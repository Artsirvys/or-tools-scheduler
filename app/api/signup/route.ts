// app/api/signup/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "../../../utils/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createServerClient();
    const { token, email, password, name, role, department, accountType } = await req.json();

    if (!token || !email || !password || !name) {
      return NextResponse.json({ 
        error: "Missing required fields: token, email, password, name" 
      }, { status: 400 });
    }

    // Validate invitation token
    const { data: invitation, error: invError } = await supabase
      .from("team_invitations")
      .select("*")
      .eq("token", token)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (invError || !invitation) {
      return NextResponse.json({ 
        error: "Invalid or expired invitation token" 
      }, { status: 400 });
    }

    // Check if invitation has expired
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ 
        error: "Invitation has expired" 
      }, { status: 400 });
    }

    // Create new user with Supabase Auth
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Mark email as confirmed since invitation serves as confirmation
      user_metadata: {
        first_name: name.split(' ')[0] || '',
        last_name: name.split(' ').slice(1).join(' ') || '',
        account_type: accountType || 'participant',
        role: role || invitation.role,
        department: department || invitation.department
      }
    });

    if (userError) {
      console.error('Error creating user:', userError);
      return NextResponse.json({ 
        error: `Failed to create user: ${userError.message}` 
      }, { status: 400 });
    }

    if (!userData.user) {
      return NextResponse.json({ 
        error: "Failed to create user" 
      }, { status: 500 });
    }

    // Create user profile in users table
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: userData.user.id,
        email: email,
        first_name: name.split(' ')[0] || '',
        last_name: name.split(' ').slice(1).join(' ') || '',
        account_type: accountType || 'participant',
        role: role || invitation.role,
        department: department || invitation.department,
        experience_level: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (profileError) {
      console.error('Error creating user profile:', profileError);
      // Try to clean up the auth user if profile creation fails
      await supabase.auth.admin.deleteUser(userData.user.id);
      return NextResponse.json({ 
        error: "Failed to create user profile" 
      }, { status: 500 });
    }

    // Add user to team_members
    const { error: teamMemberError } = await supabase
      .from('team_members')
      .insert({
        team_id: invitation.team_id,
        user_id: userData.user.id,
        experience_level: 1,
        joined_at: new Date().toISOString()
      });

    if (teamMemberError) {
      console.error('Error adding user to team:', teamMemberError);
      // Clean up user profile and auth user if team membership fails
      await supabase.from('users').delete().eq('id', userData.user.id);
      await supabase.auth.admin.deleteUser(userData.user.id);
      return NextResponse.json({ 
        error: "Failed to add user to team" 
      }, { status: 500 });
    }

    // Mark invitation as accepted
    const { error: updateError } = await supabase
      .from("team_invitations")
      .update({ 
        status: "accepted",
        updated_at: new Date().toISOString()
      })
      .eq("id", invitation.id);

    if (updateError) {
      console.error('Error updating invitation status:', updateError);
      // Don't fail the entire request for this
    }

    return NextResponse.json({ 
      success: true,
      message: "User created successfully and added to team",
      userId: userData.user.id,
      teamId: invitation.team_id
    });

  } catch (error) {
    console.error('Error in signup API:', error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}
