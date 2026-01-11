"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Users, CheckCircle, AlertCircle } from "lucide-react"
import { supabase } from "@/lib/supabase"

function ConfirmTeamInvitationContent() {
  const searchParams = useSearchParams()
  const userId = searchParams.get('userId')
  const teamId = searchParams.get('teamId')
  const email = searchParams.get('email')
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [teamInfo, setTeamInfo] = useState<{ name: string; department: string } | null>(null)

  const handleTeamInvitation = useCallback(async () => {
    try {
      setStatus('loading')
      setMessage('Setting up your team access...')

      // Fetch team information
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('name, department')
        .eq('id', teamId)
        .single()

      if (teamError) {
        throw new Error('Failed to fetch team information')
      }

      setTeamInfo(teamData)

      // Check if user is already confirmed
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        // User not signed in, redirect to signin
        setMessage('Please sign in to complete your team invitation.')
        setTimeout(() => {
          window.location.href = `/auth/signin?email=${encodeURIComponent(email || '')}&team=${teamId}`
        }, 3000)
        return
      }

      // Check if user profile exists, if not create it
      const { data: existingProfile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!existingProfile) {
        // Profile doesn't exist, try to create it via API
        setMessage('Creating your profile...')
        try {
          const profileResponse = await fetch('/api/create-user-profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: user.id,
              email: email,
              firstName: user.user_metadata?.first_name || 'User',
              lastName: user.user_metadata?.last_name || 'User',
              accountType: 'participant',
              role: 'participant',
              department: teamData?.department || ''
            })
          })

          if (!profileResponse.ok) {
            console.error('Failed to create profile via API')
            throw new Error('Failed to create user profile')
          }

          console.log('Profile created successfully via API')
        } catch (error) {
          console.error('Error creating profile:', error)
          throw new Error('Failed to create user profile')
        }
      }

      // Check if user is already in the team
      const { data: existingMember } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId)
        .eq('user_id', user.id)
        .single()

      if (existingMember) {
        // User is already in the team
        setStatus('success')
        setMessage('You are already a member of this team!')
        setTimeout(() => {
          window.location.href = '/participant/dashboard'
        }, 2000)
        return
      }

      // Add user to team
      const { error: addMemberError } = await supabase
        .from('team_members')
        .insert({
          team_id: teamId,
          user_id: user.id,
          experience_level: 1
        })

      if (addMemberError) {
        console.error('Error adding user to team:', addMemberError)
        throw new Error('Failed to add you to the team')
      }

      // Success! User is now in the team
      setStatus('success')
      setMessage('Successfully joined the team!')
      
      // Redirect to participant dashboard
      setTimeout(() => {
        window.location.href = '/participant/dashboard'
      }, 2000)

    } catch (error) {
      console.error('Error handling team invitation:', error)
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'An unexpected error occurred')
    }
  }, [teamId, email])

  useEffect(() => {
    if (userId && teamId && email) {
      handleTeamInvitation()
    } else {
      setStatus('error')
      setMessage('Invalid invitation link. Please contact your team administrator.')
    }
  }, [userId, teamId, email, handleTeamInvitation])

  const handleSignIn = () => {
    window.location.href = `/auth/signin?email=${encodeURIComponent(email || '')}&team=${teamId}`
  }

  const handleGoToDashboard = () => {
    window.location.href = '/participant/dashboard'
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
            {status === 'loading' && 'Setting up your account...'}
            {status === 'success' && 'Welcome to the team!'}
            {status === 'error' && 'Something went wrong'}
          </CardTitle>
          <CardDescription>
            {status === 'loading' && 'Please wait while we complete your team invitation'}
            {status === 'success' && 'You have successfully joined the team'}
            {status === 'error' && 'There was an issue with your team invitation'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          {status === 'loading' && (
            <div className="py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-300">{message}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-green-600 dark:text-green-400 mb-4">{message}</p>
              <Button onClick={handleGoToDashboard} className="w-full">
                Go to Dashboard
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="py-8">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
              <p className="text-red-600 dark:text-red-400 mb-4">{message}</p>
              <div className="space-y-2">
                <Button onClick={handleSignIn} className="w-full">
                  Sign In
                </Button>
                <Button variant="outline" onClick={() => window.location.href = '/auth/signin'} className="w-full">
                  Go to Sign In
                </Button>
              </div>
            </div>
          )}
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
            <p className="text-gray-600 dark:text-gray-300">Loading team invitation...</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function ConfirmTeamInvitationPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ConfirmTeamInvitationContent />
    </Suspense>
  )
}
