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
    console.log('Using service role key for AI constraints operations')
  } else {
    // Fallback to anon key - this may cause RLS issues
    supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    console.log('WARNING: Using anon key for AI constraints operations - RLS policies may cause issues')
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

    console.log('Fetching AI constraints for team:', teamId)

    // Get AI constraints for the team
    const { data, error } = await supabaseService
      .from('ai_constraints')
      .select('*')
      .eq('team_id', teamId)
      .single()

    if (error) {
      console.error('Error fetching AI constraints:', error)
      // If it's a not found error, return defaults
      if (error.code === 'PGRST116') {
        console.log('No AI constraints found for team, returning defaults')
        const constraints = {
          max_consecutive_days: 30,
          workers_per_shift: 2,
          shift_specific_workers: {},
          custom_constraints: '',
          max_days_per_month: 20
        }
        return Response.json(constraints)
      }
      
      // If it's an RLS error, try to handle it
      if (error.message.includes('infinite recursion') || error.message.includes('RLS') || error.message.includes('row-level security')) {
        console.error('RLS policy error detected:', error.message)
        // Return defaults for now
        const constraints = {
          max_consecutive_days: 30,
          workers_per_shift: 2,
          shift_specific_workers: {},
          custom_constraints: '',
          max_days_per_month: 20
        }
        return Response.json(constraints)
      }
      
      return new Response(`Database error: ${error.message}`, { status: 500 })
    }

    console.log('Found AI constraints:', data)

    // Return constraints or defaults
    const constraints = data || {
      max_consecutive_days: 30,
      workers_per_shift: 2,
      shift_specific_workers: {},
      custom_constraints: '',
      max_days_per_month: 20
    }

    return Response.json(constraints)
  } catch (error) {
    console.error('Error in AI constraints GET:', error)
    return new Response('Internal server error', { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { teamId, maxConsecutiveDays, workersPerShift, shiftSpecificWorkers, customConstraints, maxDaysPerMonth } = await request.json()

    if (!teamId) {
      return new Response('Team ID is required', { status: 400 })
    }

    console.log('Updating AI constraints for team:', teamId, { maxConsecutiveDays, workersPerShift, customConstraints })

    // Validate input - relaxed constraints for small teams
    if (maxConsecutiveDays < 1 || maxConsecutiveDays > 30) {
      return new Response('Max consecutive days must be between 1 and 30', { status: 400 })
    }


    if (workersPerShift < 1 || workersPerShift > 10) {
      return new Response('Workers per shift must be between 1 and 10', { status: 400 })
    }

    if (maxDaysPerMonth < 1 || maxDaysPerMonth > 31) {
      return new Response('Max days per month must be between 1 and 31', { status: 400 })
    }

    // Try to upsert the constraints directly
    console.log('Attempting to upsert AI constraints...')
    const { data, error } = await supabaseService
      .from('ai_constraints')
      .upsert({
        team_id: teamId,
        max_consecutive_days: maxConsecutiveDays,
        workers_per_shift: workersPerShift,
        shift_specific_workers: shiftSpecificWorkers || {},
        custom_constraints: customConstraints || '',
        max_days_per_month: maxDaysPerMonth
      }, {
        onConflict: 'team_id'
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving AI constraints:', error)
      
      // If it's an RLS error, try to handle it
      if (error.message.includes('infinite recursion') || error.message.includes('RLS') || error.message.includes('row-level security')) {
        console.error('RLS policy error detected:', error.message)
        
        // Try a different approach - use a raw SQL query
        console.log('Attempting alternative approach with raw SQL...')
        
        try {
          // Try to use a different client configuration
          const alternativeClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
              auth: {
                autoRefreshToken: false,
                persistSession: false
              }
            }
          )
          
          // Try to insert first, then update if it fails
          let alternativeResult;
          
          // First try to insert
          alternativeResult = await alternativeClient
            .from('ai_constraints')
            .insert({
              team_id: teamId,
              max_consecutive_days: maxConsecutiveDays,
              workers_per_shift: workersPerShift,
              shift_specific_workers: shiftSpecificWorkers || {},
              custom_constraints: customConstraints || '',
              max_days_per_month: maxDaysPerMonth
            })
            .select()
            .single()
            
          if (alternativeResult.error && alternativeResult.error.code === '23505') {
            // Unique constraint violation - try update instead
            console.log('Constraint violation, trying update...')
            alternativeResult = await alternativeClient
              .from('ai_constraints')
              .update({
                max_consecutive_days: maxConsecutiveDays,
                workers_per_shift: workersPerShift,
                shift_specific_workers: shiftSpecificWorkers || {},
                custom_constraints: customConstraints || '',
                max_days_per_month: maxDaysPerMonth
              })
              .eq('team_id', teamId)
              .select()
              .single()
          }
          
          if (alternativeResult.error) {
            console.error('Alternative approach also failed:', alternativeResult.error)
            return new Response(`RLS policy error: ${alternativeResult.error.message}. Please run the SQL script to fix RLS policies.`, { status: 500 })
          }
          
          console.log('Alternative approach succeeded:', alternativeResult.data)
          return Response.json({ 
            message: 'AI constraints updated successfully',
            constraints: alternativeResult.data 
          })
          
        } catch (alternativeError) {
          console.error('Alternative approach failed:', alternativeError)
          return new Response(`RLS policy error: ${error.message}. Please run the SQL script to fix RLS policies.`, { status: 500 })
        }
      }
      
      return new Response(`Database error: ${error.message}`, { status: 500 })
    }

    console.log('Successfully saved AI constraints:', data)

    return Response.json({ 
      message: 'AI constraints updated successfully',
      constraints: data 
    })
  } catch (error) {
    console.error('Error in AI constraints POST:', error)
    return new Response('Internal server error', { status: 500 })
  }
}

