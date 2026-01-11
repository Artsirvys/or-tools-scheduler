"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Clock, Mail } from "lucide-react"
import Link from "next/link"

export default function SetDeadlinePage() {
  const [deadlineData, setDeadlineData] = useState({
    date: "",
    time: "23:59",
    message: "",
  })
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    // TODO: Implement deadline setting
    console.log("Setting deadline:", deadlineData)

    setTimeout(() => {
      setIsLoading(false)
      alert("Deadline set successfully! Team members will be notified.")
    }, 1000)
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
              <Clock className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">Set Availability Deadline</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Emergency Department - Availability Deadline</CardTitle>
            <CardDescription>
              Set when team members must submit their availability preferences for the upcoming schedule
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="deadlineDate">Deadline Date</Label>
                  <Input
                    id="deadlineDate"
                    type="date"
                    value={deadlineData.date}
                    onChange={(e) => setDeadlineData({ ...deadlineData, date: e.target.value })}
                    min={new Date().toISOString().split("T")[0]}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deadlineTime">Deadline Time</Label>
                  <Input
                    id="deadlineTime"
                    type="time"
                    value={deadlineData.time}
                    onChange={(e) => setDeadlineData({ ...deadlineData, time: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message to Team (Optional)</Label>
                <Textarea
                  id="message"
                  placeholder="Please submit your availability by the deadline so we can generate the optimal schedule..."
                  value={deadlineData.message}
                  onChange={(e) => setDeadlineData({ ...deadlineData, message: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <div className="flex items-start space-x-3">
                  <Mail className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-900 dark:text-blue-100">Automatic Notifications</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      All team members will receive an email notification about this deadline. Reminders will be sent 24
                      hours before the deadline.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-4">
                <Link href="/dashboard">
                  <Button variant="outline">Cancel</Button>
                </Link>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Setting Deadline..." : "Set Deadline & Notify Team"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
