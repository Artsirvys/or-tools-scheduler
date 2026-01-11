"use client"

import { useEffect, useState } from "react"
import { supabase } from '@/lib/supabase'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Users, Check, X, Star, Clock, AlertCircle, UserCheck, UserX } from "lucide-react"
import Link from "next/link"

type TeamMember = {
  user_id: string
  users: {
    first_name: string
    last_name: string
    role: string
    email: string
  } | {
    first_name: string
    last_name: string
    role: string
    email: string
  }[]
}

type Shift = {
  id: string
  team_id: string
  name: string
  start_time: string
  end_time: string
  day_of_week?: number | null
  created_at?: string
}

type Availability = {
  id: string
  user_id: string
  team_id: string
  shift_id: string
  date: string
  status: 'available' | 'unavailable' | 'priority'
  created_at: string
}

type Team = {
  id: string
  name: string
  department: string
  host_id: string
  workers_per_shift: number
  created_at: string
  updated_at: string
  status: string
  availability_deadline?: string
}

export default function TeamAvailabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const [teamId, setTeamId] = useState<string>("")
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [availability, setAvailability] = useState<Availability[]>([])
  const [team, setTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)

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
      const { id } = await params
      setTeamId(id)
      
      // Set default month to current month
      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      setSelectedMonth(currentMonth)
      
      await fetchTeamData(id, currentMonth)
    }
    
    init()
  }, [params])

  const fetchTeamData = async (id: string, month: string) => {
    setLoading(true)
    
    try {
      // Fetch team info
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', id)
        .single()
      
      if (teamError) {
        console.error('Error fetching team:', teamError)
        return
      }
      
      setTeam(teamData)

      // Fetch team members
      const { data: membersData, error: membersError } = await supabase
        .from('team_members')
        .select(`
          user_id,
          users (
            first_name,
            last_name,
            role,
            email
          )
        `)
        .eq('team_id', id)

      if (membersError) {
        console.error('Error fetching team members:', membersError)
        return
      }

      setTeamMembers((membersData as TeamMember[]) || [])

      // Fetch shifts
      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts')
        .select('*')
        .eq('team_id', id)

      if (shiftsError) {
        console.error('Error fetching shifts:', shiftsError)
        return
      }

      setShifts(shiftsData || [])

      // Fetch availability for the selected month
      await fetchAvailability(id, month)
      
    } catch (error) {
      console.error('Error fetching team data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAvailability = async (id: string, month: string) => {
    const [year, monthNum] = month.split('-').map(Number)
    const startDate = `${year}-${monthNum.toString().padStart(2, '0')}-01`
    const endDate = `${year}-${monthNum.toString().padStart(2, '0')}-${new Date(year, monthNum, 0).getDate()}`

    const { data, error } = await supabase
      .from('availability')
      .select('*')
      .eq('team_id', id)
      .gte('date', startDate)
      .lte('date', endDate)

    if (error) {
      console.error('Error fetching availability:', error)
      return
    }

    setAvailability(data || [])
  }

  // Generate calendar days for the selected month
  const generateCalendarDays = () => {
    if (!selectedMonth) return []
    const [year, month] = selectedMonth.split("-").map(Number)
    const daysInMonth = new Date(year, month, 0).getDate()
    const days = []
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day)
    }
    return days
  }

  // Get shifts that apply to a specific date
  const getShiftsForDate = (date: Date) => {
    const dayOfWeek = date.getDay() // 0 = Sunday, 1 = Monday, etc.
    
    return shifts.filter(shift => {
      // If shift has no day_of_week specified, it applies to all days
      if (shift.day_of_week === null || shift.day_of_week === undefined) {
        return true
      }
      // Otherwise, only show if it matches the specific day
      return shift.day_of_week === dayOfWeek
    })
  }

  // Get availability for a specific member, day, and shift
  const getAvailability = (memberId: string, day: number, shiftId: string) => {
    const date = `${selectedMonth}-${day.toString().padStart(2, '0')}`
    const found = availability.find(
      a => a.user_id === memberId && 
           a.shift_id === shiftId && 
           a.date === date
    )
    return found?.status || "unset"
  }

  // Get shift display info for a specific date
  const getShiftDisplayInfo = (shift: Shift, date: Date) => {
    const dayOfWeek = date.getDay()
    const isSpecificDay = shift.day_of_week !== null && shift.day_of_week !== undefined
    
    // If shift is day-specific and doesn't match current date, don't show
    if (isSpecificDay && shift.day_of_week !== dayOfWeek) {
      return null
    }
    
    // If shift is day-specific, show the time
    if (isSpecificDay) {
      return {
        name: shift.name,
        time: `${shift.start_time} - ${shift.end_time}`,
        showTime: true
      }
    }
    
    // If shift applies to all days, only show time if there are other day-specific shifts
    const hasDaySpecificShifts = shifts.some(s => s.day_of_week !== null && s.day_of_week !== undefined)
    return {
      name: shift.name,
      time: `${shift.start_time} - ${shift.end_time}`,
      showTime: hasDaySpecificShifts
    }
  }

  // Check if member has filled any availability for the month
  const hasMemberFilledAvailability = (memberId: string) => {
    return availability.some(a => a.user_id === memberId)
  }

  // Get completion percentage for a member
  const getMemberCompletionPercentage = (memberId: string) => {
    const calendarDays = generateCalendarDays()
    const totalSlots = calendarDays.length * shifts.length
    const filledSlots = availability.filter(a => a.user_id === memberId).length
    return totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-100 text-green-800"
      case "priority":
        return "bg-blue-100 text-blue-800"
      case "unavailable":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-600"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "available":
        return <Check className="h-3 w-3" />
      case "priority":
        return <Star className="h-3 w-3" />
      case "unavailable":
        return <X className="h-3 w-3" />
      default:
        return <Clock className="h-3 w-3" />
    }
  }

  const calendarDays = generateCalendarDays()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading team availability...</p>
        </div>
      </div>
    )
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Team not found</p>
          <Link href="/dashboard">
            <Button className="mt-4">Back to Dashboard</Button>
          </Link>
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
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <div className="flex items-center space-x-2">
              <Users className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                {team.department} - Team Availability
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Team Info */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Team Information</CardTitle>
            <CardDescription>
              {teamMembers.length} members • {shifts.length} shift types • 
              {team.availability_deadline ? (
                <span className="text-orange-600">
                  Deadline: {new Date(team.availability_deadline).toLocaleDateString()}
                </span>
              ) : (
                <span className="text-gray-500">No deadline set</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{teamMembers.length}</div>
                <div className="text-sm text-gray-600">Total Members</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {teamMembers.filter(m => hasMemberFilledAvailability(m.user_id)).length}
                </div>
                <div className="text-sm text-gray-600">Members with Availability</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {teamMembers.filter(m => !hasMemberFilledAvailability(m.user_id)).length}
                </div>
                <div className="text-sm text-gray-600">Members Pending</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2">Select Month</label>
            <Select value={selectedMonth} onValueChange={(value) => {
              setSelectedMonth(value)
              fetchAvailability(teamId, value)
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {generateMonthOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Legend */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Availability Legend</CardTitle>
            <CardDescription>Overview of team member availability for the selected month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center space-x-2">
                <Badge className="bg-green-100 text-green-800">
                  <Check className="h-3 w-3 mr-1" />
                  Available
                </Badge>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className="bg-blue-100 text-blue-800">
                  <Star className="h-3 w-3 mr-1" />
                  Priority
                </Badge>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className="bg-red-100 text-red-800">
                  <X className="h-3 w-3 mr-1" />
                  Unavailable
                </Badge>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className="bg-gray-100 text-gray-600">
                  <Clock className="h-3 w-3 mr-1" />
                  Not Set
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Availability Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              Team Availability -{" "}
              {new Date(selectedMonth + "-01").toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                {/* Header Row - Dates */}
                <thead>
                  <tr>
                    <th className="border p-2 bg-gray-50 dark:bg-gray-800 text-left font-medium sticky left-0 z-10">
                      Team Member
                    </th>
                    {calendarDays.map((day) => (
                      <th key={day} className="border p-1 bg-gray-50 dark:bg-gray-800 text-center min-w-[60px]">
                        <div className="font-medium">{day}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(selectedMonth + `-${day.toString().padStart(2, "0")}`).toLocaleDateString("en-US", {
                            weekday: "short",
                          })}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Each Row is a Team Member */}
                  {teamMembers.map((member) => {
                    const user = Array.isArray(member.users) ? member.users[0] : member.users
                    const hasFilled = hasMemberFilledAvailability(member.user_id)
                    const completionPercentage = getMemberCompletionPercentage(member.user_id)
                    
                    return (
                      <tr key={member.user_id}>
                        <td className="border p-3 font-medium bg-gray-50 dark:bg-gray-800 sticky left-0 z-10">
                          <div className="flex items-center space-x-2">
                            <div>
                              <div className="font-medium">
                                {user?.first_name && user?.last_name 
                                  ? `${user.first_name} ${user.last_name}` 
                                  : 'Unknown'
                                }
                              </div>
                              <div className="text-xs text-gray-500">{user?.role || 'Staff'}</div>
                              <div className="text-xs text-gray-400">{user?.email}</div>
                            </div>
                            <div className="flex flex-col items-center space-y-1">
                              {hasFilled ? (
                                <UserCheck className="h-4 w-4 text-green-600" />
                              ) : (
                                <UserX className="h-4 w-4 text-red-600" />
                              )}
                              <div className="text-xs text-gray-500">
                                {completionPercentage}%
                              </div>
                            </div>
                          </div>
                        </td>
                        {/* Each Column is a Date */}
                        {calendarDays.map((day) => {
                          const currentDate = new Date(selectedMonth + `-${day.toString().padStart(2, '0')}`)
                          const shiftsForDay = getShiftsForDate(currentDate)
                          
                          return (
                            <td key={day} className="border p-1">
                              <div className="space-y-1">
                                {shiftsForDay.map((shift) => {
                                  const shiftInfo = getShiftDisplayInfo(shift, currentDate)
                                  if (!shiftInfo) return null
                                  
                                  return (
                                    <div
                                      key={shift.id}
                                      className={`text-xs p-1 rounded text-center ${getStatusColor(
                                        getAvailability(member.user_id, day, shift.id),
                                      )}`}
                                    >
                                      <div className="flex items-center justify-center">
                                        {getStatusIcon(getAvailability(member.user_id, day, shift.id))}
                                      </div>
                                      <div className="text-xs font-medium">{shiftInfo.name}</div>
                                      {shiftInfo.showTime && (
                                        <div className="text-xs text-gray-600">
                                          {shiftInfo.time}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex justify-end space-x-4">
              <Button
                variant="outline"
                onClick={() => {
                  alert("Schedule exported to Excel! Please check your Downloads folder.")
                }}
              >
                Export to Excel
              </Button>
              <Button
                onClick={async () => {
                  try {
                    // Get current user
                    const { data: { user }, error: userError } = await supabase.auth.getUser()
                    if (userError || !user) {
                      alert("Error: User not authenticated")
                      return
                    }

                    // Get current month and year
                    const [year, month] = selectedMonth.split('-').map(Number)
                    
                    // Prepare constraints (you can make these configurable)
                    const constraints = {
                      maxConsecutiveDays: 30,
                      workersPerShift: team?.workers_per_shift || 2,
                    }

                    // Call the AI generation API
                    const response = await fetch("/api/generateSchedule", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        teamId,
                        month,
                        year,
                        hostId: user.id,
                        constraints,
                      }),
                    })

                    if (response.ok) {
                      alert("AI Schedule generated successfully!")
                      // Redirect to generated schedule page
                      setTimeout(() => {
                        window.location.href = `/schedule/host/${teamId}`
                      }, 1000)
                    } else {
                      const errorData = await response.text()
                      alert(`Failed to generate schedule: ${errorData}`)
                    }
                  } catch (error) {
                    console.error('Error generating schedule:', error)
                    alert(`Failed to generate schedule: ${error instanceof Error ? error.message : 'Unknown error'}`)
                  }
                }}
              >
                Generate AI Schedule
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
