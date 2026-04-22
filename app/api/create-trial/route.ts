import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await sessionSupabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { planId } = body

    // Validate required fields
    if (!planId) {
      return NextResponse.json(
        { error: 'Missing required field: planId' },
        { status: 400 }
      )
    }

    // Create Supabase client with service role key to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Handle special case for default host plan
    let plan
    if (planId === 'default-host-plan') {
      // Get the free plan for host accounts
      const { data: freePlan, error: freePlanError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('name', 'free')
        .eq('is_active', true)
        .single()

      if (freePlanError || !freePlan) {
        console.error('Error fetching free plan:', freePlanError)
        return NextResponse.json(
          { error: 'Free plan not found' },
          { status: 400 }
        )
      }
      plan = freePlan
    } else {
      // Verify the plan exists and is not free
      const { data: fetchedPlan, error: planError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .eq('is_active', true)
        .single()

      if (planError || !fetchedPlan) {
        console.error('Error fetching plan:', planError)
        return NextResponse.json(
          { error: 'Invalid plan ID' },
          { status: 400 }
        )
      }
      plan = fetchedPlan
    }

    // Don't create trials for free plans
    if (plan.price_monthly_cents === 0) {
      console.log('Free plan selected, no trial needed')
      return NextResponse.json({
        success: true,
        message: 'Free plan selected, no trial needed',
        isFreePlan: true
      })
    }

    // Check if user already has an active trial
    const { data: existingTrial, error: trialCheckError } = await supabase
      .from('trial_periods')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('trial_end', new Date().toISOString())
      .single()

    if (trialCheckError && trialCheckError.code !== 'PGRST116') {
      console.error('Error checking existing trial:', trialCheckError)
      return NextResponse.json(
        { error: `Failed to check existing trial: ${trialCheckError.message}` },
        { status: 500 }
      )
    }

    if (existingTrial) {
      console.log('User already has an active trial')
      return NextResponse.json({
        success: true,
        message: 'User already has an active trial',
        trialId: existingTrial.id,
        isExistingTrial: true
      })
    }

    // Create trial period with plan-based limits
    console.log('Creating trial period...')
    const trialStart = new Date()
    const trialEnd = new Date(trialStart.getTime() + (14 * 24 * 60 * 60 * 1000)) // 14 days

    // Set generation limits based on plan
    // These limits are designed to give users a good taste of the service
    // while encouraging them to upgrade for more usage
    let maxGenerations = 3 // Default for team plans
    if (plan.name === 'free') {
      maxGenerations = 1 // Free plan trial gets minimal generations (1 schedule)
    } else if (plan.name === 'team') {
      maxGenerations = 3 // Team plan trial gets 3 generations (1 month of schedules)
    } else if (plan.name === 'department') {
      maxGenerations = 5 // Department trial gets 5 generations (more flexibility)
    } else if (plan.name === 'enterprise') {
      maxGenerations = 10 // Enterprise trial gets 10 generations (full evaluation)
    }

    const { data: trial, error: trialError } = await supabase
      .from('trial_periods')
      .insert({
        user_id: user.id,
        plan_id: planId,
        trial_start: trialStart.toISOString(),
        trial_end: trialEnd.toISOString(),
        status: 'active',
        schedule_generations_used: 0,
        max_schedule_generations: maxGenerations
      })
      .select()
      .single()

    if (trialError) {
      console.error('Error creating trial:', trialError)
      return NextResponse.json(
        { error: `Failed to create trial: ${trialError.message}` },
        { status: 500 }
      )
    }

    console.log('Trial created successfully:', trial)
    return NextResponse.json({
      success: true,
      message: 'Trial created successfully',
      trialId: trial.id,
      trialEnd: trial.trial_end,
      daysRemaining: Math.ceil((new Date(trial.trial_end).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    })

  } catch (error) {
    console.error('Unexpected error in create-trial API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
