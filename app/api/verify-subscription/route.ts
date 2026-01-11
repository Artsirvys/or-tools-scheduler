import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST!, {
  apiVersion: '2025-08-27.basil',
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { sessionId, userId } = await request.json()

    if (!sessionId || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, userId' },
        { status: 400 }
      )
    }

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (!session) {
      return NextResponse.json(
        { error: 'Checkout session not found' },
        { status: 404 }
      )
    }

    // Verify the session belongs to the user
    if (session.metadata?.userId !== userId) {
      return NextResponse.json(
        { error: 'Session does not belong to user' },
        { status: 403 }
      )
    }

    // Get the subscription details
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select(`
        *,
        subscription_plans (*)
      `)
      .eq('user_id', userId)
      .eq('stripe_subscription_id', session.subscription as string)
      .single()

    if (subError || !subscription) {
      return NextResponse.json(
        { error: 'Subscription not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      subscription,
      session: {
        id: session.id,
        payment_status: session.payment_status,
        customer_email: session.customer_details?.email,
      },
    })

  } catch (error) {
    console.error('Error verifying subscription:', error)
    return NextResponse.json(
      { error: 'Failed to verify subscription' },
      { status: 500 }
    )
  }
}
