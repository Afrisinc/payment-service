export enum PaymentProvider {
  PAYPACK = 'paypack',
  ITEC = 'itec',
}

export interface ProviderTransactionRequest {
  amount: number;
  phoneNumber: string;
  orderId: string;
  note?: string;
}

export interface ProviderTransactionResponse {
  transactionId: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SUCCESSFUL';
  amount: number;
  currency: string;
}

export interface ProviderStatusResponse {
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SUCCESSFUL';
  transactionId: string;
  amount: string;
}

export interface PaymentProviderAdapter {
  requestPayment(request: ProviderTransactionRequest): Promise<ProviderTransactionResponse>;
  checkStatus(transactionId: string): Promise<ProviderStatusResponse>;
  requestCashout(amount: number, phoneNumber: string): Promise<ProviderTransactionResponse>;
}
