'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { CheckCircle, ArrowRight, Users, Calendar } from 'lucide-react'

function SuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState<{ 
    id: string; 
    status: string; 
    current_period_end: string;
    subscription_plans: { display_name: string; max_teams: number; max_members_per_team: number }
  } | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        // Get current user
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) {
          router.push('/auth/signin')
          return
        }

        // Get the session_id from URL params
        const sessionId = searchParams.get('session_id')
        if (!sessionId) {
          console.error('No session_id found in URL')
          router.push('/subscribe')
          return
        }

        // Verify the subscription was created successfully
        const response = await fetch('/api/verify-subscription', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId,
            userId: user.id,
          }),
        })

        const { subscription: subData, error: verifyError } = await response.json()

        if (verifyError || !subData) {
          console.error('Error verifying subscription:', verifyError)
          router.push('/subscribe')
          return
        }

        setSubscription(subData)

      } catch (error) {
        console.error('Error:', error)
        router.push('/subscribe')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [router, searchParams])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Verifying your subscription...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center">
          {/* Success Icon */}
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Payment Successful!
            </h1>
            <p className="text-xl text-gray-600">
              Your subscription has been activated successfully.
            </p>
          </div>

          {/* Subscription Details */}
          {subscription && (
            <Card className="mb-8 text-left">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Subscription Details
                </CardTitle>
                <CardDescription>
                  Your new plan is now active
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="font-medium">Plan:</span>
                  <span>{subscription.subscription_plans?.display_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Status:</span>
                  <span className="capitalize text-green-600">{subscription.status}</span>
                </div>
                {subscription.current_period_end && (
                  <div className="flex justify-between">
                    <span className="font-medium">Next billing date:</span>
                    <span>{new Date(subscription.current_period_end).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="font-medium">Teams allowed:</span>
                  <span>
                    {subscription.subscription_plans?.max_teams === -1 
                      ? 'Unlimited' 
                      : subscription.subscription_plans?.max_teams}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Members per team:</span>
                  <span>
                    {subscription.subscription_plans?.max_members_per_team === -1 
                      ? 'Unlimited' 
                      : subscription.subscription_plans?.max_members_per_team}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Next Steps */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              What&apos;s Next?
            </h2>
            <div className="space-y-4 text-left max-w-md mx-auto">
              <div className="flex items-start">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                  <span className="text-blue-600 text-sm font-medium">1</span>
                </div>
                <div>
                  <p className="font-medium">Create or manage your teams</p>
                  <p className="text-gray-600 text-sm">Set up your medical teams and invite members</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                  <span className="text-blue-600 text-sm font-medium">2</span>
                </div>
                <div>
                  <p className="font-medium">Configure shifts and availability</p>
                  <p className="text-gray-600 text-sm">Define your shift patterns and team availability</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                  <span className="text-blue-600 text-sm font-medium">3</span>
                </div>
                <div>
                  <p className="font-medium">Generate your first schedule</p>
                  <p className="text-gray-600 text-sm">Use our AI-powered scheduler to create optimal schedules</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={() => router.push('/dashboard')}
              className="flex items-center"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Go to Dashboard
            </Button>
            <Button 
              variant="outline"
              onClick={() => router.push('/billing')}
              className="flex items-center"
            >
              Manage Billing
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>

          {/* Support */}
          <div className="mt-12 p-4 bg-blue-50 rounded-lg">
            <p className="text-blue-800">
              <strong>Need help getting started?</strong> Check out our{' '}
              <a href="/help" className="underline hover:no-underline">
                help center
              </a>{' '}
              or contact our support team.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
