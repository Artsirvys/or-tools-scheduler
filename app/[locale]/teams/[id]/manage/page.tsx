"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ArrowLeft, Trash2, Mail, Settings, Users, Calendar, X, ChevronDown } from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"

interface TeamMember {
  id: string
  user_id: string
  team_id: string
  experience_level: number
  joined_at: string
  user: {
    id: string
    email: string
    first_name: string
    last_name: string
    role: string
    department: string
  }
}

interface Team {
  id: string
  name: string
  description: string
  department: string
  host_id: string
  workers_per_shift: number
}

export default function ManageTeamPage() {
  const params = useParams()
  const teamId = params.id as string
  const { toast } = useToast()
  
  const [team, setTeam] = useState<Team | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [shifts, setShifts] = useState<Array<{
    id: string
    name: string
    start_time: string
    end_time: string
    day_of_week: number | null
  }>>([])
  const [pendingInvitations, setPendingInvitations] = useState<Array<{
    id: string
    email: string
    role: string
    department: string
    created_at: string
    expires_at: string
  }>>([])
  const [newMemberEmail, setNewMemberEmail] = useState("")
  const [isInviting, setIsInviting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRemoving, setIsRemoving] = useState<string | null>(null)
  const [isDeletingShift, setIsDeletingShift] = useState<string | null>(null)
  const [aiConstraints, setAiConstraints] = useState<{
    maxConsecutiveDays: number
    workersPerShift: number
    customConstraints: string
    maxDaysPerMonth: number
    [key: string]: number | string // Allow dynamic shift-specific worker keys
  }>({
            maxConsecutiveDays: 30,
    workersPerShift: 2,
    customConstraints: '',
    maxDaysPerMonth: 20
  })
  const [isUpdatingConstraints, setIsUpdatingConstraints] = useState(false)
  const [customConstraints, setCustomConstraints] = useState<Array<{
    id: string
    raw_text: string
    ai_translation?: Record<string, unknown>
    status: string
    created_at: string
  }>>([])
  const [newCustomConstraint, setNewCustomConstraint] = useState("")
  const [isAddingConstraint, setIsAddingConstraint] = useState(false)
  const [isDeletingConstraint, setIsDeletingConstraint] = useState<string | null>(null)

  // Template constraint sentences
  const constraintTemplates = [
    "Team member \"Name Surname\": monthly [type of shift] shift limit = X",
    "No more than X [shift type] in a row for the same worker",
    "No [shift type] assignment on the next day right after [shift type] for the same worker",
    "Vacation-adjusted monthly cap: up to 9 vacation days => -25% max monthly shifts; up to 16 => -50%; up to 28 => -75%"
  ]

  const handleTemplateSelect = (template: string) => {
    setNewCustomConstraint(template)
  }

  // Fetch team and members data
  useEffect(() => {
    fetchTeamData()
    fetchShifts()
    fetchAiConstraints()
    fetchPendingInvitations()
  }, [teamId])

  const fetchTeamData = async () => {
    try {
      setIsLoading(true)
      
      // Fetch team details
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single()

      if (teamError) throw teamError
      setTeam(teamData)

      // Fetch team members with user details
      const { data: membersData, error: membersError } = await supabase
        .from('team_members')
        .select(`
          *,
          user:users(
            id,
            email,
            first_name,
            last_name,
            role,
            department
          )
        `)
        .eq('team_id', teamId)

      if (membersError) throw membersError
      setTeamMembers(membersData || [])
    } catch (error) {
      console.error('Error fetching team data:', error)
      toast({
        title: "Error",
        description: "Failed to load team data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const fetchShifts = async () => {
    try {
      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts')
        .select('id, name, start_time, end_time, day_of_week')
        .eq('team_id', teamId)
        .order('start_time', { ascending: true })

      if (shiftsError) throw shiftsError
      setShifts(shiftsData || [])
    } catch (error) {
      console.error('Error fetching shifts:', error)
      toast({
        title: "Error",
        description: "Failed to load shifts",
        variant: "destructive",
      })
    }
  }

  const fetchPendingInvitations = async () => {
    try {
      const { data: invitations, error: invitationsError } = await supabase
        .from('team_invitations')
        .select('id, email, role, department, created_at, expires_at')
        .eq('team_id', teamId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (invitationsError) throw invitationsError
      setPendingInvitations(invitations || [])
    } catch (error) {
      console.error('Error fetching pending invitations:', error)
    }
  }

  const fetchAiConstraints = async () => {
    try {
      // Fetch basic constraints
      const basicResponse = await fetch(`/api/basic-constraints?teamId=${teamId}`)
      let basicConstraints: {
        max_consecutive_days?: number
        workers_per_shift?: number
        shift_specific_workers?: Record<string, number>
        max_days_per_month?: number
      } = {}
      
      if (basicResponse.ok) {
        basicConstraints = await basicResponse.json()
      } else {
        console.error('Failed to fetch basic constraints')
      }

      // Fetch custom constraints
      const customResponse = await fetch(`/api/custom-constraints?teamId=${teamId}`)
      let customConstraintsData: Array<{
        id: string
        raw_text: string
        ai_translation?: Record<string, unknown>
        status: string
        created_at: string
      }> = []
      
      if (customResponse.ok) {
        customConstraintsData = await customResponse.json()
      } else {
        console.error('Failed to fetch custom constraints')
      }
      
      // Set custom constraints separately
      setCustomConstraints(customConstraintsData)
      
      // Build dynamic constraints object from basic constraints
      const dynamicConstraints: {
        maxConsecutiveDays: number
        workersPerShift: number
        customConstraints: string
        maxDaysPerMonth: number
        [key: string]: number | string
      } = {
        maxConsecutiveDays: basicConstraints.max_consecutive_days || 3,
        workersPerShift: basicConstraints.workers_per_shift || 2,
        customConstraints: customConstraintsData.length > 0 ? customConstraintsData.map((c: { raw_text: string }) => c.raw_text).join('\n') : '',
        maxDaysPerMonth: basicConstraints.max_days_per_month || 20
      }
      
      // Add shift-specific constraints if they exist
      if (basicConstraints.shift_specific_workers && typeof basicConstraints.shift_specific_workers === 'object') {
        Object.entries(basicConstraints.shift_specific_workers as Record<string, number>).forEach(([shiftId, workers]) => {
          dynamicConstraints[`shift_${shiftId}_workers`] = workers
        })
      }
      
      setAiConstraints(dynamicConstraints)
    } catch (error) {
      console.error('Error fetching constraints:', error)
    }
  }

  const handleUpdateAiConstraints = async () => {
    setIsUpdatingConstraints(true)
    try {
      // Extract shift-specific constraints
      const shiftSpecificWorkers: { [key: string]: number } = {}
      Object.entries(aiConstraints).forEach(([key, value]) => {
        if (key.startsWith('shift_') && key.endsWith('_workers')) {
          const shiftId = key.replace('shift_', '').replace('_workers', '')
          shiftSpecificWorkers[shiftId] = value as number
        }
      })

      // Save basic constraints only
      const basicResponse = await fetch('/api/basic-constraints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId,
          maxConsecutiveDays: aiConstraints.maxConsecutiveDays,
          workersPerShift: aiConstraints.workersPerShift,
          shiftSpecificWorkers,
          maxDaysPerMonth: aiConstraints.maxDaysPerMonth
        })
      })

      if (!basicResponse.ok) {
        const error = await basicResponse.text()
        throw new Error(`Failed to save basic constraints: ${error}`)
      }

      toast({
        title: "Success",
        description: "Basic constraints updated successfully",
      })

      // Refresh the constraints to show updated data
      await fetchAiConstraints()
    } catch (error) {
      console.error('Error updating constraints:', error)
      toast({
        title: "Error",
        description: `Failed to update constraints: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      })
    } finally {
      setIsUpdatingConstraints(false)
    }
  }

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMemberEmail.trim()) return

    setIsInviting(true)
    try {
      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, account_type')
        .eq('email', newMemberEmail)
        .single()

      if (existingUser) {
        // User exists, check if they're already a member
        const { data: existingMember } = await supabase
          .from('team_members')
          .select('id')
          .eq('team_id', teamId)
          .eq('user_id', existingUser.id)
          .single()

        if (existingMember) {
          toast({
            title: "Already a member",
            description: "This person is already a member of this team",
            variant: "destructive",
          })
          return
        }

        // Add existing user to team
        const { error: addError } = await supabase
          .from('team_members')
          .insert({
            team_id: teamId,
            user_id: existingUser.id,
            experience_level: 1
          })

        if (addError) throw addError

        toast({
          title: "Member added",
          description: "User has been added to the team",
        })

        // Refresh team members
        fetchTeamData()
      } else {
        // User doesn't exist, send invitation
        console.log('Sending invitation to:', newMemberEmail)
        
        // Send invitation email using our custom API
        const emailResponse = await fetch('/api/invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: newMemberEmail,
            teamId: teamId,
            teamName: team?.name,
            department: team?.department,
            role: 'participant',
            invitedBy: team?.host_id
          })
        })

        if (!emailResponse.ok) {
          const errorData = await emailResponse.text()
          console.error('Custom invitation API error:', errorData)
          throw new Error(`Failed to send invitation email: ${emailResponse.status}`)
        }

        const emailResult = await emailResponse.json()
        console.log('Team invitation email sent successfully:', emailResult)

        toast({
          title: "Invitation sent",
          description: "Invitation email has been sent to the user",
        })

        // Clear the email input
        setNewMemberEmail("")
        
        // Refresh team data to show any new invitations
        fetchTeamData()
        fetchPendingInvitations()
      }
    } catch (error) {
      console.error('Error inviting member:', error)
      toast({
        title: "Error",
        description: "Failed to invite member",
        variant: "destructive",
      })
    } finally {
      setIsInviting(false)
    }
  }

  const handleCancelInvitation = async (invitationId: string, email: string) => {
    if (!confirm(`Are you sure you want to cancel the invitation to ${email}?`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('team_invitations')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', invitationId)

      if (error) throw error

      toast({
        title: "Invitation cancelled",
        description: `Invitation to ${email} has been cancelled`,
      })

      // Refresh pending invitations
      fetchPendingInvitations()
    } catch (error) {
      console.error('Error cancelling invitation:', error)
      toast({
        title: "Error",
        description: "Failed to cancel invitation",
        variant: "destructive",
      })
    }
  }

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from the team?`)) {
      return
    }

    setIsRemoving(memberId)
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('id', memberId)

      if (error) throw error

      toast({
        title: "Member removed",
        description: `${memberName} has been removed from the team`,
      })

      // Refresh team members
      fetchTeamData()
    } catch (error) {
      console.error('Error removing member:', error)
      toast({
        title: "Error",
        description: "Failed to remove member",
        variant: "destructive",
      })
    } finally {
      setIsRemoving(null)
    }
  }

  const handleDeleteShift = async (shiftId: string, shiftName: string) => {
    if (!confirm(`Are you sure you want to delete the shift type "${shiftName}"? This will also remove all related availability and schedule data.`)) {
      return
    }

    setIsDeletingShift(shiftId)
    try {
      const response = await fetch(`/api/shifts?shiftId=${shiftId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      toast({
        title: "Shift deleted",
        description: `Shift type "${shiftName}" has been deleted successfully`,
      })

      // Refresh shifts and AI constraints
      fetchShifts()
      fetchAiConstraints()
    } catch (error) {
      console.error('Error deleting shift:', error)
      toast({
        title: "Error",
        description: "Failed to delete shift type",
        variant: "destructive",
      })
    } finally {
      setIsDeletingShift(null)
    }
  }

  const handleAddCustomConstraint = async () => {
    if (!newCustomConstraint.trim()) return

    setIsAddingConstraint(true)
    try {
      const response = await fetch('/api/custom-constraints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId,
          rawText: newCustomConstraint.trim()
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      toast({
        title: "Constraint added",
        description: "Custom constraint has been added successfully",
      })

      // Clear the input and refresh constraints
      setNewCustomConstraint("")
      await fetchAiConstraints()
    } catch (error) {
      console.error('Error adding custom constraint:', error)
      toast({
        title: "Error",
        description: "Failed to add custom constraint",
        variant: "destructive",
      })
    } finally {
      setIsAddingConstraint(false)
    }
  }

  const handleDeleteCustomConstraint = async (constraintId: string, constraintText: string) => {
    if (!confirm(`Are you sure you want to delete this constraint: "${constraintText}"?`)) {
      return
    }

    setIsDeletingConstraint(constraintId)
    try {
      // Get the current session to include auth token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }

      const response = await fetch(`/api/custom-constraints/${constraintId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      toast({
        title: "Constraint deleted",
        description: "Custom constraint has been deleted successfully",
      })

      // Refresh constraints to update both individual constraints and concatenated string
      await fetchAiConstraints()
    } catch (error) {
      console.error('Error deleting custom constraint:', error)
      toast({
        title: "Error",
        description: "Failed to delete custom constraint",
        variant: "destructive",
      })
    } finally {
      setIsDeletingConstraint(null)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Loading team data...</p>
        </div>
      </div>
    )
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-300">Team not found</p>
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
                Manage {team.name}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Team Members */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Team Members</span>
                </CardTitle>
                <CardDescription>Manage your team members</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div>
                          <p className="font-medium">{member.user.first_name} {member.user.last_name}</p>
                          <p className="text-sm text-gray-500">{member.user.email}</p>
                          <div className="flex items-center space-x-2 mt-1">
                            <Badge variant="outline">{member.user.role}</Badge>
                            <Badge variant="secondary">{member.user.department}</Badge>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMember(member.id, `${member.user.first_name} ${member.user.last_name}`)}
                        disabled={isRemoving === member.id}
                      >
                        {isRemoving === member.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                  {teamMembers.length === 0 && (
                    <p className="text-center text-gray-500 py-4">No team members yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pending Invitations */}
            {pendingInvitations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Mail className="h-5 w-5" />
                    <span>Pending Invitations</span>
                  </CardTitle>
                  <CardDescription>People who have been invited but have not joined yet</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {pendingInvitations.map((invitation) => (
                      <div key={invitation.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                        <div className="flex items-center space-x-3">
                          <div>
                            <p className="font-medium">{invitation.email}</p>
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge variant="outline">{invitation.role}</Badge>
                              {invitation.department && (
                                <Badge variant="secondary">{invitation.department}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              Invited {new Date(invitation.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelInvitation(invitation.id, invitation.email)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Logic Constraints */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <span>Scheduling Constraints</span>
                </CardTitle>
                <CardDescription>Update constraints and preferences for AI-powered scheduling</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxConsecutiveDays">Max Consecutive Days</Label>
                    <Input 
                      id="maxConsecutiveDays" 
                      type="number" 
                      value={aiConstraints.maxConsecutiveDays}
                      onChange={(e) => setAiConstraints(prev => ({ ...prev, maxConsecutiveDays: parseInt(e.target.value) || 30 }))}
                      min="1" 
                      max="30"  
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxDaysPerMonth">Max Days Per Month</Label>
                    <Input 
                      id="maxDaysPerMonth" 
                      type="number" 
                      value={aiConstraints.maxDaysPerMonth}
                      onChange={(e) => setAiConstraints(prev => ({ ...prev, maxDaysPerMonth: parseInt(e.target.value) || 20 }))}
                      min="1" 
                      max="31"  
                    />
                  </div>
                </div>

                {/* Staff per Shift Configuration */}
                <div className="space-y-3">
                  <Label>Staff Required per Shift Type</Label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <span className="font-medium">Default Workers Per Shift</span>
                        <p className="text-xs text-gray-500 mt-1">General setting for all shifts</p>
                      </div>
                      <Input 
                        type="number" 
                        value={aiConstraints.workersPerShift}
                        onChange={(e) => setAiConstraints(prev => ({ ...prev, workersPerShift: parseInt(e.target.value) || 2 }))}
                        min="1" 
                        max="10" 
                        className="w-20" 
                      />
                    </div>
                    
                    {/* Shift-specific worker requirements */}
                    {shifts.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">Shift Types & Requirements</Label>
                          <p className="text-xs text-gray-500">Click the trash icon to delete a shift type</p>
                        </div>
                        <div className="space-y-2">
                          {shifts.map((shift, index) => {
                            const shiftKey = `shift_${shift.id}_workers`
                            const currentValue = aiConstraints[shiftKey] || aiConstraints.workersPerShift
                            
                            return (
                              <div key={shift.id} className={`flex items-center justify-between p-3 border rounded-lg ${index % 3 === 0 ? 'bg-blue-50' : index % 3 === 1 ? 'bg-purple-50' : 'bg-green-50'}`}>
                                <div className="flex-1">
                                  <span className="font-medium">{shift.name}</span>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {shift.start_time} - {shift.end_time}
                                    {shift.day_of_week !== null && (
                                      <span className="ml-2">
                                        ({['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][shift.day_of_week]})
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Input 
                                    type="number" 
                                    value={currentValue}
                                    onChange={(e) => setAiConstraints(prev => ({ 
                                      ...prev, 
                                      [shiftKey]: parseInt(e.target.value) || aiConstraints.workersPerShift 
                                    }))}
                                    min="1" 
                                    max="10" 
                                    className="w-20" 
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteShift(shift.id, shift.name)}
                                    disabled={isDeletingShift === shift.id}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    {isDeletingShift === shift.id ? (
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          Set specific worker requirements for each shift type. Leave empty to use the default value.
                        </p>
                      </div>
                    )}
                    {shifts.length === 0 && (
                      <div className="text-center py-4 border rounded-lg bg-gray-50">
                        <p className="text-sm text-gray-500">No shift types defined yet</p>
                        <p className="text-xs text-gray-400 mt-1">Shift types will appear here once created</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Custom Constraints */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Custom Constraints</Label>
                    <p className="text-xs text-gray-500">Click dropdown for templates • Click trash to delete</p>
                  </div>
                  
                  {/* Add new constraint input */}
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 relative">
                      <Input
                        placeholder="Enter a new constraint..."
                        value={newCustomConstraint}
                        onChange={(e) => setNewCustomConstraint(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddCustomConstraint()
                          }
                        }}
                        className="pr-10"
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-gray-100"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-80">
                          <div className="p-2">
                            <p className="text-xs font-medium text-gray-500 mb-2">Template Constraints</p>
                            <p className="text-xs text-gray-400 mb-3">Click to insert into the input field</p>
                            {constraintTemplates.map((template, index) => (
                              <DropdownMenuItem
                                key={index}
                                onClick={() => handleTemplateSelect(template)}
                                className="cursor-pointer p-3 text-sm hover:bg-blue-50 rounded-md"
                              >
                                <div className="whitespace-normal">
                                  <span className="font-medium text-blue-600">Template {index + 1}:</span>
                                  <br />
                                  <span className="text-gray-700">{template}</span>
                                </div>
                              </DropdownMenuItem>
                            ))}
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Button
                      onClick={handleAddCustomConstraint}
                      disabled={isAddingConstraint || !newCustomConstraint.trim()}
                      size="sm"
                    >
                      {isAddingConstraint ? "Adding..." : "Add"}
                    </Button>
                  </div>

                  {/* Existing constraints as tabs */}
                  <div className="space-y-2">
                    {customConstraints.map((constraint, index) => (
                      <div key={constraint.id} className={`flex items-center justify-between p-3 border rounded-lg ${index % 3 === 0 ? 'bg-blue-50' : index % 3 === 1 ? 'bg-purple-50' : 'bg-green-50'}`}>
                        <div className="flex-1">
                          <span className="font-medium">{constraint.raw_text}</span>
                          <p className="text-xs text-gray-500 mt-1">
                            Status: {constraint.status}
                            {constraint.created_at && (
                              <span className="ml-2">
                                • Added {new Date(constraint.created_at).toLocaleDateString()}
                              </span>
                            )}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCustomConstraint(constraint.id, constraint.raw_text)}
                          disabled={isDeletingConstraint === constraint.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {isDeletingConstraint === constraint.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                  
                  {customConstraints.length === 0 && (
                    <div className="text-center py-4 border rounded-lg bg-gray-50">
                      <p className="text-sm text-gray-500">No custom constraints yet</p>
                      <p className="text-xs text-gray-400 mt-1">Add constraints above to customize AI scheduling behavior</p>
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-500">
                    Each constraint will be processed by AI and used to guide the scheduling algorithm.
                  </p>
                </div>

                <Button 
                  className="w-full" 
                  onClick={handleUpdateAiConstraints}
                  disabled={isUpdatingConstraints}
                >
                  {isUpdatingConstraints ? "Updating..." : "Update Constraints"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Invite New Member */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Mail className="h-5 w-5" />
                  <span>Invite Member</span>
                </CardTitle>
                <CardDescription>Send an invitation to join this team</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleInviteMember} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="memberEmail">Email Address</Label>
                    <Input
                      id="memberEmail"
                      type="email"
                      placeholder="doctor@hospital.com"
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isInviting}>
                    {isInviting ? "Sending..." : "Send Invitation"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link href={`/teams/${teamId}/availability`}>
                  <Button variant="outline" className="w-full justify-start">
                    <Calendar className="h-4 w-4 mr-2" />
                    View Team Availability
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Team Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Team Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm">Total Members</span>
                  <span className="font-medium">{teamMembers.length}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
