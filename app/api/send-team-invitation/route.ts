import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  console.log('send-team-invitation API called')
  
  try {
    const body = await request.json()
    console.log('Request body:', body)
    
    const { invitationId, email, teamId, teamName, department, role } = body

    // Validate required fields
    if (!invitationId || !email || !teamId || !teamName) {
      console.error('Missing required fields:', { invitationId, email, teamId, teamName })
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create Supabase client with service role key
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

    // Build a redirect URL for after the invite is accepted
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.aischedulator.com'
    const redirectTo = `${appUrl}/auth/signin?team=${teamId}&email=${encodeURIComponent(email)}`

    // Try Supabase Admin invite; if it fails, surface the error to help configuration
    console.log('Attempting Supabase admin invitation for:', email)
    
    try {
      const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: {
          team_id: teamId,
          team_name: teamName,
          department: department || null,
          role: role || 'participant',
          invitation_id: invitationId,
        },
      })

      if (inviteError) {
        console.error('Supabase inviteUserByEmail error details:', inviteError)
        return NextResponse.json(
          { error: `Supabase invitation failed: ${inviteError.message}` },
          { status: 500 }
        )
      }

      console.log('Supabase invitation successful, updating status...')
      
      // Update invitation status in our table
      await supabase
        .from('team_invitations')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', invitationId)

      return NextResponse.json({
        success: true,
        message: 'Supabase invitation email sent',
        invitationId
      })
      
    } catch (error) {
      console.error('Exception during Supabase admin invitation:', error)
      return NextResponse.json(
        { error: `Exception during Supabase invitation: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Error in send-team-invitation API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
