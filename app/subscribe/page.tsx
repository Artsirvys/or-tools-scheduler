'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Check, Star, Users, Building, Crown, Calendar } from 'lucide-react'
import { useRouter } from 'next/navigation'
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

export default function SubscribePage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [currentSubscription, setCurrentSubscription] = useState<{
    plan_id: string;
    subscription_plans: SubscriptionPlan;
  } | null>(null)
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      try {
        // Force fresh session check by getting session first, then user
        console.log('Performing fresh authentication check...')
        
        // First, try to get the current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError || !session) {
          console.log('No valid session found, user is unauthenticated')
          setUser(null)
        } else {
          // Session exists, now get user to verify it's still valid
          const { data: { user }, error: userError } = await supabase.auth.getUser()
          
          if (userError || !user) {
            console.log('Session exists but user validation failed, treating as unauthenticated')
            setUser(null)
          } else {
            // Verify user exists in database
            const { data: userProfile, error: profileError } = await supabase
              .from('users')
              .select('id, email')
              .eq('id', user.id)
              .single()
            
            if (profileError || !userProfile) {
              console.log('User profile not found, treating as unauthenticated')
              setUser(null)
            } else {
              console.log('Valid authenticated user found:', user.email)
              setUser(user)
            }
          }
        }

        // Fetch subscription plans
        const { data: plansData, error: plansError } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('is_active', true)
          .order('price_monthly_cents', { ascending: true })

        if (plansError) {
          console.error('Error fetching plans:', plansError)
          return
        }
        setPlans(plansData || [])

        // Check current subscription (only if user is authenticated)
        if (user) {
          const { data: subscriptionData, error: subError } = await supabase
            .from('subscriptions')
            .select(`
              *,
              subscription_plans (*)
            `)
            .eq('user_id', user.id)
            .in('status', ['active', 'trialing'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          
          if (!subError && subscriptionData) {
            setCurrentSubscription(subscriptionData)
          } else {
            setCurrentSubscription(null)
          }
        } else {
          setCurrentSubscription(null) // Reset subscription for unauthenticated users
        }

      } catch (error) {
        console.error('Error initializing:', error)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [router])

  const handlePlanSelection = async (planId: string, planName: string) => {
    // Handle enterprise plan - redirect to contact page
    if (planName === 'enterprise') {
      router.push('/contact')
      return
    }
    
    // For all other plans (free, team, department):
    // - If user is authenticated, redirect to checkout
    // - If user is not authenticated, redirect to signup with plan info
    
    if (user && user.id && user.email) {
      // Triple-check authentication with fresh session validation
      console.log('Performing final authentication check before checkout...')
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
      
      if (sessionError || !session || userError || !currentUser || currentUser.id !== user.id) {
        console.log('Final authentication check failed, redirecting to sign in')
        alert('Your session has expired. Please sign in to continue.')
        router.push('/auth/signin')
        return
      }
      
      // Valid authenticated user - proceed to checkout
      console.log('Proceeding to checkout for authenticated user:', currentUser.email)
      router.push(`/checkout?plan=${planId}`)
    } else {
      // User not authenticated - redirect to signup with plan info
      console.log('User not authenticated, redirecting to signup with plan:', planId)
      router.push(`/auth/signup?plan=${planId}`)
    }
  }

  const formatPrice = (cents: number) => {
    if (cents === 0) return 'Free'
    if (cents === -1) return 'Custom'
    return `€${(cents / 100).toFixed(0)}`
  }

  const getPlanIcon = (planName: string) => {
    switch (planName) {
      case 'free':
        return <Users className="h-6 w-6" />
      case 'team':
        return <Building className="h-6 w-6" />
      case 'department':
        return <Star className="h-6 w-6" />
      case 'enterprise':
        return <Crown className="h-6 w-6" />
      default:
        return <Users className="h-6 w-6" />
    }
  }

  const isCurrentPlan = (planId: string) => {
    return currentSubscription?.plan_id === planId
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading subscription plans...</p>
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
          <div className="flex items-center space-x-6">
            <Link href="/about">
              <Button variant="ghost">About</Button>
            </Link>
            <Link href="/auth/signin">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/auth/signup">
              <Button>Get Started</Button>
            </Link>
          </div>
        </nav>
      </header>

      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Choose the perfect plan for your medical department. Start free and upgrade as you grow.
          </p>
        </div>

        {/* Current Subscription Status - Only show for authenticated users with active subscriptions */}
        {!loading && user && currentSubscription && (
          <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-center">
              <Check className="h-5 w-5 text-green-600 mr-2" />
              <span className="text-green-800 font-medium">
                Current Plan: {currentSubscription.subscription_plans?.display_name}
              </span>
            </div>
          </div>
        )}

        {/* Authentication Notice for Unauthenticated Users */}
        {!loading && !user && (
          <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600 mr-2" />
              <span className="text-blue-800 font-medium">
                Sign in to view your current subscription and manage billing
              </span>
            </div>
          </div>
        )}

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {plans
            .sort((a, b) => {
              // Custom sort order: Free, Team (as Starter), Department (as Pro), Enterprise
              // Use price_monthly_cents for sorting, but handle special cases
              const getSortValue = (plan: SubscriptionPlan) => {
                if (plan.name === 'free') return 0
                if (plan.name === 'team') return 1
                if (plan.name === 'department') return 2
                if (plan.name === 'enterprise') return 3
                return plan.price_monthly_cents || 999
              }
              return getSortValue(a) - getSortValue(b)
            })
            .map((plan) => (
            <Card 
              key={plan.id} 
              className={`relative transition-all duration-200 hover:shadow-lg ${
                plan.name === 'department' ? 'border-blue-500 shadow-lg scale-105' : ''
              }`}
            >
              {plan.name === 'department' && (
                <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white">
                  Most Popular
                </Badge>
              )}
              
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-4">
                  <div className={`p-3 rounded-full ${
                    plan.name === 'free' ? 'bg-gray-100 text-gray-600' :
                    plan.name === 'team' ? 'bg-blue-100 text-blue-600' :
                    plan.name === 'department' ? 'bg-purple-100 text-purple-600' :
                    plan.name === 'enterprise' ? 'bg-yellow-100 text-yellow-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {getPlanIcon(plan.name)}
                  </div>
                </div>
                <CardTitle className="text-2xl font-bold">{plan.display_name}</CardTitle>
                <CardDescription className="text-gray-600 mt-2">
                  {plan.description}
                </CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-gray-900">
                    {formatPrice(plan.price_monthly_cents)}
                  </span>
                  {plan.price_monthly_cents > 0 && (
                    <span className="text-gray-600">/month</span>
                  )}
                  {plan.price_monthly_cents === -1 && (
                    <span className="text-gray-600">/month</span>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-2">
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

              <CardFooter>
                <Button 
                  className="w-full"
                  variant={plan.name === 'department' ? 'default' : 'outline'}
                  onClick={() => handlePlanSelection(plan.id, plan.name)}
                  disabled={isCurrentPlan(plan.id)}
                >
                  {isCurrentPlan(plan.id) ? 'Current Plan' : 
                   plan.name === 'enterprise' ? 'Contact Sales' :
                   plan.name === 'free' || plan.price_monthly_cents === 0 ? 'Get Started Free' : 
                   user ? 'Start Free Trial' : 'Start Free Trial'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Additional Info */}
        <div className="text-center mt-16">
          <p className="text-gray-600 mb-4">
            All plans include 24/7 support and can be cancelled at any time.
          </p>
          <div className="flex justify-center space-x-8 text-sm text-gray-500">
            <span>✓ Secure payments via Stripe</span>
            <span>✓ Cancel anytime</span>
            <span>✓ 30-day money back guarantee</span>
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
