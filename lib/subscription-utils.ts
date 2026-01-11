import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface TrialInfo {
  trial_id: string
  plan_id: string
  plan_name: string
  plan_display_name: string
  trial_start: string
  trial_end: string
  days_remaining: number
  schedule_generations_used: number
  max_schedule_generations: number
  status: string
}

interface TrialLimitInfo {
  planName: string
  generationsUsed: number
  maxGenerations: number
  daysRemaining: number
}

export interface SubscriptionLimits {
  maxTeams: number
  maxMembersPerTeam: number
  canCreateTeam: boolean
  canAddMember: (teamId: string) => Promise<boolean>
  planName: string
  isActive: boolean
  isTrial: boolean
  trialDaysRemaining?: number
  scheduleGenerationsUsed?: number
  maxScheduleGenerations?: number
}

export async function getUserSubscriptionLimits(userId: string): Promise<SubscriptionLimits> {
  try {
    // SIMPLIFIED LIMITS FOR DONATION MODEL
    // Simple hardcoded limits: 5 teams per user, 30 members per team
    const MAX_TEAMS_PER_USER = 5
    const MAX_MEMBERS_PER_TEAM = 30

    // Check current team count
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id')
      .eq('host_id', userId)

    if (teamsError) {
      console.error('Error fetching teams:', teamsError)
      // Return limits with canCreateTeam as false on error
      return {
        maxTeams: MAX_TEAMS_PER_USER,
        maxMembersPerTeam: MAX_MEMBERS_PER_TEAM,
        canCreateTeam: false,
        canAddMember: async () => false,
        planName: 'Standard',
        isActive: true,
        isTrial: false,
      }
    }

    const currentTeamCount = teams?.length || 0
    const canCreateTeam = currentTeamCount < MAX_TEAMS_PER_USER

    return {
      maxTeams: MAX_TEAMS_PER_USER,
      maxMembersPerTeam: MAX_MEMBERS_PER_TEAM,
      canCreateTeam,
      canAddMember: async (teamId: string) => {
        const { data: members, error } = await supabase
          .from('team_members')
          .select('id')
          .eq('team_id', teamId)

        if (error) {
          console.error('Error fetching team members:', error)
          return false
        }

        return (members?.length || 0) < MAX_MEMBERS_PER_TEAM
      },
      planName: 'Standard',
      isActive: true,
      isTrial: false,
    }

    /* COMMENTED OUT: Subscription/Trial logic for future use
    // First check for active trial
    const { data: trialInfo, error: trialError } = await supabase
      .rpc('get_user_trial_info', { user_uuid: userId })

    if (!trialError && trialInfo && trialInfo.length > 0) {
      const trial = trialInfo[0]
      
      // Check current team count
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id')
        .eq('host_id', userId)

      if (teamsError) {
        console.error('Error fetching teams:', teamsError)
        return getFreePlanLimits()
      }

      const currentTeamCount = teams?.length || 0
      // Trial team limits based on plan
      let maxTeams = 1 // Default for team plan
      if (trial.plan_name === 'department') {
        maxTeams = 3 // Department trial allows 3 teams
      } else if (trial.plan_name === 'enterprise') {
        maxTeams = -1 // Enterprise trial allows unlimited teams
      } else if (trial.plan_name === 'free') {
        maxTeams = 1 // Free plan trial allows 1 team
      }
      
      const canCreateTeam = maxTeams === -1 || currentTeamCount < maxTeams

      return {
        maxTeams: maxTeams,
        maxMembersPerTeam: trial.plan_name === 'team' ? 25 : trial.plan_name === 'department' ? 50 : trial.plan_name === 'enterprise' ? -1 : 5,
        canCreateTeam,
        canAddMember: async (teamId: string) => {
          const maxMembers = trial.plan_name === 'team' ? 25 : trial.plan_name === 'department' ? 50 : trial.plan_name === 'enterprise' ? -1 : 5
          const { data: members, error } = await supabase
            .from('team_members')
            .select('id')
            .eq('team_id', teamId)

          if (error) {
            console.error('Error fetching team members:', error)
            return false
          }

          return maxMembers === -1 || (members?.length || 0) < maxMembers
        },
        planName: `${trial.plan_display_name} (Trial)`,
        isActive: true,
        isTrial: true,
        trialDaysRemaining: trial.days_remaining,
        scheduleGenerationsUsed: trial.schedule_generations_used,
        maxScheduleGenerations: trial.max_schedule_generations,
      }
    }

    // Get user's active subscription
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select(`
        *,
        subscription_plans (*)
      `)
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subError) {
      console.error('Error fetching subscription:', subError)
      // Return free plan limits as fallback
      return getFreePlanLimits()
    }

    if (!subscription) {
      // No subscription, use free plan limits
      return getFreePlanLimits()
    }

    const plan = subscription.subscription_plans

    // Check current team count
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id')
      .eq('host_id', userId)

    if (teamsError) {
      console.error('Error fetching teams:', teamsError)
      return getFreePlanLimits()
    }

    const currentTeamCount = teams?.length || 0
    const canCreateTeam = plan.max_teams === -1 || currentTeamCount < plan.max_teams

    return {
      maxTeams: plan.max_teams,
      maxMembersPerTeam: plan.max_members_per_team,
      canCreateTeam,
      canAddMember: async (teamId: string) => {
        if (plan.max_members_per_team === -1) return true
        
        const { data: members, error } = await supabase
          .from('team_members')
          .select('id')
          .eq('team_id', teamId)

        if (error) {
          console.error('Error fetching team members:', error)
          return false
        }

        return (members?.length || 0) < plan.max_members_per_team
      },
      planName: plan.display_name,
      isActive: true,
      isTrial: false,
    }
    */

  } catch (error) {
    console.error('Error getting subscription limits:', error)
    // Return safe defaults on error
    return {
      maxTeams: 5,
      maxMembersPerTeam: 30,
      canCreateTeam: false,
      canAddMember: async () => false,
      planName: 'Standard',
      isActive: true,
      isTrial: false,
    }
  }
}

// COMMENTED OUT: Free plan limits function - not used in donation model
/*
function getFreePlanLimits(): SubscriptionLimits {
  return {
    maxTeams: 1,
    maxMembersPerTeam: 5,
    canCreateTeam: false, // Will be checked dynamically
    canAddMember: async () => false, // Will be checked dynamically
    planName: 'Free Plan',
    isActive: false,
    isTrial: false,
  }
}
*/

export async function checkTeamCreationLimit(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const limits = await getUserSubscriptionLimits(userId)
  
  if (!limits.canCreateTeam) {
    return {
      allowed: false,
      reason: `You've reached the team limit (${limits.maxTeams} teams). You cannot create more teams at this time.`
    }
  }

  return { allowed: true }
}

export async function checkMemberAdditionLimit(teamId: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Get team host
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('host_id')
      .eq('id', teamId)
      .single()

    if (teamError || !team) {
      return { allowed: false, reason: 'Team not found' }
    }

    const limits = await getUserSubscriptionLimits(team.host_id)
    
    if (limits.maxMembersPerTeam === -1) {
      return { allowed: true }
    }

    const canAdd = await limits.canAddMember(teamId)
    
    if (!canAdd) {
      return {
        allowed: false,
        reason: `You've reached the member limit for this team (${limits.maxMembersPerTeam} members). You cannot add more members at this time.`
      }
    }

    return { allowed: true }

  } catch (error) {
    console.error('Error checking member addition limit:', error)
    return { allowed: false, reason: 'Error checking limits' }
  }
}

export async function getUpgradePrompt(currentPlan: string, limitType: 'teams' | 'members'): Promise<string> {
  switch (currentPlan) {
    case 'Free Plan':
      return `You've reached the ${limitType} limit for the free plan. Upgrade to the Team Plan (€6/month) to get up to 25 members per team.`
    case 'Team Plan':
      return `You've reached the ${limitType} limit for the Team Plan. Upgrade to the Department Plan (€20/month) to manage up to 3 teams with 50 members each.`
    case 'Department Plan':
      return `You've reached the ${limitType} limit for the Department Plan. Contact sales for Enterprise pricing with unlimited teams and members.`
    default:
      return `You've reached the ${limitType} limit for your current plan. Upgrade to unlock more capacity.`
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function checkTrialScheduleGenerationLimit(_userId: string): Promise<{ allowed: boolean; reason?: string }> {
  // COMMENTED OUT: Trial schedule generation limits - not used in donation model
  // All users can generate schedules without limits
  return { allowed: true }

  /* COMMENTED OUT: Original trial limit checking logic
  try {
    const limits = await getUserSubscriptionLimits(userId)
    
    if (!limits.isTrial) {
      return { allowed: true } // Not in trial, no limit
    }

    if (limits.scheduleGenerationsUsed !== undefined && limits.maxScheduleGenerations !== undefined) {
      if (limits.scheduleGenerationsUsed >= limits.maxScheduleGenerations) {
        return {
          allowed: false,
          reason: `You've used all ${limits.maxScheduleGenerations} schedule generations in your trial. Upgrade to continue generating schedules.`
        }
      }
    }

    return { allowed: true }

  } catch (error) {
    console.error('Error checking trial schedule generation limit:', error)
    return { allowed: false, reason: 'Error checking trial limits' }
  }
  */
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function incrementTrialScheduleGeneration(_userId: string): Promise<boolean> {
  // COMMENTED OUT: Trial schedule generation tracking - not used in donation model
  // No tracking needed, always return true
  return true

  /* COMMENTED OUT: Original trial increment logic
  try {
    const { data, error } = await supabase
      .rpc('increment_trial_schedule_generations', { user_uuid: userId })

    if (error) {
      console.error('Error incrementing trial schedule generation:', error)
      return false
    }

    return data || false

  } catch (error) {
    console.error('Error incrementing trial schedule generation:', error)
    return false
  }
  */
}

export async function checkTrialExpiration(userId: string): Promise<{ isExpired: boolean; trialInfo?: TrialInfo }> {
  try {
    const { data: trialInfo, error: trialError } = await supabase
      .rpc('get_user_trial_info', { user_uuid: userId })

    if (trialError || !trialInfo || trialInfo.length === 0) {
      return { isExpired: false } // No trial found, not expired
    }

    const trial = trialInfo[0]
    const isExpired = trial.days_remaining <= 0

    return { 
      isExpired, 
      trialInfo: isExpired ? trial : undefined 
    }

  } catch (error) {
    console.error('Error checking trial expiration:', error)
    return { isExpired: false }
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function enforceTrialLimits(_userId: string): Promise<{ allowed: boolean; reason?: string; trialInfo?: TrialInfo | TrialLimitInfo }> {
  // COMMENTED OUT: Trial limit enforcement - not used in donation model
  // All users can generate schedules without limits
  return { allowed: true }

  /* COMMENTED OUT: Original trial enforcement logic
  try {
    const limits = await getUserSubscriptionLimits(userId)
    
    if (!limits.isTrial) {
      // Not in trial, check if user has active subscription or is on free plan
      if (limits.isActive) {
        return { allowed: true } // Has active subscription, no limits
      } else if (limits.planName === 'Free Plan') {
        // Free plan users can use the service without subscription
        // They have their own limits (1 team, 5 members, limited generations)
        return { allowed: true }
      } else {
        // No trial, no subscription, and not on free plan
        return {
          allowed: false,
          reason: 'No active subscription. Please subscribe to continue using the service.'
        }
      }
    }

    // Check if trial has expired
    const { isExpired, trialInfo } = await checkTrialExpiration(userId)
    
    if (isExpired) {
      // If it's a free plan trial that expired, they can continue with free plan
      if (trialInfo?.plan_name === 'free') {
        // Free plan trial expired, but they can continue with free plan limits
        return { allowed: true }
      } else {
        // Paid plan trial expired, they need to subscribe
        return {
          allowed: false,
          reason: `Your ${trialInfo?.plan_display_name || 'trial'} has expired. Subscribe to continue using the service.`,
          trialInfo
        }
      }
    }

    // Check schedule generation limits
    if (limits.scheduleGenerationsUsed !== undefined && limits.maxScheduleGenerations !== undefined) {
      if (limits.scheduleGenerationsUsed >= limits.maxScheduleGenerations) {
        // Different messages for free plan vs paid plans
        const isFreePlan = limits.planName.includes('Free') || limits.planName.includes('free')
        const upgradeMessage = isFreePlan 
          ? `You've used all ${limits.maxScheduleGenerations} schedule generations in your free plan. Upgrade to a paid plan to continue generating schedules.`
          : `You've used all ${limits.maxScheduleGenerations} schedule generations in your ${limits.planName}. Subscribe to continue generating schedules.`
        
        return {
          allowed: false,
          reason: upgradeMessage,
          trialInfo: {
            planName: limits.planName,
            generationsUsed: limits.scheduleGenerationsUsed || 0,
            maxGenerations: limits.maxScheduleGenerations || 0,
            daysRemaining: limits.trialDaysRemaining || 0
          }
        }
      }
    }

    return { allowed: true }

  } catch (error) {
    console.error('Error enforcing trial limits:', error)
    return { allowed: false, reason: 'Error checking trial limits' }
  }
  */
}
