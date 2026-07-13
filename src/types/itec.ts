export interface ItecConfig {
  apiKey: string; // Default/fallback API key for all methods
  mtnKey?: string; // MTN Mobile Money (separate key if different)
  airtelKey?: string; // Airtel Money (separate key if different)
  cardApiKey?: string; // Card payments (Visa, Mastercard, Amex) - separate key if different
  baseUrl: string;
}

export interface ItecPaymentRequest {
  amount: number;
  phone: string;
  reqRef: string;
  note?: string;
  message?: string;
  provider?: 'mtn' | 'airtel'; // Mobile money provider (optional, defaults to mtn if not specified)
}

export interface ItecPaymentResponse {
  status: number;
  data: {
    financial_transaction_id?: string;
    transaction_id: string;
    amount: string;
    currency?: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SUCCESSFUL';
  };
}

export interface ItecStatusCheckRequest {
  action: 'status_check';
  reqRef: string;
}

export interface ItecStatusCheckResponse {
  status: number;
  data: {
    transaction_id: string;
    amount: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SUCCESSFUL';
  };
}

export interface ItecCashoutRequest {
  amount: number;
  phone: string;
}

export interface ItecCashoutResponse {
  status: number;
  data: {
    transaction_id: string;
    amount: string;
  };
}

export interface ItecReportRequest {
  report: 'payments' | 'transfers' | 'charges' | 'all';
  start: number;
  end: number;
}

export interface ItecReportResponse {
  status: number;
  data: Array<{
    transaction_id: string;
    amount: string;
    status: string;
    timestamp: string;
  }>;
}

export interface ItecCallbackPayload {
  status: number;
  data: {
    transaction_id: string;
    amount: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SUCCESSFUL';
  };
}

// ============================================================================
// ITEC V1 API Types (MoMo, SPENN, Airtel, Cards via PesaPal)
// ============================================================================

export interface ItecV1PaymentRequest {
  amount: number;
  phone: string;
}

export interface ItecV1PaymentResponse {
  status: number;
  data: {
    amount: number;
    transID: string;
  };
}

export interface ItecCardPaymentRequest {
  amount: number;
  email: string;
}

export interface ItecCardPaymentResponse {
  status: number;
  PCODE: string | null;
  amount: number | null;
  link: string;
  valid_until: string;
}

export interface ItecCardCallbackPayload {
  PCODE: string;
  amount: string;
  transID: string;
}
