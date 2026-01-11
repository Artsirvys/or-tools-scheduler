'use client'

import { useRouter } from 'next/navigation'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { XCircle, ArrowLeft, RefreshCw } from 'lucide-react'

export default function CancelPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center">
          {/* Cancel Icon */}
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-full mb-4">
              <XCircle className="h-12 w-12 text-red-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Payment Cancelled
            </h1>
            <p className="text-xl text-gray-600">
              Your payment was cancelled. No charges have been made.
            </p>
          </div>

          {/* Information Card */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>What happened?</CardTitle>
              <CardDescription>
                Your subscription setup was interrupted
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-left">
              <div className="flex items-start">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                  <span className="text-blue-600 text-sm font-medium">✓</span>
                </div>
                <div>
                  <p className="font-medium">No charges were made</p>
                  <p className="text-gray-600 text-sm">Your payment method was not charged</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                  <span className="text-blue-600 text-sm font-medium">✓</span>
                </div>
                <div>
                  <p className="font-medium">You can try again anytime</p>
                  <p className="text-gray-600 text-sm">Return to our pricing page to select a plan</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                  <span className="text-blue-600 text-sm font-medium">✓</span>
                </div>
                <div>
                  <p className="font-medium">Free plan still available</p>
                  <p className="text-gray-600 text-sm">You can continue using our free plan with basic features</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reasons for cancellation */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Common reasons for cancellation
            </h2>
            <div className="space-y-3 text-left max-w-md mx-auto">
              <div className="flex items-center text-gray-600">
                <span className="w-2 h-2 bg-gray-400 rounded-full mr-3"></span>
                Changed your mind about the plan
              </div>
              <div className="flex items-center text-gray-600">
                <span className="w-2 h-2 bg-gray-400 rounded-full mr-3"></span>
                Wanted to compare different options
              </div>
              <div className="flex items-center text-gray-600">
                <span className="w-2 h-2 bg-gray-400 rounded-full mr-3"></span>
                Technical issues during checkout
              </div>
              <div className="flex items-center text-gray-600">
                <span className="w-2 h-2 bg-gray-400 rounded-full mr-3"></span>
                Need to discuss with your team first
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={() => router.push('/subscribe')}
              className="flex items-center"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button 
              variant="outline"
              onClick={() => router.push('/dashboard')}
              className="flex items-center"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>

          {/* Support */}
          <div className="mt-12 p-4 bg-blue-50 rounded-lg">
            <p className="text-blue-800">
              <strong>Need help choosing a plan?</strong> Our team is here to help.{' '}
              <a href="mailto:support@medical-scheduler.com" className="underline hover:no-underline">
                Contact us
              </a>{' '}
              for personalized recommendations.
            </p>
          </div>

          {/* Alternative options */}
          <div className="mt-8 p-6 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Alternative options
            </h3>
            <div className="space-y-2 text-gray-600">
              <p>• Start with our <strong>free plan</strong> to test the platform</p>
              <p>• Contact sales for <strong>enterprise pricing</strong> and custom solutions</p>
              <p>• Schedule a <strong>demo</strong> to see all features in action</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
