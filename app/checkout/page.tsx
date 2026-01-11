'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Check, Calendar, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface SubscriptionPlan {
  id: string
  name: string
  display_name: string
  description: string
  price_monthly_cents: number
  max_teams: number
  max_members_per_team: number
  features: string[]
}

function CheckoutContent() {
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const planId = searchParams.get('plan')

  useEffect(() => {
    const init = async () => {
      try {
        // Force completely fresh authentication check
        console.log('Performing completely fresh authentication check on checkout page...')
        
        // Clear any cached user state first
        setUser(null)
        
        // First, try to get the current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError || !session) {
          console.log('No valid session found, user is unauthenticated')
          setUser(null)
          router.push('/auth/signup')
          return
        }
        
        // Check if session is expired
        if (session.expires_at && new Date(session.expires_at) < new Date()) {
          console.log('Session expired, treating as unauthenticated')
          setUser(null)
          router.push('/auth/signup')
          return
        }
        
        // Session exists and is valid, now get user to verify it's still valid
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        
        if (userError || !user) {
          console.log('Session exists but user validation failed, treating as unauthenticated')
          setUser(null)
          router.push('/auth/signup')
          return
        }
        
        // Verify user exists in database
        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('id, email')
          .eq('id', user.id)
          .single()
        
        if (profileError || !userProfile) {
          console.log('User profile not found, treating as unauthenticated')
          setUser(null)
          router.push('/auth/signup')
          return
        }
        
        console.log('Valid authenticated user found for checkout:', user.email)
        setUser(user)

        // Get plan details
        if (!planId) {
          console.log('No plan ID provided')
          router.push('/subscribe')
          return
        }

        const { data: planData, error: planError } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('id', planId)
          .eq('is_active', true)
          .single()

        if (planError || !planData) {
          console.error('Error fetching plan:', planError)
          router.push('/subscribe')
          return
        }

        setPlan(planData)

      } catch (error) {
        console.error('Error initializing checkout:', error)
        router.push('/subscribe')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [planId, router])

  const handleCheckout = async () => {
    if (!plan || !user) return

    setIsProcessing(true)

    try {
      // Triple-check authentication with fresh session validation
      console.log('Performing final authentication check before checkout...')
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
      
      if (sessionError || !session || userError || !currentUser || currentUser.id !== user.id) {
        console.error('Final authentication check failed:', sessionError || userError)
        alert('Your session has expired. Please sign in again.')
        router.push('/auth/signin')
        return
      }

      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId: plan.id,
          userId: user.id,
          userEmail: user.email,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('Error creating checkout session:', data)
        
        // Handle specific error cases
        if (response.status === 401) {
          alert('Your session has expired. Please sign in again.')
          router.push('/auth/signin')
        } else {
          alert(`Error creating checkout session: ${data.error || 'Please try again.'}`)
        }
        return
      }

      if (data.url) {
        window.location.href = data.url
      } else if (data.redirectUrl) {
        // Handle free plan redirect
        window.location.href = data.redirectUrl
      } else {
        console.error('No URL returned from checkout session')
        alert('Error: No checkout URL received. Please try again.')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error creating checkout session. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const formatPrice = (cents: number) => {
    if (cents === 0) return 'Free'
    if (cents === -1) return 'Custom'
    return `€${(cents / 100).toFixed(0)}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading checkout...</p>
        </div>
      </div>
    )
  }

  if (!plan || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Invalid checkout session</p>
          <Link href="/subscribe">
            <Button className="mt-4">Back to Plans</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <Calendar className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900 dark:text-white">AISchedulator</span>
          </Link>
          <Link href="/subscribe">
            <Button variant="ghost">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Plans
            </Button>
          </Link>
        </nav>
      </header>

      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Complete Your Subscription
            </h1>
            <p className="text-xl text-gray-600">
              You are almost ready to start optimizing your medical scheduling
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Plan Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Selected Plan</span>
                  <Badge variant="outline">{plan.display_name}</Badge>
                </CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center">
                  <div className="text-4xl font-bold text-gray-900 mb-2">
                    {formatPrice(plan.price_monthly_cents)}
                  </div>
                  {plan.price_monthly_cents > 0 && (
                    <div className="text-gray-600">per month</div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center text-sm">
                    <Check className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                    <span>
                      {plan.max_teams === -1 ? 'Unlimited' : plan.max_teams} team{plan.max_teams !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Check className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                    <span>
                      {plan.max_members_per_team === -1 ? 'Unlimited' : plan.max_members_per_team} members per team
                    </span>
                  </div>
                  {plan.features.map((feature, index) => (
                    <div key={index} className="flex items-center text-sm">
                      <Check className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Checkout Form */}
            <Card>
              <CardHeader>
                <CardTitle>Checkout Details</CardTitle>
                <CardDescription>
                  {plan.price_monthly_cents === 0 
                    ? 'Your free plan will be activated immediately'
                    : 'Secure payment powered by Stripe'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Account</label>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    {user && user.email ? (
                      <>
                        <div className="font-medium">{user.email}</div>
                        <div className="text-sm text-gray-600">Logged in user</div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium text-gray-500">Not logged in</div>
                        <div className="text-sm text-gray-600">Please sign in to continue</div>
                      </>
                    )}
                  </div>
                </div>

                {plan.price_monthly_cents > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Payment</label>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">
                        You will be redirected to Stripe to securely enter your payment information.
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-medium">Total</span>
                    <span className="text-2xl font-bold">
                      {formatPrice(plan.price_monthly_cents)}
                      {plan.price_monthly_cents > 0 && (
                        <span className="text-sm font-normal text-gray-600">/month</span>
                      )}
                    </span>
                  </div>

                  <Button 
                    onClick={handleCheckout}
                    disabled={isProcessing}
                    className="w-full"
                    size="lg"
                  >
                    {isProcessing ? 'Processing...' : 
                     plan.price_monthly_cents === 0 ? 'Activate Free Plan' : 'Complete Payment'}
                  </Button>

                  <div className="text-center mt-4">
                    <div className="flex justify-center space-x-4 text-xs text-gray-500">
                      <span>✓ Secure payment</span>
                      <span>✓ Cancel anytime</span>
                      <span>✓ 30-day guarantee</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center space-x-2 mb-8">
            <Calendar className="h-8 w-8 text-blue-400" />
            <span className="text-2xl font-bold">AISchedulator</span>
          </div>
          <div className="text-center text-gray-400">
            <p>&copy; {new Date().getFullYear()} AISchedulator. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function CheckoutLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading checkout...</p>
      </div>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutLoading />}>
      <CheckoutContent />
    </Suspense>
  )
}
