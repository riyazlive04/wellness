import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { VerifyPaymentDto } from './workspace-billing.controller';

/**
 * A one-off PLAN payment goes through the same /verify endpoint as a credit
 * top-up, but has no topup key. Requiring one rejected the payment after the
 * money had already been taken, with "topupKey should not be empty".
 */
describe('VerifyPaymentDto', () => {
  const base = {
    razorpayOrderId: 'order_123',
    razorpayPaymentId: 'pay_123',
    razorpaySignature: 'sig',
  };
  const errs = (o: object) => validateSync(plainToInstance(VerifyPaymentDto, o));

  it('accepts a plan payment, which carries no topup key', () => {
    expect(errs(base)).toHaveLength(0);
  });

  it('still accepts a top-up payment', () => {
    expect(errs({ ...base, topupKey: 'ai_1000' })).toHaveLength(0);
  });

  it('still requires the signature fields', () => {
    expect(errs({ razorpayOrderId: 'order_123' }).length).toBeGreaterThan(0);
  });
});
