import * as z from 'zod/v4';
import type { TradeOpenOrder } from '../ripio/schemas.js';
import { toIsoDate } from './dates.js';
import { toDecimal } from './money.js';

export const OpenOrderSchema = z.object({
  id: z.string(),
  pair: z.string(),
  side: z.string(),
  type: z.string(),
  status: z.string(),
  price: z.string().optional(),
  requested_amount: z.string().optional(),
  executed_amount: z.string().optional(),
  remaining_amount: z.string().optional(),
  created_at: z.string(),
});

export const OpenOrdersOutputSchema = z.object({
  orders: z.array(OpenOrderSchema),
  next_cursor: z.string().optional(),
});

export type OpenOrder = z.infer<typeof OpenOrderSchema>;
export type OpenOrdersOutput = z.infer<typeof OpenOrdersOutputSchema>;

export function normalizeOpenOrder(order: TradeOpenOrder): OpenOrder {
  return {
    id: order.id,
    pair: order.pair.toUpperCase(),
    side: order.side.toLowerCase(),
    type: order.type.toLowerCase(),
    status: order.status.toLowerCase(),
    price: toDecimal(order.price),
    requested_amount: toDecimal(order.requested_amount),
    executed_amount: toDecimal(order.executed_amount),
    remaining_amount: toDecimal(order.remaining_amount),
    created_at: toIsoDate(order.create_date),
  };
}
