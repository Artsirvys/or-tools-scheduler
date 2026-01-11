import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  console.log('create-user-profile API called')
  
  try {
    const body = await request.json()
    console.log('Request body:', body)
    
    const { userId, email, firstName, lastName, accountType = 'participant', role, department, teamId } = body

    // Validate required fields
    if (!userId || !email || !firstName || !lastName) {
      console.error('Missing required fields:', { userId, email, firstName, lastName })
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create Supabase client with service role key to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('Service role client created, bypassing RLS policies')

    // Check if user profile already exists
    console.log('Checking if user profile exists...')
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileCheckError && profileCheckError.code !== 'PGRST116') {
      console.error('Error checking existing profile:', profileCheckError)
      return NextResponse.json(
        { error: `Failed to check existing profile: ${profileCheckError.message}` },
        { status: 500 }
      )
    }

    if (existingProfile) {
      console.log('User profile already exists:', existingProfile)
    } else {
      console.log('Creating new user profile...')
      
      // Create user profile using service role (bypasses RLS)
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .insert([{
          id: userId,
          email,
          first_name: firstName,
          last_name: lastName,
          account_type: accountType,
          role: role || null,
          department: department || null
        }])
        .select()
        .single()

      if (profileError) {
        console.error('Error creating user profile:', profileError)
        return NextResponse.json(
          { error: `Failed to create profile: ${profileError.message}` },
          { status: 500 }
        )
      }

      console.log('Profile created successfully:', profileData)
    }

    // Handle team membership if teamId is provided
    if (teamId) {
      console.log('Adding user to team:', { teamId, userId })
      
      // Check if user is already a team member
      const { data: existingMember, error: memberCheckError } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .single()

      if (memberCheckError && memberCheckError.code !== 'PGRST116') {
        console.error('Error checking existing team membership:', memberCheckError)
        return NextResponse.json(
          { error: `Failed to check team membership: ${memberCheckError.message}` },
          { status: 500 }
        )
      }

      if (!existingMember) {
        // Add user to team using service role (bypasses RLS)
        const { error: teamMemberError } = await supabase
          .from('team_members')
          .insert({
            team_id: teamId,
            user_id: userId,
            experience_level: 1
          })

        if (teamMemberError) {
          console.error('Error adding user to team:', teamMemberError)
          return NextResponse.json(
            { error: `Failed to add user to team: ${teamMemberError.message}` },
            { status: 500 }
          )
        }

        console.log('User successfully added to team')
      } else {
        console.log('User already a team member')
      }
    }

    console.log('API call completed successfully')
    return NextResponse.json({
      success: true,
      message: 'User profile created successfully',
      userId,
      teamId
    })

  } catch (error) {
    console.error('Unexpected error in create-user-profile API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
