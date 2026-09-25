import * as z from 'zod/v4';
import type { WalletAddress, WalletCurrencyNetwork } from '../ripio/schemas.js';
import {
  canReceive,
  currentAddresses,
  describeNetworks,
  memoOf,
  memoSent,
  namesNetwork,
  needsMemo,
  NetworkInfoSchema,
  networkLabel,
  partialNote,
  positiveAmount,
  resolveNetwork,
  sameAddress,
  sortNetworks,
  statusNotes,
  VENUE_WARNING,
} from './networks.js';

export const DepositAddressSchema = z.object({
  asset: z.string(),
  asset_name: z.string().optional(),
  status: z.enum(['ok', 'choose_network', 'unsupported_network', 'deposits_disabled', 'no_address', 'memo_missing']),
  deposit: z
    .object({
      address: z.string(),
      memo: z.string().nullable(),
      memo_required: z.boolean(),
      network: z.object({ code: z.string(), name: z.string(), label: z.string(), token_standard: z.string().nullable() }),
      address_version: z.number().optional(),
    })
    .optional(),
  networks: z.array(NetworkInfoSchema),
  warnings: z.array(z.string()),
  next_step: z.string().optional(),
});
export type DepositAddress = z.infer<typeof DepositAddressSchema>;
type DepositStatus = DepositAddress['status'];

export interface DepositAddressInput {
  /** Ripio's ticker (see canonicalAsset). */
  asset: string;
  assetName?: string;
  /** The network as the user named it; undefined when not given. */
  network?: string;
  /** Ripio does not accept deposits of this asset at all right now. */
  depositsDisabled: boolean;
  networks: WalletCurrencyNetwork[];
  addresses: WalletAddress[];
  /** The caller's own warnings, shown first. */
  warnings?: string[];
}

export const CHOOSE_NETWORK = 'Ask which network the sender will use: the address and the risk depend on it.';
export const VERIFY_HINT =
  'Copy the address exactly. Before sending, verify the address you will actually use with ripio_verify_deposit_address ' +
  'or against the Ripio app; for large amounts, send a small test deposit first.';
const SEND_ONLY = 'Send only ';
const MEMO_RULE = 'This network requires a memo/tag';
const NO_MATCH = 'Ripio lists no ';

/**
 * Picks the one deposit address that is safe to hand out, or says why there is none. The address and memo are copied
 * from Ripio untouched; nothing here creates, guesses or rebuilds an address.
 */
export function buildDepositAddress(input: DepositAddressInput): DepositAddress {
  const { asset, network: requested } = input;
  const sorted = sortNetworks(input.networks);
  const receivable = sorted.filter(canReceive);
  const credited = receivable.map(networkLabel).join(', ');
  const current = currentAddresses(input.addresses);
  const base = { asset, asset_name: input.assetName, networks: describeNetworks(asset, sorted, input.addresses) };
  const withoutAddress = (status: DepositStatus, next_step: string, warnings: string[] = []): DepositAddress => ({
    ...base,
    status,
    warnings: [...(input.warnings ?? []), ...warnings, VENUE_WARNING],
    next_step,
  });

  if (input.depositsDisabled) return withoutAddress('deposits_disabled', `Ripio does not accept ${asset} deposits right now.`);
  if (receivable.length === 0) {
    return withoutAddress('deposits_disabled', `Ripio lists no network that can receive ${asset} right now.`);
  }

  let chosen: WalletCurrencyNetwork;
  if (requested === undefined) {
    const [only] = receivable;
    if (only === undefined || receivable.length > 1) return withoutAddress('choose_network', CHOOSE_NETWORK);
    chosen = only;
  } else {
    const match = resolveNetwork(requested, sorted);
    if (match.kind === 'none') {
      const warnings = [
        `${NO_MATCH}${asset} network matching '${requested}'. Ripio credits ${asset} only via: ${credited}. ` +
          `Sending ${asset} over any other network can lose the funds.`,
      ];
      const elsewhere = current.find((entry) => namesNetwork(requested, entry.network.code, entry.network.name));
      if (elsewhere !== undefined) {
        warnings.push(`You do have an address on ${elsewhere.network.name}, but Ripio does not credit ${asset} there.`);
      }
      return withoutAddress('unsupported_network', `Ask the sender to use one of the networks that credit ${asset}, or do not send.`, warnings);
    }
    if (match.kind === 'many') {
      const labels = match.networks.map(networkLabel).join(', ');
      return withoutAddress('choose_network', `'${requested}' matches more than one ${asset} network (${labels}): ask which one the sender will use.`);
    }
    chosen = match.network;
    if (!canReceive(chosen)) {
      return withoutAddress('deposits_disabled', `Ripio is not receiving ${asset} on ${networkLabel(chosen)} right now.`);
    }
  }

  const label = networkLabel(chosen);
  const code = chosen.network.code;
  const entry = current.find((candidate) => candidate.network.code === code);
  if (entry === undefined) {
    return withoutAddress(
      'no_address',
      `Ripio has not assigned a ${label} address to this account yet. ` +
        `Open the Ripio app, start a ${asset} deposit and pick ${label} so Ripio assigns one, then ask again.`,
    );
  }
  const memo = memoOf(entry);
  const memoRequired = needsMemo(entry, chosen);
  if (memoRequired && memo === null) {
    const returned = memoSent(entry) ? 'returned one that cannot be read exactly' : 'returned none';
    return withoutAddress('memo_missing', `${label} needs a memo/tag but Ripio ${returned}. Do not send; check the deposit screen in the Ripio app.`);
  }

  const receivableCodes = new Set(receivable.map((n) => n.network.code));
  const alsoOn = [
    ...new Set(
      current
        .filter((other) => other.network.code !== code && !receivableCodes.has(other.network.code))
        .filter((other) => sameAddress(other.address, entry.address))
        .map((other) => other.network.name),
    ),
  ];
  const min = positiveAmount(chosen.min_amount);
  const max = positiveAmount(chosen.max_amount);
  const version = entry.version ?? undefined;
  const warnings = [
    ...(input.warnings ?? []),
    ...partialNote(chosen),
    `${SEND_ONLY}${asset} over ${label}. Ripio credits ${asset} only via: ${credited}. Sending over any other network can lose the funds.`,
    ...(alsoOn.length > 0 ? [`This same address also exists on ${alsoOn.join(', ')}, where Ripio does not credit ${asset}.`] : []),
    ...(memoRequired && memo !== null
      ? [`${MEMO_RULE}: include ${memo} exactly as shown. Without it the deposit cannot be matched to the account and can be lost.`]
      : []),
    ...(min === undefined ? [] : [`Ripio lists a minimum of ${min} ${asset} on this network; smaller deposits may not be credited.`]),
    ...(max === undefined ? [] : [`Ripio lists a maximum of ${max} ${asset} on this network; larger deposits may not be credited.`]),
    ...statusNotes(asset, chosen),
    VENUE_WARNING,
    version === undefined
      ? 'Ripio can rotate deposit addresses: get it again right before each deposit instead of reusing an old one.'
      : `Ripio can rotate deposit addresses (this is version ${version}): get it again right before each deposit instead of reusing an old one.`,
    VERIFY_HINT,
  ];
  return {
    ...base,
    status: 'ok',
    deposit: {
      address: entry.address,
      memo,
      memo_required: memoRequired,
      network: { code, name: chosen.network.name, label, token_standard: chosen.standard?.trim() || null },
      address_version: version,
    },
    warnings,
  };
}

export function summarizeDepositAddress(result: DepositAddress): string {
  const { deposit } = result;
  if (result.status === 'ok' && deposit !== undefined) {
    const memo = deposit.memo === null ? ' (no memo)' : ` · memo/tag: ${deposit.memo}`;
    const rules = result.warnings.filter((warning) => warning.startsWith(SEND_ONLY) || warning.startsWith(MEMO_RULE));
    return [
      `${result.asset} deposit address on ${deposit.network.label}: ${deposit.address}${memo}`,
      rules.join(' '),
      'Verify it before sending with ripio_verify_deposit_address.',
    ].join('\n');
  }
  if (result.status === 'choose_network') {
    const labels = result.networks.filter((n) => n.can_receive).map((n) => n.label);
    return `No address returned: ${result.asset} can be received on ${labels.length} networks (${labels.join(', ')}). ${result.next_step ?? ''}`.trim();
  }
  const reason = result.status === 'unsupported_network' ? result.warnings.find((w) => w.startsWith(NO_MATCH)) : undefined;
  return ['No address returned:', reason, result.next_step].filter((part) => part !== undefined).join(' ');
}
