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
import { Calendar, ArrowLeft, Plus, X } from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

export default function CreateTeamPage() {
  const [teamData, setTeamData] = useState({
    name: "",
    description: "",
    department: "",
    workersPerShift: 2,
  })

  const [shifts, setShifts] = useState<Array<{
    id: number;
    name: string;
    startTime: string;
    endTime: string;
    dayOfWeek: number | null;
    workersRequired: number;
    daySpecificTimes?: Record<string, { start_time: string; end_time: string }>;
  }>>([
    { id: 1, name: "Day Shift", startTime: "08:00", endTime: "20:00", dayOfWeek: null, workersRequired: 2 },
    { id: 2, name: "Night Shift", startTime: "20:00", endTime: "08:00", dayOfWeek: null, workersRequired: 2 },
  ])

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
    { id: 1, startTime: "08:00", endTime: "16:00", dayType: "all" }
  ])

  const [isLoading, setIsLoading] = useState(false)
  const [subscriptionLimits, setSubscriptionLimits] = useState<{
    canCreateTeam: boolean;
    planName: string;
    maxTeams: number;
    maxMembersPerTeam: number;
  } | null>(null)
  const [limitCheckLoading, setLimitCheckLoading] = useState(true)

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

  const dayOptions = [
    { value: null, label: "All Days" },
    { value: "mon-fri", label: "Monday-Friday" },
    { value: "weekend", label: "Weekend (Sat-Sun)" },
    { value: 0, label: "Sunday" },
    { value: 1, label: "Monday" },
    { value: 2, label: "Tuesday" },
    { value: 3, label: "Wednesday" },
    { value: 4, label: "Thursday" },
    { value: 5, label: "Friday" },
    { value: 6, label: "Saturday" },
  ]

  const getDayLabel = (dayOfWeek: number | null) => {
    if (dayOfWeek === null) return "All Days"
    return dayOptions.find(day => day.value === dayOfWeek)?.label || "Unknown"
  }

  const addTimeSlot = () => {
    const newSlot = {
      id: Date.now(),
      startTime: "08:00",
      endTime: "16:00",
      dayType: "all"
    }
    setShiftTimeSlots([...shiftTimeSlots, newSlot])
  }

  const removeTimeSlot = (id: number) => {
    if (shiftTimeSlots.length > 1) {
      setShiftTimeSlots(shiftTimeSlots.filter(slot => slot.id !== id))
    }
  }

  const updateTimeSlot = (id: number, field: string, value: string) => {
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

      console.log("Creating team:", { teamData, shifts })

      // Create the team
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert([{
          name: teamData.name,
          department: teamData.department,
          description: teamData.description,
          workers_per_shift: teamData.workersPerShift,
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
            workers_per_shift: teamData.workersPerShift,
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
    if (newShift.name && shiftTimeSlots.length > 0) {
      // Validate that all time slots have times
      const validSlots = shiftTimeSlots.filter(slot => slot.startTime && slot.endTime)
      
      if (validSlots.length === 0) {
        alert("Please add at least one time slot with start and end times")
        return
      }

      // Create day-specific times from the time slots
      const daySpecificTimes: Record<string, { start_time: string; end_time: string }> = {}
      
      validSlots.forEach(slot => {
        if (slot.dayType === "all") {
          daySpecificTimes["default"] = {
            start_time: slot.startTime,
            end_time: slot.endTime
          }
        } else if (slot.dayType === "mon-fri") {
          // Set Monday-Friday (days 1-5)
          for (let i = 1; i <= 5; i++) {
            daySpecificTimes[i.toString()] = {
              start_time: slot.startTime,
              end_time: slot.endTime
            }
          }
        } else if (slot.dayType === "weekend") {
          // Set Weekend (days 0 and 6)
          daySpecificTimes["0"] = {
            start_time: slot.startTime,
            end_time: slot.endTime
          }
          daySpecificTimes["6"] = {
            start_time: slot.startTime,
            end_time: slot.endTime
          }
        } else {
          // Set specific day
          daySpecificTimes[slot.dayType] = {
            start_time: slot.startTime,
            end_time: slot.endTime
          }
        }
      })

      const shiftToAdd = {
        id: Date.now(),
        name: newShift.name,
        startTime: validSlots[0].startTime, // Use first slot as base
        endTime: validSlots[0].endTime,
        dayOfWeek: null,
        workersRequired: newShift.workersRequired,
        daySpecificTimes: daySpecificTimes
      }
      
      setShifts([...shifts, shiftToAdd])
      setNewShift({ name: "", startTime: "", endTime: "", dayOfWeek: null, workersRequired: 2, daySpecificTimes: {} })
      setShiftTimeSlots([{ id: 1, startTime: "08:00", endTime: "16:00", dayType: "all" }])
      setHasDifferentWeekdayHours(false)
    }
  }

  const removeShift = (id: number) => {
    setShifts(shifts.filter((shift) => shift.id !== id))
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
              <Calendar className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">Create New Team</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
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
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Set up the basic details for your medical team</CardDescription>
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
                <Label htmlFor="department">Department</Label>
                <Select onValueChange={(value) => setTeamData({ ...teamData, department: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="emergency">Emergency Medicine</SelectItem>
                    <SelectItem value="icu">Intensive Care Unit</SelectItem>
                    <SelectItem value="surgery">Surgery</SelectItem>
                    <SelectItem value="pediatrics">Pediatrics</SelectItem>
                    <SelectItem value="cardiology">Cardiology</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
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

              <div className="space-y-2">
                <Label htmlFor="workersPerShift">Workers Required Per Shift</Label>
                <Input
                  id="workersPerShift"
                  type="number"
                  min="1"
                  max="20"
                  value={teamData.workersPerShift}
                  onChange={(e) => setTeamData({ ...teamData, workersPerShift: Number.parseInt(e.target.value) })}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Shift Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Shift Configuration</CardTitle>
              <CardDescription>Define the working shifts for your team. Create one shift type with multiple time slots for different days - they will automatically consolidate into one shift type in the schedule.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Existing Shifts */}
              <div className="space-y-3">
                <Label>Current Shifts</Label>
                {shifts.map((shift) => (
                  <div key={shift.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <Badge variant="outline">{shift.name}</Badge>
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {shift.startTime} - {shift.endTime}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {shift.daySpecificTimes && Object.keys(shift.daySpecificTimes).length > 0 
                          ? `${Object.keys(shift.daySpecificTimes).length} day variations`
                          : getDayLabel(shift.dayOfWeek)
                        }
                      </Badge>
                      <div className="flex items-center space-x-2">
                        <Label className="text-xs text-gray-500">Workers:</Label>
                        <Input
                          type="number"
                          min="1"
                          max="20"
                          value={shift.workersRequired}
                          onChange={(e) => {
                            const newShifts = shifts.map(s => 
                              s.id === shift.id 
                                ? { ...s, workersRequired: parseInt(e.target.value) || 1 }
                                : s
                            )
                            setShifts(newShifts)
                          }}
                          className="w-16 h-8 text-xs"
                        />
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeShift(shift.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Add New Shift */}
              <div className="border-t pt-4">
                <Label className="text-sm font-medium mb-3 block">Add New Shift</Label>
                
                {/* Shift Name and Workers */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <Input
                    placeholder="Shift name"
                    value={newShift.name}
                    onChange={(e) => setNewShift({ ...newShift, name: e.target.value })}
                  />
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    placeholder="Workers"
                    value={newShift.workersRequired}
                    onChange={(e) => setNewShift({ ...newShift, workersRequired: parseInt(e.target.value) || 1 })}
                    className="w-20"
                  />
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="differentWeekdayHours"
                      checked={hasDifferentWeekdayHours}
                      onChange={(e) => setHasDifferentWeekdayHours(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="differentWeekdayHours" className="text-sm">
                      Different shift hours between weekdays?
                    </Label>
                  </div>
                </div>

                {/* Time Slots */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Time Slots</Label>
                  {shiftTimeSlots.map((slot) => (
                    <div key={slot.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                      <Input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => updateTimeSlot(slot.id, "startTime", e.target.value)}
                        className="w-32"
                      />
                      <span>-</span>
                      <Input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => updateTimeSlot(slot.id, "endTime", e.target.value)}
                        className="w-32"
                      />
                      <Select 
                        value={slot.dayType} 
                        onValueChange={(value) => updateTimeSlot(slot.id, "dayType", value)}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {dayOptions.map((day) => (
                            <SelectItem key={day.value?.toString() || "null"} value={day.value?.toString() || "null"}>
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {shiftTimeSlots.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTimeSlot(slot.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  
                  {hasDifferentWeekdayHours && (
                    <Button
                      type="button"
                      onClick={addTimeSlot}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Another Time Slot
                    </Button>
                  )}
                </div>

                <Button type="button" onClick={addShift} variant="outline" className="w-full mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Shift
                </Button>

                <p className="text-xs text-gray-500 mt-2">
                  <strong>Tip:</strong> Check &quot;Different shift hours between weekdays?&quot; to add multiple time slots for the same shift type.
                  <br />
                  Use &quot;Monday-Friday&quot; and &quot;Weekend&quot; options for common patterns, or select specific days for custom hours.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* AI Logic Constraints */}
          <Card>
            <CardHeader>
              <CardTitle>AI Scheduling Logic</CardTitle>
              <CardDescription>Set constraints and preferences for AI-powered schedule generation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="maxConsecutiveDays">Maximum Consecutive Days</Label>
                <Input id="maxConsecutiveDays" type="number" min="1" max="30" defaultValue="30" placeholder="30" />
                                  <p className="text-xs text-gray-500">Maximum number of consecutive days a person can work (relaxed for small teams)</p>
              </div>



              <div className="space-y-2">
                <Label htmlFor="experienceWeight">Experience Level Weight</Label>
                <Select defaultValue="medium">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low - Experience matters less</SelectItem>
                    <SelectItem value="medium">Medium - Balanced consideration</SelectItem>
                    <SelectItem value="high">High - Prioritize experienced staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customConstraints">Custom Constraints (Optional)</Label>
                <Textarea
                  id="customConstraints"
                  placeholder="e.g., 'Always have at least one senior doctor on night shifts', 'Avoid scheduling the same person for consecutive weekends'..."
                  rows={3}
                />
                <p className="text-xs text-gray-500">Describe any specific rules or preferences for scheduling</p>
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end space-x-4">
            <Link href="/dashboard">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button 
              type="submit" 
              disabled={isLoading || (subscriptionLimits?.canCreateTeam === false)}
            >
              {isLoading ? "Creating Team..." : "Create Team"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
