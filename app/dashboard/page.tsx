"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Calendar, Users, Brain, Plus, FileDown, Bell, LogOut, Check, Star, X, Clock, Heart, Trash2, Mail } from "lucide-react"
import Link from "next/link"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ParticipantList } from "@/components/participant-list"
// import { ReportingDashboard } from "@/components/reporting-dashboard"
// import { AuditTrail } from "@/components/audit-trail"
import { supabase } from "@/lib/supabase"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
dayjs.extend(relativeTime)
import GenerateScheduleForm from "@/components/GenerateScheduleForm"
import TrialStatusIndicator from "@/components/TrialStatusIndicator"
import { FeedbackDialog } from "@/components/FeedbackDialog"





export default function DashboardPage() {
  const [userName, setUserName] = useState<string | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [totalMembers, setTotalMembers] = useState(0)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [availableSchedules, setAvailableSchedules] = useState<Array<{teamId: string, month: number, year: number}>>([])
  const [activity, setActivity] = useState<{
    id: string
    host_id: string
    actor_id: string
    team_id: string
    action: string
    type: string
    created_at: string
  }[]>([])
  // AI Constraints interface
  interface AiConstraints {
    max_consecutive_days: number
    workers_per_shift: number
    custom_constraints?: string
    max_days_per_month: number
  }

  const [aiConstraints, setAiConstraints] = useState<Record<string, AiConstraints>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Generate month options for the next 6 months
  const generateMonthOptions = () => {
    const options = []
    const now = new Date()
    
    for (let i = 0; i < 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const year = date.getFullYear()
      const month = date.getMonth() + 1
      const monthString = `${year}-${String(month).padStart(2, '0')}`
      const monthName = date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      
      options.push({
        value: monthString,
        label: monthName
      })
    }
    
    return options
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
        setCurrentUserId(user.id)

        // Expire old trials (background task)
        fetch('/api/expire-trials', { method: 'POST' }).catch(error => {
          console.error('Error expiring trials:', error)
        })

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

        // Fetch user's teams (as host)
        const { data: teams, error: teamError } = await supabase
          .from('teams')
          .select('*')
          .eq('host_id', user.id)

        if (teamError) {
          console.error('Error fetching teams:', teamError)
          // setTeamError(teamError.message) // This line was removed
        } else {
          setTeams(teams || [])
        }

        // Fetch total member count for all teams
        if (teams && teams.length > 0) {
          const { data: membersData, error: membersError } = await supabase
            .from('team_members')
            .select('user_id')
            .in('team_id', teams.map(t => t.id))

          if (membersError) {
            console.error('Error fetching member count:', membersError)
          } else {
            setTotalMembers(membersData?.length || 0)
          }

          // Fetch available schedules for all teams
          const { data: schedulesData, error: schedulesError } = await supabase
            .from('schedules')
            .select('team_id, month, year')
            .in('team_id', teams.map(t => t.id))
            .eq('status', 'active')

          if (schedulesError) {
            console.error('Error fetching schedules:', schedulesError)
          } else {
            setAvailableSchedules((schedulesData || []).map(s => ({
              teamId: s.team_id,
              month: s.month,
              year: s.year
            })))
          }

          // Fetch basic constraints for all teams
          const constraintsMap: Record<string, AiConstraints> = {}
          for (const team of teams) {
            try {
              const response = await fetch(`/api/basic-constraints?teamId=${team.id}`)
              if (response.ok) {
                const constraints: AiConstraints = await response.json()
                constraintsMap[team.id] = constraints
              }
            } catch (error) {
              console.error('Error fetching basic constraints for team:', team.id, error)
            }
          }
          setAiConstraints(constraintsMap)
          console.log('AI Constraints loaded:', constraintsMap)
          // Keep constraints available for potential future use
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          void aiConstraints
        }

        // Fetch recent activity
        await recentActivity()

        setIsLoading(false)
      } catch (error) {
        console.error('Error in dashboard init:', error)
        setIsLoading(false)
      }
    }

    init()
  }, [])

    const getUserInitials = (fullName: string) => {
    const names = fullName.trim().split(' ')
    if (names.length === 0) return 'H'
    
    const firstName = names[0]
    const lastName = names[names.length - 1]
    
    const firstInitial = firstName.charAt(0).toUpperCase()
    const lastInitial = lastName.charAt(0).toUpperCase()
    
    return `${firstInitial}${lastInitial}`
  }

  const formatRelativeTime = (timestamp: string) => {
    return dayjs(timestamp).fromNow()
  }
  const recentActivity = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data, error } = await supabase
      .from("activity_log")
      .select("*")
      .eq("host_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Failed to fetch activity", error.message)
    } else {
      setActivity(data)
    }
  }

  const [showDeadlineModal, setShowDeadlineModal] = useState(false)
  const [showAIModal, setShowAIModal] = useState(false)
  const [showDonationModal, setShowDonationModal] = useState(false)
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false)
  type Team = {
    id: string
    name: string
    host_id: string;
    department: string
    workers_per_shift: number
    created_at: string
    updated_at: string
    status: "active" | "pending" | string
    availability_deadline?: string
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [deadlineDate, setDeadlineDate] = useState("")
  const [showAddMemberModal, setShowAddMemberModal] = useState(false)
  const [showSetAvailabilityModal, setShowSetAvailabilityModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [newMember, setNewMember] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "",
    teamId: "",
  })
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [availabilityForm, setAvailabilityForm] = useState({
    selectedTeam: "",
    selectedMonth: "",
    availability: {} as Record<string, Record<string, string>>
  })
  const [isSavingAvailability, setIsSavingAvailability] = useState(false)
  const [exportForm, setExportForm] = useState({
    selectedTeam: "",
    selectedMonth: "",
    format: "pdf"
  })
  const [isExporting, setIsExporting] = useState(false)
  const [isDeletingTeam, setIsDeletingTeam] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState("overview")

  // Helper functions for availability
  const generateCalendarDays = (month: string) => {
    const [year, monthNum] = month.split("-").map(Number)
    const daysInMonth = new Date(year, monthNum, 0).getDate()
    const days = []
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day)
    }
    return days
  }

  const getAvailabilityStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-100 text-green-800 border-green-200"
      case "priority":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "unavailable":
        return "bg-red-100 text-red-800 border-red-200"
      default:
        return "bg-gray-100 text-gray-600 border-gray-200"
    }
  }

  const getAvailabilityStatusIcon = (status: string) => {
    switch (status) {
      case "available":
        return <Check className="h-4 w-4" />
      case "priority":
        return <Star className="h-4 w-4" />
      case "unavailable":
        return <X className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const toggleAvailability = (dateKey: string, shiftId: string) => {
    const currentStatus = availabilityForm.availability[dateKey]?.[shiftId] || "unset"
    const nextStatus = currentStatus === "unset" ? "available" : 
                      currentStatus === "available" ? "priority" : 
                      currentStatus === "priority" ? "unavailable" : "unset"
    
    setAvailabilityForm(prev => ({
      ...prev,
      availability: {
        ...prev.availability,
        [dateKey]: {
          ...prev.availability[dateKey],
          [shiftId]: nextStatus
        }
      }
    }))
  }

  const saveAvailability = async () => {
    if (!availabilityForm.selectedTeam || !availabilityForm.selectedMonth) return

    setIsSavingAvailability(true)
    
    try {
      // Get current user (host)
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error("Failed to get current user")
      }

      // Get shifts for the selected team
      const { data: shifts, error: shiftsError } = await supabase
        .from('shifts')
        .select('id')
        .eq('team_id', availabilityForm.selectedTeam)

      if (shiftsError) {
        throw new Error(`Failed to get shifts: ${shiftsError.message}`)
      }

      // Prepare availability data
      const availabilityData = []
      const calendarDays = generateCalendarDays(availabilityForm.selectedMonth)

      for (const day of calendarDays) {
        const dateKey = `${availabilityForm.selectedMonth}-${day.toString().padStart(2, '0')}`
        const dayAvailability = availabilityForm.availability[dateKey] || {}

        for (const shift of shifts || []) {
          const status = dayAvailability[shift.id] || "unset"
          if (status !== "unset") {
            availabilityData.push({
              user_id: user.id,
              team_id: availabilityForm.selectedTeam,
              shift_id: shift.id,
              date: dateKey,
              status: status
            })
          }
        }
      }

      // Use upsert to handle both insert and update cases
      if (availabilityData.length > 0) {
        const { error: upsertError } = await supabase
          .from('availability')
          .upsert(availabilityData, {
            onConflict: 'user_id,team_id,shift_id,date'
          })

        if (upsertError) {
          throw new Error(`Failed to save availability: ${upsertError.message}`)
        }
      }

      // Log activity
      await supabase.from('activity_log').insert([{
        host_id: user.id,
        actor_id: user.id,
        team_id: availabilityForm.selectedTeam,
        action: `Updated availability for ${new Date(availabilityForm.selectedMonth + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
        type: 'availability'
      }])

      setShowSetAvailabilityModal(false)
      setAvailabilityForm({ selectedTeam: "", selectedMonth: "", availability: {} })
      
      alert("Availability saved successfully!")
      
    } catch (error) {
      console.error('Error saving availability:', error)
      alert(`Failed to save availability: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSavingAvailability(false)
    }
  }

  const exportSchedule = async () => {
    if (!exportForm.selectedTeam || !exportForm.selectedMonth) return

    setIsExporting(true)
    
    try {
      const [month, year] = exportForm.selectedMonth.split("-").map(Number)
      const team = teams.find(t => t.id === exportForm.selectedTeam)
      
      if (!team) {
        throw new Error("Team not found")
      }

      // Navigate to the schedule page with export parameters
      const scheduleUrl = `/schedule/host/${exportForm.selectedTeam}?export=true&format=${exportForm.format}&month=${month}&year=${year}`
      
      // Open in new tab for download
      window.open(scheduleUrl, '_blank')
      
      // Log activity
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('activity_log').insert([{
          host_id: user.id,
          actor_id: user.id,
          team_id: exportForm.selectedTeam,
          action: `Exported schedule for ${new Date(year, month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })} as ${exportForm.format.toUpperCase()}`,
          type: 'export'
        }])
      }

      setShowExportModal(false)
      setExportForm({ selectedTeam: "", selectedMonth: "", format: "pdf" })
      
      alert(`Schedule exported successfully as ${exportForm.format.toUpperCase()}!`)
      
    } catch (error) {
      console.error('Error exporting schedule:', error)
      alert(`Failed to export schedule: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsExporting(false)
    }
  }

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    if (!confirm(`Are you sure you want to delete the team "${teamName}"? This will permanently delete the team and all associated data including members, shifts, schedules, and availability. This action cannot be undone.`)) {
      return
    }

    setIsDeletingTeam(teamId)
    try {
      const response = await fetch(`/api/teams/${teamId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete team')
      }

      // Remove team from local state
      setTeams(teams.filter(team => team.id !== teamId))
      
      // Update total members count (we'll recalculate on next load, but for now just remove)
      // The count will be recalculated when the page refreshes or teams are refetched
      
      alert(`Team "${teamName}" has been deleted successfully`)
    } catch (error) {
      console.error('Error deleting team:', error)
      alert(`Failed to delete team: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsDeletingTeam(null)
    }
  }

  // Show loading state while checking authentication
  if (isLoading) {
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
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Calendar className="h-8 w-8 text-blue-600" />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">AISchedulator</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowFeedbackDialog(true)}
                className="text-base font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1.5"
              >
                Send Feedback <Mail className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowDonationModal(true)}
                className="text-base font-medium text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:hover:bg-pink-900/20 flex items-center gap-1.5"
              >
                Support a project <Heart className="h-4 w-4 fill-red-500 text-red-500" />
              </Button>
              <Button variant="ghost" size="sm">
                <Bell className="h-4 w-4" />
              </Button>

              {/* Avatar Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium hover:bg-blue-700"
                  >
                    {userName ? getUserInitials(userName) : 'H'}
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

      <div className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Welcome back, {userName || "Doctor"}
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
          Manage your teams and schedules efficiently
        </p>
        </div>

        {/* Trial Status Indicator */}
        {isAuthenticated && currentUserId && (
          <TrialStatusIndicator userId={currentUserId} />
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Teams</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
        <CardContent>
        <div className="text-2xl font-bold">{teams.length}</div>
      </CardContent>
    </Card>


          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalMembers}</div>
              <p className="text-xs text-muted-foreground">Across all teams</p>
            </CardContent>
          </Card>

          {/* <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">AI Generations</CardTitle>
              <Brain className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0/1</div>
              <p className="text-xs text-muted-foreground">Free tier remaining</p>
            </CardContent>
          </Card> */}

          {/* Deadline feature hidden for now */}
          {/* <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Next Deadline</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {teams.length > 0 && teams[0]?.availability_deadline 
                  ? new Date(teams[0].availability_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : 'Not Set'
                }
              </div>
              <p className="text-xs text-muted-foreground">
                {teams.length > 0 ? teams[0]?.department || 'Team' : 'No teams'}
              </p>
            </CardContent>
          </Card> */}
        </div>

        {/* Dashboard Tabs */}
        <div className="mb-8">
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
                Overview
              </button>
              <button
                onClick={() => setActiveTab("participants")}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === "participants"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Team Members
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Teams Section */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Your Teams</h2>
                <Link href="/teams/create">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Team
                  </Button>
                </Link>
              </div>

              <div className="space-y-4">
                 {teams.map((team) => (
                   <Card key={team.id} className="hover:shadow-md transition-shadow">
                   <CardHeader>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                           <div className="flex-1">
                             <CardTitle className="text-lg">{team.name}</CardTitle>
                             <CardDescription>
                             Created: {new Date(team.created_at).toLocaleDateString()}
                          </CardDescription>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTeam(team.id, team.name)}
                          disabled={isDeletingTeam === team.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Delete team"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                       </CardHeader>
                       <CardContent>
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-3">
                            <Link href={`/teams/${team.id}/manage`}>
                                <Button variant="outline" size="sm" className="flex-1 min-w-[100px]">
                                    Manage
                                </Button>
                            </Link>

                            {/* Deadline feature hidden for now */}
                            {/* <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setSelectedTeam(team)
                                    setShowDeadlineModal(true)
                                }}
                                className="flex-1 min-w-[120px]"
                            >
                                <Calendar className="h-4 w-4 mr-1" />
                                <span className="hidden sm:inline">Set Deadline</span>
                                <span className="sm:hidden">Deadline</span>
                            </Button> */}

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    window.location.href = `/schedule/host/${team.id}`
                                }}
                                className="flex-1 min-w-[120px]"
                            >
                                View Schedule
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    window.location.href = `/teams/${team.id}/availability`
                                }}
                                className="flex-1 min-w-[140px]"
                            >
                                View Team&apos;s Availability
                            </Button>
                        </div>
                        
                        <GenerateScheduleForm teamId={team.id} teamName={team.name} />
                    </div>
              </CardContent>
              </Card>
                ))}
            </div>

            </div>

            {/* Recent Activity - Mobile Responsive */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Recent Activity</h2>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Latest Updates</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                          {activity.slice(0, 5).map((item) => (
                            <div key={item.id} className="flex items-start space-x-3">
                            <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                            <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900 dark:text-white break-words">{item.action}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{formatRelativeTime(item.created_at)}
                           </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
        )}

        {activeTab === "participants" && <ParticipantList isHost={true} />}
      </div>
      {/* Deadline Modal */}
      {showDeadlineModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Set Availability Deadline</CardTitle>
              <CardDescription>
                Set when team members must submit their availability for {selectedTeam?.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="deadlineDate">Deadline Date</Label>
                <Input
                  id="deadlineDate"
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  className="flex-1 bg-transparent"
                  onClick={() => {
                    setShowDeadlineModal(false)
                    setDeadlineDate("")
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={async () => {
                    if (!selectedTeam || !deadlineDate) return
                    
                    try {
                      const { error } = await supabase
                        .from('teams')
                        .update({ availability_deadline: deadlineDate })
                        .eq('id', selectedTeam.id)
                      
                      if (error) {
                        console.error('Error setting deadline:', error)
                        alert('Failed to set deadline. Please try again.')
                        return
                      }
                      
                      // Update local state
                      setTeams(teams.map(team => 
                        team.id === selectedTeam.id 
                          ? { ...team, availability_deadline: deadlineDate }
                          : team
                      ))
                      
                      setShowDeadlineModal(false)
                      setDeadlineDate("")
                      alert(`Deadline set for ${selectedTeam.department}!`)
                    } catch (error) {
                      console.error('Error setting deadline:', error)
                      alert('Failed to set deadline. Please try again.')
                    }
                  }}
                >
                  Set Deadline
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* AI Generation Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Brain className="h-5 w-5 text-purple-600" />
                <span>AI Schedule Generated!</span>
              </CardTitle>
              <CardDescription>Successfully generated optimal schedule for {selectedTeam?.name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
                <p className="text-sm text-gray-600">
                  The AI has analyzed team availability and generated an optimal schedule considering all constraints.
                </p>
              </div>
              <div className="flex space-x-2">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowAIModal(false)}>
                  View Schedule
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    setShowAIModal(false)
                    alert("Schedule saved successfully!")
                  }}
                >
                  Save & Notify Team
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Add Team Member</CardTitle>
              <CardDescription>Invite a new member to join one of your teams</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="memberEmail">Email Address</Label>
                <Input
                  id="memberEmail"
                  type="email"
                  placeholder="doctor@hospital.com"
                  value={newMember.email}
                  onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    value={newMember.firstName}
                    onChange={(e) => setNewMember({ ...newMember, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    value={newMember.lastName}
                    onChange={(e) => setNewMember({ ...newMember, lastName: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="roleSelect">Role</Label>
                <Select
                  value={newMember.role}
                  onValueChange={(value) => setNewMember({ ...newMember, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Doctor">Doctor</SelectItem>
                    <SelectItem value="Nurse">Nurse</SelectItem>
                    <SelectItem value="Resident">Resident</SelectItem>
                    <SelectItem value="Technician">Technician</SelectItem>
                    <SelectItem value="Administrator">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="teamSelect">Select Team</Label>
                <Select
                  value={newMember.teamId}
                  onValueChange={(value) => setNewMember({ ...newMember, teamId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.department || team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  className="flex-1 bg-transparent"
                  onClick={() => {
                    setShowAddMemberModal(false)
                    setNewMember({ email: "", firstName: "", lastName: "", role: "", teamId: "" })
                  }}
                  disabled={isAddingMember}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={async () => {
                    // Validate required fields
                    if (!newMember.email || !newMember.firstName || !newMember.lastName || !newMember.role || !newMember.teamId) {
                      alert("Please fill in all required fields")
                      return
                    }

                    setIsAddingMember(true)
                    
                    try {
                      // Get current user (host)
                      const { data: { user }, error: userError } = await supabase.auth.getUser()
                      if (userError || !user) {
                        throw new Error("Failed to get current user")
                      }

                      // Check if user already exists
                      const { data: existingUser } = await supabase
                        .from('users')
                        .select('id')
                        .eq('email', newMember.email)
                        .single()

                      let userId: string

                      if (existingUser) {
                        // User exists, use their ID
                        userId = existingUser.id
                      } else {
                        // Create new user
                        const { data: newUser, error: createError } = await supabase
                          .from('users')
                          .insert([{
                            email: newMember.email,
                            first_name: newMember.firstName,
                            last_name: newMember.lastName,
                            role: newMember.role,
                            account_type: 'participant',
                            department: teams.find(t => t.id === newMember.teamId)?.department || ''
                          }])
                          .select('id')
                          .single()

                        if (createError) {
                          throw new Error(`Failed to create user: ${createError.message}`)
                        }
                        userId = newUser.id
                      }

                      // Add user to team
                      const { error: teamMemberError } = await supabase
                        .from('team_members')
                        .insert([{
                          team_id: newMember.teamId,
                          user_id: userId
                        }])

                      if (teamMemberError) {
                        // If it's a duplicate error, that's okay
                        if (teamMemberError.code !== '23505') { // Unique constraint violation
                          throw new Error(`Failed to add user to team: ${teamMemberError.message}`)
                        }
                      }

                      // Log activity
                      await supabase.from('activity_log').insert([{
                        host_id: user.id,
                        actor_id: user.id,
                        team_id: newMember.teamId,
                        action: `Added ${newMember.firstName} ${newMember.lastName} to team`,
                        type: 'team'
                      }])

                      // Update local state
                      setTotalMembers(prev => prev + 1)

                      setShowAddMemberModal(false)
                      setNewMember({ email: "", firstName: "", lastName: "", role: "", teamId: "" })
                      
                      alert(`Successfully added ${newMember.firstName} ${newMember.lastName} to the team!`)
                      
                    } catch (error) {
                      console.error('Error adding team member:', error)
                      alert(`Failed to add team member: ${error instanceof Error ? error.message : 'Unknown error'}`)
                    } finally {
                      setIsAddingMember(false)
                    }
                  }}
                  disabled={isAddingMember}
                >
                  {isAddingMember ? "Adding..." : "Add Member"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Set Availability Modal */}
      {showSetAvailabilityModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Set Your Availability</CardTitle>
              <CardDescription>
                Mark your availability for shifts in your teams
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Team and Month Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="availabilityTeam">Select Team</Label>
                  <Select
                    value={availabilityForm.selectedTeam}
                    onValueChange={(value) => setAvailabilityForm(prev => ({ ...prev, selectedTeam: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a team" />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.department || team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="availabilityMonth">Select Month</Label>
                  <Select
                    value={availabilityForm.selectedMonth}
                    onValueChange={(value) => setAvailabilityForm(prev => ({ ...prev, selectedMonth: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose month" />
                    </SelectTrigger>
                    <SelectContent>
                      {generateMonthOptions().map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Availability Calendar */}
              {availabilityForm.selectedTeam && availabilityForm.selectedMonth && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">
                      {new Date(availabilityForm.selectedMonth + "-01").toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                      })}
                    </h3>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Clear all availability for this month
                          const calendarDays = generateCalendarDays(availabilityForm.selectedMonth)
                          const newAvailability = { ...availabilityForm.availability }
                          calendarDays.forEach(day => {
                            const dateKey = `${availabilityForm.selectedMonth}-${day.toString().padStart(2, '0')}`
                            newAvailability[dateKey] = {}
                          })
                          setAvailabilityForm(prev => ({ ...prev, availability: newAvailability }))
                        }}
                      >
                        Clear All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Set all as available
                          const calendarDays = generateCalendarDays(availabilityForm.selectedMonth)
                          const newAvailability = { ...availabilityForm.availability }
                          calendarDays.forEach(day => {
                            const dateKey = `${availabilityForm.selectedMonth}-${day.toString().padStart(2, '0')}`
                            newAvailability[dateKey] = { "1": "available", "2": "available" }
                          })
                          setAvailabilityForm(prev => ({ ...prev, availability: newAvailability }))
                        }}
                      >
                        Set All Available
                      </Button>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className="border p-2 bg-gray-50 dark:bg-gray-800 text-left font-medium sticky left-0 z-10">
                            Date
                          </th>
                          <th className="border p-2 bg-gray-50 dark:bg-gray-800 text-center">Day Shift</th>
                          <th className="border p-2 bg-gray-50 dark:bg-gray-800 text-center">Night Shift</th>
                        </tr>
                      </thead>
                      <tbody>
                        {generateCalendarDays(availabilityForm.selectedMonth).map((day) => {
                          const dateKey = `${availabilityForm.selectedMonth}-${day.toString().padStart(2, '0')}`
                          const dayAvailability = availabilityForm.availability[dateKey] || {}
                          
                          return (
                            <tr key={day}>
                              <td className="border p-2 font-medium bg-gray-50 dark:bg-gray-800 sticky left-0 z-10">
                                <div className="flex flex-col">
                                  <span className="font-bold">{day}</span>
                                  <span className="text-xs text-gray-500">
                                    {new Date(dateKey).toLocaleDateString("en-US", { weekday: "short" })}
                                  </span>
                                </div>
                              </td>
                              <td className="border p-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={`w-full h-12 ${getAvailabilityStatusColor(dayAvailability["1"] || "unset")}`}
                                  onClick={() => toggleAvailability(dateKey, "1")}
                                >
                                  {getAvailabilityStatusIcon(dayAvailability["1"] || "unset")}
                                </Button>
                              </td>
                              <td className="border p-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={`w-full h-12 ${getAvailabilityStatusColor(dayAvailability["2"] || "unset")}`}
                                  onClick={() => toggleAvailability(dateKey, "2")}
                                >
                                  {getAvailabilityStatusIcon(dayAvailability["2"] || "unset")}
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowSetAvailabilityModal(false)
                    setAvailabilityForm({ selectedTeam: "", selectedMonth: "", availability: {} })
                  }}
                  disabled={isSavingAvailability}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={saveAvailability}
                  disabled={!availabilityForm.selectedTeam || !availabilityForm.selectedMonth || isSavingAvailability}
                >
                  {isSavingAvailability ? "Saving..." : "Save Availability"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileDown className="h-5 w-5 text-blue-600" />
                <span>Export Schedule</span>
              </CardTitle>
              <CardDescription>Export your team schedule in PDF or Excel format</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Team Selection */}
              <div className="space-y-2">
                <Label htmlFor="exportTeam">Select Team</Label>
                <Select
                  value={exportForm.selectedTeam}
                  onValueChange={(value) => setExportForm(prev => ({ ...prev, selectedTeam: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.filter(team => 
                      availableSchedules.some(schedule => schedule.teamId === team.id)
                    ).map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.department || team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Month Selection */}
              {exportForm.selectedTeam && (
                <div className="space-y-2">
                  <Label htmlFor="exportMonth">Select Month</Label>
                  <Select
                    value={exportForm.selectedMonth}
                    onValueChange={(value) => setExportForm(prev => ({ ...prev, selectedMonth: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose month" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSchedules
                        .filter(schedule => schedule.teamId === exportForm.selectedTeam)
                        .map((schedule) => {
                          const monthName = new Date(schedule.year, schedule.month - 1).toLocaleDateString("en-US", {
                            month: "long",
                            year: "numeric"
                          })
                          return (
                            <SelectItem key={`${schedule.month}-${schedule.year}`} value={`${schedule.month}-${schedule.year}`}>
                              {monthName}
                            </SelectItem>
                          )
                        })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Format Selection */}
              {exportForm.selectedTeam && exportForm.selectedMonth && (
                <div className="space-y-2">
                  <Label htmlFor="exportFormat">Export Format</Label>
                  <Select
                    value={exportForm.format}
                    onValueChange={(value) => setExportForm(prev => ({ ...prev, format: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF Document</SelectItem>
                      <SelectItem value="excel">Excel Spreadsheet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowExportModal(false)
                    setExportForm({ selectedTeam: "", selectedMonth: "", format: "pdf" })
                  }}
                  disabled={isExporting}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={exportSchedule}
                  disabled={!exportForm.selectedTeam || !exportForm.selectedMonth || isExporting}
                >
                  {isExporting ? "Exporting..." : "Export Schedule"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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

      {/* Feedback Dialog */}
      <FeedbackDialog 
        open={showFeedbackDialog} 
        onOpenChange={setShowFeedbackDialog} 
      />
    </div>
  )
}
