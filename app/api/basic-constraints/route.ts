import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

// Create Supabase service client to bypass RLS policies
let supabaseService: SupabaseClient;

try {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey || serviceRoleKey.includes('eyJ') === false) {
      throw new Error('Invalid service role key format')
    }
    supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
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
    console.log('Using service role key for basic constraints operations')
  } else {
    throw new Error('Service role key not configured')
  }
} catch (error) {
  console.error('Error creating Supabase client:', error)
  throw new Error('Failed to create Supabase client')
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')

    if (!teamId) {
      return new Response('Team ID is required', { status: 400 })
    }

    console.log('Fetching basic constraints for team:', teamId)

    // Get basic constraints for the team
    const { data, error } = await supabaseService
      .from('basic_constraints')
      .select('*')
      .eq('team_id', teamId)
      .single()

    if (error) {
      console.error('Error fetching basic constraints:', error)
      // If it's a not found error, return defaults
      if (error.code === 'PGRST116') {
        console.log('No basic constraints found for team, returning defaults')
        const constraints = {
          max_consecutive_days: 3,
          workers_per_shift: 2,
          shift_specific_workers: {},
          max_days_per_month: 20
        }
        return Response.json(constraints)
      }
      
      return new Response(`Database error: ${error.message}`, { status: 500 })
    }

    console.log('Found basic constraints:', data)

    // Return constraints or defaults
    const constraints = data || {
      max_consecutive_days: 3,
      workers_per_shift: 2,
      shift_specific_workers: {},
      max_days_per_month: 20
    }

    return Response.json(constraints)
  } catch (error) {
    console.error('Error in basic constraints GET:', error)
    return new Response('Internal server error', { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { teamId, maxConsecutiveDays, workersPerShift, shiftSpecificWorkers, maxDaysPerMonth } = await request.json()

    if (!teamId) {
      return new Response('Team ID is required', { status: 400 })
    }

    console.log('Updating basic constraints for team:', teamId, { maxConsecutiveDays, workersPerShift, maxDaysPerMonth })

    // Validate input
    if (maxConsecutiveDays < 1 || maxConsecutiveDays > 30) {
      return new Response('Max consecutive days must be between 1 and 30', { status: 400 })
    }


    if (workersPerShift < 1 || workersPerShift > 10) {
      return new Response('Workers per shift must be between 1 and 10', { status: 400 })
    }

    if (maxDaysPerMonth < 1 || maxDaysPerMonth > 31) {
      return new Response('Max days per month must be between 1 and 31', { status: 400 })
    }

    // Try to upsert the constraints
    console.log('Attempting to upsert basic constraints...')
    const { data, error } = await supabaseService
      .from('basic_constraints')
      .upsert({
        team_id: teamId,
        max_consecutive_days: maxConsecutiveDays,
        workers_per_shift: workersPerShift,
        shift_specific_workers: shiftSpecificWorkers || {},
        max_days_per_month: maxDaysPerMonth
      }, {
        onConflict: 'team_id'
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving basic constraints:', error)
      return new Response(`Database error: ${error.message}`, { status: 500 })
    }

    console.log('Successfully saved basic constraints:', data)

    return Response.json({ 
      message: 'Basic constraints updated successfully',
      constraints: data 
    })
  } catch (error) {
    console.error('Error in basic constraints POST:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
