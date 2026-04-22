// app/api/invite/route.ts
import { NextResponse } from "next/server";
import { createServerClient as createSessionClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServerClient } from "../../../utils/supabase/server";
import { randomUUID } from "crypto";
import { sendEmail } from "../../../utils/email";
import { routing } from "@/i18n/routing";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const sessionSupabase = createSessionClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user }, error: userError } = await sessionSupabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServerClient();
    const { email, teamId, teamName, department, role } = await req.json();

    if (!email || !teamId || !teamName) {
      return NextResponse.json({ 
        error: "Missing required fields: email, teamId, teamName" 
      }, { status: 400 });
    }

    // Verify caller is host of the target team.
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, name, department, host_id")
      .eq("id", teamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (team.host_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Generate unique token for this invitation
    const token = randomUUID();
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Check if invitation already exists for this email and team
    const { data: existingInvitation } = await supabase
      .from("team_invitations")
      .select("id, status")
      .eq("email", email)
      .eq("team_id", teamId)
      .maybeSingle();

    if (existingInvitation) {
      if (existingInvitation.status === 'pending') {
        return NextResponse.json({ 
          error: "An invitation has already been sent to this email for this team" 
        }, { status: 400 });
      }
      // If expired or cancelled, we can create a new one
    }

    // Create or update invitation record
    const { error: invitationError } = await supabase
      .from("team_invitations")
      .upsert({
        email,
        team_id: teamId,
        team_name: team.name || teamName,
        department: team.department || department || null,
        role: role || 'participant',
        invited_by: user.id,
        status: "pending",
        expires_at: expires_at.toISOString(),
        token,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'team_id,email'
      });

    if (invitationError) {
      console.error('Error creating invitation:', invitationError);
      return NextResponse.json({ 
        error: "Failed to create invitation" 
      }, { status: 500 });
    }

    // Generate invitation link
    const invitationLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.aischedulator.com'}/${routing.defaultLocale}/auth/signup?token=${token}`;

    // Send invitation email
    try {
      await sendEmail({
        to: email,
        subject: `You've been invited to join ${teamName}`,
        text: `You have been invited to join the team "${teamName}" on AISchedulator.

Click the following link to complete your registration:
${invitationLink}

This invitation will expire in 7 days.

If you have any questions, please contact your team administrator.`
      });
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      // Don't fail the entire request if email fails
      // The invitation is still created in the database
    }

    return NextResponse.json({ 
      success: true, 
      message: "Invitation sent successfully"
    });

  } catch (error) {
    console.error('Error in invite API:', error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}
