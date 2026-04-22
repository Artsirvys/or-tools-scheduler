"use client"

import type React from "react"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from 'next-intl'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar, Eye, EyeOff, Users, CheckCircle, AlertCircle } from "lucide-react"
import { Link } from "@/i18n/routing"
import { supabase } from "@/lib/supabase"
import { Alert, AlertDescription } from "@/components/ui/alert"

function SignInContent() {
  const locale = useLocale()
  const t = useTranslations('auth.signin')
  const tCommon = useTranslations('common')
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
          title: t('messages.emailConfirmed.title'),
          description: t('messages.emailConfirmed.description')
        }
      case 'link_expired':
        return {
          type: 'error' as const,
          title: t('messages.linkExpired.title'),
          description: t('messages.linkExpired.description')
        }
      case 'link_already_used':
        return {
          type: 'info' as const,
          title: t('messages.linkAlreadyUsed.title'),
          description: t('messages.linkAlreadyUsed.description')
        }
      case 'confirmation_error':
        return {
          type: 'error' as const,
          title: t('messages.confirmationError.title'),
          description: t('messages.confirmationError.description')
        }
      case 'no_code':
        return {
          type: 'info' as const,
          title: t('messages.noCode.title'),
          description: t('messages.noCode.description')
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
    
    setIsLoading(true)

    try {
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
              window.location.href = `/${locale}/participant/dashboard`
              return
            } else {
              console.log('Failed to create missing profile for team invitation')
              // Fall back to participant dashboard
              window.location.href = `/${locale}/participant/dashboard`
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
                window.location.href = `/${locale}/participant/dashboard`
              } else {
                window.location.href = `/${locale}/dashboard`
              }
              return
            } else {
              console.log('Failed to create missing profile, defaulting to participant dashboard')
              window.location.href = `/${locale}/participant/dashboard`
              return
            }
          }
        } catch (error) {
          console.error('Error creating missing profile:', error)
          // Default to participant dashboard for safety
          window.location.href = `/${locale}/participant/dashboard`
          return
        }
      }
      
      console.log('User profile found:', userData)
      console.log('Account type:', userData?.account_type)
      
      // Redirect based on account type
      if (userData?.account_type === 'participant') {
        console.log('Account type is participant, redirecting to participant dashboard')
        
        // If this is a team invitation, ensure user can be added securely.
        if (teamId) {
          try {
            await fetch('/api/create-user-profile', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                firstName: data.user.user_metadata?.first_name || 'User',
                lastName: data.user.user_metadata?.last_name || 'User',
                accountType: 'participant',
                role: data.user.user_metadata?.title || data.user.user_metadata?.role || 'participant',
                department: teamInfo?.department || data.user.user_metadata?.department || '',
                teamId
              })
            })
          } catch (error) {
            console.error('Error ensuring team membership:', error)
          }
        }
        
        window.location.href = `/${locale}/participant/dashboard`
        return
      } else {
        console.log('Account type is host (or undefined), redirecting to host dashboard')
        window.location.href = `/${locale}/dashboard`
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
            <span className="text-2xl font-bold">{tCommon('appName')}</span>
          </div>
          
          {teamInfo && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-300">
                <Users className="h-4 w-4" />
                <span className="font-medium">{t('teamInvitation')}</span>
              </div>
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                {t('joiningTeam')} <strong>{teamInfo.name}</strong>
                {teamInfo.department && ` (${teamInfo.department})`}
              </p>
            </div>
          )}
          
          <CardTitle className="text-2xl">{t('title')}</CardTitle>
          <CardDescription>
            {teamInfo ? t('descriptionWithInvitation') : t('description')}
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
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('password')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t('passwordPlaceholder')}
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
              {isLoading ? t('signingIn') : t('signInButton')}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <Link href="/auth/forgot-password" className="text-blue-600 hover:underline">
              {t('forgotPassword')}
            </Link>
          </div>

          <div className="mt-4 text-center text-sm">
            {t('noAccount')}{' '}
            <Link href="/auth/signup" className="text-blue-600 hover:underline">
              {t('signUpLink')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function LoadingFallback() {
  const t = useTranslations('auth.signin')
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300">{t('loading')}</p>
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
