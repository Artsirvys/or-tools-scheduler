"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Calendar, Clock, AlertCircle, Bell, LogOut, Mail, Heart } from "lucide-react"
import Link from "next/link"
import { ParticipantList } from "@/components/participant-list"
import { supabase } from "@/lib/supabase"
import { FeedbackDialog } from "@/components/FeedbackDialog"

export default function ParticipantDashboard() {
  const [userName, setUserName] = useState<string | null>(null)


  const [upcomingShifts, setUpcomingShifts] = useState<Array<{
    id: string
    date: string
    shift: string
    time: string
    team: string
    status: string
    shiftId: string
    teamId: string
  }>>([])
  const [loading, setLoading] = useState(true)
  const [userStatus, setUserStatus] = useState<'loading' | 'no-team' | 'no-shifts' | 'has-shifts'>('loading')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [userTeamId, setUserTeamId] = useState<string | null>(null)
  const [userTeams, setUserTeams] = useState<Array<{
    id: string
    name: string
    department: string
  }>>([])
  const [selectedTeamForView, setSelectedTeamForView] = useState<string | null>(null)

  const [notifications, setNotifications] = useState<Array<{
    id: string
    message: string
    time: string
    requesterId: string
    requesterName: string
    originalDate: string
    requestedDate: string
    originalShiftId: string
    requestedShiftId: string
    originalAssignmentId: string
    status: string
  }>>([])

  const [activeTab, setActiveTab] = useState("overview")
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false)
  const [showDonationModal, setShowDonationModal] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleLogout = () => {
    alert("Logout clicked!")
  }

  const handleShiftChangeRequest = async (shiftId: string, date: string, teamId: string) => {
    try {
      // Navigate to shift change page with parameters
      window.location.href = `/participant/shift-change?shiftId=${shiftId}&date=${date}&teamId=${teamId}`
    } catch (error) {
      console.error('Error navigating to shift change:', error)
      alert('Failed to open shift change request')
    }
  }

  const fetchNotifications = useCallback(async (userId: string) => {
    try {
      console.log('Fetching notifications for user:', userId)
      
      // Fetch pending shift change requests where this user is the target
      const { data: requests, error } = await supabase
        .from('shift_change_requests')
        .select('id, requester_id, original_assignment_id, requested_date, requested_shift_id, target_user_id, status, created_at')
        .eq('target_user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching notifications:', error)
        return
      }

      console.log('Found shift change requests:', requests?.length || 0)

      if (!requests || requests.length === 0) {
        setNotifications([])
        return
      }

      // Fetch related data separately
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
        .select('id, name')
        .in('id', shiftIds)

      // Transform the data into notifications
      const notificationsData = requests.map(request => {
        const requester = requesters?.find(r => r.id === request.requester_id)
        const assignment = assignments?.find(a => a.id === request.original_assignment_id)
        const requestedShift = shifts?.find(r => r.id === request.requested_shift_id)
        const originalShift = shifts?.find(s => s.id === assignment?.shift_id)

        const requesterName = requester?.last_name 
          ? `${requester.first_name} ${requester.last_name}`
          : requester?.first_name || 'Unknown User'

        const originalDate = assignment?.date
        const requestedDate = request.requested_date
        const originalShiftName = originalShift?.name || 'Unknown Shift'
        const requestedShiftName = requestedShift?.name || 'Unknown Shift'

        const message = `${requesterName} wants to swap ${originalShiftName} on ${new Date(originalDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} with your ${requestedShiftName} on ${new Date(requestedDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`

        return {
          id: request.id,
          message,
          time: formatRelativeTime(request.created_at),
          requesterId: request.requester_id,
          requesterName,
          originalDate: originalDate || '',
          requestedDate: requestedDate || '',
          originalShiftId: assignment?.shift_id || '',
          requestedShiftId: request.requested_shift_id,
          originalAssignmentId: request.original_assignment_id,
          status: request.status
        }
      })

      setNotifications(notificationsData)
    } catch (error) {
      console.error('Error fetching notifications:', error)
    }
  }, [])

  const getUserInitials = (fullName: string) => {
    const names = fullName.trim().split(' ')
    if (names.length === 0) return 'U'
    
    const firstName = names[0]
    const lastName = names[names.length - 1]
    
    const firstInitial = firstName.charAt(0).toUpperCase()
    const lastInitial = lastName.charAt(0).toUpperCase()
    
    return `${firstInitial}${lastInitial}`
  }

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date()
    const time = new Date(timestamp)
    const diffInHours = Math.floor((now.getTime() - time.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return 'Just now'
    if (diffInHours === 1) return '1 hour ago'
    if (diffInHours < 24) return `${diffInHours} hours ago`
    
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays === 1) return '1 day ago'
    return `${diffInDays} days ago`
  }

  const handleAcceptRequest = async (notificationId: string) => {
    try {
      const notification = notifications.find(n => n.id === notificationId)
      if (!notification) return

      console.log('Accepting shift change request:', notificationId)

      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('User not authenticated')
        return
      }

      // Get the current user's assignment for the requested date
      const { data: currentUserAssignment, error: currentError } = await supabase
        .from('schedule_assignments')
        .select('id, user_id')
        .eq('user_id', user.id)
        .eq('date', notification.requestedDate)
        .eq('shift_id', notification.requestedShiftId)
        .single()

      if (currentError) {
        console.error('Error finding current user assignment:', currentError)
        alert('Failed to process request')
        return
      }

      // Get the requester's original assignment
      const { data: requesterAssignment, error: requesterError } = await supabase
        .from('schedule_assignments')
        .select('id, user_id')
        .eq('id', notification.originalAssignmentId)
        .single()

      if (requesterError) {
        console.error('Error finding requester assignment:', requesterError)
        alert('Failed to process request')
        return
      }

      // Update the assignments to swap users
      const { error: updateError } = await supabase
        .from('schedule_assignments')
        .update({ user_id: notification.requesterId })
        .eq('id', currentUserAssignment.id)

      if (updateError) {
        console.error('Error updating current user assignment:', updateError)
        alert('Failed to process request')
        return
      }

      const { error: updateRequesterError } = await supabase
        .from('schedule_assignments')
        .update({ user_id: user.id })
        .eq('id', requesterAssignment.id)

      if (updateRequesterError) {
        console.error('Error updating requester assignment:', updateRequesterError)
        alert('Failed to process request')
        return
      }

      // Update the request status to approved
      const { error: statusError } = await supabase
        .from('shift_change_requests')
        .update({ status: 'approved' })
        .eq('id', notificationId)

      if (statusError) {
        console.error('Error updating request status:', statusError)
      }

      // Immediately remove the notification from local state for instant UI feedback
      setNotifications(prev => prev.filter(n => n.id !== notificationId))

      // Refresh shifts (notifications will be empty since we removed it from local state)
      await fetchUpcomingShifts(user.id)

      alert('Shift change accepted! Your schedule has been updated.')
    } catch (error) {
      console.error('Error accepting request:', error)
      alert('Failed to accept request')
    }
  }

  const handleDeclineRequest = async (notificationId: string) => {
    try {
      console.log('Declining shift change request:', notificationId)

      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('User not authenticated')
        return
      }

      // Update the request status to rejected
      const { error } = await supabase
        .from('shift_change_requests')
        .update({ status: 'rejected' })
        .eq('id', notificationId)

      if (error) {
        console.error('Error updating request status:', error)
        alert('Failed to decline request')
        return
      }

      // Immediately remove the notification from local state for instant UI feedback
      setNotifications(prev => prev.filter(n => n.id !== notificationId))

      // Refresh notifications
      await fetchNotifications(user.id)

      alert('Shift change request declined.')
    } catch (error) {
      console.error('Error declining request:', error)
      alert('Failed to decline request')
    }
  }

  useEffect(() => {
    const init = async () => {
      try {
        console.log('Dashboard init started')
        
        // Get current user
        const { data: { user }, error } = await supabase.auth.getUser()
        
        console.log('Dashboard auth check - user:', user?.id, 'error:', error)
        
        if (error || !user) {
          console.log('No authenticated user, redirecting to signin')
          window.location.href = '/auth/signin'
          return
        }

        setIsAuthenticated(true)

        // Check if user profile exists in users table
        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single()

        if (profileError || !userProfile) {
          console.log('User profile not found, creating missing profile')
          
          // Try to create missing profile
          const profileResponse = await fetch('/api/create-missing-profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            }
          })

          if (!profileResponse.ok) {
            console.error('Failed to create missing profile')
            // Continue anyway, user might be able to use the app
          } else {
            console.log('Missing profile created successfully')
          }
        }

        // Set user name from auth metadata or profile
        const userMetadata = user.user_metadata || {}
        const displayName = userProfile?.first_name 
          ? `${userProfile.first_name} ${userProfile.last_name}`
          : userMetadata.first_name 
            ? `${userMetadata.first_name} ${userMetadata.last_name}`
            : user.email?.split('@')[0] || 'User'
        
        setUserName(displayName)

        // Fetch user's team memberships
        console.log('Fetching team memberships for user:', user.id)
        const { data: teamMemberships, error: teamError } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', user.id)

        if (teamError) {
          console.error('Error fetching team memberships:', teamError)
          setUserStatus('no-team')
          setLoading(false)
          return
        }

        console.log('Team memberships found:', teamMemberships)
        console.log('User ID:', user.id)
        console.log('Team memberships length:', teamMemberships?.length || 0)
        
        // Also check if user exists in users table
        const { data: userProfileCheck, error: userError } = await supabase
          .from('users')
          .select('id, email, account_type')
          .eq('id', user.id)
          .single()
        
        console.log('User profile from users table:', userProfileCheck)
        console.log('User profile error:', userError)

        // Check if user has any team memberships
        if (!teamMemberships || teamMemberships.length === 0) {
          console.log('User has no team memberships, checking for pending invitations')
          
          // For now, let's check if the user was invited via URL parameters
          const urlParams = new URLSearchParams(window.location.search)
          const invitedTeamId = urlParams.get('team')
          
          if (invitedTeamId) {
            console.log('Found team invitation in URL, adding user to team:', invitedTeamId)
            try {
              const { data: teamMemberData, error: addError } = await supabase
                .from('team_members')
                .insert({
                  team_id: invitedTeamId,
                  user_id: user.id,
                  experience_level: 1
                })
                .select()

              if (addError) {
                console.error('Error adding user to invited team:', addError)
              } else {
                console.log('Successfully added user to invited team:', teamMemberData)
                // Refresh team memberships
                const { data: newMemberships } = await supabase
                  .from('team_members')
                  .select('team_id')
                  .eq('user_id', user.id)
                
                if (newMemberships && newMemberships.length > 0) {
                  // User now has team memberships, continue with normal flow
                  setUserStatus('has-shifts') // Set status to indicate user has teams
                  await fetchUpcomingShifts(user.id)
                  await fetchNotifications(user.id)
                  setLoading(false)
                  return
                }
              }
            } catch (error) {
              console.error('Error processing team invitation:', error)
            }
          }
          
          console.log('User has no team memberships')
          setUserStatus('no-team')
          setLoading(false)
          return
        }

        // User has team memberships - set status and continue
        console.log('User has team memberships, setting status to has-shifts')
        setUserStatus('has-shifts')
        
        // Store the first team ID for the ParticipantList component
        if (teamMemberships && teamMemberships.length > 0) {
          setUserTeamId(teamMemberships[0].team_id)
          
          // Fetch team details for all teams the user belongs to
          const teamIds = teamMemberships.map(tm => tm.team_id)
          const { data: teamsData, error: teamsError } = await supabase
            .from('teams')
            .select('id, name, department')
            .in('id', teamIds)
          
          if (!teamsError && teamsData) {
            setUserTeams(teamsData)
            setSelectedTeamForView(teamsData[0].id) // Set first team as default for viewing
            
            // Now that we have userTeams, fetch shifts
            await fetchUpcomingShifts(user.id)
            await fetchNotifications(user.id)
          } else {
            console.error('Error fetching team details:', teamsError)
            // Even if team details fail, try to fetch shifts
            await fetchUpcomingShifts(user.id)
            await fetchNotifications(user.id)
          }
        } else {
          // Fallback: fetch shifts even without team details
          await fetchUpcomingShifts(user.id)
          await fetchNotifications(user.id)
        }

        setLoading(false)
      } catch (error) {
        console.error('Error in dashboard init:', error)
        setLoading(false)
      }
    }

    init()
  }, [])

  const fetchUpcomingShifts = useCallback(async (userId: string) => {
    try {
      console.log('Fetching shifts for user:', userId)
      
      // First, check if user is assigned to any team
      const { data: teamMemberships, error: teamError } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', userId)

      if (teamError) {
        console.error('Error checking team memberships:', teamError)
        setUserStatus('no-team')
        setLoading(false)
        return
      }

      if (!teamMemberships || teamMemberships.length === 0) {
        console.log('User is not assigned to any team')
        setUserStatus('no-team')
        setUpcomingShifts([])
        setLoading(false)
        return
      }

      // If userTeams is not available yet, fetch team details here
      let availableTeams = userTeams
      if (!availableTeams || availableTeams.length === 0) {
        console.log('userTeams not available, fetching team details directly')
        const teamIds = teamMemberships.map(tm => tm.team_id)
        const { data: teamsData, error: teamsError } = await supabase
          .from('teams')
          .select('id, name, department')
          .in('id', teamIds)
        
        if (!teamsError && teamsData) {
          availableTeams = teamsData
          // Also update the state for consistency
          setUserTeams(teamsData)
          console.log('Fetched teams directly:', availableTeams)
        } else {
          console.error('Error fetching team details:', teamsError)
        }
      }

      const today = new Date()
      const currentMonth = today.getMonth() + 1
      const currentYear = today.getFullYear()
      
      // Get current and next month
      const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1
      const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear
      
      const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
      const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${new Date(nextYear, nextMonth, 0).getDate()}`
      
      console.log('Date range:', startDate, 'to', endDate)
      console.log('User ID for fetching shifts:', userId)
      
      // Fetch schedule assignments first, then get related data
      const { data: assignments, error } = await supabase
        .from('schedule_assignments')
        .select('id, date, shift_id, schedule_id')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })

      if (error) {
        console.error('Error fetching shifts:', error)
        setUpcomingShifts([])
        setUserStatus('no-shifts')
        setLoading(false)
        return
      }

      console.log('Found assignments:', assignments?.length || 0)
      console.log('Sample assignment structure:', assignments?.[0])

      if (!assignments || assignments.length === 0) {
        console.log('No assignments found, user has team but no shifts')
        setUpcomingShifts([])
        setUserStatus('no-shifts')
        setLoading(false)
        return
      }

      // Fetch shifts data
      const shiftIds = [...new Set(assignments.map(a => a.shift_id))]
      console.log('Fetching shifts for IDs:', shiftIds)

      const { data: shifts, error: shiftsError } = await supabase
        .from('shifts')
        .select('id, name, start_time, end_time')
        .in('id', shiftIds)

      if (shiftsError) {
        console.error('Error fetching shifts:', shiftsError)
      }

      // We'll use availableTeams for team information
      console.log('Using availableTeams for team information:', availableTeams)
      console.log('AvailableTeams length:', availableTeams?.length || 0)

      // Ensure we have team information before proceeding
      if (!availableTeams || availableTeams.length === 0) {
        console.log('No teams available, cannot resolve team names')
        setUpcomingShifts([])
        setUserStatus('no-shifts')
        setLoading(false)
        return
      }

      // Transform the data using separate data sources
      const shiftsData = assignments.map(assignment => {
          const shift = shifts?.find(s => s.id === assignment.shift_id)
          
          // Since schedule_id might be null or schedules might not have team info,
          // we'll use the user's team memberships directly
          let teamDisplayName = 'Unknown Team'
          let teamId = ''
          
          // First try to get team from schedules if available (simplified approach)
          // Since we're not fetching schedules anymore, we'll go straight to userTeams
          
          // Use the first available team from available teams
          if (availableTeams && availableTeams.length > 0) {
            teamDisplayName = availableTeams[0].name
            teamId = availableTeams[0].id
            console.log('Using team from available teams:', teamDisplayName)
          }
          
          console.log('Assignment:', assignment.id, 'Final team:', teamDisplayName, 'Team ID:', teamId, 'Available teams count:', availableTeams?.length || 0)
          
          return {
            id: assignment.id,
            date: assignment.date,
            shift: shift?.name || 'Unknown Shift',
            time: shift ? `${shift.start_time} - ${shift.end_time}` : 'Unknown Time',
            team: teamDisplayName,
            status: 'confirmed', // Default status, can be enhanced later
            shiftId: assignment.shift_id,
            teamId: teamId
          }
        })

      console.log('Transformed shifts data:', shiftsData.length)
      setUpcomingShifts(shiftsData)
      setUserStatus('has-shifts')
    } catch (error) {
      console.error('Error fetching upcoming shifts:', error)
      setUpcomingShifts([])
      setUserStatus('no-shifts')
    } finally {
      console.log('Setting loading to false')
      setLoading(false)
    }
  }, [])

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  // Redirect if not authenticated
  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Simple Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Calendar className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">AISchedulator</span>
            </div>

            <div className="flex items-center space-x-3">
              {/* Support Project Button */}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowDonationModal(true)}
                className="text-base font-medium text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:hover:bg-pink-900/20 flex items-center gap-1.5"
              >
                Support a project <Heart className="h-4 w-4 fill-red-500 text-red-500" />
              </Button>
              {/* Feedback Button */}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowFeedbackDialog(true)}
                className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1.5"
              >
                Send Feedback <Mail className="h-4 w-4" />
              </Button>
              {/* Notification Bell */}
              <Button variant="ghost" size="sm" className="relative">
                <Bell className="h-4 w-4" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                    {notifications.length}
                  </span>
                )}
              </Button>

              {/* Avatar Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium hover:bg-blue-700"
                  >
                    {userName ? getUserInitials(userName) : 'U'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => {
                      console.log("Logging out...")
                      window.location.href = "/"
                    }}
                    className="text-red-600"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-3xl">
        {/* Simple Welcome */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            Hello, {userName || "Participant"}!
          </h1>
          <p className="text-gray-600 dark:text-gray-300">Here is your shift overview</p>
        </div>

        {/* Big Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Link href="/participant/availability">
            <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-blue-200">
              <CardContent className="p-6 text-center">
                <Calendar className="h-12 w-12 text-blue-600 mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-2">Set My Availability</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">Mark when you can work</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/participant/shift-change">
            <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-orange-200">
              <CardContent className="p-6 text-center">
                <AlertCircle className="h-12 w-12 text-orange-600 mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-2">Request Shift Change</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">Swap or change shifts</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/schedule/participant/1">
            <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-purple-200">
              <CardContent className="p-6 text-center">
                <Calendar className="h-12 w-12 text-purple-600 mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-2">View Schedule</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">See your assigned shifts</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Dashboard Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8 overflow-x-auto">
              <button
                onClick={() => setActiveTab("overview")}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === "overview"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                My Overview
              </button>
              <button
                onClick={() => setActiveTab("team")}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === "team"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                My Team
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <>
            {/* My Next Shifts */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Clock className="h-5 w-5 mr-2" />
                  My Next Shifts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading your shifts...</p>
                  </div>
                ) : userStatus === 'no-team' ? (
                  <div className="text-center py-8">
                    <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-2">You are not assigned to a team</p>
                    <p className="text-sm text-gray-500">Contact your administrator to be added to a team</p>
                  </div>
                ) : userStatus === 'no-shifts' ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-2">No upcoming shifts scheduled</p>
                    <p className="text-sm text-gray-500">Here you will see your shifts when they are assigned to you</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upcomingShifts.map((shift) => {
                      const formattedDate = new Date(shift.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        weekday: "short"
                      })
                      
                      return (
                        <div
                          key={shift.id}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-medium">{formattedDate}</span>
                              <Badge
                                variant={shift.status === "confirmed" ? "default" : "secondary"}
                                className={shift.status === "pending_change" ? "bg-orange-100 text-orange-800" : ""}
                              >
                                {shift.status === "confirmed" ? "Confirmed" : "Change Requested"}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                              {shift.shift} ({shift.time}) • {shift.team}
                            </p>
                          </div>
                          {shift.status === "confirmed" && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="w-full sm:w-auto bg-transparent"
                              onClick={() => handleShiftChangeRequest(shift.shiftId, shift.date, shift.teamId)}
                            >
                              Change
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Bell className="h-5 w-5 mr-2" />
                  New Notifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                {notifications.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 mb-2">No new notifications</p>
                    <p className="text-sm text-gray-500">You&apos;ll see shift change requests here when they come in</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((notification) => (
                      <div key={notification.id} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-sm font-medium">{notification.message}</p>
                        <p className="text-xs text-gray-500 mt-1">{notification.time}</p>
                        <div className="flex flex-col sm:flex-row gap-2 mt-3">
                          <Button 
                            size="sm" 
                            className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700"
                            onClick={() => handleAcceptRequest(notification.id)}
                          >
                            Accept
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="flex-1 sm:flex-none bg-transparent border-red-300 text-red-600 hover:bg-red-50"
                            onClick={() => handleDeclineRequest(notification.id)}
                          >
                            Decline
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === "team" && (
          <div className="space-y-6">
            {/* Team Selection */}
            {userTeams.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Select Team to View</CardTitle>
                  <CardDescription>Choose a team to see its members and details</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {userTeams.map((team) => (
                      <Button
                        key={team.id}
                        variant={selectedTeamForView === team.id ? "default" : "outline"}
                        className="justify-start h-auto p-4"
                        onClick={() => setSelectedTeamForView(team.id)}
                      >
                        <div className="text-left">
                          <div className="font-medium">{team.name}</div>
                          <div className="text-sm text-gray-500">{team.department}</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Team Members List */}
            {selectedTeamForView && (
              <ParticipantList isHost={false} teamId={selectedTeamForView} />
            )}
          </div>
        )}
      </div>

      {/* Feedback Dialog */}
      <FeedbackDialog 
        open={showFeedbackDialog} 
        onOpenChange={setShowFeedbackDialog} 
      />

      {/* Donation Modal */}
      {showDonationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="text-center">Support AISchedulator</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  If AISchedulator helps you or your team, you can support the development.
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                  Every donation helps keep the project alive and fund new features. ❤️
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={() => {
                    window.open("https://donate.stripe.com/6oUaEYcTKdjR9Na1uR8so00", "_blank")
                  }}
                >
                  3 €
                </Button>
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={() => {
                    window.open("https://donate.stripe.com/bJecN64necfN7F2ddz8so01", "_blank")
                  }}
                >
                  5 €
                </Button>
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={() => {
                    window.open("https://donate.stripe.com/9B628saLC7Zx7F26Pb8so03", "_blank")
                  }}
                >
                  10 €
                </Button>
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={() => {
                    window.open("https://donate.stripe.com/fZu28sbPGcfN9Na2yV8so05", "_blank")
                  }}
                >
                  20 €
                </Button>
              </div>
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowDonationModal(false)}
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
