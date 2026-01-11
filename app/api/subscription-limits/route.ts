import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getUserSubscriptionLimits } from '@/lib/subscription-utils'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get subscription limits using the server-side function
    const limits = await getUserSubscriptionLimits(user.id)

    // Return only serializable fields (exclude functions like canAddMember)
    return NextResponse.json({
      maxTeams: limits.maxTeams,
      maxMembersPerTeam: limits.maxMembersPerTeam,
      canCreateTeam: limits.canCreateTeam,
      planName: limits.planName,
      isActive: limits.isActive,
      isTrial: limits.isTrial,
      trialDaysRemaining: limits.trialDaysRemaining,
      scheduleGenerationsUsed: limits.scheduleGenerationsUsed,
      maxScheduleGenerations: limits.maxScheduleGenerations,
    })
  } catch (error) {
    console.error('Error getting subscription limits:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

