import * as z from 'zod/v4';
import type { WalletAddress, WalletCurrencyNetwork } from '../ripio/schemas.js';
import {
  canReceive,
  currentAddresses,
  isEvmAddress,
  memoOf,
  namesNetwork,
  networkLabel,
  resolveNetwork,
  sameAddress,
  VENUE_WARNING,
} from './networks.js';

export const VerifyAddressSchema = z.object({
  status: z.enum(['verified', 'wrong_network', 'memo_mismatch', 'near_miss', 'not_yours']),
  verdict: z.string(),
  address_networks: z.array(z.object({ code: z.string(), name: z.string() })),
  asset: z.string().optional(),
  credited_via: z.array(z.string()).optional(),
  not_credited_via: z.array(z.string()).optional(),
  expected_memo: z.string().optional(),
  near_miss: z.object({ distance: z.number(), differing_positions: z.array(z.number()).optional() }).optional(),
  warnings: z.array(z.string()),
});
export type VerifyAddress = z.infer<typeof VerifyAddressSchema>;

export interface VerifyAddressInput {
  /** As pasted by the user; surrounding whitespace is ignored. */
  address: string;
  memo?: string;
  network?: string;
  asset?: { ticker: string; networks: WalletCurrencyNetwork[]; depositsDisabled: boolean };
  addresses: WalletAddress[];
  /** The caller's own warnings, shown first. */
  warnings?: string[];
}

/** Up to this many edits from one of the account's addresses reads as a mistyped copy, not someone else's address. */
const NEAR_MISS_MAX_DISTANCE = 3;
const NOT_YOURS =
  'This is not one of your Ripio Wallet deposit addresses. Do not send to it expecting it to reach your Ripio app account. ' +
  'Ripio Trade addresses are not checked here.';

const plural = (count: number, word: string): string => `${word}${count === 1 ? '' : 's'}`;

/** Edit distance: insertions, deletions and substitutions. */
export function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min((previous[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    previous = row;
  }
  return previous[b.length] ?? 0;
}

function notOwned(address: string, current: WalletAddress[], warnings: string[]): VerifyAddress {
  let best: { candidate: string; distance: number; fold: boolean } | undefined;
  for (const candidate of new Set(current.map((entry) => entry.address))) {
    const fold = isEvmAddress(candidate) && isEvmAddress(address);
    const distance = fold ? levenshtein(address.toLowerCase(), candidate.toLowerCase()) : levenshtein(address, candidate);
    if (best === undefined || distance < best.distance) best = { candidate, distance, fold };
  }
  if (best === undefined || best.distance > NEAR_MISS_MAX_DISTANCE) {
    return { status: 'not_yours', verdict: NOT_YOURS, address_networks: [], warnings };
  }
  const { candidate, distance, fold } = best;
  const networks = current.filter((entry) => entry.address === candidate).map((entry) => entry.network.name);
  const positions: number[] = [];
  if (address.length === candidate.length) {
    for (let i = 0; i < address.length; i += 1) {
      const a = address[i] ?? '';
      const b = candidate[i] ?? '';
      if (fold ? a.toLowerCase() !== b.toLowerCase() : a !== b) positions.push(i + 1);
    }
  }
  const where =
    positions.length > 0
      ? `at ${plural(positions.length, 'character')} ${positions.join(', ')}`
      : `by ${distance} ${plural(distance, 'character')}`;
  return {
    status: 'near_miss',
    verdict: `This is NOT your address: it differs from your ${networks.join(', ')} address ${where}. It looks like a mistyped copy — do not use it; copy the address again.`,
    address_networks: [],
    near_miss: positions.length > 0 ? { distance, differing_positions: positions } : { distance },
    warnings,
  };
}

/**
 * Compares, with code, an address someone is about to use against the account's current Wallet deposit addresses.
 * Any copying mistake fails towards "not verified"; the account's addresses are never echoed back.
 */
export function verifyDepositAddress(input: VerifyAddressInput): VerifyAddress {
  const address = input.address.trim();
  const memo = input.memo?.trim() || undefined;
  const notes: string[] = [];
  const warnings = (): string[] => [...(input.warnings ?? []), ...notes, VENUE_WARNING];
  const current = currentAddresses(input.addresses);
  const owned = current.filter((entry) => sameAddress(entry.address, address));
  if (owned.length === 0) return notOwned(address, current, warnings());

  const address_networks = owned.map((entry) => ({ code: entry.network.code, name: entry.network.name }));
  const assetNetworks = input.asset?.networks ?? [];
  const labelOf = (entry: WalletAddress): string => {
    const match = assetNetworks.find((n) => n.network.code === entry.network.code);
    return match === undefined ? entry.network.name : networkLabel(match);
  };
  let assetFields: Pick<VerifyAddress, 'asset' | 'credited_via' | 'not_credited_via'> = {};
  const answer = (
    status: VerifyAddress['status'],
    verdict: string,
    extra: Pick<VerifyAddress, 'expected_memo'> = {},
  ): VerifyAddress => ({
    status,
    verdict,
    address_networks,
    ...assetFields,
    ...extra,
    warnings: warnings(),
  });

  let relevant = owned;
  let requestedLabel = '';
  if (input.network !== undefined) {
    const wanted = input.network;
    const assetMatch = resolveNetwork(wanted, assetNetworks);
    const matchedCode = assetMatch.kind === 'one' ? assetMatch.network.network.code : undefined;
    relevant = owned.filter((entry) => entry.network.code === matchedCode || namesNetwork(wanted, entry.network.code, entry.network.name));
    requestedLabel = assetMatch.kind === 'one' ? networkLabel(assetMatch.network) : (relevant[0]?.network.name ?? wanted);
    if (relevant.length === 0) return answer('wrong_network', `This address is not assigned to ${requestedLabel} on your account.`);
  }

  if (input.asset !== undefined) {
    const { ticker, depositsDisabled } = input.asset;
    if (depositsDisabled) notes.push(`Ripio does not accept ${ticker} deposits right now.`);
    const receivable = new Set(depositsDisabled ? [] : assetNetworks.filter(canReceive).map((n) => n.network.code));
    const credited = owned.filter((entry) => receivable.has(entry.network.code)).map(labelOf);
    assetFields = {
      asset: ticker,
      credited_via: credited,
      not_credited_via: owned.filter((entry) => !receivable.has(entry.network.code)).map(labelOf),
    };
    const noCredit = `Ripio does not credit ${ticker} to this address on any network.`;
    if (credited.length === 0) return answer('wrong_network', noCredit);
    if (input.network !== undefined && !relevant.some((entry) => receivable.has(entry.network.code))) {
      return answer(
        'wrong_network',
        `This is your address, but Ripio does not credit ${ticker} to it via ${requestedLabel}. Ripio credits ${ticker} to it only via: ${credited.join(', ')}.`,
      );
    }
    if (input.network === undefined) relevant = owned.filter((entry) => receivable.has(entry.network.code));
    notes.push(`Ripio credits ${ticker} to this address only via: ${credited.join(', ')}. Sending over any other network can lose the funds.`);
  }

  const memoEntry = relevant.find((entry) => entry.network.use_memo === true);
  if (memoEntry !== undefined) {
    const expected = memoOf(memoEntry);
    const label = labelOf(memoEntry);
    if (expected === null) {
      return answer('memo_mismatch', `${label} requires a memo/tag, but Ripio returned none for this address: do not send; check the Ripio app.`);
    }
    if (memo !== expected) {
      return answer(
        'memo_mismatch',
        `The address is yours, but ${label} requires the memo/tag ${expected}; without the exact memo the deposit can be lost.`,
        { expected_memo: expected },
      );
    }
  } else if (memo !== undefined) {
    notes.push('This network does not use a memo/tag; the one given is not needed.');
  }

  const creditedText =
    input.asset === undefined ? '' : ` and Ripio credits ${input.asset.ticker} to it via ${(assetFields.credited_via ?? []).join(', ')}`;
  return answer('verified', `This is exactly one of your Ripio Wallet deposit addresses${creditedText}.`);
}
