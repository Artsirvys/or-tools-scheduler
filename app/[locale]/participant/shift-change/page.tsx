"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
// import { Input } from "@/components/ui/input" // Unused - using calendar picker instead
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ArrowLeft, Send, Clock, AlertCircle, CalendarIcon, CheckCircle, XCircle } from "lucide-react"
import { Link } from "@/i18n/routing"
import { supabase } from "@/lib/supabase"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { useLocale, useTranslations } from "next-intl"

interface Shift {
  id: string
  name: string
  start_time: string
  end_time: string
}

interface ScheduleAssignment {
  id: string
  date: string
  shift_id: string
  shift: Shift
  team: {
    id: string
    name: string
  }
}

// Interface for the raw data from the join query
interface RawAssignment {
  id: string
  date: string
  shift_id: string
  shifts: {
    id: string
    name: string
    start_time: string
    end_time: string
    team_id: string
  }
}

// Interface for target assignments when looking for shift swaps
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface TargetAssignment {
  user_id: string
  shift_id: string
  shifts: {
    id: string
    name: string
    start_time: string
    end_time: string
    team_id: string
  }[]
}


interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  account_type: string
  role: string
  department?: string
  experience_level?: number
  created_at: string
  updated_at: string
}

interface ShiftChangeRequest {
  id: string
  requester_id: string
  original_assignment_id: string
  requested_date: string
  requested_shift_id: string
  target_user_id: string
  status: string
  message: string
  created_at: string
  requester: {
    first_name: string
    last_name: string
  }
  original_assignment: {
    date: string
    shift: Shift
  }
  requested_shift: Shift
  target_user: {
    first_name: string
    last_name: string
  }
}

export default function ShiftChangePage() {
  const t = useTranslations("participant.shiftChange")
  const locale = useLocale()
  const dateLocale = {
    en: "en-US",
    lt: "lt-LT",
    pl: "pl-PL",
    it: "it-IT",
    de: "de-DE",
  }[locale] || "en-US"
  const tx = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback)

  const [selectedShift, setSelectedShift] = useState<string | null>(null)
  const [targetDate, setTargetDate] = useState<Date>()
  const [targetShift, setTargetShift] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [myUpcomingShifts, setMyUpcomingShifts] = useState<ScheduleAssignment[]>([])
  const [availableShifts, setAvailableShifts] = useState<Shift[]>([])
  const [pendingRequests, setPendingRequests] = useState<ShiftChangeRequest[]>([])
  const [myRequests, setMyRequests] = useState<ShiftChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [userTeams, setUserTeams] = useState<Array<{id: string, name: string, department: string}>>([])
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)

  useEffect(() => {
    fetchUserData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch shifts when selected team changes
  useEffect(() => {
    if (currentUser && selectedTeam) {
      console.log('Team changed, refetching shifts for team:', selectedTeam)
      fetchUpcomingShifts(currentUser.id)
      fetchAvailableShifts()
    }
  }, [selectedTeam, currentUser]) // eslint-disable-line react-hooks/exhaustive-deps

      const fetchUserTeams = useCallback(async (userId: string) => {
      try {
        const { data: teamMemberships, error: teamError } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', userId)

      if (teamError) {
        console.error('Error fetching team memberships:', teamError)
        setUserTeams([])
        return
      }

      if (!teamMemberships || teamMemberships.length === 0) {
        console.log('No team memberships found for user:', userId)
        setUserTeams([])
        return
      }

      const teamIds = teamMemberships.map(tm => tm.team_id)
      console.log('User is member of teams:', teamIds)

      // Fetch team details
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('id, name, department')
        .in('id', teamIds)

      if (teamsError) {
        console.error('Error fetching team details:', teamsError)
        setUserTeams([])
        return
      }

      console.log('Fetched teams:', teamsData)
      setUserTeams(teamsData || [])
      
      // Set the first team as default selected team
      if (teamsData && teamsData.length > 0) {
        setSelectedTeam(teamsData[0].id)
      }
    } catch (error) {
      console.error('Error fetching user teams:', error)
      setUserTeams([])
    }
  }, [])

  const fetchUserData = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error('No authenticated user')
        return
              }
  
        // Fetch user details from the users table
        const { data: userDetails } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!userDetails) {
        console.error('User details not found')
        return
      }

      setCurrentUser(userDetails)

      // Fetch user's teams first
      await fetchUserTeams(userDetails.id)
      
      // Fetch user's upcoming shifts
      await fetchUpcomingShifts(userDetails.id)
      
      // Fetch available shifts for user's teams
      await fetchAvailableShifts()
      
      // Fetch pending requests
      await fetchPendingRequests(userDetails.id)
      
      // Fetch user's own requests
      await fetchMyRequests(userDetails.id)

    } catch (error) {
      console.error('Error fetching user data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchUpcomingShifts = useCallback(async (userId: string) => {
    try {
      if (!selectedTeam) {
        console.log('No team selected, cannot fetch shifts')
        setMyUpcomingShifts([])
        return
      }

      console.log('Fetching shifts for team:', selectedTeam)
      
              // Get assignments with team information directly from schedule_assignments
        // Since we can't access schedules table due to RLS, we'll use a different approach
        const { data: assignments, error } = await supabase
        .from('schedule_assignments')
        .select(`
          id, 
          date, 
          shift_id,
          shifts!inner(
            id,
            name,
            start_time,
            end_time,
            team_id
          )
        `)
        .eq('user_id', userId)
        .eq('shifts.team_id', selectedTeam)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true }) as { data: RawAssignment[] | null, error: Error | null }

      if (error) {
        console.error('Error fetching upcoming shifts:', error)
        return
      }

      if (!assignments || assignments.length === 0) {
        console.log('No assignments found for user in selected team:', selectedTeam)
        setMyUpcomingShifts([])
        return
      }

      console.log('Found assignments with shifts:', assignments)

      // Get team details
      const { data: teamData } = await supabase
        .from('teams')
        .select('id, name')
        .eq('id', selectedTeam)
        .single()

      if (!teamData) {
        console.error('Team not found:', selectedTeam)
        setMyUpcomingShifts([])
        return
      }

      // Format the data
      const formattedAssignments = assignments.map((assignment: RawAssignment) => {
        const shift = assignment.shifts

        if (!shift) {
          return null
        }

        return {
          id: assignment.id,
          date: assignment.date,
          shift_id: assignment.shift_id,
          shift: {
            id: shift.id,
            name: shift.name,
            start_time: shift.start_time,
            end_time: shift.end_time
          } as Shift,
          team: teamData as { id: string; name: string }
        }
      }).filter((item): item is ScheduleAssignment => item !== null)

      console.log('Final formatted assignments:', formattedAssignments)
      setMyUpcomingShifts(formattedAssignments)
    } catch (error) {
      console.error('Error fetching upcoming shifts:', error)
    }
  }, [selectedTeam])

  const fetchAvailableShifts = useCallback(async () => {
    try {
      if (!selectedTeam) {
        console.log('No team selected, cannot fetch available shifts')
        setAvailableShifts([])
        return
      }

      console.log('Fetching available shifts for team:', selectedTeam)

              // Fetch shifts for the selected team
        const { data: shifts, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('team_id', selectedTeam)
        .order('start_time', { ascending: true })

      if (error) {
        console.error('Error fetching available shifts:', error)
        setAvailableShifts([])
        return
      }

      console.log('Fetched shifts:', shifts)
      setAvailableShifts(shifts || [])
    } catch (error) {
      console.error('Error fetching available shifts:', error)
      setAvailableShifts([])
    }
  }, [selectedTeam])

  const fetchPendingRequests = async (userId: string) => {
    try {
      const { data: requests, error } = await supabase
        .from('shift_change_requests')
        .select('id, requester_id, original_assignment_id, requested_date, requested_shift_id, target_user_id, status, message, created_at')
        .eq('target_user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching pending requests:', error)
        return
      }

      if (!requests || requests.length === 0) {
        setPendingRequests([])
        return
      }

      // Get related data
      const requesterIds = [...new Set(requests.map(r => r.requester_id))]
      const assignmentIds = [...new Set(requests.map(r => r.original_assignment_id))]
      const shiftIds = [...new Set(requests.map(r => r.requested_shift_id))]

      const { data: requesters } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .in('id', requesterIds)

      const { data: assignments } = await supabase
        .from('schedule_assignments')
        .select('id, date, shift_id')
        .in('id', assignmentIds)

      const { data: shifts } = await supabase
        .from('shifts')
        .select('id, name, start_time, end_time')
        .in('id', shiftIds)

      // Format the data
      const formattedRequests = requests.map(request => {
        const requester = requesters?.find(r => r.id === request.requester_id)
        const assignment = assignments?.find(a => a.id === request.original_assignment_id)
        const requestedShift = shifts?.find(s => s.id === request.requested_shift_id)
        const originalShift = shifts?.find(s => s.id === assignment?.shift_id)

        // Only include requests that have all required data
        if (!requester || !assignment || !requestedShift || !originalShift) {
          return null
        }

        return {
          id: request.id,
          requester_id: request.requester_id,
          original_assignment_id: request.original_assignment_id,
          requested_date: request.requested_date,
          requested_shift_id: request.requested_shift_id,
          target_user_id: request.target_user_id,
          status: request.status,
          message: request.message,
          created_at: request.created_at,
          requester: {
            first_name: requester.first_name || '',
            last_name: requester.last_name || ''
          },
          original_assignment: {
            date: assignment.date || '',
            shift: originalShift as Shift
          },
          requested_shift: requestedShift as Shift,
          target_user: {
            first_name: '',
            last_name: ''
          }
        }
      }).filter((item): item is ShiftChangeRequest => item !== null) // Remove null entries with proper typing

      setPendingRequests(formattedRequests)
    } catch (error) {
      console.error('Error fetching pending requests:', error)
    }
  }

  const fetchMyRequests = async (userId: string) => {
    try {
      const { data: requests, error } = await supabase
        .from('shift_change_requests')
        .select('id, requester_id, original_assignment_id, requested_date, requested_shift_id, target_user_id, status, message, created_at')
        .eq('requester_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching my requests:', error)
        return
      }

      if (!requests || requests.length === 0) {
        setMyRequests([])
        return
      }

      // Get related data
      const requesterIds = [...new Set(requests.map(r => r.requester_id))]
      const assignmentIds = [...new Set(requests.map(r => r.original_assignment_id))]
      const shiftIds = [...new Set(requests.map(r => r.requested_shift_id))]

      const { data: requesters } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .in('id', requesterIds)

      const { data: assignments } = await supabase
        .from('schedule_assignments')
        .select('id, date, shift_id')
        .in('id', assignmentIds)

      const { data: shifts } = await supabase
        .from('shifts')
        .select('id, name, start_time, end_time')
        .in('id', shiftIds)

      // Format the data
      const formattedRequests = requests.map(request => {
        const requester = requesters?.find(r => r.id === request.requester_id)
        const assignment = assignments?.find(a => a.id === request.original_assignment_id)
        const requestedShift = shifts?.find(s => s.id === request.requested_shift_id)
        const originalShift = shifts?.find(s => s.id === assignment?.shift_id)

        // Only include requests that have all required data
        if (!requester || !assignment || !requestedShift || !originalShift) {
          return null
        }

        return {
          id: request.id,
          requester_id: request.requester_id,
          original_assignment_id: request.original_assignment_id,
          requested_date: request.requested_date,
          requested_shift_id: request.requested_shift_id,
          target_user_id: request.target_user_id,
          status: request.status,
          message: request.message,
          created_at: request.created_at,
          requester: {
            first_name: requester.first_name || '',
            last_name: requester.last_name || ''
          },
          original_assignment: {
            date: assignment.date || '',
            shift: originalShift as Shift
          },
          requested_shift: requestedShift as Shift,
          target_user: {
            first_name: '',
            last_name: ''
          }
        }
      }).filter((item): item is ShiftChangeRequest => item !== null) // Remove null entries with proper typing

      setMyRequests(formattedRequests)
    } catch (error) {
      console.error('Error fetching my requests:', error)
    }
  }

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Enhanced validation with better error messages
    if (!currentUser) {
      alert(tx("alerts.userNotAuthenticated", "User not authenticated. Please log in again."))
      return
    }

    if (!selectedTeam) {
      alert(tx("alerts.selectTeamFirst", "Please select a team first."))
      return
    }

    if (!selectedShift) {
      alert(tx("alerts.selectCurrentShift", "Please select the shift you want to change."))
      return
    }

    if (!targetDate) {
      alert(tx("alerts.selectPreferredDate", "Please select your preferred new date."))
      return
    }

    if (!targetShift) {
      alert(tx("alerts.selectPreferredShift", "Please select your preferred new shift time."))
      return
    }

    // Check if the target date is in the past
    if (targetDate < new Date()) {
      alert(tx("alerts.futureDateOnly", "Please select a future date for your preferred shift."))
      return
    }

    // Show confirmation with request details
    const selectedShiftData = myUpcomingShifts.find(s => s.id === selectedShift)
    const targetShiftData = availableShifts.find(s => s.id === targetShift)
    
    if (!selectedShiftData || !targetShiftData) {
      alert(tx("alerts.shiftDataMissing", "Shift data not found. Please try again."))
      return
    }

    const confirmationMessage = `${tx("confirm.title", "Please confirm your shift change request")}:

${tx("confirm.from", "From")}: ${selectedShiftData.shift?.name || tx("unknownShift", "Unknown Shift")} ${tx("confirm.on", "on")} ${new Date(selectedShiftData.date).toLocaleDateString(dateLocale)}
${tx("confirm.to", "To")}: ${targetShiftData.name} ${tx("confirm.on", "on")} ${targetDate.toLocaleDateString(dateLocale)}
${tx("confirm.team", "Team")}: ${selectedShiftData.team?.name || tx("unknownTeam", "Unknown Team")}
${message ? `${tx("confirm.reason", "Reason")}: ${message}` : ''}

${tx("confirm.footer", "The system will find a team member with the requested shift and send them a swap request. Do you want to proceed?")}`

    if (!confirm(confirmationMessage)) {
      return
    }

    if (myUpcomingShifts.length === 0 || availableShifts.length === 0) {
      alert(tx("alerts.noShiftsAvailable", "No shifts available. Please check your team assignments."))
      return
    }

    setIsLoading(true)

    try {
      // Find the target user who has the requested shift on the target date
      // First get the shift details to find the shift type
      const { data: targetShiftData, error: shiftError } = await supabase
        .from('shifts')
        .select('id, name, start_time, end_time')
        .eq('id', targetShift)
        .single()

      if (shiftError || !targetShiftData) {
        alert(tx("alerts.selectedShiftNotFound", "Selected shift not found"))
        setIsLoading(false)
        return
      }

      console.log('Looking for users with shift:', targetShiftData.name, 'on date:', format(targetDate, 'yyyy-MM-dd'))
      console.log('Target date object:', targetDate)
      console.log('Formatted date string:', format(targetDate, 'yyyy-MM-dd'))
      console.log('ISO string:', targetDate.toISOString().split('T')[0])

      // Use a more reliable date format that avoids timezone issues
      const targetDateString = targetDate.toLocaleDateString('en-CA') // Returns YYYY-MM-DD format
      console.log('Local date string (en-CA):', targetDateString)
      
      // Also try the US format that matches the database (MM/DD/YYYY)
      const targetDateUSFormat = targetDate.toLocaleDateString('en-US') // Returns MM/DD/YYYY format
      console.log('US date format (MM/DD/YYYY):', targetDateUSFormat)
      
      // Let's try both formats to see which one works
      console.log('Will try both date formats:', { targetDateString, targetDateUSFormat })

      // First, let's check if there are any assignments at all for this team on the target date
      let { data: allTeamAssignments, error: allAssignmentsError } = await supabase
        .from('schedule_assignments')
        .select(`
          user_id, 
          shift_id,
          shifts!inner(
            id,
            name,
            start_time,
            end_time,
            team_id
          )
        `)
        .eq('date', targetDateString)
        .eq('shifts.team_id', selectedTeam)

      // If no results, try US date format
      if ((!allTeamAssignments || allTeamAssignments.length === 0) && targetDateString !== targetDateUSFormat) {
        console.log('Trying US date format for all team assignments...')
        const { data: fallbackAllAssignments, error: fallbackAllError } = await supabase
          .from('schedule_assignments')
          .select(`
            user_id, 
            shift_id,
            shifts!inner(
              id,
              name,
              start_time,
              end_time,
              team_id
            )
          `)
          .eq('date', targetDateUSFormat)
          .eq('shifts.team_id', selectedTeam)
        
        if (fallbackAllError) {
          console.error('Fallback all assignments error:', fallbackAllError)
        } else if (fallbackAllAssignments && fallbackAllAssignments.length > 0) {
          console.log('Fallback all assignments successful!')
          allTeamAssignments = fallbackAllAssignments
          allAssignmentsError = null
        }
      }

      if (allAssignmentsError) {
        console.error('Error checking all team assignments:', allAssignmentsError)
      } else {
        console.log('All team assignments on target date:', allTeamAssignments)
      }

      // If no assignments exist for the team on that date, we need to handle this case
      if (!allTeamAssignments || allTeamAssignments.length === 0) {
        // Check if there are any shifts defined for the team
        const { data: teamShifts, error: shiftsError } = await supabase
          .from('shifts')
          .select('id, name, start_time, end_time')
          .eq('team_id', selectedTeam)

        if (shiftsError) {
          console.error('Error fetching team shifts:', shiftsError)
        } else {
          console.log('Available shifts for team:', teamShifts)
        }

        // Find available dates and provide a more helpful error message
        const availableDates = await findAvailableDates(selectedTeam)
        let availableDatesMessage = ''
        if (availableDates.length > 0) {
          const formattedDates = availableDates.map(date => new Date(date).toLocaleDateString(dateLocale)).join(', ')
          availableDatesMessage = `\n\n${tx("alerts.availableDatesNext30", "Available dates in the next 30 days")}:\n${formattedDates}`
        }
        
        alert(`${tx("alerts.noShiftsOnDatePrefix", "No shifts are currently scheduled for your team on")} ${targetDate.toLocaleDateString(dateLocale)}.\n\n${tx("alerts.noShiftsOnDateBody", "This could mean:\n\n1. The schedule hasn't been generated for this date yet\n2. No team members are assigned to work on this date\n3. The date is outside the current schedule period\n\nPlease contact your team host to schedule shifts for this date, or choose a different date.")}${availableDatesMessage}`)
        setIsLoading(false)
        return
      }

      // Find someone assigned to the same shift type on the target date within the same team
      // First, get all team members
      const { data: teamMembers, error: teamError } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', selectedTeam)

      if (teamError || !teamMembers || teamMembers.length === 0) {
        console.error('Error fetching team members:', teamError)
        alert(tx("alerts.errorFindingTeamMembers", "Error finding team members"))
        setIsLoading(false)
        return
      }

      const teamMemberIds = teamMembers.map(tm => tm.user_id)
      console.log('Team member IDs:', teamMemberIds)

      // Find assignments for team members on the target date
      // First, get all assignments for the target date and team members
      console.log('=== STEP 1: Finding assignments for team members ===')
      console.log('Searching for assignments on date:', targetDateString)
      console.log('For team members:', teamMemberIds)
      console.log('Excluding current user:', currentUser.id)
      
      // Let's also check the exact data types and values
      console.log('=== DEBUGGING DATA TYPES ===')
      console.log('targetDateString type:', typeof targetDateString, 'value:', targetDateString)
      console.log('teamMemberIds type:', typeof teamMemberIds, 'length:', teamMemberIds.length)
      console.log('teamMemberIds values:', teamMemberIds.map(id => ({ id, type: typeof id })))
      console.log('currentUser.id type:', typeof currentUser.id, 'value:', currentUser.id)
      
      // Let's also verify the team membership directly
      const { data: teamMembershipCheck, error: membershipError } = await supabase
        .from('team_members')
        .select('user_id, team_id')
        .eq('team_id', selectedTeam)
        .in('user_id', teamMemberIds)
      
      if (membershipError) {
        console.error('Error checking team membership:', membershipError)
      } else {
        console.log('Team membership verification:', teamMembershipCheck)
      }
      
      // Follow the logical sequence: schedule_assignments -> team_id -> date -> shift_id -> shifts table
      console.log('=== FOLLOWING LOGICAL SEQUENCE ===')
      console.log('1. Access schedule_assignments table')
      console.log('2. Filter by team_id and schedule_id (through shifts join)')
      console.log('3. Filter by date:', targetDateString)
      console.log('4. Link with shift_id to shifts table')
      console.log('5. Find user to switch with (exclude current user)')
      
      // Step 1-4: Get assignments with shift details using proper join
      let { data: targetAssignments, error: targetError } = await supabase
        .from('schedule_assignments')
        .select(`
          id,
          user_id, 
          shift_id,
          date,
          shifts (
            id,
            name,
            start_time,
            end_time,
            team_id
          )
        `)
        .eq('date', targetDateString)
        .neq('user_id', currentUser.id) // Step 5: Exclude current user

      // If no results, try alternative date formats
      if ((!targetAssignments || targetAssignments.length === 0)) {
        console.log('No results with primary date format, trying alternative formats...')
        
        // Try ISO date format
        const isoDate = targetDate.toISOString().split('T')[0]
        if (isoDate !== targetDateString) {
          console.log('Trying ISO date format:', isoDate)
          const { data: isoAssignments, error: isoError } = await supabase
            .from('schedule_assignments')
            .select(`
              id,
              user_id, 
              shift_id,
              date,
              shifts (
                id,
                name,
                start_time,
                end_time,
                team_id
              )
            `)
            .eq('date', isoDate)
            .neq('user_id', currentUser.id)
          
          if (!isoError && isoAssignments && isoAssignments.length > 0) {
            console.log('ISO date format successful!')
            targetAssignments = isoAssignments
            targetError = null
          }
        }
        
        // Try US date format as last resort
        if ((!targetAssignments || targetAssignments.length === 0) && targetDateUSFormat !== targetDateString) {
          console.log('Trying US date format:', targetDateUSFormat)
          const { data: usAssignments, error: usError } = await supabase
            .from('schedule_assignments')
            .select(`
              id,
              user_id, 
              shift_id,
              date,
              shifts (
                id,
                name,
                start_time,
                end_time,
                team_id
              )
            `)
            .eq('date', targetDateUSFormat)
            .neq('user_id', currentUser.id)
          
          if (!usError && usAssignments && usAssignments.length > 0) {
            console.log('US date format successful!')
            targetAssignments = usAssignments
            targetError = null
          }
        }
      }

      console.log('=== QUERY EXECUTION DEBUG ===')
      console.log('Query executed:')
      console.log('- Table: schedule_assignments')
      console.log('- Date filter:', targetDateString)
      console.log('- User filter:', teamMemberIds)
      console.log('- Exclude user:', currentUser.id)
      console.log('Query result:', { data: targetAssignments, error: targetError })
      
      if (targetError) {
        console.error('Error finding target assignments:', targetError)
        alert(tx("alerts.errorFindingAvailableShifts", "Error finding available shifts"))
        setIsLoading(false)
        return
      }

      console.log('Raw target assignments found:', targetAssignments)
      console.log('Number of assignments found:', targetAssignments?.length || 0)
      
      // Let's also check what assignments exist for ALL users on this date (for debugging)
      const { data: allAssignmentsOnDate, error: allDateError } = await supabase
        .from('schedule_assignments')
        .select('user_id, shift_id, date')
        .eq('date', targetDateString)
      
      if (allDateError) {
        console.error('Error checking all assignments on date:', allDateError)
      } else {
        console.log('All assignments on target date (any user):', allAssignmentsOnDate)
        console.log('Total assignments on date:', allAssignmentsOnDate?.length || 0)
      }

      if (!targetAssignments || targetAssignments.length === 0) {
        console.log('=== NO ASSIGNMENTS FOUND - DEBUGGING ===')
        console.log('This means either:')
        console.log('1. No assignments exist for the date:', targetDateString)
        console.log('2. No assignments exist for team members:', teamMemberIds)
        console.log('3. All assignments are for the current user:', currentUser.id)
        
        // Let's check what assignments exist for team members on ANY date
        const { data: anyTeamMemberAssignments, error: anyError } = await supabase
          .from('schedule_assignments')
          .select('user_id, shift_id, date')
          .in('user_id', teamMemberIds)
          .limit(10)
        
        if (anyError) {
          console.error('Error checking any team member assignments:', anyError)
        } else {
          console.log('Sample assignments for team members (any date):', anyTeamMemberAssignments)
        }
        
        alert(`${tx("alerts.noAssignmentsOnDate", "No one in your team is assigned to any shifts on")} ${targetDate.toLocaleDateString(dateLocale)}`)
        setIsLoading(false)
        return
      }

      // Step 2: Process assignments and filter by team_id
      console.log('=== STEP 2: Processing assignments with shift details ===')
      console.log('Assignments found with shift details:', targetAssignments)
      console.log('Number of assignments found:', targetAssignments?.length || 0)
      
      // Debug: Show the exact structure of the first assignment
      if (targetAssignments && targetAssignments.length > 0) {
        console.log('=== DEBUG: First assignment structure ===')
        console.log('Raw assignment:', targetAssignments[0])
        console.log('Assignment shifts property:', targetAssignments[0].shifts)
        console.log('Shifts type:', typeof targetAssignments[0].shifts)
        console.log('Shifts is array:', Array.isArray(targetAssignments[0].shifts))
        if (targetAssignments[0].shifts) {
          console.log('Shift details:', targetAssignments[0].shifts)
        }
      }

      // Filter assignments to only include those from the correct team
      const validAssignments = (targetAssignments || []).filter(assignment => {
        // Fix: shifts is already the shift object, not an array
        const shift = assignment.shifts as unknown as { id: string; name: string; start_time: string; end_time: string; team_id: string };
        if (!shift) {
          console.log('Assignment has no shift details:', assignment);
          return false;
        }
        
        const isCorrectTeam = shift.team_id === selectedTeam;
        console.log(`Assignment: user ${assignment.user_id}, shift ${shift.name}, team ${shift.team_id}, correct team: ${isCorrectTeam}`);
        return isCorrectTeam;
      });
      
      console.log('Valid team assignments:', validAssignments)
      console.log('Number of valid assignments:', validAssignments.length)

      // Summary log for debugging
      console.log('=== SHIFT CHANGE REQUEST DEBUG SUMMARY ===')
      console.log('Selected team:', selectedTeam)
      console.log('Target date:', targetDateString)
      console.log('Requested shift type:', targetShiftData.name, '(', targetShiftData.start_time, '-', targetShiftData.end_time, ')')
      console.log('Team members found:', teamMemberIds.length)
      console.log('Total assignments on target date:', targetAssignments?.length || 0)
      console.log('Valid team assignments:', validAssignments.length)
      console.log('Available shift types on target date:', validAssignments.map(a => {
        const shift = a.shifts as unknown as { id: string; name: string; start_time: string; end_time: string; team_id: string };
        return shift ? `${shift.name} (${shift.start_time}-${shift.end_time})` : 'Unknown shift'
      }))
      console.log('==========================================')

      if (validAssignments.length === 0) {
        alert(`${tx("alerts.noAssignmentsOnDate", "No one in your team is assigned to any shifts on")} ${targetDate.toLocaleDateString(dateLocale)}`)
        setIsLoading(false)
        return
      }

      // Find someone with the same shift type (same start/end time) within the team
      console.log('=== STEP 4: Finding matching shift type ===')
      console.log('Looking for shift type:', targetShiftData.name, 'with time:', targetShiftData.start_time, '-', targetShiftData.end_time)
      console.log('Available shifts to compare against:')
      validAssignments.forEach(assignment => {
        // Fix: shifts is already the shift object, not an array
        const shift = assignment.shifts as unknown as { id: string; name: string; start_time: string; end_time: string; team_id: string };
        if (shift) {
          console.log(`- User ${assignment.user_id}: ${shift.name} (${shift.start_time}-${shift.end_time})`)
        } else {
          console.log(`- User ${assignment.user_id}: NO SHIFT DETAILS FOUND`)
        }
      })
      
      const targetAssignment = validAssignments.find(assignment => {
        // Fix: shifts is already the shift object, not an array
        const shift = assignment.shifts as unknown as { id: string; name: string; start_time: string; end_time: string; team_id: string };
        
        if (!shift) {
          console.log('Assignment has no shift details:', assignment);
          return false;
        }
        
        const matches = shift.start_time === targetShiftData.start_time && shift.end_time === targetShiftData.end_time
        console.log('Checking assignment:', assignment.user_id, 'shift:', shift.name, 'time:', shift.start_time, '-', shift.end_time, 'matches:', matches)
        return matches
      })

      if (!targetAssignment) {
        console.log('No matching shift found. Available assignments:')
        validAssignments.forEach(assignment => {
          const shift = assignment.shifts as unknown as { id: string; name: string; start_time: string; end_time: string; team_id: string };
          if (shift) {
            console.log('User:', assignment.user_id, 'Shift:', shift.name, 'Time:', shift.start_time, '-', shift.end_time)
          } else {
            console.log('User:', assignment.user_id, 'Shift: NO SHIFT DETAILS')
          }
        })
        
        // Provide more helpful information about what shifts are available
        const availableShiftTypes = new Set()
        validAssignments.forEach(assignment => {
          const shift = assignment.shifts as unknown as { id: string; name: string; start_time: string; end_time: string; team_id: string };
          if (shift) {
            availableShiftTypes.add(`${shift.name} (${shift.start_time}-${shift.end_time})`)
          }
        })
        
        const availableShiftsList = Array.from(availableShiftTypes).join('\n• ')
        
        if (availableShiftsList) {
          alert(`${tx("alerts.noMatchingShiftPrefix", "No one in your team is assigned to a")} ${targetShiftData.name} ${tx("alerts.noMatchingShiftOn", "shift on")} ${targetDate.toLocaleDateString(dateLocale)}.\n\n${tx("alerts.availableShiftsOnDate", "Available shifts on that date")}:\n• ${availableShiftsList}\n\n${tx("alerts.pickDifferentShiftOrDate", "Please select a different shift type or date.")}`)
        } else {
          alert(`${tx("alerts.noMatchingShiftPrefix", "No one in your team is assigned to a")} ${targetShiftData.name} ${tx("alerts.noMatchingShiftOn", "shift on")} ${targetDate.toLocaleDateString(dateLocale)}.\n\n${tx("alerts.noShiftDetails", "No shift details could be retrieved for the available assignments. This might be a data access issue.")}`)
        }
        setIsLoading(false)
        return
      }

      // Create shift change request
      const insertData = {
        requester_id: currentUser.id,
        original_assignment_id: selectedShift, // This should be the assignment ID
        requested_date: targetDateString,
        requested_shift_id: targetShift,
        target_user_id: targetAssignment.user_id,
        message: message || null,
        status: 'pending'
      }
      
      console.log('Inserting shift change request with data:', insertData)
      console.log('Current user ID:', currentUser.id)
      console.log('Auth UID check:', currentUser.id === (await supabase.auth.getUser()).data.user?.id)
      
      const { data: request, error } = await supabase
        .from('shift_change_requests')
        .insert(insertData)
        .select()
        .single()

      if (error) {
        console.error('Error creating shift change request:', error)
        alert(tx("alerts.createRequestFailed", "Failed to create shift change request"))
        return
      }

      // Send email notification
      await sendEmailNotification(request, targetAssignment.user_id)

      // Reset form (but keep selected team)
      setSelectedShift(null)
      setTargetDate(undefined)
      setTargetShift(null)
      setMessage("")

      // Refresh data
      await fetchMyRequests(currentUser.id)

      alert(tx("alerts.requestSent", "Shift change request sent successfully!"))
    } catch (error) {
      console.error('Error submitting request:', error)
      alert(tx("alerts.submitFailed", "Failed to submit request"))
    } finally {
      setIsLoading(false)
    }
  }

  const sendEmailNotification = async (request: { id: string }, targetUserId: string) => {
    try {
      if (!currentUser) {
        console.error('Current user not available')
        return
      }

      // Get target user's email
      const { data: targetUser } = await supabase
        .from('users')
        .select('email, first_name, last_name')
        .eq('id', targetUserId)
        .single()

      if (!targetUser) {
        console.error('Target user not found')
        return
      }

      // Get requester details
      const { data: requester } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', currentUser.id)
        .single()

      // Get shift details
      const selectedShiftData = myUpcomingShifts.find(s => s.id === selectedShift)
      const targetShiftData = availableShifts.find(s => s.id === targetShift)

      if (!selectedShiftData || !targetShiftData) {
        console.error('Shift data not found')
        return
      }

      // Send email using our API route
      const emailData = {
        to: targetUser.email,
        subject: 'Shift Change Request',
        html: `
          <h2>Shift Change Request</h2>
          <p>Hello ${targetUser.first_name},</p>
          <p>${requester?.first_name} ${requester?.last_name} has requested to swap shifts with you:</p>
          <ul>
            <li><strong>Their shift:</strong> ${selectedShiftData.shift?.name || 'Unknown Shift'} on ${format(new Date(selectedShiftData.date), 'MMM dd, yyyy')}</li>
            <li><strong>Your shift:</strong> ${targetShiftData.name || 'Unknown Shift'} on ${format(targetDate!, 'MMM dd, yyyy')}</li>
          </ul>
          ${message ? `<p><strong>Reason:</strong> ${message}</p>` : ''}
          <p>Please log into the system to accept or decline this request.</p>
          <p>Best regards,<br>AISchedulator</p>
        `
      }

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData),
      })

      if (!response.ok) {
        console.error('Failed to send email notification')
      } else {
        console.log('Email notification sent successfully')
      }

    } catch (error) {
      console.error('Error sending email notification:', error)
    }
  }

  const handleAcceptRequest = async (requestId: string) => {
    try {
      console.log('=== ACCEPT REQUEST DEBUG START ===')
      console.log('Request ID received:', requestId)
      console.log('Request ID type:', typeof requestId)
      console.log('Request ID length:', requestId?.length)
      console.log('Request ID value:', JSON.stringify(requestId))
      
      // Use the API endpoint instead of complex frontend logic
      const response = await fetch('/api/accept-shift-change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requestId }),
      })

      const result = await response.json()
      
      if (!response.ok) {
        console.error('API Error:', result.error)
      alert(`${tx("alerts.processFailed", "Failed to process request")}: ${result.error}`)
        return
      }

      console.log('API Success:', result)
      
      // Immediately remove the request from local state for instant UI feedback
      setPendingRequests(prev => prev.filter(req => req.id !== requestId))
      
      // Refresh data
      if (currentUser) {
        await fetchPendingRequests(currentUser.id)
        await fetchMyRequests(currentUser.id)
      }

      alert(tx("alerts.acceptSuccess", "Shift change request accepted and shifts swapped successfully!"))
    } catch (error) {
      console.error('=== ACCEPT REQUEST ERROR ===')
      console.error('Full error object:', error)
      alert(tx("alerts.processFailed", "Failed to process request"))
    }
  }

  const handleDeclineRequest = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('shift_change_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId)

      if (error) {
        console.error('Error declining request:', error)
        alert(tx("alerts.declineFailed", "Failed to decline request"))
        return
      }

      // Immediately remove the request from local state for instant UI feedback
      setPendingRequests(prev => prev.filter(req => req.id !== requestId))

      // Refresh data
      if (currentUser) {
        await fetchPendingRequests(currentUser.id)
        await fetchMyRequests(currentUser.id)
      }

      alert(tx("alerts.declineSuccess", "Request declined successfully!"))
    } catch (error) {
      console.error('Error declining request:', error)
      alert(tx("alerts.declineFailed", "Failed to decline request"))
    }
  }

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date()
    const time = new Date(timestamp)
    const diffInHours = Math.floor((now.getTime() - time.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return tx("time.justNow", "Just now")
    if (diffInHours === 1) return tx("time.oneHourAgo", "1 hour ago")
    if (diffInHours < 24) return `${diffInHours} ${tx("time.hoursAgo", "hours ago")}`
    
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays === 1) return tx("time.oneDayAgo", "1 day ago")
    return `${diffInDays} ${tx("time.daysAgo", "days ago")}`
  }

  const findAvailableDates = async (teamId: string) => {
    try {
      // Look for dates in the next 30 days that have assignments
      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
      
      const { data: assignments, error } = await supabase
        .from('schedule_assignments')
        .select('date')
        .eq('shifts.team_id', teamId)
        .gte('date', new Date().toISOString().split('T')[0])
        .lte('date', thirtyDaysFromNow.toISOString().split('T')[0])
        .order('date', { ascending: true })

      if (error) {
        console.error('Error finding available dates:', error)
        return []
      }

      // Get unique dates
      const uniqueDates = [...new Set(assignments?.map(a => a.date) || [])]
      return uniqueDates.slice(0, 10) // Return first 10 available dates
    } catch (error) {
      console.error('Error in findAvailableDates:', error)
      return []
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">{tx("loading", "Loading shift change data...")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Link href="/participant/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {tx("backToDashboard", "Back to Dashboard")}
              </Button>
            </Link>
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">{tx("title", "Shift Change Requests")}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Request New Change */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Send className="h-5 w-5" />
                  <span>{tx("requestTitle", "Request Shift Change")}</span>
                </CardTitle>
                <CardDescription>
                  {tx("requestDesc", "Request to change one of your assigned shifts with another team member")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitRequest} className="space-y-6">
                  {/* Team Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="team">{tx("selectTeam", "Select Team")}</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {userTeams && userTeams.length > 0 ? (
                        userTeams.map((team) => (
                          <Button
                            key={team.id}
                            variant={selectedTeam === team.id ? "default" : "outline"}
                            className="justify-start h-auto p-4"
                            onClick={() => setSelectedTeam(team.id)}
                          >
                            <div className="text-left">
                              <div className="font-medium">{team.name}</div>
                              <div className="text-sm text-gray-500">{team.department}</div>
                            </div>
                          </Button>
                        ))
                      ) : (
                        <div className="text-center py-4 text-gray-500">
                          {tx("noTeams", "No teams available")}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="currentShift">{tx("currentShift", "Current Shift to Change")}</Label>
                    <Select value={selectedShift || ""} onValueChange={setSelectedShift}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={tx("currentShiftPlaceholder", "Select your shift to change")} />
                      </SelectTrigger>
                      <SelectContent>
                        {myUpcomingShifts && myUpcomingShifts.length > 0 ? (
                          myUpcomingShifts.map((shift) => (
                            <SelectItem key={shift.id} value={shift.id}>
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {new Date(shift.date).toLocaleDateString(dateLocale)} - {shift.shift?.name || tx("unknownShift", "Unknown Shift")}
                                </span>
                                <span className="text-sm text-gray-500">
                                  {shift.shift?.start_time || ''} - {shift.shift?.end_time || ''} ({shift.team?.name || tx("unknownTeam", "Unknown Team")})
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-shifts" disabled>
                            {selectedTeam ? tx("noShiftsForTeam", `No upcoming shifts available for this team (${myUpcomingShifts?.length || 0} shifts found)`) : tx("selectTeamFirst", "Please select a team first")}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="targetDate">{tx("preferredDate", "Preferred New Date")}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !targetDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {targetDate ? targetDate.toLocaleDateString(dateLocale) : <span>{tx("pickDate", "Pick a date")}</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={targetDate}
                          onSelect={setTargetDate}
                          disabled={(date) => date < new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {selectedTeam && (
                      <div className="space-y-2">
                        <div className="text-sm text-gray-500">
                          <button
                            type="button"
                            onClick={async () => {
                              const dates = await findAvailableDates(selectedTeam)
                              if (dates.length > 0) {
                                const formattedDates = dates.map(date => new Date(date).toLocaleDateString(dateLocale)).join(', ')
                                alert(`${tx("alerts.availableDatesNext30", "Available dates for your team in the next 30 days")}:\n\n${formattedDates}`)
                              } else {
                                alert(tx("alerts.noScheduledShiftsNext30", "No scheduled shifts found for your team in the next 30 days."))
                              }
                            }}
                            className="text-blue-600 hover:text-blue-800 underline"
                          >
                            {tx("showAvailableDates", "Click here to see available dates")}
                          </button>
                        </div>
                        <div className="text-xs text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                          💡 <strong>{tx("howItWorks", "How it works")}:</strong> {tx("howItWorksDesc", "Select a date when someone else in your team is working, and choose the shift type you want. The system will find a team member with that shift and send them a swap request.")}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="targetShift">{tx("preferredShift", "Preferred New Shift")}</Label>
                    <Select value={targetShift || ""} onValueChange={setTargetShift}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={tx("preferredShiftPlaceholder", "Select preferred shift time")} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableShifts && availableShifts.length > 0 ? (
                          availableShifts.map((shift) => (
                            <SelectItem key={shift.id} value={shift.id}>
                              <div className="flex flex-col">
                                <span className="font-medium">{shift.name || tx("unknownShift", "Unknown Shift")}</span>
                                <span className="text-sm text-gray-500">
                                  {shift.start_time || ''} - {shift.end_time || ''}
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-available-shifts" disabled>
                            {tx("noShiftsAnyTeam", "No shifts available for your teams")}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">{tx("reasonOptional", "Reason for Change (Optional)")}</Label>
                    <Textarea
                      id="message"
                      placeholder={tx("reasonPlaceholder", "Explain why you need to change this shift...")}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      className="resize-none"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        {tx("sending", "Sending Request...")}
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        {tx("sendRequest", "Send Change Request")}
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Pending Requests */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Clock className="h-5 w-5" />
                  <span>{tx("pendingTitle", "Pending Requests")}</span>
                  {pendingRequests.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {pendingRequests.length}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>{tx("pendingDesc", "Shift change requests that need your response")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pendingRequests.map((request) => (
                    <div key={request.id} className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium">
                          {request.requester?.first_name} {request.requester?.last_name}
                        </h3>
                        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
                          {tx(`status.${request.status}`, request.status)}
                        </Badge>
                      </div>

                      <div className="space-y-2 mb-3">
                        <div className="text-sm">
                          <span className="font-medium">{tx("original", "Original")}:</span> {new Date(request.original_assignment?.date || '').toLocaleDateString(dateLocale)} - {request.original_assignment?.shift?.name || tx("unknownShift", "Unknown Shift")}
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">{tx("requested", "Requested")}:</span> {new Date(request.requested_date).toLocaleDateString(dateLocale)} - {request.requested_shift?.name || tx("unknownShift", "Unknown Shift")}
                        </div>
                        {request.message && (
                          <div className="text-sm">
                            <span className="font-medium">{tx("message", "Message")}:</span> {request.message}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {formatRelativeTime(request.created_at)}
                        </div>
                      </div>

                      <div className="flex space-x-2">
                        <Button 
                          size="sm" 
                          className="flex-1"
                          onClick={() => handleAcceptRequest(request.id)}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          {tx("accept", "Accept")}
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1 bg-transparent"
                          onClick={() => handleDeclineRequest(request.id)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          {tx("decline", "Decline")}
                        </Button>
                      </div>
                    </div>
                  ))}

                  {pendingRequests.length === 0 && (
                    <div className="text-center py-8">
                      <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500 dark:text-gray-400">{tx("noPending", "No pending requests")}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* My Requests */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>{tx("myRequests", "My Requests")}</CardTitle>
                <CardDescription>{tx("myRequestsDesc", "Track the status of your shift change requests")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {myRequests.map((request) => (
                    <div key={request.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">
                          {new Date(request.original_assignment?.date || '').toLocaleDateString(dateLocale)} → {new Date(request.requested_date).toLocaleDateString(dateLocale)}
                        </span>
                        <Badge 
                          className={cn(
                            request.status === 'pending' && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
                            request.status === 'approved' && "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
                            request.status === 'rejected' && "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                          )}
                        >
                          {tx(`status.${request.status}`, request.status)}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {request.original_assignment?.shift?.name || tx("unknownShift", "Unknown Shift")} → {request.requested_shift?.name || tx("unknownShift", "Unknown Shift")}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatRelativeTime(request.created_at)}
                      </p>
                    </div>
                  ))}

                  {myRequests.length === 0 && (
                    <div className="text-center py-4">
                      <p className="text-gray-500 dark:text-gray-400">{tx("noRequestsYet", "No requests yet")}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
