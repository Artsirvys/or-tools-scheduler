import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')

    if (!teamId) {
      return NextResponse.json({ error: 'Team ID is required' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: shifts, error } = await supabase
      .from('shifts')
      .select('id, name, start_time, end_time, day_of_week')
      .eq('team_id', teamId)
      .order('start_time', { ascending: true })

    if (error) {
      console.error('Error fetching shifts:', error)
      return NextResponse.json({ error: 'Failed to fetch shifts' }, { status: 500 })
    }

    return NextResponse.json(shifts || [])
  } catch (error) {
    console.error('Error in shifts GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const shiftId = searchParams.get('shiftId')

    if (!shiftId) {
      return NextResponse.json({ error: 'Shift ID is required' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Check if shift exists and get team_id for verification
    const { data: shift, error: fetchError } = await supabase
      .from('shifts')
      .select('id, team_id')
      .eq('id', shiftId)
      .single()

    if (fetchError || !shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
    }

    // Delete the shift (cascade will handle related records)
    const { error: deleteError } = await supabase
      .from('shifts')
      .delete()
      .eq('id', shiftId)

    if (deleteError) {
      console.error('Error deleting shift:', deleteError)
      return NextResponse.json({ error: 'Failed to delete shift' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Shift deleted successfully' })
  } catch (error) {
    console.error('Error in shifts DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
