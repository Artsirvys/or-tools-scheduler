"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { History, Search, Download, User, Calendar, Settings, AlertCircle } from "lucide-react"

interface AuditEntry {
  id: number
  timestamp: string
  user: string
  action: string
  target: string
  details: string
  type: "schedule" | "user" | "team" | "system"
  severity: "low" | "medium" | "high"
}

export function AuditTrail() {
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [filterUser, setFilterUser] = useState("all")

  const [auditEntries] = useState<AuditEntry[]>([
    {
      id: 1,
      timestamp: "2024-03-20 14:30:15",
      user: "Dr. Sarah Johnson",
      action: "Schedule Generated",
      target: "Emergency Department - March 2024",
      details: "AI schedule generated with 95% optimization score",
      type: "schedule",
      severity: "low",
    },
    {
      id: 2,
      timestamp: "2024-03-20 13:45:22",
      user: "Nurse Mike Chen",
      action: "Shift Change Requested",
      target: "March 22, Day Shift",
      details: "Requested to swap with March 25, Night Shift",
      type: "schedule",
      severity: "medium",
    },
    {
      id: 3,
      timestamp: "2024-03-20 12:15:08",
      user: "Dr. Emily Davis",
      action: "Availability Updated",
      target: "March 2024 Availability",
      details: "Marked unavailable for March 18-20 (Conference)",
      type: "user",
      severity: "low",
    },
    {
      id: 4,
      timestamp: "2024-03-20 11:20:33",
      user: "Host Admin",
      action: "Team Member Added",
      target: "Emergency Department",
      details: "Added Dr. James Wilson to team",
      type: "team",
      severity: "medium",
    },
    {
      id: 5,
      timestamp: "2024-03-20 10:45:17",
      user: "System",
      action: "Deadline Reminder Sent",
      target: "All Emergency Department Members",
      details: "24-hour reminder for availability deadline",
      type: "system",
      severity: "low",
    },
    {
      id: 6,
      timestamp: "2024-03-19 16:30:45",
      user: "Dr. Sarah Johnson",
      action: "Schedule Constraints Updated",
      target: "Emergency Department Settings",
      details: "Changed max consecutive days from 4 to 3",
      type: "team",
      severity: "high",
    },
    {
      id: 7,
      timestamp: "2024-03-19 15:22:11",
      user: "Nurse Lisa Wong",
      action: "Profile Updated",
      target: "Personal Profile",
      details: "Updated experience level from 3 to 4 years",
      type: "user",
      severity: "low",
    },
    {
      id: 8,
      timestamp: "2024-03-19 14:15:33",
      user: "Dr. Sarah Johnson",
      action: "Schedule Published",
      target: "Emergency Department - March 2024",
      details: "Schedule published and notifications sent to all team members",
      type: "schedule",
      severity: "medium",
    },
  ])

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "schedule":
        return <Calendar className="h-4 w-4" />
      case "user":
        return <User className="h-4 w-4" />
      case "team":
        return <Settings className="h-4 w-4" />
      case "system":
        return <AlertCircle className="h-4 w-4" />
      default:
        return <History className="h-4 w-4" />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "schedule":
        return "bg-blue-100 text-blue-800"
      case "user":
        return "bg-green-100 text-green-800"
      case "team":
        return "bg-purple-100 text-purple-800"
      case "system":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "bg-red-100 text-red-800"
      case "medium":
        return "bg-yellow-100 text-yellow-800"
      case "low":
        return "bg-green-100 text-green-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const filteredEntries = auditEntries.filter((entry) => {
    const matchesSearch =
      entry.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.target.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.details.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesType = filterType === "all" || entry.type === filterType
    const matchesUser = filterUser === "all" || entry.user === filterUser

    return matchesSearch && matchesType && matchesUser
  })

  const uniqueUsers = [...new Set(auditEntries.map((entry) => entry.user))]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <History className="h-5 w-5" />
          <span>Audit Trail</span>
          <Badge variant="secondary" className="ml-auto">
            {filteredEntries.length} entries
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search audit logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="schedule">Schedule</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="team">Team</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {uniqueUsers.map((user) => (
                  <SelectItem key={user} value={user}>
                    {user}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </div>

        {/* Audit Entries */}
        <div className="space-y-3">
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              {/* Mobile Layout */}
              <div className="sm:hidden space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Badge className={`text-xs ${getTypeColor(entry.type)}`}>
                      {getTypeIcon(entry.type)}
                      <span className="ml-1 capitalize">{entry.type}</span>
                    </Badge>
                    <Badge className={`text-xs ${getSeverityColor(entry.severity)}`}>{entry.severity}</Badge>
                  </div>
                  <span className="text-xs text-gray-500">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div>
                  <h4 className="font-medium text-sm">{entry.action}</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-300">{entry.target}</p>
                </div>
                <p className="text-xs text-gray-500">{entry.details}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>By: {entry.user}</span>
                  <span>{new Date(entry.timestamp).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Desktop Layout */}
              <div className="hidden sm:block">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <Badge className={`text-xs ${getTypeColor(entry.type)}`}>
                        {getTypeIcon(entry.type)}
                        <span className="ml-1 capitalize">{entry.type}</span>
                      </Badge>
                      <Badge className={`text-xs ${getSeverityColor(entry.severity)}`}>{entry.severity}</Badge>
                      <h4 className="font-medium">{entry.action}</h4>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">{entry.target}</p>
                    <p className="text-xs text-gray-500">{entry.details}</p>
                  </div>
                  <div className="text-right text-xs text-gray-500 ml-4">
                    <div className="font-medium">{entry.user}</div>
                    <div>{new Date(entry.timestamp).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredEntries.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No audit entries found matching your filters
          </div>
        )}
      </CardContent>
    </Card>
  )
}
