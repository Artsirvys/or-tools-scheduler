import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Create Supabase client with service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get trial information
    const { data: trialInfo, error: trialError } = await supabase
      .rpc('get_user_trial_info', { user_uuid: userId })

    if (trialError) {
      console.error('Error fetching trial info:', trialError)
      return NextResponse.json(
        { error: 'Failed to fetch trial information' },
        { status: 500 }
      )
    }

    if (!trialInfo || trialInfo.length === 0) {
      return NextResponse.json({
        success: true,
        trialInfo: null
      })
    }

    return NextResponse.json({
      success: true,
      trialInfo: trialInfo[0]
    })

  } catch (error) {
    console.error('Unexpected error in trial-info API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}