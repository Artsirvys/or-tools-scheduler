import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  try {
    const teamId = resolvedParams.id;

    return NextResponse.json({
      message: "Teams API is working",
      teamId,
      endpoints: {
        members: `/api/teams/${teamId}/members`,
        shifts: `/api/teams/${teamId}/shifts`
      }
    });
  } catch (error) {
    console.error("Error in teams/[id] GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const teamId = resolvedParams.id;

    if (!teamId) {
      return NextResponse.json({ error: "Team ID is required" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if team exists and get host_id for verification
    const { data: team, error: fetchError } = await supabase
      .from("teams")
      .select("id, host_id, name")
      .eq("id", teamId)
      .single();

    if (fetchError || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Verify the user is the host of the team
    if (team.host_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete the team (cascade will handle related records)
    const { error: deleteError } = await supabase
      .from("teams")
      .delete()
      .eq("id", teamId);

    if (deleteError) {
      console.error("Error deleting team:", deleteError);
      return NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
    }

    return NextResponse.json({ message: "Team deleted successfully" });
  } catch (error) {
    console.error("Error in teams/[id] DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
