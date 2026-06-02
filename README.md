# Afrisinc Pay — Payment Gateway Service

Stripe integration layer for the Afrisinc Pay gateway.
Handles card payments, checkout sessions, webhooks, refunds, and merchant auth.

## Stack
- Node.js + Express
- Stripe API (v14)
- PostgreSQL
- Docker

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in your Stripe keys and DB credentials
```

### 3. Run the database migration
```bash
psql -U dbuser -d afrisinc_pay_db -f src/db/migrate.sql
```

### 4. Start in development
```bash
npm run dev
```

### 5. Test the webhook locally (Stripe CLI)
```bash
stripe listen --forward-to localhost:3400/webhooks/stripe
```

## API Endpoints

### Health
```
GET /health
```

### Payments
```
POST /payments/checkout     — create hosted checkout session
POST /payments/intent       — create payment intent (custom UI)
GET  /payments/:id          — get payment status
POST /payments/:id/refund   — issue refund
```

**Auth:** All payment routes require `Authorization: Bearer <merchant_api_key>`

### Example — create checkout session
```bash
curl -X POST http://localhost:3400/payments/checkout \
  -H "Authorization: Bearer your_merchant_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000,
    "currency": "usd",
    "orderId": "order_123",
    "customerEmail": "customer@example.com"
  }'
```

### Response
```json
{
  "paymentId": "uuid",
  "checkoutUrl": "https://checkout.stripe.com/...",
  "sessionId": "cs_test_...",
  "status": "pending"
}
```

## Project Structure
```
src/
├── app.js                  — Express app, middleware, routes
├── routes/
│   ├── payments.js         — Payment endpoints
│   ├── webhooks.js         — Stripe event handler
│   └── health.js           — Health check
├── services/
│   └── stripe.js           — Stripe API wrapper
├── middleware/
│   └── auth.js             — Merchant API key validation
├── db/
│   ├── client.js           — PostgreSQL pool
│   ├── payments.js         — Payment queries
│   ├── merchants.js        — Merchant queries
│   └── migrate.sql         — Database schema
└── utils/
    └── logger.js           — Winston logger
```

## Environment Variables
See `.env.example` for all required variables.

## Next Steps
- [ ] Add Stripe Connect for merchant onboarding
- [ ] Connect Notify for payment confirmation messages  
- [ ] Add fee engine (deduct % before settlement)
- [ ] Add crypto payment rail (separate service)
