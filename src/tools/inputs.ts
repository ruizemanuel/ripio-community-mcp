import * as z from 'zod/v4';

export const RailInput = z.enum(['bank', 'pix', 'crypto', 'ripio']);
export const SideInput = z.enum(['buy', 'sell']);
export const AssetInput = z.string().regex(/^[A-Za-z0-9]{2,12}$/);
export const DateInput = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })])
  .describe('UTC date (YYYY-MM-DD) or ISO 8601 date-time.');
export const PairInput = z
  .string()
  .regex(/^[A-Za-z0-9]{2,12}_[A-Za-z0-9]{2,12}$/)
  .describe('Ripio Trade pair, e.g. USDT_ARS.');
export const PositiveDecimalInput = z
  .string()
  .regex(/^(?=.*[1-9])\d+(\.\d+)?$/)
  .describe('Positive decimal as a string, e.g. "100" or "0.005".');

export const TickerInput = z
  .string()
  .regex(/^[A-Za-z0-9]{1,15}$/, 'asset must be a Ripio ticker such as USDT.')
  .describe('Ripio ticker, e.g. USDT, BTC or AAPLx.');
export const NetworkInput = z
  .string()
  .min(1)
  .max(60)
  .describe('The network as the sender names it: code, name or token standard, e.g. tron, "BNB Chain", TRC20, BEP-20.');
