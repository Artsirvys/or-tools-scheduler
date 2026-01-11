"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Users, Search, Mail } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"

interface Participant {
  id: string
  name: string
  email: string
  role: string
  department: string
  experience: number
  status: "active" | "inactive"
  phone?: string
  teamId: string
}

interface Team {
  id: string
  name: string
  department: string
}

interface ParticipantListProps {
  isHost?: boolean
  teamId?: string | null
}

export function ParticipantList({ isHost = false, teamId = null }: ParticipantListProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTeam, setSelectedTeam] = useState(teamId || "all")
  const [teams, setTeams] = useState<Team[]>([])
  const [allParticipants, setAllParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        if (isHost) {
          // Fetch teams created by this host
          const { data: teamsData, error: teamsError } = await supabase
            .from("teams")
            .select("id, name, department")
            .eq("host_id", user.id)

          if (teamsError) {
            console.error("Error fetching teams:", teamsError)
            return
          }

          setTeams(teamsData || [])

          // Fetch team members for all teams
          const { data: membersData, error: membersError } = await supabase
            .from("team_members")
            .select("user_id, team_id")
            .in("team_id", teamsData?.map(t => t.id) || [])

          if (membersError) {
            console.error("Error fetching team members:", membersError)
            return
          }

          // Now fetch user details for each team member
          if (membersData && membersData.length > 0) {
            console.log("Team members to process:", membersData.length)
            
            // Fetch users one by one to handle any missing users gracefully
            const participants: Participant[] = []
            
                          for (const member of membersData) {
                try {
                  // Try to fetch user data with more detailed error logging
                  console.log(`Attempting to fetch user: ${member.user_id}`)
                  
                  const { data: userData, error: userError } = await supabase
                    .from("users")
                    .select("id, email, first_name, last_name, role, department, experience_level")
                    .eq("id", member.user_id)
                    .maybeSingle() // Use maybeSingle instead of single to avoid errors

                  if (userError) {
                    console.error(`Error fetching user ${member.user_id}:`, userError)
                    console.error(`Error details:`, {
                      code: userError.code,
                      message: userError.message,
                      details: userError.details,
                      hint: userError.hint
                    })
                  }
                  
                                  if (!userData) {
                  console.log(`No user data found for ${member.user_id}`)
                  
                  // Try to get user info from auth metadata as fallback
                  try {
                    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(member.user_id)
                    if (!authError && authUser?.user) {
                      const metadata = authUser.user.user_metadata || {}
                      const fallbackName = metadata.first_name && metadata.last_name 
                        ? `${metadata.first_name} ${metadata.last_name}`
                        : metadata.name || metadata.email?.split('@')[0] || 'Unnamed'
                      
                      console.log(`Using auth metadata for ${member.user_id}:`, fallbackName)
                      
                      participants.push({
                        id: member.user_id,
                        name: fallbackName,
                        email: authUser.user.email || '',
                        role: 'Staff',
                        department: '',
                        experience: 1,
                        status: 'active' as const,
                        teamId: member.team_id,
                      })
                      continue
                    }
                  } catch (authFallbackError) {
                    console.log(`Auth fallback failed for ${member.user_id}:`, authFallbackError)
                  }
                  
                  // Add participant with limited info if no user data and auth fallback fails
                  participants.push({
                    id: member.user_id,
                    name: 'Unnamed',
                    email: '',
                    role: 'Staff',
                    department: '',
                    experience: 1,
                    status: 'active' as const,
                    teamId: member.team_id,
                  })
                  continue
                }
                  
                  console.log(`User data for ${member.user_id}:`, userData)
                  
                  participants.push({
                    id: member.user_id,
                    name: userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'Unnamed' : 'Unnamed',
                    email: userData?.email || '',
                    role: userData?.role || 'Staff',
                    department: userData?.department || '',
                    experience: userData?.experience_level || 1,
                    status: 'active' as const,
                    teamId: member.team_id,
                  })
                } catch (error) {
                  console.error(`Unexpected error fetching user ${member.user_id}:`, error)
                  // Add participant with limited info if there's an unexpected error
                  participants.push({
                    id: member.user_id,
                    name: 'Unnamed',
                    email: '',
                    role: 'Staff',
                    department: '',
                    experience: 1,
                    status: 'active' as const,
                    teamId: member.team_id,
                  })
                }
              }
            
            console.log("Final participants array:", participants)
            setAllParticipants(participants)
          } else {
            setAllParticipants([])
          }
        } else {
          // For participants, fetch their team members
          if (teamId) {
            // First fetch team details
            const { data: teamData, error: teamError } = await supabase
              .from("teams")
              .select("id, name, department")
              .eq("id", teamId)

            if (teamError) {
              console.error("Error fetching team details:", teamError)
            } else if (teamData && teamData.length > 0) {
              console.log("Team data fetched:", teamData)
              setTeams(teamData)
            } else {
              console.log("No team data found for teamId:", teamId)
            }

            // First, let's fetch team members with their user IDs
            const { data: membersData, error: membersError } = await supabase
              .from("team_members")
              .select("user_id, team_id")
              .eq("team_id", teamId)

            if (membersError) {
              console.error("Error fetching team members:", membersError)
              return
            }
            
            console.log("Team members data fetched:", membersData)

            // Now fetch user details for each team member
            if (membersData && membersData.length > 0) {
              console.log("Team members to process:", membersData.length)
              
              // Fetch users one by one to handle any missing users gracefully
              const participants: Participant[] = []
              
              for (const member of membersData) {
                try {
                  // Try to fetch user data with more detailed error logging
                  console.log(`Attempting to fetch user: ${member.user_id}`)
                  
                  const { data: userData, error: userError } = await supabase
                    .from("users")
                    .select("id, email, first_name, last_name, role, department, experience_level")
                    .eq("id", member.user_id)
                    .maybeSingle() // Use maybeSingle instead of single to avoid errors

                  if (userError) {
                    console.error(`Error fetching user ${member.user_id}:`, userError)
                    console.error(`Error details:`, {
                      code: userError.code,
                      message: userError.message,
                      details: userError.details,
                      hint: userError.hint
                    })
                  }
                  
                  if (!userData) {
                    console.log(`No user data found for ${member.user_id}`)
                    
                    // Try to get user info from auth metadata as fallback
                    try {
                      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(member.user_id)
                      if (!authError && authUser?.user) {
                        const metadata = authUser.user.user_metadata || {}
                        const fallbackName = metadata.first_name && metadata.last_name 
                          ? `${metadata.first_name} ${metadata.last_name}`
                          : metadata.name || metadata.email?.split('@')[0] || 'Unnamed'
                        
                        console.log(`Using auth metadata for ${member.user_id}:`, fallbackName)
                        
                        participants.push({
                          id: member.user_id,
                          name: fallbackName,
                          email: authUser.user.email || '',
                          role: 'Staff',
                          department: '',
                          experience: 1,
                          status: 'active' as const,
                          teamId: member.team_id || '',
                        })
                        continue
                      }
                    } catch (authFallbackError) {
                      console.log(`Auth fallback failed for ${member.user_id}:`, authFallbackError)
                    }
                    
                    // Add participant with limited info if no user data and auth fallback fails
                    participants.push({
                      id: member.user_id,
                      name: 'Unnamed',
                      email: '',
                      role: 'Staff',
                      department: '',
                      experience: 1,
                      status: 'active' as const,
                      teamId: member.team_id || '',
                    })
                    continue
                  }
                  
                  console.log(`User data for ${member.user_id}:`, userData)
                  
                  participants.push({
                    id: member.user_id,
                    name: userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'Unnamed' : 'Unnamed',
                    email: userData?.email || '',
                    role: userData?.role || 'Staff',
                    department: userData?.department || '',
                    experience: userData?.experience_level || 1,
                    status: 'active' as const,
                    teamId: member.team_id || '',
                  })
                } catch (error) {
                  console.error(`Unexpected error fetching user ${member.user_id}:`, error)
                  // Add participant with limited info if there's an unexpected error
                  participants.push({
                    id: member.user_id,
                    name: 'Unnamed',
                    email: '',
                    role: 'Staff',
                    department: '',
                    experience: 1,
                    status: 'active' as const,
                    teamId: member.team_id || '',
                  })
                }
              }
              
              console.log("Final participants array:", participants)
              setAllParticipants(participants)
            } else {
              setAllParticipants([])
            }


          }
        }
      } catch (error) {
        console.error("Error fetching data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [isHost, teamId])

  // Debug logging for participant view
  useEffect(() => {
    if (!isHost && teamId) {
      console.log("ParticipantList: teamId prop changed to:", teamId)
      console.log("ParticipantList: teams state:", teams)
      console.log("ParticipantList: allParticipants count:", allParticipants.length)
    }
  }, [teamId, teams, allParticipants, isHost])

  // Filter participants by team
  const participants = isHost
    ? (selectedTeam === "all" ? allParticipants : allParticipants.filter((p) => p.teamId === selectedTeam))
    : allParticipants // For participant view, show all participants (they're already filtered by teamId in the data fetch)

  const filteredParticipants = participants.filter(
    (participant) =>
      participant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      participant.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      participant.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const currentTeamName = isHost 
    ? (selectedTeam === "all" ? "All Teams" : teams.find((t) => t.id === selectedTeam)?.name || "Unknown Team")
    : (teams.find((t) => t.id === teamId)?.name || "Unknown Team")

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Team Members</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">Loading team members...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Users className="h-5 w-5" />
          <span>Team Members - {currentTeamName}</span>
          <Badge variant="secondary" className="ml-auto">
            {participants.filter((p) => p.status === "active").length} Active
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Team Selector for Host */}
        {isHost && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Select Team</label>
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search team members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Mobile-First List */}
        <div className="space-y-3">
          {filteredParticipants.map((participant) => (
            <div
              key={participant.id}
              className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {/* Mobile Layout */}
              <div className="flex flex-col space-y-2 sm:hidden">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900 dark:text-white">{participant.name}</h3>
                  <Badge variant={participant.status === "active" ? "default" : "secondary"} className="text-xs">
                    {participant.status}
                  </Badge>
                </div>
                <div className="flex items-center space-x-2">
                  {/* <Badge variant="outline" className="text-xs">
                    {participant.role}
                  </Badge> */}
                  {/* <span className="text-xs text-gray-500">•</span>
                  <span className="text-xs text-gray-600 dark:text-gray-300">{participant.experience} years exp</span> */}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300">{participant.email}</div>
                {participant.phone && (
                  <div className="text-sm text-gray-600 dark:text-gray-300">{participant.phone}</div>
                )}
                {isHost && (
                  <div className="flex space-x-2 pt-2">
                    <Button size="sm" variant="outline" className="flex-1 text-xs bg-transparent">
                      <Mail className="h-3 w-3 mr-1" />
                      Email
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-xs bg-transparent">
                      Edit
                    </Button>
                  </div>
                )}
              </div>

              {/* Desktop Layout */}
              <div className="hidden sm:flex sm:items-center sm:justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-1">
                    <h3 className="font-medium text-gray-900 dark:text-white">{participant.name}</h3>
                    {/* <Badge variant="outline" className="text-xs">
                      {participant.role}
                    </Badge> */}
                    <Badge variant={participant.status === "active" ? "default" : "secondary"} className="text-xs">
                      {participant.status}
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-300">
                    <span>{participant.email}</span>
                    {participant.phone && (
                      <>
                        <span>•</span>
                        <span>{participant.phone}</span>
                      </>
                    )}
                    {/* <span>•</span>
                    <span>{participant.experience} years experience</span> */}
                  </div>
                </div>
                {isHost && (
                  <div className="flex space-x-2">
                    <Button size="sm" variant="outline">
                      <Mail className="h-4 w-4 mr-1" />
                      Email
                    </Button>
                    <Button size="sm" variant="outline">
                      Edit
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {filteredParticipants.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No team members found matching &quot;{searchTerm}&quot;
          </div>
        )}
      </CardContent>
    </Card>
  )
}
