import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { firstName, lastName, accountType = 'participant', role, department, teamId } = body || {}

    const safeFirstName = firstName || user.user_metadata?.first_name || 'User'
    const safeLastName = lastName || user.user_metadata?.last_name || 'User'
    const safeEmail = user.email || ''
    const safeAccountType = user.user_metadata?.account_type || accountType || 'participant'

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

    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Check if user profile already exists
    const { data: existingProfile, error: profileCheckError } = await adminSupabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

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
      // Create user profile using service role (bypasses RLS)
      const { error: profileError } = await adminSupabase
        .from('users')
        .insert([{
          id: user.id,
          email: safeEmail,
          first_name: safeFirstName,
          last_name: safeLastName,
          account_type: safeAccountType,
          role: role || null,
          department: department || null
        }])

      if (profileError) {
        console.error('Error creating user profile:', profileError)
        return NextResponse.json(
          { error: `Failed to create profile: ${profileError.message}` },
          { status: 500 }
        )
      }

    }

    // Handle team membership if teamId is provided
    if (teamId) {
      // Check if user is already a team member
      const { data: existingMember, error: memberCheckError } = await adminSupabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (memberCheckError && memberCheckError.code !== 'PGRST116') {
        console.error('Error checking existing team membership:', memberCheckError)
        return NextResponse.json(
          { error: `Failed to check team membership: ${memberCheckError.message}` },
          { status: 500 }
        )
      }

      if (!existingMember) {
        // Allow joining a team only for hosts of that team or invited users.
        const { data: hostTeam } = await adminSupabase
          .from('teams')
          .select('id')
          .eq('id', teamId)
          .eq('host_id', user.id)
          .maybeSingle()

        const { data: invitation } = await adminSupabase
          .from('team_invitations')
          .select('id')
          .eq('team_id', teamId)
          .eq('email', safeEmail)
          .in('status', ['pending', 'sent'])
          .gt('expires_at', new Date().toISOString())
          .maybeSingle()

        if (!hostTeam && !invitation) {
          return NextResponse.json(
            { error: 'Forbidden: no valid invitation for this team' },
            { status: 403 }
          )
        }

        // Add user to team using service role (bypasses RLS)
        const { error: teamMemberError } = await adminSupabase
          .from('team_members')
          .insert({
            team_id: teamId,
            user_id: user.id,
            experience_level: 1
          })

        if (teamMemberError) {
          console.error('Error adding user to team:', teamMemberError)
          return NextResponse.json(
            { error: `Failed to add user to team: ${teamMemberError.message}` },
            { status: 500 }
          )
        }

        // Best-effort update of invitation status.
        if (invitation) {
          await adminSupabase
            .from('team_invitations')
            .update({ status: 'accepted', updated_at: new Date().toISOString() })
            .eq('id', invitation.id)
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'User profile created successfully',
      userId: user.id,
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
