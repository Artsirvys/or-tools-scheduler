"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface GenerateScheduleFormProps {
  teamId: string
  teamName: string
  onScheduleGenerated?: () => void
}

interface GeneratedSchedule {
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
    customConstraints: string
    maxDaysPerMonth: number
  }
}

export default function GenerateScheduleForm({ teamId, teamName, onScheduleGenerated }: GenerateScheduleFormProps) {
  // Set default to current month
  const getCurrentMonth = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  }

  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth())
  const [generatedSchedule, setGeneratedSchedule] = useState<GeneratedSchedule | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user) {
        toast.error("Error fetching user")
        return
      }
      setCurrentUserId(data.user.id)
    }
    fetchUser()
  }, [])

  const handleGenerateSchedule = async () => {
    if (!currentUserId) {
      toast.error("No user logged in.")
      return
    }

    const [yearStr, monthStr] = selectedMonth.split("-")
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10)

    console.log("Starting schedule generation:", { teamId, month, year, hostId: currentUserId });

    setIsLoading(true)
    try {
      // Call the simplified schedule generation API
      const response = await fetch('/api/generateSchedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId,
          month,
          year,
          hostId: currentUserId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate schedule');
      }

      console.log("Schedule generated successfully:", result);
      
      // Create a GeneratedSchedule object for compatibility
      const schedule: GeneratedSchedule = {
        teamId,
        month,
        year,
        assignments: result.assignments?.map((a: Record<string, unknown>) => ({
          date: a.date as string,
          shiftId: a.shift_id as string,
          userId: a.user_id as string,
          confidence: 1.0, // OR-Tools doesn't provide confidence scores
        })) || [],
        generatedAt: result.schedule?.generated_at || new Date().toISOString(),
        status: result.schedule?.status || 'active',
        constraints: {
          maxConsecutiveDays: 30, // Default values since we're not using the old constraint system
          workersPerShift: 2,
          customConstraints: '',
          maxDaysPerMonth: 20,
        },
      };

      setGeneratedSchedule(schedule)
      toast.success(`Schedule generated successfully for ${teamName}`)
      
      // Call the callback to refresh the parent component
      if (onScheduleGenerated) {
        onScheduleGenerated()
      }
    } catch (error) {
      console.error('Error generating schedule:', error)
      toast.error(error instanceof Error ? error.message : "Failed to generate schedule")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <label htmlFor="month" className="block text-sm font-medium text-gray-700 mb-1">
            Select Month
          </label>
          <input
            type="month"
            id="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <Button
          onClick={handleGenerateSchedule}
          disabled={isLoading}
          className="mt-6"
        >
          {isLoading ? "Generating..." : "Generate Schedule"}
        </Button>
      </div>

      {generatedSchedule && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <h3 className="text-sm font-medium text-green-800">Schedule Generated Successfully</h3>
          <p className="text-sm text-green-600 mt-1">
            Generated {generatedSchedule.assignments.length} assignments for {teamName} in {selectedMonth}
          </p>
        </div>
      )}
    </div>
  )
}
