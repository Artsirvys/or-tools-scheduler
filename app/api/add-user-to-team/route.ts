import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { checkMemberAdditionLimit } from '../../../lib/subscription-utils'

export async function POST(request: NextRequest) {
  try {
    const { teamId, userId } = await request.json()
    
    if (!teamId || !userId) {
      return NextResponse.json(
        { success: false, message: 'Missing teamId or userId' },
        { status: 400 }
      )
    }

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

    // Check subscription limits before adding member
    const limitCheck = await checkMemberAdditionLimit(teamId)
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { success: false, message: limitCheck.reason },
        { status: 403 }
      )
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .single()

    if (existingMember) {
      return NextResponse.json(
        { success: true, message: 'User is already a team member' }
      )
    }

    // Add user to team
    const { data: teamMember, error } = await supabase
      .from('team_members')
      .insert({
        team_id: teamId,
        user_id: userId,
        experience_level: 1
      })
      .select()

    if (error) {
      console.error('Error adding user to team:', error)
      return NextResponse.json(
        { success: false, message: 'Failed to add user to team', error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, message: 'User added to team successfully', teamMember }
    )
  } catch (error) {
    console.error('Error in add-user-to-team:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
} 