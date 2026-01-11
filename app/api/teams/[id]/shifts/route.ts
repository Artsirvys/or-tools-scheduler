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

    console.log("Fetching shifts for team:", teamId);

    // Fetch shifts for the team
    const { data: shifts, error: shiftsError } = await supabase
      .from("shifts")
      .select("id, name, start_time, end_time")
      .eq("team_id", teamId);

    if (shiftsError) {
      console.error("Error fetching shifts:", shiftsError);
      return NextResponse.json(
        { error: "Failed to fetch shifts" },
        { status: 500 }
      );
    }

    console.log("Fetched shifts:", shifts);

    return NextResponse.json(shifts || []);
  } catch (error) {
    console.error("Error in teams/[id]/shifts GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
