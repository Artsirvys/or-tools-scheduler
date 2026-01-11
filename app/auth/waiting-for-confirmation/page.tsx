"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Users, Mail } from "lucide-react"
import { supabase } from "@/lib/supabase"

function WaitingForConfirmationContent() {
  const searchParams = useSearchParams()
  const teamId = searchParams.get('teamId')
  const email = searchParams.get('email')
  
  const [teamInfo, setTeamInfo] = useState<{ name: string; department: string } | null>(null)

  // Fetch team info if teamId is provided
  useEffect(() => {
    if (teamId) {
      fetchTeamInfo()
    }
  }, [teamId])

  const fetchTeamInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('name, department')
        .eq('id', teamId)
        .single()

      if (!error && data) {
        setTeamInfo(data)
      }
    } catch (error) {
      console.error('Error fetching team info:', error)
    }
  }

  const handleGoToSignIn = () => {
    window.location.href = `/auth/signin?email=${encodeURIComponent(email || '')}&team=${teamId}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Calendar className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold">AISchedulator</span>
          </div>
          
          {teamInfo && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-300">
                <Users className="h-4 w-4" />
                <span className="font-medium">Team Invitation</span>
              </div>
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                You&apos;re joining <strong>{teamInfo.name}</strong>
                {teamInfo.department && ` (${teamInfo.department})`}
              </p>
            </div>
          )}
          
          <CardTitle className="text-2xl">
            Check Your Email
          </CardTitle>
          <CardDescription>
            We sent you a confirmation email. Please check your inbox and click the confirmation link to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <div className="py-8">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="h-8 w-8 text-blue-600" />
            </div>
            <p className="text-blue-600 dark:text-blue-400 mb-4">
              Please check your email and click the confirmation link to continue.
            </p>
            {email && (
              <p className="text-sm text-gray-500 mb-4">
                Check your email at: <strong>{email}</strong>
              </p>
            )}
            <Button variant="outline" onClick={handleGoToSignIn} className="w-full">
              Go to Sign In
            </Button>
            <p className="text-xs text-gray-400 mt-4">
              After clicking the confirmation link in your email, you will be redirected to sign in.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300">Loading...</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function WaitingForConfirmationPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <WaitingForConfirmationContent />
    </Suspense>
  )
}
