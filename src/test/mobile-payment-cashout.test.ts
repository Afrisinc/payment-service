import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';
import type { MobilePayment } from '@prisma/client';

const repo = {
  findByMerchantAndOrder: vi.fn(),
  createCashoutWithinBalance: vi.fn(),
  updateById: vi.fn(),
  updateByRef: vi.fn(),
};

const itec = {
  requestCashout: vi.fn(),
  findTransfer: vi.fn(),
};

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../services/merchant-webhook.service.js', () => ({
  merchantWebhookService: { notifyPaymentEvent: vi.fn() },
}));

vi.mock('../repositories/mobile-payment.repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../repositories/mobile-payment.repository.js')>();
  return { ...actual, MobilePaymentRepository: vi.fn(() => repo) };
});

vi.mock('../lib/prisma.js', () => ({ prismaRead: {}, prismaWrite: {} }));

vi.mock('../helpers/paypack.js', () => ({
  getPaypackHelper: vi.fn(),
  PaypackError: class PaypackError extends Error {},
}));

vi.mock('../helpers/itec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../helpers/itec.js')>();
  return { ...actual, getItecHelper: vi.fn(() => itec) };
});

import { MobilePaymentService } from '../services/mobile-payment.service.js';
import { ItecError, ItecHelper } from '../helpers/itec.js';
import { ConflictError, HttpError } from '../utils/http-error.js';
import { InsufficientBalanceError } from '../repositories/mobile-payment.repository.js';

const merchant = { id: 'merchant-uuid' } as Parameters<MobilePaymentService['cashout']>[0]['merchant'];

function makePayment(overrides: Partial<MobilePayment> = {}): MobilePayment {
  return {
    id: 'payment-uuid',
    merchantId: 'merchant-uuid',
    orderId: 'payout-1',
    ref: 'pending_abc',
    amount: 500,
    currency: 'RWF',
    phoneNumber: '250788123456',
    type: 'CASHOUT',
    status: 'PENDING',
    provider: 'itec',
    fee: 0,
    customerName: null,
    description: null,
    failureReason: null,
    metadata: { payment_type: 'mobile_money' },
    processedAt: null,
    createdAt: new Date('2025-01-10T13:30:45Z'),
    updatedAt: new Date('2025-01-10T13:30:45Z'),
    ...overrides,
  };
}

const request = { merchant, merchantId: merchant.id, orderId: 'payout-1', amount: 500, phoneNumber: '0788123456' };

describe('MobilePaymentService.cashout (ITEC)', () => {
  let service: MobilePaymentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MobilePaymentService();
    repo.findByMerchantAndOrder.mockResolvedValue(null);
    repo.createCashoutWithinBalance.mockImplementation(async (data) => makePayment({ ref: data.ref }));
    repo.updateById.mockImplementation(async (_id, data) => makePayment(data));
  });

  it('reserves the payout before calling ITEC, then stores the transaction id', async () => {
    itec.requestCashout.mockResolvedValue({ status: 200, data: { transaction_id: 'itec-tx-1', amount: '500' } });

    const result = await service.cashout(request);

    expect(repo.createCashoutWithinBalance).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CASHOUT', provider: 'itec', phoneNumber: '250788123456' }),
    );
    expect(repo.createCashoutWithinBalance.mock.calls[0][0].ref).toMatch(/^pending_/);
    expect(repo.createCashoutWithinBalance.mock.invocationCallOrder[0]).toBeLessThan(
      itec.requestCashout.mock.invocationCallOrder[0],
    );
    expect(itec.requestCashout).toHaveBeenCalledWith({ amount: 500, phone: '250788123456' });
    expect(repo.updateById).toHaveBeenCalledWith('payment-uuid', { ref: 'itec-tx-1', amount: 500 });
    expect(result).toMatchObject({ ref: 'itec-tx-1', status: 'PENDING', type: 'CASHOUT' });
  });

  it('returns the existing cashout for a repeated orderId without disbursing again', async () => {
    repo.findByMerchantAndOrder.mockResolvedValue(makePayment({ ref: 'itec-tx-1' }));

    const result = await service.cashout(request);

    expect(result.ref).toBe('itec-tx-1');
    expect(repo.createCashoutWithinBalance).not.toHaveBeenCalled();
    expect(itec.requestCashout).not.toHaveBeenCalled();
  });

  it('rejects an orderId already used by a cashin', async () => {
    repo.findByMerchantAndOrder.mockResolvedValue(makePayment({ type: 'CASHIN' }));

    await expect(service.cashout(request)).rejects.toBeInstanceOf(ConflictError);
    expect(itec.requestCashout).not.toHaveBeenCalled();
  });

  it('does not disburse when a concurrent request already reserved the orderId', async () => {
    repo.findByMerchantAndOrder.mockResolvedValueOnce(null).mockResolvedValueOnce(makePayment());
    repo.createCashoutWithinBalance.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5' }),
    );

    const result = await service.cashout(request);

    expect(result.id).toBe('payment-uuid');
    expect(itec.requestCashout).not.toHaveBeenCalled();
  });

  it('refuses a payout above the available balance without calling ITEC', async () => {
    repo.createCashoutWithinBalance.mockRejectedValue(new InsufficientBalanceError(300, 500));

    const error = await service.cashout(request).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).statusCode).toBe(422);
    expect(itec.requestCashout).not.toHaveBeenCalled();
  });

  it('marks the payout FAILED when ITEC rejects it', async () => {
    itec.requestCashout.mockRejectedValue(new ItecError('Cashout request rejected: insufficient balance', 400));

    await expect(service.cashout(request)).rejects.toBeInstanceOf(ItecError);
    expect(repo.updateById).toHaveBeenCalledWith('payment-uuid', {
      status: 'FAILED',
      failureReason: 'Cashout request rejected: insufficient balance',
    });
  });

  it('keeps the payout PENDING and flags it for review when the ITEC outcome is unknown', async () => {
    itec.requestCashout.mockRejectedValue(new ItecError('Cashout request failed: timeout', 502, true));

    await expect(service.cashout(request)).rejects.toBeInstanceOf(ItecError);
    const update = repo.updateById.mock.calls[0][1];
    expect(update.status).toBeUndefined();
    expect(update.metadata).toMatchObject({ requires_manual_review: true, payment_type: 'mobile_money' });
  });
});

describe('MobilePaymentService.getTransactionStatus (ITEC cashout)', () => {
  let service: MobilePaymentService;
  const payment = { provider: 'itec', type: 'CASHOUT' as const, status: 'PENDING' as const, createdAt: new Date() };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MobilePaymentService();
  });

  it('resolves status from the ITEC transfers report', async () => {
    itec.findTransfer.mockResolvedValue({ transaction_id: 'itec-tx-1', amount: '500', status: 'SUCCESS' });

    const result = await service.getTransactionStatus('itec-tx-1', payment);

    expect(itec.findTransfer).toHaveBeenCalledWith('itec-tx-1', payment.createdAt);
    expect(repo.updateByRef).toHaveBeenCalledWith('itec-tx-1', expect.objectContaining({ status: 'SUCCESSFUL' }));
    expect(result).toEqual({ status: 'SUCCESSFUL', provider: 'itec' });
  });

  it('leaves the record untouched while the transfer is not yet reported', async () => {
    itec.findTransfer.mockResolvedValue(null);

    const result = await service.getTransactionStatus('itec-tx-1', payment);

    expect(repo.updateByRef).not.toHaveBeenCalled();
    expect(result.status).toBe('PENDING');
  });

  it('does not query any provider for a reservation without a provider reference', async () => {
    const result = await service.getTransactionStatus('pending_abc', payment);

    expect(itec.findTransfer).not.toHaveBeenCalled();
    expect(result.status).toBe('PENDING');
  });
});

describe('MobilePaymentRepository.getLedger', () => {
  it('computes the available balance from successful cashins and non-failed cashouts', async () => {
    const actual = await vi.importActual<typeof import('../repositories/mobile-payment.repository.js')>(
      '../repositories/mobile-payment.repository.js',
    );
    const groupBy = vi.fn().mockResolvedValue([
      { type: 'CASHIN', status: 'SUCCESSFUL', _sum: { amount: 10_000, fee: 300 } },
      { type: 'CASHIN', status: 'PENDING', _sum: { amount: 5_000, fee: 0 } },
      { type: 'CASHIN', status: 'FAILED', _sum: { amount: 2_000, fee: 0 } },
      { type: 'CASHOUT', status: 'SUCCESSFUL', _sum: { amount: 4_000, fee: 0 } },
      { type: 'CASHOUT', status: 'PENDING', _sum: { amount: 1_000, fee: 0 } },
      { type: 'CASHOUT', status: 'PROCESSING', _sum: { amount: 500, fee: 0 } },
      { type: 'CASHOUT', status: 'FAILED', _sum: { amount: 9_999, fee: 0 } },
    ]);

    const ledger = await new actual.MobilePaymentRepository().getLedger('merchant-uuid', {
      mobilePayment: { groupBy },
    } as never);

    expect(ledger).toEqual({
      collected: 10_000,
      collectionFees: 300,
      paidOut: 4_000,
      pendingPayouts: 1_500,
      available: 4_200,
      currency: 'RWF',
    });
  });
});

describe('ItecHelper.findTransfer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('queries the transfers report in Rwanda time and matches by transaction id', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-10T14:00:00Z'));
    const helper = new ItecHelper({ apiKey: 'key', baseUrl: 'https://itec.test' });
    const getReport = vi.spyOn(helper, 'getReport').mockResolvedValue({
      status: 200,
      data: [
        { transaction_id: 'other', amount: '100', status: 'SUCCESS', timestamp: '' },
        { transaction_id: 'itec-tx-1', amount: '500', status: 'FAILED', timestamp: '' },
      ],
    });

    const entry = await helper.findTransfer('itec-tx-1', new Date('2025-01-10T13:30:45Z'));

    expect(getReport).toHaveBeenCalledWith({ report: 'transfers', start: 20250109153045, end: 20250111160000 });
    expect(entry?.status).toBe('FAILED');
  });
});
