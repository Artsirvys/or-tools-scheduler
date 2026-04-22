"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Calendar, ArrowLeft, Plus, X, Clock, Users } from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { CreateTeamFirstVisitWizard } from "@/components/create-team-first-visit-wizard"

export default function CreateTeamPage() {
  const [teamData, setTeamData] = useState({
    name: "",
    description: "",
  })

  const [shifts, setShifts] = useState<Array<{
    id: number;
    name: string;
    startTime: string;
    endTime: string;
    dayOfWeek: number | null;
    workersRequired: number;
    daySpecificTimes?: Record<string, { start_time: string; end_time: string }>;
  }>>([])

  const [newShift, setNewShift] = useState({
    name: "",
    startTime: "",
    endTime: "",
    dayOfWeek: null as number | null,
    workersRequired: 2,
    daySpecificTimes: {},
  })

  const [hasDifferentWeekdayHours, setHasDifferentWeekdayHours] = useState(false)
  const [shiftTimeSlots, setShiftTimeSlots] = useState<Array<{
    id: number;
    startTime: string;
    endTime: string;
    dayType: string;
  }>>([
    { id: 1, startTime: "", endTime: "", dayType: "all" },
  ])

  const [isLoading, setIsLoading] = useState(false)
  const [subscriptionLimits, setSubscriptionLimits] = useState<{
    canCreateTeam: boolean;
    planName: string;
    maxTeams: number;
    maxMembersPerTeam: number;
  } | null>(null)
  const [limitCheckLoading, setLimitCheckLoading] = useState(true)
  const [showFirstVisitWizard, setShowFirstVisitWizard] = useState(false)
  const [shiftFormError, setShiftFormError] = useState<string | null>(null)

  const dismissFirstVisitWizard = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user && typeof window !== "undefined") {
      window.localStorage.setItem(`createTeamOnboarding:v1:${user.id}`, "1")
    }
    setShowFirstVisitWizard(false)
  }

  useEffect(() => {
    const checkFirstVisit = async () => {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()
        if (authError || !user) return
        if (typeof window !== "undefined" && window.localStorage.getItem(`createTeamOnboarding:v1:${user.id}`)) {
          return
        }
        const { count, error: countError } = await supabase
          .from("teams")
          .select("id", { count: "exact", head: true })
          .eq("host_id", user.id)
        if (countError) return
        if ((count ?? 0) === 0) setShowFirstVisitWizard(true)
      } catch {
        /* ignore — wizard is optional */
      }
    }
    void checkFirstVisit()
  }, [])

  useEffect(() => {
    const checkLimits = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) {
          setLimitCheckLoading(false)
          return
        }

        const response = await fetch('/api/subscription-limits')
        if (response.ok) {
          const limits = await response.json()
          setSubscriptionLimits(limits)
        } else {
          console.error('Error fetching subscription limits:', response.statusText)
        }
      } catch (error) {
        console.error('Error checking subscription limits:', error)
      } finally {
        setLimitCheckLoading(false)
      }
    }

    checkLimits()
  }, [])

  const dayOptions: { value: string; label: string }[] = [
    { value: "all", label: "All Days" },
    { value: "mon-fri", label: "Monday-Friday" },
    { value: "weekend", label: "Weekend (Sat-Sun)" },
    { value: "0", label: "Sunday" },
    { value: "1", label: "Monday" },
    { value: "2", label: "Tuesday" },
    { value: "3", label: "Wednesday" },
    { value: "4", label: "Thursday" },
    { value: "5", label: "Friday" },
    { value: "6", label: "Saturday" },
  ]

  const getDayLabel = (dayOfWeek: number | null) => {
    if (dayOfWeek === null) return "All Days"
    return dayOptions.find((day) => day.value === String(dayOfWeek))?.label || "Unknown"
  }

  const addTimeSlot = () => {
    setShiftFormError(null)
    const newSlot = {
      id: Date.now(),
      startTime: "",
      endTime: "",
      dayType: "all",
    }
    setShiftTimeSlots([...shiftTimeSlots, newSlot])
  }

  const removeTimeSlot = (id: number) => {
    if (shiftTimeSlots.length > 1) {
      setShiftTimeSlots(shiftTimeSlots.filter(slot => slot.id !== id))
    }
  }

  const updateTimeSlot = (id: number, field: string, value: string) => {
    setShiftFormError(null)
    setShiftTimeSlots(shiftTimeSlots.map(slot => 
      slot.id === id ? { ...slot, [field]: value } : slot
    ))
  }



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        console.error('Error getting user:', userError)
        alert('Please sign in to create a team')
        setIsLoading(false)
        return
      }

      // Check subscription limits
      const limitCheckResponse = await fetch('/api/check-team-creation-limit')
      if (!limitCheckResponse.ok) {
        alert('Error checking subscription limits. Please try again.')
        setIsLoading(false)
        return
      }
      const limitCheck = await limitCheckResponse.json()
      if (!limitCheck.allowed) {
        alert(limitCheck.reason)
        setIsLoading(false)
        return
      }

      if (shifts.length === 0) {
        alert("Add at least one shift type with a name, times, and how many people are needed per shift.")
        setIsLoading(false)
        return
      }

      console.log("Creating team:", { teamData, shifts })

      const workersPerShiftDefault = Math.max(1, ...shifts.map((s) => s.workersRequired))

      // Create the team
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert([{
          name: teamData.name,
          department: null,
          description: teamData.description,
          workers_per_shift: workersPerShiftDefault,
          host_id: user.id,
          status: 'active'
        }])
        .select()
        .single()

      if (teamError) {
        console.error('Error creating team:', teamError)
        alert('Failed to create team: ' + teamError.message)
        setIsLoading(false)
        return
      }

      console.log('Team created:', team)

      // Create shifts for the team
      const shiftsToInsert = shifts.map(shift => {
        const shiftData: {
          team_id: string;
          name: string;
          start_time: string;
          end_time: string;
          day_specific_times?: Record<string, { start_time: string; end_time: string }>;
          day_of_week?: number;
        } = {
          team_id: team.id,
          name: shift.name,
          start_time: shift.startTime,
          end_time: shift.endTime,
        }
        
        // If there are day-specific times, use them instead of day_of_week
        if (shift.daySpecificTimes && Object.keys(shift.daySpecificTimes).length > 0) {
          shiftData.day_specific_times = shift.daySpecificTimes
        } else if (shift.dayOfWeek !== null) {
          // Fallback to old day_of_week field for backward compatibility
          shiftData.day_of_week = shift.dayOfWeek
        }
        
        return shiftData
      })

      const { data: createdShifts, error: shiftsError } = await supabase
        .from('shifts')
        .insert(shiftsToInsert)
        .select()

      if (shiftsError) {
        console.error('Error creating shifts:', shiftsError)
        alert('Team created but failed to create shifts: ' + shiftsError.message)
      } else {
        // Create AI constraints with shift-specific worker requirements
        const shiftSpecificWorkers: { [key: string]: number } = {}
        createdShifts?.forEach((createdShift, index) => {
          shiftSpecificWorkers[createdShift.id] = shifts[index].workersRequired
        })

        const { error: constraintsError } = await supabase
          .from('basic_constraints')
          .insert([{
            team_id: team.id,
            max_consecutive_days: 30,
            workers_per_shift: workersPerShiftDefault,
            shift_specific_workers: shiftSpecificWorkers,
            max_days_per_month: 20
          }])

        if (constraintsError) {
          console.error('Error creating basic constraints:', constraintsError)
          // Don't fail the whole operation for this
        }
      }

      // Log activity
      await supabase.from('activity_log').insert([{
        host_id: user.id,
        actor_id: user.id,
        team_id: team.id,
        action: `Created new team: ${teamData.name}`,
        type: 'team'
      }])

      setIsLoading(false)
      alert('Team created successfully!')
      window.location.href = "/dashboard"
      
    } catch (error) {
      console.error('Error creating team:', error)
      alert('An unexpected error occurred. Please try again.')
      setIsLoading(false)
    }
  }

  const addShift = () => {
    setShiftFormError(null)
    const nameTrimmed = newShift.name.trim()
    if (!nameTrimmed) {
      setShiftFormError('Add a short name for this shift (for example "Day shift").')
      return
    }

    const validSlots = shiftTimeSlots.filter((slot) => slot.startTime && slot.endTime)

    if (validSlots.length === 0) {
      setShiftFormError(
        "Choose a start and end time for at least one row. Both time fields need a value before you add this shift.",
      )
      return
    }

    const daySpecificTimes: Record<string, { start_time: string; end_time: string }> = {}

    validSlots.forEach((slot) => {
      if (slot.dayType === "all") {
        daySpecificTimes["default"] = {
          start_time: slot.startTime,
          end_time: slot.endTime,
        }
      } else if (slot.dayType === "mon-fri") {
        for (let i = 1; i <= 5; i++) {
          daySpecificTimes[i.toString()] = {
            start_time: slot.startTime,
            end_time: slot.endTime,
          }
        }
      } else if (slot.dayType === "weekend") {
        daySpecificTimes["0"] = {
          start_time: slot.startTime,
          end_time: slot.endTime,
        }
        daySpecificTimes["6"] = {
          start_time: slot.startTime,
          end_time: slot.endTime,
        }
      } else {
        daySpecificTimes[slot.dayType] = {
          start_time: slot.startTime,
          end_time: slot.endTime,
        }
      }
    })

    const shiftToAdd = {
      id: Date.now(),
      name: nameTrimmed,
      startTime: validSlots[0].startTime,
      endTime: validSlots[0].endTime,
      dayOfWeek: null,
      workersRequired: newShift.workersRequired,
      daySpecificTimes: daySpecificTimes,
    }

    setShifts([...shifts, shiftToAdd])
    setShiftFormError(null)
    setNewShift({ name: "", startTime: "", endTime: "", dayOfWeek: null, workersRequired: 2, daySpecificTimes: {} })
    setShiftTimeSlots([{ id: Date.now(), startTime: "", endTime: "", dayType: "all" }])
    setHasDifferentWeekdayHours(false)
  }

  const removeShift = (id: number) => {
    setShifts(shifts.filter((shift) => shift.id !== id))
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <CreateTeamFirstVisitWizard open={showFirstVisitWizard} onDismiss={dismissFirstVisitWizard} />
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
              <Calendar className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">Create New Team</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <p className="mx-auto mb-8 max-w-2xl text-center text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          Most hosts finish in about two minutes. Your team is only created when you press{" "}
          <span className="font-medium text-gray-800 dark:text-gray-200">Create Team</span>
          —you can change names, shifts, and scheduling rules later from your dashboard.
        </p>
        {/* Subscription Limit Warning */}
        {!limitCheckLoading && subscriptionLimits && !subscriptionLimits.canCreateTeam && (
          <Card className="mb-6 border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Team Limit Reached
                  </h3>
                  <p className="text-sm text-yellow-700 mt-1">
                    You&apos;ve reached the team limit ({subscriptionLimits.maxTeams} teams). 
                    You cannot create more teams at this time.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Information */}
          <Card id="create-team-basic" className="scroll-mt-24">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-normal">
                  Step 1 of 2
                </Badge>
                <CardTitle>Basic Information</CardTitle>
              </div>
              <CardDescription>Set up the basic details for your team</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="teamName">Team Name</Label>
                <Input
                  id="teamName"
                  placeholder="Emergency Department"
                  value={teamData.name}
                  onChange={(e) => setTeamData({ ...teamData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of the team's responsibilities..."
                  value={teamData.description}
                  onChange={(e) => setTeamData({ ...teamData, description: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Shift Configuration */}
          <Card id="create-team-shifts" className="scroll-mt-24">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-normal">
                  Step 2 of 2
                </Badge>
                <CardTitle>Shift types</CardTitle>
              </div>
              <CardDescription>
                Add each kind of shift your team uses (for example day shift and night shift). One row here becomes one shift type in the schedule—you can attach different hours for different days in the time rows below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <details className="rounded-lg border border-gray-200 bg-gray-50/90 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-800/50">
                <summary className="cursor-pointer font-medium text-gray-800 dark:text-gray-200">
                  See a quick example
                </summary>
                <p className="mt-3 leading-relaxed text-gray-600 dark:text-gray-400">
                  A common setup is a <strong className="font-medium text-gray-800 dark:text-gray-200">Day shift</strong>{" "}
                  (for example 07:00–19:00) and a{" "}
                  <strong className="font-medium text-gray-800 dark:text-gray-200">Night shift</strong> (19:00–07:00),
                  each with how many people you need on duty. Add each as its own shift type below.
                </p>
              </details>
              {shifts.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Shift types you added</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    You can adjust people needed per run or remove a type before creating the team.
                  </p>
                  <ul className="space-y-3">
                    {shifts.map((shift) => (
                      <li
                        key={shift.id}
                        className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/50 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex flex-1 flex-wrap items-center gap-3">
                          <Badge variant="outline" className="text-sm font-medium">
                            {shift.name}
                          </Badge>
                          <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                            <Clock className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
                            {shift.startTime} – {shift.endTime}
                          </span>
                          <Badge variant="secondary" className="text-xs font-normal">
                            {shift.daySpecificTimes && Object.keys(shift.daySpecificTimes).length > 0
                              ? `${Object.keys(shift.daySpecificTimes).length} day pattern${Object.keys(shift.daySpecificTimes).length !== 1 ? "s" : ""}`
                              : getDayLabel(shift.dayOfWeek)}
                          </Badge>
                          <div className="flex flex-wrap items-center gap-2 rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900/50">
                            <Users className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden />
                            <Label htmlFor={`workers-${shift.id}`} className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              People per shift
                            </Label>
                            <Input
                              id={`workers-${shift.id}`}
                              type="number"
                              min={1}
                              max={20}
                              value={shift.workersRequired}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10) || 1
                                setShifts(
                                  shifts.map((s) =>
                                    s.id === shift.id ? { ...s, workersRequired: v } : s,
                                  ),
                                )
                              }}
                              className="h-8 w-16 text-xs"
                              aria-label={`People needed for ${shift.name}`}
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-red-600 hover:text-red-700 dark:text-red-400"
                          onClick={() => removeShift(shift.id)}
                        >
                          <X className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Remove</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-xl border border-blue-100 bg-gradient-to-b from-blue-50/80 to-white p-5 shadow-sm dark:border-blue-900/40 dark:from-blue-950/30 dark:to-gray-900/40 md:p-6">
                <div className="mb-5 flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
                    <Plus className="h-5 w-5 text-blue-700 dark:text-blue-300" aria-hidden />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">Add a shift type</h3>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      Give it a name, set how many people are needed when this shift runs, then choose the time window and which days it applies to.
                    </p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="newShiftName">Shift name</Label>
                    <Input
                      id="newShiftName"
                      placeholder="e.g. Day shift, Night shift, On-call"
                      value={newShift.name}
                      onChange={(e) => {
                        setShiftFormError(null)
                        setNewShift({ ...newShift, name: e.target.value })
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newShiftWorkers">How many people for this shift?</Label>
                    <Input
                      id="newShiftWorkers"
                      type="number"
                      min={1}
                      max={20}
                      value={newShift.workersRequired}
                      onChange={(e) => {
                        setShiftFormError(null)
                        setNewShift({ ...newShift, workersRequired: parseInt(e.target.value, 10) || 1 })
                      }}
                      className="max-w-[8rem]"
                    />
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Each time this shift appears on the schedule, this many people will be assigned (you can set different amounts per shift type).
                    </p>
                  </div>

                  <div className="flex items-start gap-3 rounded-lg border border-dashed border-gray-200 bg-white/80 px-3 py-3 dark:border-gray-600 dark:bg-gray-900/30">
                    <input
                      type="checkbox"
                      id="differentWeekdayHours"
                      checked={hasDifferentWeekdayHours}
                      onChange={(e) => setHasDifferentWeekdayHours(e.target.checked)}
                      className="mt-1 rounded"
                    />
                    <Label htmlFor="differentWeekdayHours" className="text-sm font-normal leading-snug cursor-pointer">
                      Different shift hours between weekdays?
                    </Label>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden />
                      <Label className="text-sm font-semibold text-gray-900 dark:text-white">
                        Time window for this shift type
                      </Label>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Choose the start and end time for each row. Use the day column so the same shift name can follow different hours (for example weekdays vs weekend).
                    </p>
                    <div className="space-y-3">
                      {shiftTimeSlots.map((slot) => (
                        <div
                          key={slot.id}
                          className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-950/50 sm:flex-row sm:flex-wrap sm:items-end"
                        >
                          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                            <div className="space-y-1.5">
                              <Label className="text-xs text-gray-500 dark:text-gray-400">Starts</Label>
                              <Input
                                type="time"
                                value={slot.startTime}
                                onChange={(e) => updateTimeSlot(slot.id, "startTime", e.target.value)}
                                className="w-full sm:max-w-[9rem]"
                                aria-label="Shift start time"
                              />
                            </div>
                            <span className="hidden pb-2 text-center text-gray-400 sm:block" aria-hidden>
                              →
                            </span>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-gray-500 dark:text-gray-400">Ends</Label>
                              <Input
                                type="time"
                                value={slot.endTime}
                                onChange={(e) => updateTimeSlot(slot.id, "endTime", e.target.value)}
                                className="w-full sm:max-w-[9rem]"
                                aria-label="Shift end time"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5 sm:min-w-[11rem]">
                            <Label className="text-xs text-gray-500 dark:text-gray-400">Applies to</Label>
                            <Select
                              value={slot.dayType}
                              onValueChange={(value) => updateTimeSlot(slot.id, "dayType", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Choose days" />
                              </SelectTrigger>
                              <SelectContent>
                                {dayOptions.map((day) => (
                                  <SelectItem key={day.value} value={day.value}>
                                    {day.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {shiftTimeSlots.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTimeSlot(slot.id)}
                              className="text-red-600 hover:text-red-700 dark:text-red-400 sm:shrink-0"
                              aria-label="Remove time slot"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>

                    {hasDifferentWeekdayHours && (
                      <Button type="button" onClick={addTimeSlot} variant="outline" size="sm" className="w-full">
                        <Plus className="h-4 w-4 mr-2" />
                        Add another time window
                      </Button>
                    )}
                  </div>

                  <Button type="button" onClick={addShift} className="w-full" variant="default">
                    <Plus className="h-4 w-4 mr-2" />
                    Add this shift type to the list
                  </Button>

                  {shiftFormError && (
                    <p
                      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
                      role="alert"
                    >
                      {shiftFormError}
                    </p>
                  )}

                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Tip:</span> Turn on &quot;Different shift hours between weekdays?&quot; to add a second time row for the same shift name (for example Mon–Fri hours vs weekend).
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div id="create-team-actions" className="scroll-mt-24 flex flex-col items-end gap-2">
            {shifts.length === 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Add at least one shift type in the section above to create your team.
              </p>
            )}
            <div className="flex justify-end space-x-4">
            <Link href="/dashboard">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button
              type="submit"
              disabled={
                isLoading ||
                subscriptionLimits?.canCreateTeam === false ||
                shifts.length === 0
              }
            >
              {isLoading ? "Creating Team..." : "Create Team"}
            </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
