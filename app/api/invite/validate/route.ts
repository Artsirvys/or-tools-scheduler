// app/api/invite/validate/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "../../../../utils/supabase/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ 
        error: "Token is required" 
      }, { status: 400 });
    }

    const supabase = createServerClient();

    // Fetch invitation details
    const { data: invitation, error: invError } = await supabase
      .from("team_invitations")
      .select("email, team_name, department, role, status, expires_at")
      .eq("token", token)
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

    return NextResponse.json({
      email: invitation.email,
      teamName: invitation.team_name,
      department: invitation.department,
      role: invitation.role
    });

  } catch (error) {
    console.error('Error in invitation validation:', error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}
