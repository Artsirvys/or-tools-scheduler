"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useLocale } from 'next-intl'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar, Users, CheckCircle } from "lucide-react"
import { supabase } from "@/lib/supabase"

function InviteContent() {
  const locale = useLocale()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<'loading' | 'form' | 'processing' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [teamInfo, setTeamInfo] = useState<{ name: string; department: string } | null>(null)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: ''
  })

  useEffect(() => {
    // Check if this is a valid invitation
    const checkInvitation = async () => {
      try {
        setStatus('loading')
        
        // Get email and team from URL params
        const email = searchParams.get('email')
        const teamId = searchParams.get('team')
        
        if (!email || !teamId) {
          setStatus('error')
          setMessage('Invalid invitation link')
          return
        }

        // Check if user already has an account
        const { data: existingUser } = await supabase
          .from('users')
          .select('id, account_type')
          .eq('email', email)
          .single()

        if (existingUser) {
          // User already exists, check if they're in the team
          const { data: teamMember } = await supabase
            .from('team_members')
            .select('*')
            .eq('team_id', teamId)
            .eq('user_id', existingUser.id)
            .single()

          if (teamMember) {
            // User is already in the team, redirect to dashboard
            window.location.href = `/${locale}/participant/dashboard`
            return
          } else {
            // User exists but not in team, redirect to signin
            window.location.href = `/${locale}/auth/signin?email=${encodeURIComponent(email)}&team=${teamId}`
            return
          }
        }

        // User doesn't exist, show form to complete setup
        setStatus('form')
        await fetchTeamInfo()
        
      } catch (error) {
        console.error('Error checking invitation:', error)
        // If error is PGRST116 (no rows), user doesn't exist, show form
        if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST116') {
          setStatus('form')
          fetchTeamInfo()
        } else {
          setStatus('error')
          setMessage('Invalid or expired invitation link')
        }
      }
    }

    checkInvitation()
  }, [])

  const fetchTeamInfo = async () => {
    try {
      // Try to get team info from URL params or session
      const teamId = searchParams.get('team')
      if (teamId) {
        const { data, error } = await supabase
          .from('teams')
          .select('name, department')
          .eq('id', teamId)
          .single()

        if (!error && data) {
          setTeamInfo(data)
        }
      }
    } catch (error) {
      console.error('Error fetching team info:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (formData.password !== formData.confirmPassword) {
      setMessage('Passwords do not match')
      return
    }

    if (formData.password.length < 6) {
      setMessage('Password must be at least 6 characters')
      return
    }

    setIsLoading(true)
    setStatus('processing')
    setMessage('Creating your account...')

    try {
      // Get email from URL params
      const email = searchParams.get('email')
      if (!email) {
        throw new Error('No email provided in invitation')
      }

      // Step 1: Create user account with Supabase Auth
      setMessage('Creating your account...')
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: formData.password,
        options: {
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            team_id: searchParams.get('team'),
            role: 'participant'
          }
        }
      })

      if (authError) {
        throw new Error(`Failed to create account: ${authError.message}`)
      }

      if (!authData.user) {
        throw new Error('Account creation failed')
      }

      console.log('User account created successfully:', authData.user.id)

      // Step 2: Create user profile
      setMessage('Setting up your profile...')
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: email,
          first_name: formData.firstName,
          last_name: formData.lastName,
          account_type: 'participant',
          role: 'participant',
          department: teamInfo?.department || ''
        })

      if (profileError) {
        console.error('Profile creation error:', profileError)
        // Don't fail completely, try to continue
      } else {
        console.log('User profile created successfully')
      }

      // Step 3: Add user to team if teamId is available
      const teamId = searchParams.get('team')
      if (teamId) {
        setMessage('Adding you to the team...')
        try {
          const { error: teamError } = await supabase
            .from('team_members')
            .insert({
              team_id: teamId,
              user_id: authData.user.id,
              experience_level: 1
            })

          if (teamError) {
            console.error('Team membership error:', teamError)
            // Don't fail the whole process if team addition fails
          } else {
            console.log('User successfully added to team')
          }
        } catch (error) {
          console.error('Error adding to team:', error)
        }
      }

      setStatus('success')
      setMessage('Account setup complete! Redirecting to dashboard...')
      
      // Redirect to dashboard
      setTimeout(() => {
        window.location.href = `/${locale}/participant/dashboard`
      }, 2000)

    } catch (error) {
      console.error('Error setting up account:', error)
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Failed to set up account')
    } finally {
      setIsLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-300">Loading invitation...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Calendar className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold">AISchedulator</span>
            </div>
            <CardTitle className="text-2xl text-red-600">Invitation Error</CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => window.location.href = `/${locale}/auth/signin`}>
              Go to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'form') {
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
            
            <CardTitle className="text-2xl">Complete Your Account</CardTitle>
            <CardDescription>
              Please provide your details to complete your team invitation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  required
                  minLength={6}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  required
                  minLength={6}
                />
              </div>
              
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Setting up...' : 'Complete Setup'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'processing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-300">{message}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="text-center py-12">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-green-600 mb-2">Welcome to the Team!</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">{message}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
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

export default function InvitePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <InviteContent />
    </Suspense>
  )
}
