import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { email, password, firstName, lastName, teamId } = await request.json();

    // Create Supabase client with service role key to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create user with admin privileges (no email confirmation needed)
    const { data: user, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Email already confirmed
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        account_type: 'participant'
      }
    });

    if (createUserError) {
      console.error('Error creating user:', createUserError);
      return NextResponse.json({ error: createUserError.message }, { status: 500 });
    }

    if (!user.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    // Create user profile
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: user.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        account_type: 'participant'
      });

    if (profileError) {
      console.error('Error creating profile:', profileError);
      return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 });
    }

    // Add user to team
    const { error: teamError } = await supabase
      .from('team_members')
      .insert({
        team_id: teamId,
        user_id: user.user.id,
        experience_level: 1
      });

    if (teamError) {
      console.error('Error adding to team:', teamError);
      return NextResponse.json({ error: 'Failed to add user to team' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      userId: user.user.id
    });

  } catch (error) {
    console.error('Error in create-invited-user API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
