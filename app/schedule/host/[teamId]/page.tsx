"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { format, getDaysInMonth, addMonths, subMonths } from "date-fns"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, FileText, FileSpreadsheet, ChevronLeft, ChevronRight } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import GenerateScheduleForm from "@/components/GenerateScheduleForm"
import { consolidateShifts, formatShiftTimeDisplay, type ConsolidatedShift } from "@/lib/shift-utils"

interface SchedulePageProps {
  params: Promise<{
    teamId: string
  }>
}

export default function HostSchedulePage({ params }: SchedulePageProps) {
  const [teamInfo, setTeamInfo] = useState<{
    id: string;
    name: string;
    department: string;
    host_id: string;
    workers_per_shift: number;
    created_at: string;
    updated_at: string;
    status: string;
  } | null>(null)

  const [consolidatedShifts, setConsolidatedShifts] = useState<ConsolidatedShift[]>([])
  const [assignments, setAssignments] = useState<Array<{
    id: string;
    schedule_id: string;
    user_id: string;
    shift_id: string;
    date: string;
    created_at: string;
  }>>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [memberMap, setMemberMap] = useState<Record<string, { name: string; role: string }>>({})
  const [basicConstraints, setBasicConstraints] = useState<{
    workers_per_shift: number;
    max_consecutive_days: number;
    max_days_per_month: number;
    shift_specific_workers: Record<string, number>;
  } | null>(null)
  const [generatedSchedule, setGeneratedSchedule] = useState<{
    id: string
    teamId: string
    month: number
    year: number
    assignments: Array<{
      date: string
      shiftId: string
      userId: string
      confidence: number
    }>
    generatedAt: string
    status: string
    constraints: {
      maxConsecutiveDays: number
      workersPerShift: number
    }
  } | null>(null)
  
  const [availabilityData, setAvailabilityData] = useState<Array<{
    id: string
    user_id: string
    team_id: string
    shift_id: string
    date: string
    status: 'available' | 'unavailable' | 'priority'
    created_at: string
  }>>([])
  
  const [activeDropdown, setActiveDropdown] = useState<{
    date: string
    shiftId: string
    workerIndex: number
  } | null>(null)
  
  const [isUpdatingAssignment, setIsUpdatingAssignment] = useState(false)
  const [showGeneratedSchedule, setShowGeneratedSchedule] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  
  // Month navigation functions
  const goToPreviousMonth = () => {
    setSelectedMonth(prev => subMonths(prev, 1))
  }

  const goToNextMonth = () => {
    setSelectedMonth(prev => addMonths(prev, 1))
  }

  const goToCurrentMonth = () => {
    setSelectedMonth(new Date())
  }

  useEffect(() => {
    const init = async () => {
      const { teamId: id } = await params
      
      // Inline fetchScheduleData to avoid dependency issues
      setLoading(true)
      
      try {
        const year = selectedMonth.getFullYear()
        const month = selectedMonth.getMonth() + 1
        const daysInMonth = getDaysInMonth(selectedMonth)
        
        const dateRangeStart = `${year}-${String(month).padStart(2, "0")}-01`
        const dateRangeEnd = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}`

        // 1. Fetch team
        const { data: teamData } = await supabase
          .from("teams")
          .select("*")
          .eq("id", id)
          .single()
        
        setTeamInfo(teamData)

        // 2. Fetch shifts
        const { data: shiftsData } = await supabase
          .from("shifts")
          .select("*")
          .eq("team_id", id)
        
        // 3. Fetch basic constraints
        const { data: constraintsData } = await supabase
          .from("basic_constraints")
          .select("*")
          .eq("team_id", id)
          .single()
        
        setBasicConstraints(constraintsData)

        // 4. Create consolidated shifts using basic constraints
        const consolidated = consolidateShifts(shiftsData || [], constraintsData?.workers_per_shift || 1)
        setConsolidatedShifts(consolidated)

        // 5. Fetch team members
        const { data: membersData } = await supabase
          .from("team_members")
          .select("user_id, users(first_name, last_name, role)")
          .eq("team_id", id)

        // 6. Fetch schedule assignments (only if not showing generated schedule)
        if (!showGeneratedSchedule) {
          const { data: assignmentsData } = await supabase
            .from("schedule_assignments")
            .select("*")
            .eq("team_id", id)
            .gte("date", dateRangeStart)
            .lte("date", dateRangeEnd)
          
          setAssignments(assignmentsData || [])
        }

        // 7. Map members
        const memberMapping: Record<string, { name: string; role: string }> = {}
        membersData?.forEach((m) => {
          const user = Array.isArray(m.users) ? m.users[0] : m.users
          const name = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : "Unnamed"
          const role = user?.role || "Staff"
          memberMapping[m.user_id] = { name, role }
        })
        setMemberMap(memberMapping)

        // 8. Fetch availability data for the month
        await fetchAvailabilityData(id, dateRangeStart, dateRangeEnd)
        
      } catch (error) {
        console.error('Error fetching schedule data:', error)
      } finally {
        setLoading(false)
      }
    }
    
    init()
  }, [params, selectedMonth, showGeneratedSchedule])

  // Fetch availability data for the month
  const fetchAvailabilityData = async (teamId: string, startDate: string, endDate: string) => {
    try {
      const { data: availabilityData, error } = await supabase
        .from('availability')
        .select('*')
        .eq('team_id', teamId)
        .gte('date', startDate)
        .lte('date', endDate)
        .in('status', ['available', 'priority', 'unavailable'])

      if (error) {
        console.error('Error fetching availability data:', error)
        return
      }

      setAvailabilityData(availabilityData || [])
    } catch (error) {
      console.error('Error in fetchAvailabilityData:', error)
    }
  }

  // Get available members for a specific shift and date
  const getAvailableMembers = (shiftId: string, date: string) => {
    const availableMembers = availabilityData
      .filter(av => av.shift_id === shiftId && av.date === date)
      .map(av => ({
        userId: av.user_id,
        name: memberMap[av.user_id]?.name || 'Unknown',
        role: memberMap[av.user_id]?.role || 'Staff',
        status: av.status
      }))
      .sort((a, b) => {
        // Sort by priority: priority > available > unavailable
        const statusOrder = { 'priority': 0, 'available': 1, 'unavailable': 2 }
        return statusOrder[a.status] - statusOrder[b.status]
      })

    return availableMembers
  }

  // Update assignment
  const updateAssignment = async (scheduleId: string, shiftId: string, date: string, newUserId: string) => {
    if (!teamInfo?.id) return

    console.log('=== FRONTEND: UPDATE ASSIGNMENT CALLED ===')
    console.log('Frontend data being sent:', { scheduleId, shiftId, date, newUserId, teamId: teamInfo.id })

    setIsUpdatingAssignment(true)
    try {
      const response = await fetch('/api/update-assignment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduleId,
          shiftId,
          date,
          newUserId,
          teamId: teamInfo.id
        })
      })

      console.log('API Response status:', response.status)
      console.log('API Response ok:', response.ok)

      const responseData = await response.json()
      console.log('API Response data:', responseData)

      if (!response.ok) {
        console.error('API Error Response:', responseData)
        console.error('Full error details:', JSON.stringify(responseData, null, 2))
        return
      }

      console.log('=== FRONTEND: ASSIGNMENT UPDATE SUCCESS ===')
      // Refresh the schedule data
      await refreshScheduleData()
      setActiveDropdown(null)
    } catch (error) {
      console.error('=== FRONTEND: FETCH ERROR ===')
      console.error('Fetch error:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
    } finally {
      setIsUpdatingAssignment(false)
    }
  }

  const fetchGeneratedSchedule = async (teamId: string, month: number, year: number) => {
    try {
      console.log('Fetching generated schedule for:', teamId, month, year)
      
      // Fetch the generated schedule from the schedules table
      const { data: scheduleData, error: scheduleError } = await supabase
        .from("schedules")
        .select("*")
        .eq("team_id", teamId)
        .eq("month", month)
        .eq("year", year)
        .eq("status", "active") // FIXED: Changed from "generated" to "active" to match API
        .order("generated_at", { ascending: false })
        .limit(1)
        .single()

      if (scheduleError) {
        console.error('Error fetching schedule:', scheduleError)
        setShowGeneratedSchedule(false)
        return
      }

      if (!scheduleData) {
        console.log('No generated schedule found for:', month, year)
        setShowGeneratedSchedule(false)
        return
      }

      // Fetch the schedule assignments for this schedule
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from("schedule_assignments")
        .select("*")
        .eq("schedule_id", scheduleData.id)
        .order("date", { ascending: true })

      if (assignmentsError) {
        console.error('Error fetching assignments:', assignmentsError)
        setShowGeneratedSchedule(false)
        return
      }

      // Get team info for workers_per_shift
      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("workers_per_shift")
        .eq("id", teamId)
        .single()

      if (teamError) {
        console.error('Error fetching team data:', teamError)
        setShowGeneratedSchedule(false)
        return
      }

      // Try to fetch basic constraints for this team
      let basicConstraints = null
      try {
        const { data: constraintsData } = await supabase
          .from("basic_constraints")
          .select("*")
          .eq("team_id", teamId)
          .single()
        basicConstraints = constraintsData
      } catch {
        console.log('No basic constraints found for team, using defaults')
      }

      // Transform the data to match our generatedSchedule state structure
      const transformedAssignments = assignmentsData?.map(assignment => ({
        date: assignment.date,
        shiftId: assignment.shift_id,
        userId: assignment.user_id,
        confidence: 0.9 // Default confidence for AI-generated schedules
      })) || []

      // Create the generatedSchedule object
      const generatedScheduleData = {
        id: scheduleData.id,
        teamId: scheduleData.team_id,
        month: scheduleData.month,
        year: scheduleData.year,
        assignments: transformedAssignments,
        generatedAt: scheduleData.generated_at,
        status: scheduleData.status,
        constraints: {
          maxConsecutiveDays: basicConstraints?.max_consecutive_days || 5,
          workersPerShift: teamData?.workers_per_shift || 1
        }
      }

      // Set the generated schedule state
      setGeneratedSchedule(generatedScheduleData)
      setShowGeneratedSchedule(true)
      
      console.log('Successfully fetched generated schedule:', generatedScheduleData)
    } catch (error) {
      console.error('Error fetching generated schedule:', error)
      setShowGeneratedSchedule(false)
    }
  }

  // Function to refresh schedule data when month changes
  const refreshScheduleData = async () => {
    if (!teamInfo?.id) return
    
    setLoading(true)
    try {
      const year = selectedMonth.getFullYear()
      const month = selectedMonth.getMonth() + 1
      const daysInMonth = getDaysInMonth(selectedMonth)
      
      const dateRangeStart = `${year}-${String(month).padStart(2, "0")}-01`
      const dateRangeEnd = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}`

      // Fetch schedule assignments for the selected month
      if (!showGeneratedSchedule) {
        const { data: assignmentsData } = await supabase
          .from("schedule_assignments")
          .select("*")
          .eq("team_id", teamInfo.id)
          .gte("date", dateRangeStart)
          .lte("date", dateRangeEnd)
        
        setAssignments(assignmentsData || [])
      }

      // Only check for generated schedule if we're not already showing one
      // or if the month/year has changed
      if (!generatedSchedule || 
          generatedSchedule.month !== month || 
          generatedSchedule.year !== year) {
        await fetchGeneratedSchedule(teamInfo.id, month, year)
      }

      // Refresh availability data
      await fetchAvailabilityData(teamInfo.id, dateRangeStart, dateRangeEnd)
      
    } catch (error) {
      console.error('Error refreshing schedule data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Refresh data when month changes
  useEffect(() => {
    if (teamInfo?.id) {
      refreshScheduleData()
    }
  }, [selectedMonth, teamInfo?.id])

  // Function to manually refresh generated schedule
  const refreshGeneratedSchedule = async () => {
    if (!teamInfo?.id) return
    
    const year = selectedMonth.getFullYear()
    const month = selectedMonth.getMonth() + 1
    
    await fetchGeneratedSchedule(teamInfo.id, month, year)
  }

  // Function to toggle between generated and database schedule
  const toggleScheduleView = async () => {
    if (showGeneratedSchedule) {
      // Switching to database view
      setShowGeneratedSchedule(false)
      // Refresh database assignments for current month
      if (teamInfo?.id) {
        const year = selectedMonth.getFullYear()
        const month = selectedMonth.getMonth() + 1
        const daysInMonth = getDaysInMonth(selectedMonth)
        
        const dateRangeStart = `${year}-${String(month).padStart(2, "0")}-01`
        const dateRangeEnd = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}`

        const { data: assignmentsData } = await supabase
          .from("schedule_assignments")
          .select("*")
          .eq("team_id", teamInfo.id)
          .gte("date", dateRangeStart)
          .lte("date", dateRangeEnd)
        
        setAssignments(assignmentsData || [])
      }
    } else {
      // Switching to generated view
      if (generatedSchedule) {
        setShowGeneratedSchedule(true)
      } else {
        // No generated schedule yet, try to fetch one
        await refreshGeneratedSchedule()
      }
    }
  }



  const getAllAssignedMembersForConsolidatedShift = (date: string, consolidatedShift: ConsolidatedShift) => {
    if (showGeneratedSchedule && generatedSchedule) {
      // For generated schedules, find all assignments for this date/shift
      const assignmentsForShift = generatedSchedule.assignments?.filter(
        (a) => a.date === date && consolidatedShift.shiftIds.includes(a.shiftId)
      )?.sort((a, b) => a.userId.localeCompare(b.userId)) || []
      
      return assignmentsForShift
        .map(assignment => memberMap[assignment.userId])
        .filter(member => member !== null && member !== undefined)
    } else {
      // For database schedules, find all assignments for this date/shift
      const assignmentsForShift = assignments?.filter(
        (a) => a.date === date && consolidatedShift.shiftIds.includes(a.shift_id)
      )?.sort((a, b) => a.user_id.localeCompare(b.user_id)) || []
      
      return assignmentsForShift
        .map(assignment => memberMap[assignment.user_id])
        .filter(member => member !== null && member !== undefined)
    }
  }

  const calendarDays = Array.from({ length: getDaysInMonth(selectedMonth) }, (_, i) => i + 1)

  // Calculate stats from existing data
  const calculateStats = () => {
    const currentAssignments = showGeneratedSchedule && generatedSchedule 
      ? generatedSchedule.assignments 
      : assignments

    if (!currentAssignments || !consolidatedShifts || !memberMap) {
      return {
        participantStats: [],
        totalPossibleAssignments: 0,
        totalActualAssignments: 0,
        unassignedShifts: 0
      }
    }

    const daysInMonth = getDaysInMonth(selectedMonth)
    const workersPerShift = basicConstraints?.workers_per_shift || 1
    
    // Calculate total possible assignments
    const totalPossibleAssignments = daysInMonth * consolidatedShifts.length * workersPerShift
    const totalActualAssignments = currentAssignments.length
    const unassignedShifts = totalPossibleAssignments - totalActualAssignments

    // Group assignments by participant
    const participantStats = Object.entries(memberMap).map(([userId, memberInfo]) => {
      const participantAssignments = currentAssignments.filter(assignment => {
        // Handle both database assignments and generated schedule assignments
        if ('user_id' in assignment) {
          return assignment.user_id === userId
        } else {
          return assignment.userId === userId
        }
      })

      // Count shifts by type
      const shiftTypeCounts: Record<string, number> = {}
      consolidatedShifts.forEach(shift => {
        shiftTypeCounts[shift.name] = 0
      })

      participantAssignments.forEach(assignment => {
        // Handle both database assignments and generated schedule assignments
        const shiftId = 'shift_id' in assignment ? assignment.shift_id : assignment.shiftId
        const consolidatedShift = consolidatedShifts.find(shift => 
          shift.shiftIds.includes(shiftId)
        )
        if (consolidatedShift) {
          shiftTypeCounts[consolidatedShift.name]++
        }
      })

      return {
        userId,
        name: memberInfo.name,
        role: memberInfo.role,
        totalShifts: participantAssignments.length,
        shiftTypeCounts
      }
    }).sort((a, b) => b.totalShifts - a.totalShifts) // Sort by total shifts descending

    return {
      participantStats,
      totalPossibleAssignments,
      totalActualAssignments,
      unassignedShifts
    }
  }

  const stats = calculateStats()

  const exportSchedule = async (exportFormat: string) => {
    if (!teamInfo) {
      console.error('No team info available for export')
      return
    }
    
    if (!consolidatedShifts || consolidatedShifts.length === 0) {
      console.error('No shifts available for export')
      return
    }
    
    if (isExporting) {
      console.log('Export already in progress')
      return
    }
    
    setIsExporting(true)
    
    try {
      const monthName = format(selectedMonth, "MMMM yyyy")
      const teamName = teamInfo?.department || teamInfo?.name || "Team"
      
      if (exportFormat === 'pdf') {
        exportToPDF(monthName, teamName)
      } else if (exportFormat === 'excel') {
        exportToExcel(monthName, teamName)
      }
    } catch (error) {
      console.error('Error during export:', error)
    } finally {
      setIsExporting(false)
    }
  }

  const exportToPDF = (monthName: string, teamName: string) => {
    // Create PDF content
    const content = generateScheduleContent(monthName, teamName)
    
    // Create blob and download
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${teamName}_Schedule_${monthName.replace(' ', '_')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const exportToExcel = (monthName: string, teamName: string) => {
    // Create CSV content (Excel can open CSV files)
    const csvContent = generateCSVContent(monthName, teamName)
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${teamName}_Schedule_${monthName.replace(' ', '_')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const generateScheduleContent = (monthName: string, teamName: string) => {
    let content = `${teamName} - ${monthName} Schedule\n`
    content += "=".repeat(50) + "\n\n"
    
    content += "Date\t\t"
    consolidatedShifts.forEach(shift => {
      content += `${shift.name}\t\t`
    })
    content += "\n"
    
    calendarDays.forEach(day => {
      const date = `${selectedMonth.getFullYear()}-${(selectedMonth.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
      const dayName = new Date(date).toLocaleDateString("en-US", { weekday: "short" })
      content += `${day} (${dayName})\t\t`
      
      consolidatedShifts.forEach(shift => {
        const members = getAllAssignedMembersForConsolidatedShift(date, shift)
        if (members.length > 0) {
          const memberNames = members.map(m => m.name).join(', ')
          content += `${memberNames}\t\t`
        } else {
          content += `Unassigned\t\t`
        }
      })
      content += "\n"
    })
    
    return content
  }

  const generateCSVContent = (monthName: string, teamName: string) => {
    let content = `${teamName} - ${monthName} Schedule\n`
    content += `Date,${consolidatedShifts.map(shift => shift.name).join(',')}\n`
    
    calendarDays.forEach(day => {
      const date = `${selectedMonth.getFullYear()}-${(selectedMonth.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
      const dayName = new Date(date).toLocaleDateString("en-US", { weekday: "short" })
      content += `${day} (${dayName}),`
      
      consolidatedShifts.forEach((shift, index) => {
        // For consolidated shifts, we need to check all shift IDs
        const members = getAllAssignedMembersForConsolidatedShift(date, shift)
        if (members.length > 0) {
          const memberNames = members.map(m => m.name).join(', ')
          content += `"${memberNames}"`
        } else {
          content += `"Unassigned"`
        }
        if (index < consolidatedShifts.length - 1) content += ','
      })
      content += '\n'
    })
    
    return content
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading schedule...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm">
                  <Calendar className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Schedule for {teamInfo?.department || "Team"}
              </h1>
            </div>
            <div className="flex space-x-2">
              {teamInfo && (
                <GenerateScheduleForm 
                  teamId={teamInfo.id} 
                  teamName={teamInfo.department || teamInfo.name || "Team"}
                  onScheduleGenerated={refreshScheduleData}
                />
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportSchedule('pdf')}
                disabled={isExporting}
              >
                <FileText className="h-4 w-4 mr-2" />
                {isExporting ? "Exporting..." : "Export PDF"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportSchedule('excel')}
                disabled={isExporting}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                {isExporting ? "Exporting..." : "Export Excel"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Month Navigation */}
        <div className="mb-6 flex items-center justify-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPreviousMonth}
            className="flex items-center space-x-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          
          <div className="flex items-center space-x-3">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {format(selectedMonth, "MMMM yyyy")}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={goToCurrentMonth}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Today
            </Button>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextMonth}
            className="flex items-center space-x-2"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Schedule and Stats Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Schedule Card */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      {format(selectedMonth, "MMMM yyyy")} Schedule
                    </CardTitle>
                    <CardDescription>
                      {showGeneratedSchedule && generatedSchedule ? 'AI Generated Schedule (Preview)' : 'Schedule for your team members'}
                    </CardDescription>
                  </div>
                  {generatedSchedule && (
                    <div className="flex items-center space-x-2">
                      <Button
                        variant={showGeneratedSchedule ? "default" : "outline"}
                        size="sm"
                        onClick={toggleScheduleView}
                      >
                        {showGeneratedSchedule ? "Show Database" : "Show Generated"}
                      </Button>
                      {showGeneratedSchedule && (
                        <>
                          <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                            AI Generated
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={refreshGeneratedSchedule}
                            className="text-xs"
                          >
                            Refresh
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
            {showGeneratedSchedule && generatedSchedule && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800">
                  📋 Showing AI-generated schedule for {format(selectedMonth, "MMMM yyyy")}. 
                  This schedule was created using AI optimization and is stored in the database.
                  You can toggle between this generated schedule and the regular database schedule using the button above.
                </p>
              </div>
            )}
            {showGeneratedSchedule && !generatedSchedule && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800">
                  ⚠️ No AI-generated schedule found for {format(selectedMonth, "MMMM yyyy")}. 
                  Generate a new schedule using the AI form above, or switch back to database view.
                </p>
              </div>
            )}
            {/* Shift Type Description */}
            {consolidatedShifts.length > 0 && (
              <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
                <p className="text-sm text-gray-700">
                  <strong>Shift Types:</strong> This team has {consolidatedShifts.length} shift type{consolidatedShifts.length !== 1 ? 's' : ''} with varying hours depending on the day of the week. 
                  Each column represents a consolidated shift type that may have different time ranges for different days.
                </p>
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border p-2 bg-gray-100">Day</th>
                    {consolidatedShifts?.map((shift) => (
                      <th key={shift.id} className="border p-2 bg-gray-100">
                        {shift.name} <br />
                        <span className="text-xs text-gray-500">
                          {formatShiftTimeDisplay(shift)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calendarDays.map((day) => {
                    const date = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                    const workersPerShift = basicConstraints?.workers_per_shift || 1
                    
                    // Create multiple rows for each day based on workers_per_shift
                    return Array.from({ length: workersPerShift }, (_, workerIndex) => (
                      <tr key={`${day}-${workerIndex}`} className={workerIndex === 0 ? "" : "border-t-0"}>
                        {workerIndex === 0 ? (
                          <td 
                            className="border p-2 font-medium bg-gray-50" 
                            rowSpan={workersPerShift}
                            style={{ verticalAlign: 'top' }}
                          >
                            {day}
                          </td>
                        ) : null}
                        {consolidatedShifts?.map((shift) => {
                          // For multiple workers per shift, we need to handle multiple assignments
                          let member = null
                          
                          if (showGeneratedSchedule && generatedSchedule) {
                            // For generated schedules, find all assignments for this date/shift
                            // We need to check all shift IDs that were consolidated
                            const assignmentsForShift = generatedSchedule.assignments?.filter(
                              (a) => a.date === date && shift.shiftIds.includes(a.shiftId)
                            )?.sort((a, b) => a.userId.localeCompare(b.userId)) || []
                            // Get the specific worker for this row
                            member = assignmentsForShift[workerIndex] ? 
                              memberMap[assignmentsForShift[workerIndex].userId] : null
                          } else {
                            // For database schedules, find all assignments for this date/shift
                            // We need to check all shift IDs that were consolidated
                            const assignmentsForShift = assignments?.filter(
                              (a) => a.date === date && shift.shiftIds.includes(a.shift_id)
                            )?.sort((a, b) => a.user_id.localeCompare(b.user_id)) || []
                            // Get the specific worker for this row
                            member = assignmentsForShift[workerIndex] ? 
                              memberMap[assignmentsForShift[workerIndex].user_id] : null
                          }
                          
                          return (
                            <td key={shift.id} className="border p-2 relative">
                              {activeDropdown?.date === date && 
                               activeDropdown?.shiftId === shift.id && 
                               activeDropdown?.workerIndex === workerIndex ? (
                                <div className="absolute top-0 left-0 right-0 bg-white border border-gray-300 rounded shadow-lg z-10 p-2">
                                  <div className="text-xs font-medium mb-2">Select Team Member:</div>
                                  <Select
                                    onValueChange={(userId) => {
                                      let scheduleId = null
                                      
                                      if (showGeneratedSchedule && generatedSchedule) {
                                        // For generated schedules, use the schedule ID
                                        scheduleId = generatedSchedule.id
                                      } else {
                                        // For database schedules, find the schedule ID from assignments
                                        scheduleId = assignments.find(a => a.date === date)?.schedule_id || null
                                      }
                                      
                                      if (scheduleId) {
                                        updateAssignment(scheduleId, shift.id, date, userId === 'unassigned' ? 'unassigned' : userId)
                                      }
                                    }}
                                    disabled={isUpdatingAssignment}
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Choose member..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="unassigned">
                                        <div className="flex items-center space-x-2">
                                          <span className="text-gray-500 italic">Unassigned</span>
                                        </div>
                                      </SelectItem>
                                      {getAvailableMembers(shift.id, date).map((member) => (
                                        <SelectItem key={member.userId} value={member.userId}>
                                          <div className="flex items-center space-x-2">
                                            <span>{member.name}</span>
                                            <span className="text-xs text-gray-500">({member.role})</span>
                                            <span className={`text-xs px-1 py-0.5 rounded ${
                                              member.status === 'priority' ? 'bg-yellow-100 text-yellow-800' :
                                              member.status === 'available' ? 'bg-green-100 text-green-800' :
                                              'bg-gray-100 text-gray-800'
                                            }`}>
                                              {member.status}
                                            </span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="mt-2 w-full"
                                    onClick={() => setActiveDropdown(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <div 
                                  className="cursor-pointer hover:bg-gray-50 p-1 rounded"
                                  onClick={() => {
                                    setActiveDropdown({
                                      date,
                                      shiftId: shift.id,
                                      workerIndex
                                    })
                                  }}
                                >
                              {member ? (
                                <div>
                                  <div className="font-semibold">{member.name}</div>
                                  <div className="text-xs text-gray-500">{member.role}</div>
                                </div>
                              ) : (
                                <div className="text-xs text-gray-500 italic">
                                  Unassigned
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
          </div>

          {/* Stats Card */}
          <div className="lg:col-span-1">
            <Card className="h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Schedule Stats</CardTitle>
                <CardDescription className="text-xs">
                  {showGeneratedSchedule && generatedSchedule ? 'AI Generated' : 'Database'} Schedule
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Summary Stats */}
                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Total Assignments:</span>
                      <span className="font-medium">{stats.totalActualAssignments}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Unassigned:</span>
                      <span className={`font-medium ${stats.unassignedShifts > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                        {stats.unassignedShifts}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Coverage:</span>
                      <span>{stats.totalPossibleAssignments > 0 ? Math.round((stats.totalActualAssignments / stats.totalPossibleAssignments) * 100) : 0}%</span>
                    </div>
                  </div>
                </div>

                {/* Participant Stats */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">By Participant</h4>
                  {stats.participantStats.length > 0 ? (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {stats.participantStats.map((participant) => (
                        <div key={participant.userId} className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs">
                          <div className="flex justify-between items-start mb-1">
                            <div>
                              <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                {participant.name}
                              </div>
                              <div className="text-gray-500 dark:text-gray-400 text-xs">
                                {participant.role}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-blue-600 dark:text-blue-400">
                                {participant.totalShifts}
                              </div>
                              <div className="text-gray-500 text-xs">shifts</div>
                            </div>
                          </div>
                          
                          {/* Shift Type Breakdown */}
                          {Object.entries(participant.shiftTypeCounts).some(([, count]) => count > 0) && (
                            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                              {Object.entries(participant.shiftTypeCounts)
                                .filter(([, count]) => count > 0)
                                .map(([shiftType, count]) => (
                                  <div key={shiftType} className="flex justify-between text-xs">
                                    <span className="text-gray-600 dark:text-gray-400 truncate max-w-20">
                                      {shiftType}:
                                    </span>
                                    <span className="font-medium text-gray-800 dark:text-gray-200">
                                      {count}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      No assignments found
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
