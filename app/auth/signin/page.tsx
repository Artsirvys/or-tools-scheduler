"use client"

import type React from "react"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar, Eye, EyeOff, Users, CheckCircle, AlertCircle } from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { Alert, AlertDescription } from "@/components/ui/alert"

function SignInContent() {
  const searchParams = useSearchParams()
  const teamId = searchParams.get('team')
  const invitedEmail = searchParams.get('email')
  const message = searchParams.get('message')
  
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState(invitedEmail || "")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [teamInfo, setTeamInfo] = useState<{ name: string; department: string } | null>(null)
  
  // Get message text based on message type
  const getMessageContent = () => {
    switch (message) {
      case 'email_confirmed':
        return {
          type: 'success' as const,
          title: 'Email Successfully Confirmed!',
          description: 'Your email has been confirmed. Please sign in to continue.'
        }
      case 'link_expired':
        return {
          type: 'error' as const,
          title: 'Confirmation Link Expired',
          description: 'The email confirmation link has expired. Please sign in if you\'ve already confirmed your email, or sign up again to receive a new confirmation link.'
        }
      case 'link_already_used':
        return {
          type: 'info' as const,
          title: 'Link Already Used',
          description: 'This confirmation link has already been used. Your email is already confirmed. Please sign in to continue.'
        }
      case 'confirmation_error':
        return {
          type: 'error' as const,
          title: 'Confirmation Error',
          description: 'There was an issue confirming your email. Please sign in if you\'ve already confirmed, or try signing up again.'
        }
      case 'no_code':
        return {
          type: 'info' as const,
          title: 'Ready to Sign In',
          description: 'Your email may already be confirmed. Please sign in to continue, or sign up if you don\'t have an account yet.'
        }
      default:
        return null
    }
  }
  
  const messageContent = getMessageContent()

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
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    console.log('Form submitted, preventing default behavior')
    console.log('Current URL before login:', window.location.href)
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('Supabase Anon Key exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    setIsLoading(true)

    try {
      // Test database connection first
      console.log('Testing database connection...')
      const { error: testError } = await supabase
        .from('users')
        .select('count')
        .limit(1)
      
      if (testError) {
        console.error('Database connection test failed:', testError)
        alert(`Database connection failed: ${testError.message}. Please check your Supabase project status.`)
        setIsLoading(false)
        return
      }
      
      console.log('Database connection test successful')

      console.log('Attempting sign in with:', email)
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error('Sign in error:', error)
        // More specific error handling for CORS issues
        if (error.message.includes('CORS') || error.message.includes('Access-Control-Allow-Origin')) {
          alert('CORS Error: Please check your Supabase CORS settings. Contact your administrator.')
        } else {
          alert(error.message)
        }
        setIsLoading(false)
        return
      }

      console.log('Sign in successful, user ID:', data.user.id)

      // Get user account type to determine redirect
      console.log('Fetching user profile from database...')
      const { data: userData, error: profileError } = await supabase
        .from('users')
        .select('account_type')
        .eq('id', data.user.id)
        .single()

      if (profileError || !userData) {
        // User exists in auth but not in users table - try to create profile
        console.log('User profile not found, attempting to create missing profile')
        
        try {
          // For team invitations, create profile with team context
          if (teamId) {
            const profileResponse = await fetch('/api/create-user-profile', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userId: data.user.id,
                email: data.user.email,
                firstName: data.user.user_metadata?.first_name || 'User',
                lastName: data.user.user_metadata?.last_name || 'User',
                accountType: 'participant',
                role: 'participant',
                department: teamInfo?.department || '',
                teamId: teamId
              })
            })

            if (profileResponse.ok) {
              console.log('Missing profile created successfully for team invitation')
              
              // Redirect to participant dashboard since they're now in the team
              window.location.href = '/participant/dashboard'
              return
            } else {
              console.log('Failed to create missing profile for team invitation')
              // Fall back to participant dashboard
              window.location.href = '/participant/dashboard'
              return
            }
          } else {
            // Regular profile creation for non-team invitations
            // Use account_type from user_metadata if available
            const accountTypeFromMetadata = data.user.user_metadata?.account_type || 'participant'
            
            const profileResponse = await fetch('/api/create-user-profile', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userId: data.user.id,
                email: data.user.email,
                firstName: data.user.user_metadata?.first_name || 'User',
                lastName: data.user.user_metadata?.last_name || 'User',
                accountType: accountTypeFromMetadata, // Use account_type from signup metadata
                role: data.user.user_metadata?.title || data.user.user_metadata?.role || 'other',
                department: data.user.user_metadata?.department || ''
              })
            })

            if (profileResponse.ok) {
              console.log('Missing profile created successfully with account_type:', accountTypeFromMetadata)
              // Redirect based on account type
              if (accountTypeFromMetadata === 'participant') {
                window.location.href = '/participant/dashboard'
              } else {
                window.location.href = '/dashboard'
              }
              return
            } else {
              console.log('Failed to create missing profile, defaulting to participant dashboard')
              window.location.href = '/participant/dashboard'
              return
            }
          }
        } catch (error) {
          console.error('Error creating missing profile:', error)
          // Default to participant dashboard for safety
          window.location.href = '/participant/dashboard'
          return
        }
      }
      
      console.log('User profile found:', userData)
      console.log('Account type:', userData?.account_type)
      
      // Redirect based on account type
      if (userData?.account_type === 'participant') {
        console.log('Account type is participant, redirecting to participant dashboard')
        
        // If this is a team invitation, ensure user is in the team
        if (teamId) {
          console.log('Team invitation detected, ensuring team membership')
          // Check if user is already in the team
          const { data: existingMember } = await supabase
            .from('team_members')
            .select('*')
            .eq('team_id', teamId)
            .eq('user_id', data.user.id)
            .single()

          if (!existingMember) {
            // Add user to team
            try {
              const { error: addMemberError } = await supabase
                .from('team_members')
                .insert({
                  team_id: teamId,
                  user_id: data.user.id,
                  experience_level: 1
                })

              if (addMemberError) {
                console.error('Error adding user to team:', addMemberError)
              } else {
                console.log('User successfully added to team')
              }
            } catch (error) {
              console.error('Error adding user to team:', error)
            }
          }
        }
        
        window.location.href = '/participant/dashboard'
        return
      } else {
        console.log('Account type is host (or undefined), redirecting to host dashboard')
        window.location.href = '/dashboard'
        return
      }
    } catch (error) {
      console.error('Sign in error:', error)
      alert('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
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
          
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>
            {teamInfo ? "Sign in to complete your team invitation" : "Sign in to your account to continue"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {messageContent && (
            <Alert 
              variant={messageContent.type === 'error' ? 'destructive' : messageContent.type === 'success' ? 'default' : 'default'}
              className={`mb-4 ${messageContent.type === 'success' ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : messageContent.type === 'info' ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : ''}`}
            >
              {messageContent.type === 'success' ? (
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription className={messageContent.type === 'success' ? 'text-green-800 dark:text-green-200' : messageContent.type === 'info' ? 'text-blue-800 dark:text-blue-200' : ''}>
                <div className="font-semibold mb-1">{messageContent.title}</div>
                <div className="text-sm">{messageContent.description}</div>
              </AlertDescription>
            </Alert>
          )}
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="doctor@hospital.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <Link href="/auth/forgot-password" className="text-blue-600 hover:underline">
              Forgot your password?
            </Link>
          </div>

          <div className="mt-4 text-center text-sm">
            {"Don't have an account? "}
            <Link href="/auth/signup" className="text-blue-600 hover:underline">
              Sign up
            </Link>
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
            <p className="text-gray-600 dark:text-gray-300">Loading sign in...</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SignInContent />
    </Suspense>
  )
}
