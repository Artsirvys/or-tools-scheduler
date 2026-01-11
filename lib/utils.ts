import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { supabase } from './supabase'

export async function getTeamData(teamId: string) {
  // Get team info with members and shifts
  const { data: teamData, error: teamError } = await supabase
    .from('teams')
    .select(`
      *,
      team_members (
        user_id,
        experience_level,
        joined_at,
        users (
          id,
          first_name,
          last_name,
          email,
          role,
          department,
          experience_level
        )
      ),
      shifts (
        id,
        name,
        start_time,
        end_time
      )
    `)
    .eq('id', teamId)
    .single()

  if (teamError) throw teamError
  return teamData
}

export async function getAvailability(teamId: string, month: number, year: number) {
  try {
    // Create proper date range
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`
    const endDate = `${year}-${month.toString().padStart(2, '0')}-31`
    
    console.log('Fetching availability for date range:', { startDate, endDate, teamId })
    
    const { data, error } = await supabase
      .from('availability')
      .select(`
        *,
        users (
          id,
          first_name,
          last_name,
          email,
          role
        ),
        shifts (
          id,
          name,
          start_time,
          end_time
        )
      `)
      .eq('team_id', teamId)
      .gte('date', startDate)
      .lte('date', endDate)

    if (error) {
      console.error('Error fetching availability:', error)
      throw error
    }
    
    console.log('Availability data fetched:', data?.length || 0, 'records')
    return data
  } catch (error) {
    console.error('Error in getAvailability:', error)
    throw error
  }
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
