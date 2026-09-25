import * as z from 'zod/v4';
import type { NetworkMessage, WalletAddress, WalletCurrency, WalletCurrencyNetwork } from '../ripio/schemas.js';
import { isZero, toDecimal, type Decimal } from './money.js';

export const NetworkInfoSchema = z.object({
  code: z.string(),
  name: z.string(),
  label: z.string(),
  token_standard: z.string().nullable(),
  can_receive: z.boolean(),
  memo_required: z.boolean(),
  typical_minutes: z.number().optional(),
  min_amount: z.string().optional(),
  max_amount: z.string().optional(),
  address_assigned: z.boolean(),
  notes: z.array(z.string()),
});
export type NetworkInfo = z.infer<typeof NetworkInfoSchema>;

export const VENUE_WARNING = 'This is a Ripio app (Wallet) address. Ripio Trade uses different deposit addresses.';

/** The ticker as Ripio spells it (some, like AAPLx, are mixed case); upper case when Ripio's list doesn't have it. */
export function canonicalAsset(input: string, currencies: WalletCurrency[] | undefined): string {
  const wanted = input.trim();
  return currencies?.find((currency) => currency.ticker.toLowerCase() === wanted.toLowerCase())?.ticker ?? wanted.toUpperCase();
}

export type CurrencyDepositState = 'enabled' | 'disabled' | 'fiat' | 'unknown';

/** Whether Ripio accepts deposits of a currency at all, from GET /wallet/currencies/. */
export function currencyDepositState(currency: WalletCurrency | undefined): CurrencyDepositState {
  if (currency === undefined || currency.actions === null || currency.actions === undefined) return 'unknown';
  const deposit = currency.actions.find((action) => action.transaction_type === 'deposit');
  if (deposit?.enabled !== true) return 'disabled';
  return currency.type?.toUpperCase() === 'FIAT' ? 'fiat' : 'enabled';
}

export function canReceive(network: WalletCurrencyNetwork): boolean {
  return network.receive === true && network.enabled !== false && network.network.enabled !== false;
}

/** How Ripio shows the network to users, e.g. "Tron (TRC-20)". */
export function networkLabel(network: WalletCurrencyNetwork): string {
  const label = network.network_standard?.trim();
  return label ? label : network.network.name;
}

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** True when `input`, ignoring case, spaces and punctuation, is exactly one of `names`. */
export function namesNetwork(input: string, ...names: Array<string | null | undefined>): boolean {
  const wanted = normalize(input);
  return wanted !== '' && names.some((name) => typeof name === 'string' && normalize(name) === wanted);
}

/** Ripio's display order (`order`), keeping Ripio's own order for ties. */
export function sortNetworks(networks: WalletCurrencyNetwork[]): WalletCurrencyNetwork[] {
  return networks
    .map((network, index) => ({ network, index }))
    .sort((a, b) => (a.network.order ?? Infinity) - (b.network.order ?? Infinity) || a.index - b.index)
    .map(({ network }) => network);
}

export type NetworkMatch =
  | { kind: 'none' }
  | { kind: 'one'; network: WalletCurrencyNetwork }
  | { kind: 'many'; networks: WalletCurrencyNetwork[] };

/** Exact match on Ripio's code, name, token standard or display label. No fuzzy matching: money is at stake. */
export function resolveNetwork(input: string, networks: WalletCurrencyNetwork[]): NetworkMatch {
  const matches = networks.filter((n) => namesNetwork(input, n.network.code, n.network.name, n.standard, n.network_standard));
  const [first] = matches;
  if (first === undefined) return { kind: 'none' };
  return matches.length === 1 ? { kind: 'one', network: first } : { kind: 'many', networks: matches };
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export const isEvmAddress = (value: string): boolean => EVM_ADDRESS.test(value);

/** Identical text, or the same EVM address in another letter case (the case only carries the EIP-55 checksum). */
export function sameAddress(a: string, b: string): boolean {
  return a === b || (isEvmAddress(a) && isEvmAddress(b) && a.toLowerCase() === b.toLowerCase());
}

/** The newest (highest `version`) non-blank address of each network. */
export function currentAddresses(addresses: WalletAddress[]): WalletAddress[] {
  const byCode = new Map<string, WalletAddress>();
  for (const entry of addresses) {
    if (entry.address.trim() === '') continue;
    const best = byCode.get(entry.network.code);
    if (best === undefined || (entry.version ?? 0) > (best.version ?? 0)) byCode.set(entry.network.code, entry);
  }
  return [...byCode.values()];
}

/** The memo/tag exactly as Ripio sent it, or null when there is none. */
export function memoOf(entry: WalletAddress): string | null {
  const raw = entry.memo_id === null || entry.memo_id === undefined ? '' : String(entry.memo_id);
  return raw.trim() === '' ? null : raw;
}

/** A minimum or maximum worth mentioning: a decimal other than zero. */
export function positiveAmount(raw: number | string | null | undefined): Decimal | undefined {
  const value = toDecimal(raw);
  return value !== undefined && !isZero(value) ? value : undefined;
}

function typicalMinutes(raw: number | string | null | undefined): number | undefined {
  const value = typeof raw === 'string' && /^\d+(\.\d+)?$/.test(raw.trim()) ? Number(raw) : raw;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function partialNote(network: WalletCurrencyNetwork): string[] {
  if (network.is_partial_disabled_receive !== true) return [];
  return [`Ripio reports receiving on ${networkLabel(network)} as partially disabled: confirm in the Ripio app before sending.`];
}

function messageNote(asset: string, label: string, message: NetworkMessage): string {
  const bridged = message.values?.currency;
  if (message.title === 'currency_network_bridge_alert' && typeof bridged === 'string') {
    return `Ripio shows a bridged-token notice for ${bridged} on ${label}: check in the Ripio app which token it credits before sending.`;
  }
  return `Ripio shows a notice for receiving ${asset} on ${label} (${message.title ?? 'untitled'}): check the deposit screen in the Ripio app before sending.`;
}

/** Congestion and Ripio's receive-side notices for a network. */
export function statusNotes(asset: string, network: WalletCurrencyNetwork): string[] {
  const label = networkLabel(network);
  const notes: string[] = [];
  const tag = network.network.status_tag?.trim();
  if (tag && tag.toUpperCase() !== 'NORMAL') notes.push(`Ripio marks ${label} as "${tag}": deposits may take longer.`);
  for (const message of network.messages ?? []) {
    if (message.location?.includes('receive')) notes.push(messageNote(asset, label, message));
  }
  return notes;
}

export function describeNetworks(asset: string, networks: WalletCurrencyNetwork[], addresses: WalletAddress[]): NetworkInfo[] {
  const assigned = new Set(currentAddresses(addresses).map((entry) => entry.network.code));
  return sortNetworks(networks).map((network) => ({
    code: network.network.code,
    name: network.network.name,
    label: networkLabel(network),
    token_standard: network.standard?.trim() || null,
    can_receive: canReceive(network),
    memo_required: network.network.use_memo === true,
    typical_minutes: typicalMinutes(network.network.deliver_time),
    min_amount: positiveAmount(network.min_amount),
    max_amount: positiveAmount(network.max_amount),
    address_assigned: assigned.has(network.network.code),
    notes: [...partialNote(network), ...statusNotes(asset, network)],
  }));
}
