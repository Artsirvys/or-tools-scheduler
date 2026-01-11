import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Check if user profile already exists
    const { data: existingProfile } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single()

    if (existingProfile) {
      return NextResponse.json(
        { success: true, message: 'Profile already exists' }
      )
    }

    // Get user metadata from auth
    const userMetadata = user.user_metadata || {}
    
    // Create user profile
    const { error: profileError } = await supabase
      .from('users')
      .insert([
        {
          id: user.id,
          email: user.email!,
          first_name: userMetadata.first_name || 'Unknown',
          last_name: userMetadata.last_name || 'User',
          account_type: userMetadata.account_type || 'participant', // Use account_type from signup metadata, fallback to participant for invited users
          role: userMetadata.role || 'other',
          department: userMetadata.department || 'Unknown',
        }
      ])

    if (profileError) {
      console.error('Error creating user profile:', profileError)
      return NextResponse.json(
        { success: false, message: 'Failed to create profile' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, message: 'Profile created successfully' }
    )
  } catch (error) {
    console.error('Error in create-missing-profile:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
} 