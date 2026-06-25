# Postman Collection - Mobile Payments API

## Files

- `Mobile_Payments_API.postman_collection.json` - Main API collection
- `Local_Development.postman_environment.json` - Local dev environment
- `Production.postman_environment.json` - Production environment

## Import Instructions

1. Open Postman
2. Click **Import** (top left)
3. Drag and drop the collection file
4. Import the environment file for your setup

## Setup

### 1. Configure Environment Variables

| Variable | Description |
|----------|-------------|
| `base_url` | API base URL (e.g., `http://localhost:3400`) |
| `api_key` | Your merchant API key |
| `paypack_client_id` | Paypack client ID (for direct API calls) |
| `paypack_client_secret` | Paypack client secret (for direct API calls) |

### 2. Select Environment

Click the environment dropdown (top right) and select your environment.

## Collection Structure

### Transactions
- **Cashin** - Collect payment from customer
- **Cashout** - Send payment to recipient

### Payments
- **List Payments** - Get all payments with filters
- **Get by ID** - Get payment by internal ID
- **Get by Reference** - Get payment by Paypack ref

### Account
- **Get Account Info** - Balance and rates

### Webhooks
- **Transaction Processed** - Simulate success webhook
- **Transaction Failed** - Simulate failed webhook

### Direct Paypack API
- Direct API calls for debugging/reference
- Requires `paypack_client_id` and `paypack_client_secret`

## Test Flow

1. Run **Cashin** to create a payment
2. Variables `payment_id` and `payment_ref` auto-populate
3. Run **Get Payment by ID** or **Get Payment by Reference**
4. Run **List Payments** to see all transactions
5. Run **Get Account Info** to check balance

## Auto-populated Variables

When you run Cashin or Cashout, these variables are automatically set:
- `payment_id` - Internal payment UUID
- `payment_ref` - Paypack transaction reference

## Phone Numbers

Use real phone numbers for production. For testing:
- `0780478387` - Default test number in collection
