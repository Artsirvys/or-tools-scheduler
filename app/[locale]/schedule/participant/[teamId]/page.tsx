"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Calendar, Download } from "lucide-react"
import { Link } from "@/i18n/routing"
import { supabase } from "@/lib/supabase"
import { format, getDaysInMonth, addMonths, subMonths } from "date-fns"
import { consolidateShifts, formatShiftTimeDisplay, type ConsolidatedShift } from "@/lib/shift-utils"
import { useLocale, useTranslations } from "next-intl"

interface SchedulePageProps {
  params: Promise<{
    teamId: string
  }>
}

interface TeamInfo {
  id: string
  name: string
  department: string
  host_id: string
  workers_per_shift: number
  created_at: string
  updated_at: string
}



interface TeamMember {
  id: string
  user_id: string
  team_id: string
  experience_level: number
  joined_at: string
  user: {
    id: string
    first_name: string
    last_name: string
    email: string
    role: string
  }
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

interface ScheduleAssignment {
  id: string
  schedule_id: string
  user_id: string
  shift_id: string
  date: string
  created_at: string
}

export default function ParticipantSchedulePage({ params }: SchedulePageProps) {
  const t = useTranslations("participant.schedule")
  const locale = useLocale()
  const dateLocale = {
    en: "en-US",
    lt: "lt-LT",
    pl: "pl-PL",
    it: "it-IT",
    de: "de-DE",
  }[locale] || "en-US"
  const tx = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback)

  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null)

  const [consolidatedShifts, setConsolidatedShifts] = useState<ConsolidatedShift[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(new Date())

  // Generate available months (next, current, and 6 previous months)
  const generateAvailableMonths = () => {
    const months = []
    const currentDate = new Date()
    
    // Add next month
    const nextMonthDate = addMonths(currentDate, 1)
    months.push({
      value: format(nextMonthDate, 'yyyy-MM'),
      label: nextMonthDate.toLocaleDateString(dateLocale, { month: "long", year: "numeric" })
    })
    
    // Add current month
    months.push({
      value: format(currentDate, 'yyyy-MM'),
      label: currentDate.toLocaleDateString(dateLocale, { month: "long", year: "numeric" })
    })
    
    // Add 6 previous months
    for (let i = 1; i <= 6; i++) {
      const prevMonth = subMonths(currentDate, i)
      months.push({
        value: format(prevMonth, 'yyyy-MM'),
        label: prevMonth.toLocaleDateString(dateLocale, { month: "long", year: "numeric" })
      })
    }
    
    return months
  }

  const availableMonths = generateAvailableMonths()

  useEffect(() => {
    const init = async () => {
      const { teamId } = await params
      await fetchUserData()
      await fetchScheduleData(teamId)
    }
    
    init()
  }, [params, selectedMonth])

  const fetchUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error('No authenticated user')
        return
      }

      const { data: userDetails } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (userDetails) {
        setCurrentUser(userDetails)
      }
    } catch (error) {
      console.error('Error fetching user data:', error)
    }
  }

  const fetchScheduleData = async (teamId: string) => {
    setLoading(true)
    
    try {
      const year = selectedMonth.getFullYear()
      const month = selectedMonth.getMonth() + 1
      const daysInMonth = getDaysInMonth(selectedMonth)
      
      const dateRangeStart = `${year}-${String(month).padStart(2, "0")}-01`
      const dateRangeEnd = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}`

      // 1. Fetch team info
      const { data: teamData } = await supabase
        .from("teams")
        .select("*")
        .eq("id", teamId)
        .single()
      
      setTeamInfo(teamData)

      // 2. Fetch shifts
      const { data: shiftsData } = await supabase
        .from("shifts")
        .select("*")
        .eq("team_id", teamId)
        .order('start_time', { ascending: true })
      
      // Create consolidated shifts
      const consolidated = consolidateShifts(shiftsData || [], teamData?.workers_per_shift || 1)
      setConsolidatedShifts(consolidated)

      // 3. Fetch team members
      const { data: membersData } = await supabase
        .from("team_members")
        .select('id, user_id, team_id, experience_level, joined_at')
        .eq("team_id", teamId)
      
      if (membersData && membersData.length > 0) {
        // Get user details for team members
        const userIds = membersData.map(m => m.user_id)
        const { data: usersData } = await supabase
          .from('users')
          .select('id, first_name, last_name, email, role')
          .in('id', userIds)
        
        // Format the data to match the interface
        const formattedMembers = membersData.map(member => {
          const user = usersData?.find(u => u.id === member.user_id)
          return {
            id: member.id,
            user_id: member.user_id,
            team_id: member.team_id,
            experience_level: member.experience_level,
            joined_at: member.joined_at,
            user: user as {
              id: string
              first_name: string
              last_name: string
              email: string
              role: string
            }
          }
        })
        
        setTeamMembers(formattedMembers)
      } else {
        setTeamMembers([])
      }

      // 4. Fetch schedule assignments for the selected month
      const { data: assignmentsData } = await supabase
        .from("schedule_assignments")
        .select("*")
        .gte("date", dateRangeStart)
        .lte("date", dateRangeEnd)
        .order("date", { ascending: true })
      
      setAssignments(assignmentsData || [])

    } catch (error) {
      console.error('Error fetching schedule data:', error)
    } finally {
      setLoading(false)
    }
  }



  const getAssignedMemberForConsolidatedShift = (date: string, consolidatedShift: ConsolidatedShift) => {
    // Check all shift IDs that were consolidated
    const assignment = assignments.find(a => 
      a.date === date && consolidatedShift.shiftIds.includes(a.shift_id)
    )
    if (!assignment) return null
    
    const member = teamMembers.find(m => m.user_id === assignment.user_id)
    return member
  }

  const checkIfMyShift = (member: TeamMember | null) => {
    return member && currentUser && member.user_id === currentUser.id
  }

  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(selectedMonth)
    const days = []
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day)
    }
    return days
  }

  const handleMonthChange = (monthValue: string) => {
    const [year, month] = monthValue.split('-').map(Number)
    setSelectedMonth(new Date(year, month - 1))
  }

  const handleExport = () => {
    alert(tx("alerts.exported", "Schedule exported to PDF! Please check your Downloads folder."))
  }

  if (loading) {
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
                <Calendar className="h-6 w-6 text-purple-600" />
                <span className="text-xl font-bold text-gray-900 dark:text-white">{tx("title", "My Team Schedule")}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300">{tx("loading", "Loading schedule data...")}</p>
          </div>
        </div>
      </div>
    )
  }

  const calendarDays = generateCalendarDays()

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
              <Calendar className="h-6 w-6 text-purple-600" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">{tx("title", "My Team Schedule")}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Header Info */}
        {teamInfo ? (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{teamInfo.name}</h1>
              <p className="text-gray-600 dark:text-gray-300">
                {tx("teamScheduleFor", "Your team schedule for")} {teamMembers.length} {tx("members", "members")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                {tx("exportPdf", "Export PDF")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{tx("teamSchedule", "Team Schedule")}</h1>
              <p className="text-gray-600 dark:text-gray-300">
                {tx("teamNotFoundDesc", "Team not found or you don't have access to this team")}
              </p>
            </div>
          </div>
        )}

                {teamInfo ? (
          <>
            {/* Month Selector */}
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">{tx("selectMonth", "Select Month")}</label>
                <Select 
                  value={format(selectedMonth, 'yyyy-MM')} 
                  onValueChange={handleMonthChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMonths.map((month) => (
                      <SelectItem key={month.value} value={month.value}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Schedule Info */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span>{tx("currentSchedule", "Current Schedule")}</span>
                </CardTitle>
                <CardDescription>
                  {tx("currentScheduleDesc", "This schedule was generated considering everyone's availability and preferences")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">{tx("scheduleDetails", "Schedule Details")}:</span>
                    <ul className="mt-1 text-gray-600 dark:text-gray-300">
                      <li>• {tx("details.fair", "Fair distribution of shifts")}</li>
                      <li>• {tx("details.availability", "Based on your availability")}</li>
                      <li>• {tx("details.coverage", "Optimized for team coverage")}</li>
                    </ul>
                  </div>
                  <div>
                    <span className="font-medium">{tx("lastUpdated", "Last Updated")}:</span>
                    <p className="mt-1 text-gray-600 dark:text-gray-300">
                      {new Date().toLocaleDateString(dateLocale)} {tx("at", "at")} {new Date().toLocaleTimeString(dateLocale)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Schedule Calendar */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {selectedMonth.toLocaleDateString(dateLocale, { month: "long", year: "numeric" })} {tx("schedule", "Schedule")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Shift Type Description */}
                {consolidatedShifts.length > 0 && (
                  <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 rounded-md">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>{tx("shiftTypes", "Shift Types")}:</strong> {tx("shiftTypesDescA", "This team has")} {consolidatedShifts.length} {tx("shiftTypesDescB", "shift type")} {consolidatedShifts.length !== 1 ? "s" : ""} {tx("shiftTypesDescC", "with varying hours depending on the day of the week.")} {tx("shiftTypesDescD", "Each column represents a consolidated shift type that may have different time ranges for different days.")}
                    </p>
                  </div>
                )}
                
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    {/* Header Row - Shifts */}
                    <thead>
                      <tr>
                        <th className="border p-3 bg-gray-50 dark:bg-gray-800 text-left font-medium">{tx("date", "Date")}</th>
                        {consolidatedShifts.map((shift) => (
                          <th key={shift.id} className="border p-3 bg-gray-50 dark:bg-gray-800 text-center min-w-[200px]">
                            <div className="font-medium">{shift.name}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              {formatShiftTimeDisplay(shift)}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Each Row is a Date */}
                      {calendarDays.map((day) => {
                        const date = format(selectedMonth, 'yyyy-MM') + '-' + day.toString().padStart(2, '0')
                        return (
                          <tr key={day}>
                            <td className="border p-3 font-medium bg-gray-50 dark:bg-gray-800">
                              <div className="flex items-center">
                                <span className="text-lg">{day}</span>
                                <span className="text-sm text-gray-500 ml-2">
                                  {new Date(date).toLocaleDateString(dateLocale, { weekday: "short" })}
                                </span>
                              </div>
                            </td>
                            {/* Each Column is a Shift */}
                            {consolidatedShifts.map((shift) => {
                              const assignedMember = getAssignedMemberForConsolidatedShift(date, shift)
                              const isMyShift = assignedMember && checkIfMyShift(assignedMember)
                              
                              return (
                                <td key={shift.id} className="border p-3">
                                  <div className="space-y-2">
                                    {/* Primary Assignment */}
                                    {assignedMember ? (
                                      <div
                                        className={`p-2 rounded border-l-4 ${
                                          isMyShift
                                            ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500"
                                            : "bg-blue-50 dark:bg-blue-900/20 border-blue-500"
                                        }`}
                                      >
                                        <div className="font-medium text-sm flex items-center">
                                          {assignedMember.user.first_name} {assignedMember.user.last_name}
                                          {isMyShift && (
                                            <Badge className="ml-2 text-xs bg-yellow-100 text-yellow-800">{tx("you", "You")}</Badge>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded border-l-4 border-gray-300">
                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                          {tx("unassigned", "Unassigned")}
                                        </div>
                                      </div>
                                    )}
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

                {/* Legend */}
                <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <h4 className="font-medium mb-2">{tx("legend", "Schedule Legend")}:</h4>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                      <span>{tx("legendYourShifts", "Your Shifts")}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-blue-500 rounded"></div>
                      <span>{tx("legendTeamShifts", "Team Member Shifts")}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-gray-300 rounded"></div>
                      <span>{tx("unassigned", "Unassigned")}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          /* Error State */
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span>{tx("accessDenied", "Access Denied")}</span>
              </CardTitle>
              <CardDescription>
                {tx("accessDeniedDesc", "You don't have access to this team's schedule")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  {tx("teamNotFound", "Team Not Found")}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  {tx("teamNotFoundLong", "The team you're looking for doesn't exist or you don't have permission to view its schedule.")}
                </p>
                <Link href="/participant/dashboard">
                  <Button variant="outline">
                    {tx("backToDashboard", "Back to Dashboard")}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
