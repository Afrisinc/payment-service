/**
 * Merchant Domain Types
 * Types for merchant service and repository operations
 */
import type { Merchant } from '@prisma/client';

// ============================================================================
// Service Layer Types
// ============================================================================

/** Parameters for creating a merchant */
export interface CreateMerchantParams {
  name: string;
  email: string;
  defaultFeePercent?: number;
}

/** Result of creating a merchant (includes plain-text API key) */
export interface CreateMerchantResult {
  merchant: Merchant;
  /** Plain-text API key (only returned once at creation) */
  apiKey: string;
}

/** Result of rotating a merchant's API key */
export interface RotateApiKeyResult {
  /** Plain-text API key (only returned once) */
  apiKey: string;
}

// ============================================================================
// Repository Layer Types
// ============================================================================

/** Data for creating a merchant in the database */
export interface CreateMerchantData {
  name: string;
  email: string;
  apiKeyHash: string;
  defaultFeePercent?: number;
}
