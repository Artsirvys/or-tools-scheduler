import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Extended Stripe types to include missing properties
interface ExtendedStripeSubscription extends Stripe.Subscription {
  current_period_start: number
  current_period_end: number
}

interface ExtendedStripeInvoice extends Stripe.Invoice {
  subscription: string | Stripe.Subscription | null
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST!, {
  apiVersion: '2025-08-27.basil',
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      )
    }

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      )
    }

    console.log('Received webhook event:', event.type)

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as ExtendedStripeSubscription)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as ExtendedStripeSubscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as ExtendedStripeInvoice)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as ExtendedStripeInvoice)
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('Processing checkout session completed:', session.id)

  const userId = session.metadata?.userId
  const planId = session.metadata?.planId

  if (!userId || !planId) {
    console.error('Missing metadata in checkout session:', session.id)
    return
  }

  // Get subscription plan details
  const { data: plan, error: planError } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('id', planId)
    .single()

  if (planError || !plan) {
    console.error('Plan not found:', planId)
    return
  }

  // Create subscription record
  const { error: subError } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      plan_id: planId,
      stripe_subscription_id: session.subscription as string,
      stripe_customer_id: session.customer as string,
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
    })

  if (subError) {
    console.error('Error creating subscription:', subError)
  } else {
    console.log('Subscription created successfully for user:', userId)
  }
}

async function handleSubscriptionCreated(subscription: ExtendedStripeSubscription) {
  console.log('Processing subscription created:', subscription.id)

  const userId = subscription.metadata?.userId
  const planId = subscription.metadata?.planId

  if (!userId || !planId) {
    console.error('Missing metadata in subscription:', subscription.id)
    return
  }

  // Update subscription record with Stripe data
  const { error } = await supabase
    .from('subscriptions')
    .update({
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer as string,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
      trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    })
    .eq('user_id', userId)
    .eq('plan_id', planId)

  if (error) {
    console.error('Error updating subscription:', error)
  }
}

async function handleSubscriptionUpdated(subscription: ExtendedStripeSubscription) {
  console.log('Processing subscription updated:', subscription.id)

  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
    })
    .eq('stripe_subscription_id', subscription.id)

  if (error) {
    console.error('Error updating subscription:', error)
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('Processing subscription deleted:', subscription.id)

  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id)

  if (error) {
    console.error('Error updating subscription:', error)
  }
}

async function handleInvoicePaymentSucceeded(invoice: ExtendedStripeInvoice) {
  console.log('Processing invoice payment succeeded:', invoice.id)

  if (!invoice.subscription) return

  // Get subscription details
  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .select('id, user_id')
    .eq('stripe_subscription_id', invoice.subscription as string)
    .single()

  if (subError || !subscription) {
    console.error('Subscription not found for invoice:', invoice.id)
    return
  }

  // Create billing history record
  const { error: billingError } = await supabase
    .from('billing_history')
    .insert({
      user_id: subscription.user_id,
      subscription_id: subscription.id,
      stripe_invoice_id: invoice.id,
      amount_cents: invoice.amount_paid,
      currency: invoice.currency,
      status: 'paid',
      invoice_url: invoice.hosted_invoice_url,
      hosted_invoice_url: invoice.hosted_invoice_url,
      pdf_url: invoice.invoice_pdf,
      period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
      period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
    })

  if (billingError) {
    console.error('Error creating billing history:', billingError)
  }
}

async function handleInvoicePaymentFailed(invoice: ExtendedStripeInvoice) {
  console.log('Processing invoice payment failed:', invoice.id)

  if (!invoice.subscription) return

  // Get subscription details
  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .select('id, user_id')
    .eq('stripe_subscription_id', invoice.subscription as string)
    .single()

  if (subError || !subscription) {
    console.error('Subscription not found for invoice:', invoice.id)
    return
  }

  // Create billing history record for failed payment
  const { error: billingError } = await supabase
    .from('billing_history')
    .insert({
      user_id: subscription.user_id,
      subscription_id: subscription.id,
      stripe_invoice_id: invoice.id,
      amount_cents: invoice.amount_due,
      currency: invoice.currency,
      status: 'uncollectible',
      invoice_url: invoice.hosted_invoice_url,
      hosted_invoice_url: invoice.hosted_invoice_url,
      pdf_url: invoice.invoice_pdf,
      period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
      period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
    })

  if (billingError) {
    console.error('Error creating billing history:', billingError)
  }
}
