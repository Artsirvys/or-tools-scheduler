import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

// Create Supabase service client to bypass RLS policies
const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    }
  }
)

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const constraintId = resolvedParams.id

    if (!constraintId) {
      return new Response('Constraint ID is required', { status: 400 })
    }

    console.log('Deleting custom constraint:', constraintId)

    // First, verify the constraint exists and get team_id
    const { data: constraint, error: fetchError } = await supabaseService
      .from('custom_constraints')
      .select('team_id')
      .eq('id', constraintId)
      .single()

    if (fetchError || !constraint) {
      console.error('Error fetching constraint or constraint not found:', fetchError)
      return new Response('Constraint not found', { status: 404 })
    }

    // Get the authenticated user's ID
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabaseService.auth.getUser(token)
    
    if (authError || !user) {
      console.error('Authentication error:', authError)
      return new Response('Unauthorized', { status: 401 })
    }

    // Verify the user is the host of the team that owns this constraint
    const { data: team, error: teamError } = await supabaseService
      .from('teams')
      .select('host_id')
      .eq('id', constraint.team_id)
      .single()

    if (teamError || !team) {
      console.error('Error fetching team or team not found:', teamError)
      return new Response('Team not found', { status: 404 })
    }

    if (team.host_id !== user.id) {
      console.error('User not authorized to delete this constraint')
      return new Response('Forbidden', { status: 403 })
    }

    // Delete the custom constraint
    const { error } = await supabaseService
      .from('custom_constraints')
      .delete()
      .eq('id', constraintId)

    if (error) {
      console.error('Error deleting custom constraint:', error)
      return new Response(`Database error: ${error.message}`, { status: 500 })
    }

    console.log('Custom constraint deleted successfully')
    return new Response('Custom constraint deleted successfully', { status: 200 })
  } catch (error) {
    console.error('Error in custom constraints DELETE:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
