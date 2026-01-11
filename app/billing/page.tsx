'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Separator } from '../../components/ui/separator'
import { 
  CreditCard, 
  Download, 
  Calendar, 
  Users, 
  Building, 
  AlertCircle,
  CheckCircle,
  XCircle,
  ExternalLink
} from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Subscription {
  id: string
  status: string
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  stripe_customer_id: string
  subscription_plans: {
    display_name: string
    max_teams: number
    max_members_per_team: number
    price_monthly_cents: number
  }
}

interface BillingHistory {
  id: string
  amount_cents: number
  currency: string
  status: string
  created_at: string
  invoice_url: string
  pdf_url: string
}

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [billingHistory, setBillingHistory] = useState<BillingHistory[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      try {
        // Get current user
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) {
          router.push('/auth/signin')
          return
        }

        // Fetch current subscription
        const { data: subData, error: subError } = await supabase
          .from('subscriptions')
          .select(`
            *,
            subscription_plans (*)
          `)
          .eq('user_id', user.id)
          .in('status', ['active', 'trialing', 'past_due'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!subError && subData) {
          setSubscription(subData)
        }

        // Fetch billing history
        const { data: billingData, error: billingError } = await supabase
          .from('billing_history')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10)

        if (!billingError && billingData) {
          setBillingHistory(billingData)
        }

      } catch (error) {
        console.error('Error loading billing data:', error)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [router])

  const formatPrice = (cents: number) => {
    return `€${(cents / 100).toFixed(2)}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'trialing':
        return <Calendar className="h-4 w-4 text-blue-600" />
      case 'past_due':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />
      case 'canceled':
        return <XCircle className="h-4 w-4 text-red-600" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'trialing':
        return 'bg-blue-100 text-blue-800'
      case 'past_due':
        return 'bg-yellow-100 text-yellow-800'
      case 'canceled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const handleManageSubscription = async () => {
    if (!subscription) return

    try {
      // Create Stripe customer portal session
      const response = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: subscription.stripe_customer_id,
          returnUrl: `${window.location.origin}/billing`,
        }),
      })

      const { url, error } = await response.json()

      if (error) {
        console.error('Error creating portal session:', error)
        alert('Error opening billing portal. Please try again.')
        return
      }

      if (url) {
        window.location.href = url
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error opening billing portal. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading billing information...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Billing & Subscription</h1>
            <p className="text-gray-600">Manage your subscription and view billing history</p>
          </div>

          {/* Current Subscription */}
          {subscription ? (
            <Card className="mb-8">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center">
                      <CreditCard className="h-5 w-5 mr-2" />
                      Current Subscription
                    </CardTitle>
                    <CardDescription>
                      {subscription.subscription_plans?.display_name}
                    </CardDescription>
                  </div>
                  <Badge className={getStatusColor(subscription.status)}>
                    <div className="flex items-center">
                      {getStatusIcon(subscription.status)}
                      <span className="ml-1 capitalize">{subscription.status}</span>
                    </div>
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center">
                    <Users className="h-4 w-4 text-gray-500 mr-2" />
                    <div>
                      <p className="text-sm font-medium">Teams</p>
                      <p className="text-sm text-gray-600">
                        {subscription.subscription_plans?.max_teams === -1 
                          ? 'Unlimited' 
                          : subscription.subscription_plans?.max_teams}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Building className="h-4 w-4 text-gray-500 mr-2" />
                    <div>
                      <p className="text-sm font-medium">Members per team</p>
                      <p className="text-sm text-gray-600">
                        {subscription.subscription_plans?.max_members_per_team === -1 
                          ? 'Unlimited' 
                          : subscription.subscription_plans?.max_members_per_team}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 text-gray-500 mr-2" />
                    <div>
                      <p className="text-sm font-medium">Next billing</p>
                      <p className="text-sm text-gray-600">
                        {formatDate(subscription.current_period_end)}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {formatPrice(subscription.subscription_plans?.price_monthly_cents || 0)}/month
                    </p>
                    {subscription.cancel_at_period_end && (
                      <p className="text-sm text-yellow-600">
                        Subscription will cancel at the end of the current period
                      </p>
                    )}
                  </div>
                  <Button onClick={handleManageSubscription}>
                    Manage Subscription
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="mb-8">
              <CardContent className="text-center py-8">
                <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Subscription</h3>
                <p className="text-gray-600 mb-4">
                  You&apos;re currently using our free plan. Upgrade to unlock more features.
                </p>
                <Button onClick={() => router.push('/subscribe')}>
                  View Plans
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Billing History */}
          <Card>
            <CardHeader>
              <CardTitle>Billing History</CardTitle>
              <CardDescription>
                Your recent invoices and payments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {billingHistory.length > 0 ? (
                <div className="space-y-4">
                  {billingHistory.map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 mr-4">
                          {getStatusIcon(invoice.status)}
                        </div>
                        <div>
                          <p className="font-medium">
                            {formatPrice(invoice.amount_cents)} {invoice.currency.toUpperCase()}
                          </p>
                          <p className="text-sm text-gray-600">
                            {formatDate(invoice.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge className={getStatusColor(invoice.status)}>
                          {invoice.status}
                        </Badge>
                        {invoice.pdf_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(invoice.pdf_url, '_blank')}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            PDF
                          </Button>
                        )}
                        {invoice.invoice_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(invoice.invoice_url, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-600">No billing history available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
