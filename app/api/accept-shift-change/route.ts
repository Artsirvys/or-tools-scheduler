import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { requestId } = await request.json()
    
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options?: Record<string, unknown>) {
            cookieStore.set(name, value, options)
          },
          remove(name: string) {
            cookieStore.delete(name)
          },
        },
      }
    )
    
    // Get the shift change request
    const { data: shiftRequest, error: requestError } = await supabase
      .from('shift_change_requests')
      .select('*')
      .eq('id', requestId)
      .single()
    
    if (requestError || !shiftRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }
    
    // Get the original assignment
    const { data: originalAssignment, error: originalError } = await supabase
      .from('schedule_assignments')
      .select('*')
      .eq('id', shiftRequest.original_assignment_id)
      .single()
    
    if (originalError || !originalAssignment) {
      return NextResponse.json({ error: 'Original assignment not found' }, { status: 404 })
    }
    
    // Find target assignment (any assignment for target user on requested date)
    const { data: targetAssignment, error: targetError } = await supabase
      .from('schedule_assignments')
      .select('*')
      .eq('user_id', shiftRequest.target_user_id)
      .eq('date', shiftRequest.requested_date)
      .single()
    
    if (targetError || !targetAssignment) {
      return NextResponse.json({ error: 'Target assignment not found' }, { status: 404 })
    }
    
    // Perform the swap
    const { error: update1Error } = await supabase
      .from('schedule_assignments')
      .update({
        shift_id: shiftRequest.requested_shift_id,
        date: shiftRequest.requested_date
      })
      .eq('id', shiftRequest.original_assignment_id)
    
    if (update1Error) {
      return NextResponse.json({ error: 'Failed to update original assignment' }, { status: 500 })
    }
    
    const { error: update2Error } = await supabase
      .from('schedule_assignments')
      .update({
        shift_id: originalAssignment.shift_id,
        date: originalAssignment.date
      })
      .eq('id', targetAssignment.id)
    
    if (update2Error) {
      return NextResponse.json({ error: 'Failed to update target assignment' }, { status: 500 })
    }
    
    // Update request status
    const { error: statusError } = await supabase
      .from('shift_change_requests')
      .update({ status: 'approved' })
      .eq('id', requestId)
    
    if (statusError) {
      return NextResponse.json({ error: 'Failed to update request status' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, message: 'Shift swap completed' })
    
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}