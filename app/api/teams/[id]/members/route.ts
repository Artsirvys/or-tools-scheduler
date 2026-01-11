import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Create Supabase client with service role key for API routes
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  try {
    const teamId = resolvedParams.id;

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID is required" },
        { status: 400 }
      );
    }

    console.log("Fetching team members for team:", teamId);

    // Fetch team members with user details
    const { data: membersData, error: membersError } = await supabase
      .from("team_members")
      .select("user_id, users(first_name, last_name)")
      .eq("team_id", teamId);

    if (membersError) {
      console.error("Error fetching team members:", membersError);
      return NextResponse.json(
        { error: "Failed to fetch team members" },
        { status: 500 }
      );
    }

    // Process members to extract names
    const members = membersData.map((m) => ({
      id: m.user_id,
      name:
        m.users && typeof m.users === "object"
          ? (Array.isArray(m.users)
              ? `${m.users[0]?.first_name || ''} ${m.users[0]?.last_name || ''}`.trim()
              : `${(m.users as { first_name?: string }).first_name || ''} ${(m.users as { last_name?: string }).last_name || ''}`.trim()) || "Unnamed"
          : "Unnamed",
    }));

    console.log("Processed members:", members);

    return NextResponse.json(members);
  } catch (error) {
    console.error("Error in teams/[id]/members GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
