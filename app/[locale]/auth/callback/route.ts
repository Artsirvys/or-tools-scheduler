import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { routing } from '@/i18n/routing'

// Helper to extract locale from URL or use default
function getLocaleFromUrl(url: string): string {
  const localeMatch = url.match(/\/(en|lt|pl|it|de)(\/|$)/)
  return localeMatch ? localeMatch[1] : routing.defaultLocale
}

export async function GET(request: NextRequest) {
  const { searchParams, origin, pathname } = new URL(request.url)
  const code = searchParams.get('code')
  const plan = searchParams.get('plan')
  const locale = getLocaleFromUrl(pathname)

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('Error exchanging code for session:', error)
      
      // Check if the error is because the link was already used or expired
      const errorCode = error.message || ''
      const isExpired = errorCode.includes('expired') || errorCode.includes('otp_expired')
      const isInvalid = errorCode.includes('invalid') || errorCode.includes('access_denied')
      
      // Try to extract email from error description or use empty string
      const userEmail = ''
      // Note: Email extraction from error is not currently implemented
      // but kept for future enhancement if needed
      
      // Determine the appropriate message based on error type
      let messageType = 'confirmation_error'
      if (isExpired) {
        messageType = 'link_expired'
      } else if (isInvalid) {
        // If link is invalid, it might be because it was already used
        // In that case, the user's email is likely already confirmed
        messageType = 'link_already_used'
      }
      
      // Redirect to signin with appropriate message
      const signInUrl = userEmail 
        ? `/${locale}/auth/signin?message=${messageType}&email=${encodeURIComponent(userEmail)}`
        : `/${locale}/auth/signin?message=${messageType}`
      return NextResponse.redirect(`${origin}${signInUrl}`)
    }
    
    if (data?.user) {
      const user = data.user
      const accountType = user.user_metadata?.account_type
      
      console.log('Email confirmation successful for user:', user.email)
      console.log('Account type from metadata:', accountType)
      
      // Create user profile if it doesn't exist (for new signups)
      // Use service role key to bypass RLS
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      
      if (supabaseUrl && supabaseServiceKey) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        })

        // Check if user profile already exists
        const { data: existingProfile, error: profileCheckError } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()

        // Handle profile check error (if it's not a "not found" error)
        if (profileCheckError && profileCheckError.code !== 'PGRST116') {
          console.error('Error checking existing profile in callback:', profileCheckError)
          // Continue anyway - will try to create profile
        }

        // Only create profile if it doesn't exist (new signup)
        if (!existingProfile) {
          // Ensure account_type is preserved from user_metadata
          // For new signups, account_type should always be in metadata
          // Only fallback to 'participant' if account_type is truly missing (backward compatibility)
          const profileAccountType = accountType || 'participant'
          
          console.log('Creating user profile in callback with account_type:', profileAccountType)
          
          const { error: profileError } = await supabaseAdmin
            .from('users')
            .insert([{
              id: user.id,
              email: user.email || '',
              first_name: user.user_metadata?.first_name || 'User',
              last_name: user.user_metadata?.last_name || 'User',
              account_type: profileAccountType,
              role: user.user_metadata?.title || user.user_metadata?.role || 'other',
              department: user.user_metadata?.department || null
            }])

          if (profileError) {
            console.error('Error creating user profile in callback:', profileError)
            // Continue anyway - profile might be created later via signin fallback
          } else {
            console.log('User profile created successfully in callback with account_type:', profileAccountType)
            
            // If this is a host account or plan-based signup, create trial
            if (plan || accountType === 'host') {
              try {
                const planId = plan || 'default-host-plan'

                // Resolve the plan to use for trial creation.
                let targetPlanId = planId
                let planData: { id: string; name: string; price_monthly_cents: number } | null = null

                if (planId === 'default-host-plan') {
                  const { data: freePlan, error: freePlanError } = await supabaseAdmin
                    .from('subscription_plans')
                    .select('id, name, price_monthly_cents')
                    .eq('name', 'free')
                    .eq('is_active', true)
                    .single()

                  if (freePlanError || !freePlan) {
                    console.error('Free plan not found in callback')
                  } else {
                    targetPlanId = freePlan.id
                    planData = freePlan
                  }
                } else {
                  const { data: fetchedPlan, error: fetchedPlanError } = await supabaseAdmin
                    .from('subscription_plans')
                    .select('id, name, price_monthly_cents')
                    .eq('id', planId)
                    .eq('is_active', true)
                    .single()

                  if (fetchedPlanError || !fetchedPlan) {
                    console.error('Invalid plan for trial creation in callback')
                  } else {
                    planData = fetchedPlan
                  }
                }

                // For paid plans, create a trial if none exists.
                if (planData && planData.price_monthly_cents > 0) {
                  const { data: existingTrial } = await supabaseAdmin
                    .from('trial_periods')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('status', 'active')
                    .gt('trial_end', new Date().toISOString())
                    .maybeSingle()

                  if (!existingTrial) {
                    const trialStart = new Date()
                    const trialEnd = new Date(trialStart.getTime() + (14 * 24 * 60 * 60 * 1000))

                    let maxGenerations = 3
                    if (planData.name === 'department') maxGenerations = 5
                    if (planData.name === 'enterprise') maxGenerations = 10

                    const { error: trialInsertError } = await supabaseAdmin
                      .from('trial_periods')
                      .insert({
                        user_id: user.id,
                        plan_id: targetPlanId,
                        trial_start: trialStart.toISOString(),
                        trial_end: trialEnd.toISOString(),
                        status: 'active',
                        schedule_generations_used: 0,
                        max_schedule_generations: maxGenerations
                      })

                    if (trialInsertError) {
                      console.error('Trial creation failed in callback:', trialInsertError)
                    }
                  }
                }
              } catch (trialError) {
                console.error('Error creating trial in callback:', trialError)
                // Continue anyway - trial can be created later
              }
            }
          }
        } else {
          console.log('User profile already exists in callback')
        }
      } else {
        console.warn('Supabase environment variables not configured, skipping profile creation')
      }
      
      // Redirect to signin page after email confirmation with success message
      const signInUrl = `/${locale}/auth/signin?email=${encodeURIComponent(user.email || '')}&message=email_confirmed`
      return NextResponse.redirect(`${origin}${signInUrl}`)
    } else {
      console.error('No user data after code exchange')
      // Redirect to signin with error message instead of error page
      return NextResponse.redirect(`${origin}/${locale}/auth/signin?message=confirmation_error`)
    }
  }

  // No code provided - this might happen if link was already used or email is already confirmed
  // Redirect to signin with informational message (not an error)
  console.log('No confirmation code provided - email may already be confirmed')
  return NextResponse.redirect(`${origin}/${locale}/auth/signin?message=no_code`)
}
