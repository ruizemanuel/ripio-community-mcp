import { describe, expect, it } from 'vitest';
import { normalizeOpenOrder } from '../../src/domain/orders.js';
import { tradeOpenOrders } from '../fixtures/synthetic.js';

describe('normalizeOpenOrder', () => {
  it('normalizes case, numbers and dates', () => {
    const [order] = tradeOpenOrders.orders;
    expect(order && normalizeOpenOrder(order)).toEqual({
      id: 'ord-1',
      pair: 'USDT_ARS',
      side: 'buy',
      type: 'limit',
      status: 'open',
      price: '1500',
      requested_amount: '10',
      executed_amount: '2.5',
      remaining_amount: '7.5',
      created_at: '2026-09-20T10:00:00.000Z',
    });
  });
});
