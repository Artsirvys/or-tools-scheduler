"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BarChart3, TrendingUp, Users, Clock, AlertTriangle, Download } from "lucide-react"

export function ReportingDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState("month")
  const [selectedTeam, setSelectedTeam] = useState("all")

  const [workHourStats] = useState({
    totalHours: 1240,
    averagePerPerson: 31,
    overtime: 48,
    undertime: 12,
  })

  const [fairnessMetrics] = useState([
    { name: "Dr. Sarah Johnson", totalHours: 35, nightShifts: 4, weekendShifts: 2, score: 92 },
    { name: "Nurse Mike Chen", totalHours: 32, nightShifts: 3, weekendShifts: 3, score: 88 },
    { name: "Dr. Emily Davis", totalHours: 28, nightShifts: 2, weekendShifts: 1, score: 85 },
    { name: "Nurse Lisa Wong", totalHours: 33, nightShifts: 4, weekendShifts: 2, score: 90 },
    { name: "Dr. James Wilson", totalHours: 36, nightShifts: 3, weekendShifts: 3, score: 89 },
    { name: "Nurse Anna Smith", totalHours: 30, nightShifts: 2, weekendShifts: 2, score: 87 },
  ])

  const [complianceIssues] = useState([
    {
      id: 1,
      type: "Consecutive Days",
      description: "Dr. Johnson scheduled 4 consecutive days (limit: 3)",
      severity: "medium",
      date: "2024-03-15",
    },
    {
      id: 2,
      type: "Rest Period",
      description: "Nurse Chen has only 10 hours rest between shifts (minimum: 12)",
      severity: "high",
      date: "2024-03-18",
    },
    {
      id: 3,
      type: "Weekly Hours",
      description: "Dr. Wilson approaching 60-hour weekly limit",
      severity: "low",
      date: "2024-03-20",
    },
  ])

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "bg-red-100 text-red-800"
      case "medium":
        return "bg-yellow-100 text-yellow-800"
      case "low":
        return "bg-blue-100 text-blue-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600"
    if (score >= 80) return "text-yellow-600"
    return "text-red-600"
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2">Time Period</label>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2">Team</label>
          <Select value={selectedTeam} onValueChange={setSelectedTeam}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              <SelectItem value="emergency">Emergency Department</SelectItem>
              <SelectItem value="icu">ICU Night Team</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Work Hours Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workHourStats.totalHours}</div>
            <p className="text-xs text-muted-foreground">+12% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg per Person</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workHourStats.averagePerPerson}h</div>
            <p className="text-xs text-muted-foreground">Within target range</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overtime Hours</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{workHourStats.overtime}</div>
            <p className="text-xs text-muted-foreground">-5% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{complianceIssues.length}</div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fairness Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5" />
              <span>Fairness Metrics</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Mobile Layout */}
              <div className="sm:hidden space-y-3">
                {fairnessMetrics.map((member, index) => (
                  <div key={index} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-sm">{member.name}</h4>
                      <Badge className={getScoreColor(member.score)}>{member.score}%</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                      <div>
                        <div className="font-medium">{member.totalHours}h</div>
                        <div>Total</div>
                      </div>
                      <div>
                        <div className="font-medium">{member.nightShifts}</div>
                        <div>Nights</div>
                      </div>
                      <div>
                        <div className="font-medium">{member.weekendShifts}</div>
                        <div>Weekends</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Layout */}
              <div className="hidden sm:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Team Member</th>
                        <th className="text-center py-2">Total Hours</th>
                        <th className="text-center py-2">Night Shifts</th>
                        <th className="text-center py-2">Weekends</th>
                        <th className="text-center py-2">Fairness Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fairnessMetrics.map((member, index) => (
                        <tr key={index} className="border-b">
                          <td className="py-2 font-medium">{member.name}</td>
                          <td className="text-center py-2">{member.totalHours}</td>
                          <td className="text-center py-2">{member.nightShifts}</td>
                          <td className="text-center py-2">{member.weekendShifts}</td>
                          <td className="text-center py-2">
                            <span className={`font-medium ${getScoreColor(member.score)}`}>{member.score}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Compliance Issues */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5" />
              <span>Compliance Issues</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {complianceIssues.map((issue) => (
                <div key={issue.id} className="p-3 border rounded-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {issue.type}
                        </Badge>
                        <Badge className={`text-xs ${getSeverityColor(issue.severity)}`}>{issue.severity}</Badge>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{issue.description}</p>
                      <p className="text-xs text-gray-500 mt-1">{issue.date}</p>
                    </div>
                    <Button size="sm" variant="outline" className="self-start sm:self-center bg-transparent">
                      Resolve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
