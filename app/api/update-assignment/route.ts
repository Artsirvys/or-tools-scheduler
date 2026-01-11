import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { scheduleId, shiftId, date, newUserId, teamId } = await request.json()
    
    console.log('=== UPDATE ASSIGNMENT API CALLED ===')
    console.log('Request data:', { scheduleId, shiftId, date, newUserId, teamId })
    
    if (!scheduleId || !shiftId || !date || !teamId) {
      console.log('Missing required fields')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Check if there's an existing assignment for this shift/date
    console.log('Checking for existing assignment...')
    const { data: existingAssignment, error: existingError } = await supabase
      .from('schedule_assignments')
      .select('id')
      .eq('schedule_id', scheduleId)
      .eq('shift_id', shiftId)
      .eq('date', date)
      .single()
    
    console.log('Existing assignment check result:', { existingAssignment, existingError })
    
    if (newUserId === 'unassigned') {
      console.log('Processing unassigned request...')
      // Remove the assignment if it exists
      if (existingAssignment) {
        console.log('Deleting existing assignment:', existingAssignment.id)
        const { error: deleteError } = await supabase
          .from('schedule_assignments')
          .delete()
          .eq('id', existingAssignment.id)
        
        if (deleteError) {
          console.error('Error deleting assignment:', deleteError)
          return NextResponse.json({ error: 'Failed to remove assignment' }, { status: 500 })
        }
        console.log('Assignment deleted successfully')
      } else {
        console.log('No existing assignment to delete')
      }
    } else {
      console.log('Processing assignment update/create...')
      if (existingAssignment) {
        console.log('Updating existing assignment:', existingAssignment.id)
        // Update existing assignment
        const { error: updateError } = await supabase
          .from('schedule_assignments')
          .update({ user_id: newUserId })
          .eq('id', existingAssignment.id)
        
        if (updateError) {
          console.error('Error updating assignment:', updateError)
          return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 })
        }
        console.log('Assignment updated successfully')
      } else {
        console.log('Creating new assignment with data:', {
          schedule_id: scheduleId,
          user_id: newUserId,
          shift_id: shiftId,
          date: date
        })
        // Create new assignment
        const { error: insertError } = await supabase
          .from('schedule_assignments')
          .insert({
            schedule_id: scheduleId,
            user_id: newUserId,
            shift_id: shiftId,
            date: date
          })
        
        if (insertError) {
          console.error('Error creating assignment:', insertError)
          console.error('Insert error details:', JSON.stringify(insertError, null, 2))
          return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
        }
        console.log('Assignment created successfully')
      }
    }
    
    console.log('=== ASSIGNMENT UPDATE COMPLETED SUCCESSFULLY ===')
    return NextResponse.json({ success: true, message: 'Assignment updated successfully' })
    
  } catch (error) {
    console.error('=== API ERROR ===')
    console.error('API Error:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
