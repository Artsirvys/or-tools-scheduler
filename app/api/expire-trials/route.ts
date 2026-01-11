import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST() {
  try {
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

    // Call the database function to expire old trials
    const { data: expiredCount, error } = await supabase
      .rpc('expire_old_trials')

    if (error) {
      console.error('Error expiring old trials:', error)
      return NextResponse.json(
        { error: 'Failed to expire old trials' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      expiredCount: expiredCount || 0,
      message: `Expired ${expiredCount || 0} trials`
    })

  } catch (error) {
    console.error('Unexpected error in expire-trials API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}