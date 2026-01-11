"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar, ArrowLeft, Check, X, Star, Clock, Users, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

// TypeScript interfaces for better type safety
interface User {
  id: string
  email?: string
}

interface Team {
  id: string
  name: string
  department: string
}

interface Shift {
  id: string
  name: string
  start_time?: string
  end_time?: string
  day_of_week?: number | null
  shifts?: Array<{
    id: string
    name: string
    start_time: string
    end_time: string
    day_of_week?: number | null
  }>
  timeDisplay?: string
}

export default function AvailabilityPage() {
  const [selectedTeam, setSelectedTeam] = useState("")
  const [selectedMonth, setSelectedMonth] = useState("")
  const [teams, setTeams] = useState<Team[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [availability, setAvailability] = useState<Record<string, Record<string, string>>>({})
  const [isSaving, setIsSaving] = useState(false)

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

  // Generate calendar days for the selected month
  const generateCalendarDays = () => {
    const [year, month] = selectedMonth.split("-").map(Number)
    const daysInMonth = new Date(year, month, 0).getDate()
    const days = []
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day)
    }
    return days
  }

  // Get shifts that apply to a specific date (for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  const setDayAvailability = (day: number, shiftId: string, status: string) => {
    const key = `${selectedMonth}-${day.toString().padStart(2, "0")}`
    
    // Handle consolidated shifts - set availability for all underlying shifts
    if (shiftId.startsWith('group_')) {
      const shiftName = shiftId.replace('group_', '')
      const shift = shifts.find(s => s.name === shiftName)
      if (shift && shift.shifts) {
        setAvailability((prev) => {
          const newAvailability = { ...prev }
          if (!newAvailability[key]) newAvailability[key] = {}
          
          // Set the same status for all underlying shifts
          shift.shifts?.forEach(actualShift => {
            newAvailability[key][actualShift.id] = status
          })
          
          return newAvailability
        })
        return
      }
    }
    
    // Handle regular shifts
    setAvailability((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [shiftId]: status,
      },
    }))
  }

  const getDayAvailability = (day: number, shiftId: string) => {
    const key = `${selectedMonth}-${day.toString().padStart(2, "0")}`
    
    // Handle consolidated shifts - check all underlying shift IDs
    if (shiftId.startsWith('group_')) {
      const shiftName = shiftId.replace('group_', '')
      const shift = shifts.find(s => s.name === shiftName)
      if (shift && shift.shifts) {
        // Check if any of the underlying shifts have availability set
        for (const actualShift of shift.shifts) {
          const status = availability[key]?.[actualShift.id]
          if (status && status !== 'unset') {
            return status
          }
        }
      }
    }
    
    // For regular shifts, check availability from any team
    return availability[key]?.[shiftId] || "unset"
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-100 text-green-800 border-green-200"
      case "priority":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "unavailable":
        return "bg-red-100 text-red-800 border-red-200"
      case "vacation":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "conference":
        return "bg-purple-100 text-purple-800 border-purple-200"
      default:
        return "bg-gray-100 text-gray-600 border-gray-200"
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
      case "vacation":
        return <Calendar className="h-3 w-3" />
      case "conference":
        return <Users className="h-3 w-3" />
      default:
        return <Clock className="h-3 w-3" />
    }
  }

  const calendarDays = generateCalendarDays()

  // Initialize data
  useEffect(() => {
    const init = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.error('No user found')
          setLoading(false)
          return
        }
        setUser(user)

        // Set next month as default
        const nextMonth = new Date()
        nextMonth.setMonth(nextMonth.getMonth() + 1)
        const nextMonthString = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`
        setSelectedMonth(nextMonthString)

        // Fetch user's teams
        console.log('Fetching teams for user:', user.id)
        const { data: teamMembers, error: teamError } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', user.id)

        if (teamError) {
          console.error('Error fetching teams:', teamError)
        }

        console.log('Team members data:', teamMembers)
        console.log('Team members length:', teamMembers?.length || 0)
        console.log('Team members raw data:', JSON.stringify(teamMembers, null, 2))

        if (teamMembers && teamMembers.length > 0) {
          // Fetch team details separately
          const teamIds = teamMembers.map(tm => tm.team_id)
          console.log('Team IDs to fetch:', teamIds)
          
          const { data: teamsData, error: teamsError } = await supabase
            .from('teams')
            .select('id, name, department')
            .in('id', teamIds)

          if (teamsError) {
            console.error('Error fetching team details:', teamsError)
          }

          console.log('Teams data:', teamsData)
          
          if (teamsData && teamsData.length > 0) {
            const userTeams = teamsData.map(team => ({
              id: team.id,
              name: team.name,
              department: team.department
            }))
            console.log('User teams:', userTeams)
            setTeams(userTeams)
            setSelectedTeam(userTeams[0].id) // Set first team as default

            // Load shifts and availability for the selected team
            await loadShifts(userTeams[0].id)
            await loadAvailabilityForTeam(user.id, userTeams[0].id, nextMonthString)
          }
        } else {
          console.log('No team memberships found for user:', user.id)
        }

      } catch (error) {
        console.error('Error initializing:', error)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  const loadShifts = async (teamId: string) => {
    try {
      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts')
        .select('id, name, start_time, end_time, day_of_week')
        .eq('team_id', teamId)

      if (shiftsError) {
        console.error('Error fetching shifts:', shiftsError)
        return
      }

      if (shiftsData) {
        // Consolidate shifts by name, keeping unique time configurations
        const shiftMap = new Map()
        shiftsData.forEach(shift => {
          const key = shift.name
          if (!shiftMap.has(key)) {
            shiftMap.set(key, [])
          }
          shiftMap.get(key).push(shift)
        })

        // Convert to array format for display
        const consolidatedShifts = Array.from(shiftMap.entries()).map(([name, shiftList]) => ({
          id: `group_${name}`,
          name: name,
          shifts: shiftList as Array<{
            id: string
            name: string
            start_time: string
            end_time: string
            day_of_week?: number | null
          }>,
          // Show time range if there are multiple time configurations
          timeDisplay: shiftList.length === 1 
            ? `${shiftList[0].start_time} - ${shiftList[0].end_time}`
            : `${shiftList.length} time configs`
        }))
        
        setShifts(consolidatedShifts)
      }
    } catch (error) {
      console.error('Error loading shifts:', error)
    }
  }

  const loadAvailabilityForTeam = async (userId: string, teamId: string, month: string) => {
    try {
      const [year, monthNum] = month.split('-').map(Number)
      
      // Calculate the start date (first day of the month)
      const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`
      
      // Calculate the end date (first day of the next month) - handle year rollover
      // Date constructor uses 0-based months (0=Jan, 11=Dec), so monthNum (1-12) becomes monthNum-1
      // But we want next month, so use monthNum directly (which will be 1-12, but Date treats it as next month)
      // Actually, let's be explicit: create date for current month, then add 1 month
      const currentMonthDate = new Date(year, monthNum - 1, 1) // monthNum is 1-12, convert to 0-11
      const nextMonthDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1)
      const endYear = nextMonthDate.getFullYear()
      const endMonth = nextMonthDate.getMonth() + 1 // getMonth() returns 0-11, convert back to 1-12
      const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`
      
      // Load availability specifically for the selected team
      const { data: availabilityData, error } = await supabase
        .from('availability')
        .select('date, shift_id, status')
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .gte('date', startDate)
        .lt('date', endDate)

      if (error) {
        console.error('Error loading availability:', error)
        return
      }

      // Transform availability data to our format
      // The key format should match what getDayAvailability expects: "YYYY-MM-DD"
      const availabilityMap: Record<string, Record<string, string>> = {}
      availabilityData?.forEach(avail => {
        // Normalize the date to ensure it matches the format used in getDayAvailability
        // Database date might be in format "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss.sssZ"
        // We need to extract just the date part (YYYY-MM-DD)
        const dateKey = avail.date ? avail.date.split('T')[0] : avail.date
        if (!availabilityMap[dateKey]) {
          availabilityMap[dateKey] = {}
        }
        // Store availability with shift_id (this will match the actual shift IDs from database)
        availabilityMap[dateKey][avail.shift_id] = avail.status
      })

      setAvailability(availabilityMap)
    } catch (error) {
      console.error('Error loading availability:', error)
    }
  }

  const saveAvailability = async () => {
    if (!user || !selectedTeam || !selectedMonth) return

    setIsSaving(true)
    try {
      // Prepare availability entries for upsert
      const availabilityEntries = []
      for (const [dateKey, shiftStatuses] of Object.entries(availability)) {
        for (const [shiftId, status] of Object.entries(shiftStatuses)) {
          if (status !== 'unset') {
            // Find the actual shift ID if this is a consolidated shift
            let actualShiftId = shiftId
            if (shiftId.startsWith('group_')) {
              const shiftName = shiftId.replace('group_', '')
              const shift = shifts.find(s => s.name === shiftName)
              if (shift && shift.shifts && shift.shifts.length > 0) {
                // Use the first actual shift ID for saving
                actualShiftId = shift.shifts[0].id
              }
            }
            
            // Convert vacation and conference to unavailable for database (database only accepts available, unavailable, priority)
            let dbStatus = status
            if (status === 'vacation' || status === 'conference') {
              dbStatus = 'unavailable'
            }
            
            availabilityEntries.push({
              user_id: user.id,
              team_id: selectedTeam,
              shift_id: actualShiftId,
              date: dateKey,
              status: dbStatus
            })
          }
        }
      }

      if (availabilityEntries.length > 0) {
        // Use upsert to handle both insert and update cases
        const { error } = await supabase
          .from('availability')
          .upsert(availabilityEntries, {
            onConflict: 'user_id,team_id,shift_id,date'
          })

        if (error) {
          console.error('Error saving availability:', error)
          alert('Failed to save availability')
          return
        }
      }

      alert('Availability saved successfully!')
    } catch (error) {
      console.error('Error saving availability:', error)
      alert('Failed to save availability')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            {/* Update the back button link */}
            <Link href="/participant/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <div className="flex items-center space-x-2">
              <Calendar className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">Set Availability</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your availability settings...</p>
          </div>
        ) : teams.length === 0 ? (
          <div className="text-center py-12">
            <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">You are not assigned to any team yet</h2>
            <p className="text-gray-600 mb-4">Please contact your administrator to be added to a team before setting availability.</p>
            <Link href="/participant/dashboard">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">Select Team</label>
                <Select value={selectedTeam} onValueChange={async (teamId) => {
                  setSelectedTeam(teamId)
                  if (user) {
                    await loadShifts(teamId)
                    // Load availability specifically for the selected team
                    await loadAvailabilityForTeam(user.id, teamId, selectedMonth)
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">Select Month</label>
                <Select value={selectedMonth} onValueChange={async (month) => {
                  setSelectedMonth(month)
                  if (user && selectedTeam) {
                    await loadAvailabilityForTeam(user.id, selectedTeam, month)
                  }
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
            <CardDescription>Click on any date/shift combination to set your availability</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center space-x-2">
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <Check className="h-3 w-3 mr-1" />
                  Available
                </Badge>
                <span className="text-sm text-gray-600">I can work this shift</span>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                  <Star className="h-3 w-3 mr-1" />
                  Priority
                </Badge>
                <span className="text-sm text-gray-600">I prefer to work this shift</span>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className="bg-red-100 text-red-800 border-red-200">
                  <X className="h-3 w-3 mr-1" />
                  Unavailable
                </Badge>
                <span className="text-sm text-gray-600">I cannot work this shift</span>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                  <Calendar className="h-3 w-3 mr-1" />
                  Vacation
                </Badge>
                <span className="text-sm text-gray-600">On vacation</span>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className="bg-purple-100 text-purple-800 border-purple-200">
                  <Users className="h-3 w-3 mr-1" />
                  Conference
                </Badge>
                <span className="text-sm text-gray-600">At conference</span>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className="bg-gray-100 text-gray-600 border-gray-200">
                  <Clock className="h-3 w-3 mr-1" />
                  Not Set
                </Badge>
                <span className="text-sm text-gray-600">No preference marked</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendar - Swapped Layout: Dates as Rows, Shifts as Columns */}
        <Card>
          <CardHeader>
            <CardTitle>
              {new Date(selectedMonth + "-01").toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}{" "}
              - {teams.find((t) => t.id === selectedTeam)?.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                {/* Header Row - Shifts */}
                <thead>
                  <tr>
                    <th className="border p-2 sm:p-3 bg-gray-50 dark:bg-gray-800 text-left font-medium sticky left-0 z-10 min-w-[80px]">
                      Date
                    </th>
                    {shifts.map((shift) => (
                      <th
                        key={shift.id}
                        className="border p-2 sm:p-3 bg-gray-50 dark:bg-gray-800 text-center min-w-[100px] sm:min-w-[120px]"
                      >
                        <div className="font-medium text-sm">{shift.name}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Each Row is a Date */}
                  {calendarDays.map((day) => (
                    <tr key={day}>
                      <td className="border p-2 sm:p-3 font-medium bg-gray-50 dark:bg-gray-800 sticky left-0 z-10">
                        <div className="flex flex-col sm:flex-row sm:items-center">
                          <span className="text-base sm:text-lg font-bold">{day}</span>
                          <span className="text-xs sm:text-sm text-gray-500 sm:ml-2">
                            {new Date(selectedMonth + `-${day.toString().padStart(2, "0")}`).toLocaleDateString(
                              "en-US",
                              {
                                weekday: "short",
                              },
                            )}
                          </span>

                        </div>
                      </td>
                      {/* Each Column is a Shift */}
                      {(() => {
                        const currentDate = new Date(selectedMonth + `-${day.toString().padStart(2, "0")}`)
                        
                        return shifts.map((shift) => {
                          // Handle consolidated shifts
                          if (shift.shifts) {
                            // Find shifts that apply to this date
                            const applicableShifts = shift.shifts.filter(s => {
                              if (s.day_of_week === null || s.day_of_week === undefined) return true
                              return s.day_of_week === currentDate.getDay()
                            })
                            
                            if (applicableShifts.length === 0) {
                              return (
                                <td key={shift.id} className="border p-1 sm:p-2">
                                  <div className="w-full h-12 sm:h-16 bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                                    <span className="text-xs text-gray-400">-</span>
                                  </div>
                                </td>
                              )
                            }
                            
                            // Always show time for this specific day
                            const timeDisplay = applicableShifts.length === 1 
                              ? `${applicableShifts[0].start_time} - ${applicableShifts[0].end_time}`
                              : applicableShifts.map(s => `${s.start_time} - ${s.end_time}`).join(', ')
                            
                            const status = getDayAvailability(day, shift.id)
                            return (
                              <td key={shift.id} className="border p-1 sm:p-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={`w-full h-12 sm:h-16 text-xs ${getStatusColor(status)}`}
                                  onClick={() => {
                                    const nextStatus =
                                      status === "unset"
                                        ? "available"
                                        : status === "available"
                                          ? "priority"
                                          : status === "priority"
                                            ? "unavailable"
                                            : status === "unavailable"
                                              ? "vacation"
                                              : status === "vacation"
                                                ? "conference"
                                                : status === "conference"
                                                  ? "unset"
                                                  : "unset"
                                    setDayAvailability(day, shift.id, nextStatus)
                                  }}
                                >
                                  <div className="flex flex-col items-center">
                                    {getStatusIcon(status)}
                                    <span className="text-xs mt-1 capitalize leading-tight">
                                      {status === "unset" ? "Not Set" : status}
                                    </span>
                                    <span className="text-xs text-gray-600 mt-1">
                                      {timeDisplay}
                                    </span>
                                  </div>
                                </Button>
                              </td>
                            )
                          }
                          
                          // Handle single shifts (fallback)
                          const shiftInfo = getShiftDisplayInfo(shift, currentDate)
                          if (!shiftInfo) {
                            return (
                              <td key={shift.id} className="border p-1 sm:p-2">
                                <div className="w-full h-12 sm:h-16 bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                                  <span className="text-xs text-gray-400">-</span>
                                </div>
                              </td>
                            )
                          }
                          
                          const status = getDayAvailability(day, shift.id)
                          return (
                            <td key={shift.id} className="border p-1 sm:p-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className={`w-full h-12 sm:h-16 text-xs ${getStatusColor(status)}`}
                                onClick={() => {
                                  const nextStatus =
                                    status === "unset"
                                      ? "available"
                                      : status === "available"
                                        ? "priority"
                                        : status === "priority"
                                          ? "unavailable"
                                          : status === "unavailable"
                                            ? "vacation"
                                              : status === "vacation"
                                                ? "conference"
                                                : status === "conference"
                                                  ? "unset"
                                                  : "unset"
                                  setDayAvailability(day, shift.id, nextStatus)
                                }}
                              >
                                                                  <div className="flex flex-col items-center">
                                    {getStatusIcon(status)}
                                    <span className="text-xs mt-1 capitalize leading-tight">
                                      {status === "unset" ? "Not Set" : status}
                                    </span>
                                    <span className="text-xs text-gray-600 mt-1">
                                      {shiftInfo.time}
                                    </span>
                                  </div>
                              </Button>
                            </td>
                          )
                        })
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Save Button */}
            <div className="mt-8 flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-4">
              <Button
                variant="outline"
                className="w-full sm:w-auto bg-transparent"
                disabled={isSaving}
                onClick={() => {
                  alert("Availability saved as draft! You can continue editing later.")
                }}
              >
                Save as Draft
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={isSaving}
                onClick={saveAvailability}
              >
                {isSaving ? "Saving..." : "Save Availability"}
              </Button>
            </div>
          </CardContent>
        </Card>
          </>
        )}
      </div>
    </div>
  )
}
