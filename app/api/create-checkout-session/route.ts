import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST!, {
  apiVersion: '2025-08-27.basil',
})

// Supabase client will be created after environment validation

export async function POST(request: NextRequest) {
  try {
    console.log('Creating checkout session...')
    
    const { planId, userId, userEmail } = await request.json()
    console.log('Request data:', { planId, userId, userEmail })

    // Validate required fields
    if (!planId || !userId || !userEmail) {
      console.error('Missing required fields:', { planId, userId, userEmail })
      return NextResponse.json(
        { error: 'Missing required fields: planId, userId, userEmail' },
        { status: 400 }
      )
    }

    // Validate user ID format (should be a valid UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(userId)) {
      console.error('Invalid user ID format:', userId)
      return NextResponse.json(
        { error: 'Invalid user session. Please sign in again.' },
        { status: 401 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(userEmail)) {
      console.error('Invalid email format:', userEmail)
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Validate environment variables
    if (!process.env.STRIPE_SECRET_KEY_TEST) {
      console.error('Missing STRIPE_SECRET_KEY_TEST environment variable')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    if (!process.env.NEXT_PUBLIC_APP_URL) {
      console.error('Missing NEXT_PUBLIC_APP_URL environment variable')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Create Supabase client after validation
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Verify user exists in database (additional security check)
    console.log('Verifying user exists in database:', userId)
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .eq('email', userEmail)
      .single()

    if (userError || !userData) {
      console.error('User verification failed:', userError)
      return NextResponse.json(
        { error: 'User not found. Please sign in again.' },
        { status: 401 }
      )
    }

    console.log('User verified:', userData.email)

    // Get the subscription plan details
    console.log('Fetching subscription plan:', planId)
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .eq('is_active', true)
      .single()

    if (planError) {
      console.error('Error fetching subscription plan:', planError)
      return NextResponse.json(
        { error: 'Failed to fetch subscription plan' },
        { status: 500 }
      )
    }

    if (!plan) {
      console.error('Subscription plan not found:', planId)
      return NextResponse.json(
        { error: 'Invalid subscription plan' },
        { status: 400 }
      )
    }

    console.log('Found plan:', { name: plan.name, price: plan.price_monthly_cents })

    // Handle enterprise plan (contact sales)
    if (plan.name === 'enterprise') {
      return NextResponse.json({
        error: 'Enterprise plan requires contacting sales',
        contactSales: true,
      })
    }

    // Handle free plan
    if (plan.price_monthly_cents === 0) {
      console.log('Processing free plan subscription')
      
      // Create a free subscription directly
      const { error: subError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_id: planId,
          stripe_customer_id: `free_${userId}`,
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
        })

      if (subError) {
        console.error('Error creating free subscription:', subError)
        return NextResponse.json(
          { error: 'Failed to create free subscription' },
          { status: 500 }
        )
      }

      console.log('Free subscription created successfully')
      return NextResponse.json({
        success: true,
        redirectUrl: '/success?plan=free',
      })
    }

    // Validate Stripe price ID for paid plans
    if (!plan.stripe_price_id_monthly) {
      console.error('Missing Stripe price ID for plan:', plan.name)
      return NextResponse.json(
        { error: 'Subscription plan not properly configured. Please contact support.' },
        { status: 500 }
      )
    }

    console.log('Using Stripe price ID:', plan.stripe_price_id_monthly)

    // Create or get Stripe customer
    let customerId: string

    // Check if user already has a Stripe customer ID
    console.log('Checking for existing Stripe customer for user:', userId)
    const { data: existingSubscription, error: customerCheckError } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (customerCheckError) {
      console.error('Error checking existing customer:', customerCheckError)
      return NextResponse.json(
        { error: 'Failed to check existing customer' },
        { status: 500 }
      )
    }

    if (existingSubscription?.stripe_customer_id) {
      customerId = existingSubscription.stripe_customer_id
      console.log('Using existing customer ID:', customerId)
    } else {
      // Create new Stripe customer
      console.log('Creating new Stripe customer for:', userEmail)
      try {
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: {
            userId: userId,
          },
        })
        customerId = customer.id
        console.log('Created new customer ID:', customerId)
      } catch (stripeError) {
        console.error('Error creating Stripe customer:', stripeError)
        return NextResponse.json(
          { error: 'Failed to create customer account' },
          { status: 500 }
        )
      }
    }

    // Create Stripe checkout session
    console.log('Creating Stripe checkout session...')
    try {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: plan.stripe_price_id_monthly,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/cancel`,
        metadata: {
          userId: userId,
          planId: planId,
        },
        subscription_data: {
          metadata: {
            userId: userId,
            planId: planId,
          },
        },
        allow_promotion_codes: true,
        billing_address_collection: 'required',
      })

      console.log('Checkout session created successfully:', session.id)
      return NextResponse.json({
        url: session.url,
      })
    } catch (stripeError) {
      console.error('Error creating Stripe checkout session:', stripeError)
      return NextResponse.json(
        { error: 'Failed to create checkout session. Please try again.' },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Unexpected error in checkout session creation:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
