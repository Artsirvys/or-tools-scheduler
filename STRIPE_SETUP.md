# Stripe Payment Integration Setup

## Environment Variables Required

Add these to your `.env.local` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App URL for redirects
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Stripe Setup Steps

1. **Get API Keys**:
   - Go to [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
   - Copy your test secret key and publishable key
   - Add them to `.env.local`

2. **Create Products and Prices**:
   - Go to [Products](https://dashboard.stripe.com/products) in Stripe Dashboard
   - Create products for each plan:
     - Free Plan (€0/month)
     - Team Plan (€6/month) 
     - Department Plan (€20/month)
   - Copy the price IDs and update them in the database

3. **Set up Webhook**:
   - Go to [Webhooks](https://dashboard.stripe.com/webhooks) in Stripe Dashboard
   - Add endpoint: `https://yourdomain.com/api/webhook`
   - Select events: `checkout.session.completed`, `customer.subscription.*`, `invoice.*`
   - Copy the webhook secret to `.env.local`

4. **Update Database**:
   - Run the SQL script: `scripts/032-add-subscription-schema.sql`
   - Update `stripe_price_id_monthly` in `subscription_plans` table with your actual Stripe price IDs

## Database Schema

The integration adds these new tables:
- `subscription_plans` - Available subscription plans
- `subscriptions` - User subscriptions
- `billing_history` - Payment history and invoices

## Features Implemented

✅ **Pages Created**:
- `/subscribe` - Pricing plans page
- `/success` - Payment success redirect
- `/cancel` - Payment cancellation redirect
- `/billing` - Manage subscription and view invoices

✅ **API Routes**:
- `/api/create-checkout-session` - Create Stripe checkout
- `/api/webhook` - Handle Stripe webhooks
- `/api/verify-subscription` - Verify payment success
- `/api/create-portal-session` - Stripe customer portal

✅ **Plan Enforcement**:
- Team creation limits based on subscription
- Member addition limits per team
- Upgrade prompts when limits reached

## Testing

1. Use Stripe test mode with test cards:
   - Success: `4242424242424242`
   - Decline: `4000000000000002`

2. Test the flow:
   - Go to `/subscribe`
   - Select a paid plan
   - Complete checkout
   - Verify success page
   - Check billing page for subscription details

## Production Deployment

1. Switch to live Stripe keys
2. Update webhook URL to production domain
3. Test with real payment methods
4. Monitor webhook delivery in Stripe Dashboard
