import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
// COMMENTED OUT: Trial functions not used in donation model
// import { incrementTrialScheduleGeneration, enforceTrialLimits } from "@/lib/subscription-utils";

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

// Python OR-Tools service configuration
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:5000';

type Shift = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
};

type Member = {
  id: string;
  name: string;
  experience_level: number;
};

type Availability = {
  user_id: string;
  shift_id: string;
  date: string;
  status: string;
};

type BasicConstraints = {
  max_consecutive_days: number;
  max_days_per_month: number;
  workers_per_shift: number;
  shift_specific_workers?: Record<string, unknown>;
};

type CustomConstraint = {
  raw_text: string;
  ai_translation: Record<string, unknown>;
  status: string;
};

// Basic schedule generation function (fallback when Python solver is not available)
function generateBasicSchedule(
  members: Member[],
  shifts: Shift[],
  availability: Availability[],
  basicConstraints: BasicConstraints,
  month: number,
  year: number
): Array<{ user_id: string; shift_id: string; date: string }> {
  console.log("Generating basic schedule with fallback algorithm...");
  
  const assignments: Array<{ user_id: string; shift_id: string; date: string }> = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const workersPerShift = basicConstraints?.workers_per_shift || 2;
  
  // Create a simple round-robin assignment
  let memberIndex = 0;
  
  for (let day = 1; day <= daysInMonth; day++) {
    for (let shiftIndex = 0; shiftIndex < shifts.length; shiftIndex++) {
      const shift = shifts[shiftIndex];
      const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      
      // Assign workers_per_shift number of workers to this shift
      for (let workerCount = 0; workerCount < workersPerShift; workerCount++) {
        const member = members[memberIndex % members.length];
        
        // Check if this member is available for this shift and date
        const availabilityEntry = availability.find(
          a => a.user_id === member.id && 
               a.shift_id === shift.id && 
               a.date === dateStr
        );
        
        // Only assign if available or no availability set (treat as available)
        if (!availabilityEntry || availabilityEntry.status !== 'unavailable') {
          assignments.push({
            user_id: member.id,
            shift_id: shift.id,
            date: dateStr
          });
        }
        
        memberIndex++;
      }
    }
  }
  
  console.log(`Generated ${assignments.length} basic assignments`);
  return assignments;
}

export async function POST(req: Request) {
  console.log("=== POST REQUEST RECEIVED ===");
  
  try {
    console.log("=== SCHEDULE GENERATION STARTED ===");
    
    const body = await req.json();
    console.log("Received request body:", body);
    
    const { teamId, month, year, hostId } = body;

    if (!teamId || !month || !year) {
      console.log("Missing fields:", { teamId, month, year });
      return NextResponse.json(
        { error: "Missing required fields: teamId, month, year" },
        { status: 400 }
      );
    }

    // COMMENTED OUT: Trial limit checking - not used in donation model
    // All users can generate schedules without limits
    /*
    // Check trial limits if hostId is provided
    if (hostId) {
      try {
        const trialEnforcement = await enforceTrialLimits(hostId);
        if (!trialEnforcement.allowed) {
          console.log("Trial limits exceeded:", trialEnforcement.reason);
          return NextResponse.json(
            { 
              error: trialEnforcement.reason,
              trialExpired: true,
              trialInfo: trialEnforcement.trialInfo
            },
            { status: 403 }
          );
        }
      } catch (trialError) {
        console.error("Error checking trial limits, continuing with generation:", trialError);
        // Continue with generation if trial check fails
      }
    }
    */

    console.log("Processing request for:", { teamId, month, year, hostId });
    console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log("Service role key exists:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch shifts
    console.log("Fetching shifts for team:", teamId);
    const { data: shifts, error: shiftsError } = await supabase
      .from("shifts")
      .select("id, name, start_time, end_time")
      .eq("team_id", teamId);

    if (shiftsError) {
      console.error("Error fetching shifts:", shiftsError);
      throw shiftsError;
    }

    console.log("Fetched shifts:", shifts);
    const typedShifts: Shift[] = shifts || [];

    // 2. Fetch team members with user details
    console.log("Fetching team members for team:", teamId);
    const { data: membersData, error: membersError } = await supabase
      .from("team_members")
      .select(`
        user_id, 
        experience_level,
        users(
          id,
          first_name, 
          last_name,
          role,
          department
        )
      `)
      .eq("team_id", teamId);

    if (membersError) {
      console.error("Error fetching team members:", membersError);
      throw membersError;
    }

    console.log("Fetched team members:", membersData);

    const members: Member[] = membersData.map((m) => ({
      id: m.user_id,
      name: m.users && typeof m.users === "object"
        ? (Array.isArray(m.users)
            ? `${m.users[0]?.first_name || ''} ${m.users[0]?.last_name || ''}`.trim()
            : `${(m.users as { first_name?: string }).first_name || ''} ${(m.users as { last_name?: string }).last_name || ''}`.trim()) || "Unnamed"
        : "Unnamed",
      experience_level: m.experience_level || 1,
    }));

    console.log("Processed members:", members);

    // 3. Fetch availability for the specified month
    console.log("Fetching availability for team:", teamId);
    const start = `${year}-${String(month).padStart(2, "0")}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    
    const { data: availability, error: availabilityError } = await supabase
      .from("availability")
      .select("user_id, shift_id, date, status")
      .eq("team_id", teamId)
      .gte("date", start)
      .lte("date", end);

    if (availabilityError) {
      console.error("Error fetching availability:", availabilityError);
      throw availabilityError;
    }

    console.log("Fetched availability:", availability);

    // 4. Fetch basic constraints
    console.log("Fetching basic constraints for team:", teamId);
    const { data: basicConstraints, error: basicConstraintsError } = await supabase
      .from("basic_constraints")
      .select("*")
      .eq("team_id", teamId)
      .maybeSingle();

    if (basicConstraintsError) {
      console.error("Error fetching basic constraints:", basicConstraintsError);
      throw basicConstraintsError;
    }

    console.log("Fetched basic constraints:", basicConstraints);

    // 5. Fetch custom constraints (AI-translated)
    console.log("Fetching custom constraints for team:", teamId);
    const { data: customConstraints, error: customConstraintsError } = await supabase
      .from("custom_constraints")
      .select("*")
      .eq("team_id", teamId)
      .eq("status", "translated") as { data: CustomConstraint[] | null; error: unknown };

    if (customConstraintsError) {
      console.error("Error fetching custom constraints:", customConstraintsError);
      // Don't fail the whole process, just log and continue
    }

    console.log("Fetched custom constraints:", customConstraints);

    // 6. Prepare data for OR-Tools solver
    const solverData = {
      team_id: teamId,
      month: month,
      year: year,
      shifts: typedShifts,
      members: members,
      availability: availability || [],
      basic_constraints: basicConstraints || {
        max_consecutive_days: 30,
        max_days_per_month: 20,
        workers_per_shift: 2,
      },
      custom_constraints: customConstraints || [],
    };

    console.log("Sending data to OR-Tools solver:", {
      teamId,
      month,
      year,
      shiftsCount: typedShifts.length,
      membersCount: members.length,
      availabilityCount: availability?.length || 0,
      hasBasicConstraints: !!basicConstraints,
      customConstraintsCount: customConstraints?.length || 0,
    });

    // 7. Test Python solver connection first
    let usePythonSolver = true;
    try {
      console.log("Testing Python solver connection...");
      const healthResponse = await fetch(`${PYTHON_SERVICE_URL}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!healthResponse.ok) {
        throw new Error(`Python solver health check failed: ${healthResponse.status} ${healthResponse.statusText}`);
      }

      const healthResult = await healthResponse.json();
      console.log("Python solver health check passed:", healthResult);
    } catch (healthError) {
      console.error("Python solver health check failed:", healthError);
      console.log("Falling back to basic schedule generation...");
      usePythonSolver = false;
    }

    let assignments: Array<{ user_id: string; shift_id: string; date: string }> = [];

    if (usePythonSolver) {
      // 8. Send to OR-Tools solver
      console.log("Sending data to OR-Tools solver...");
      const solverResponse = await fetch(`${PYTHON_SERVICE_URL}/solve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(solverData),
      });

      if (!solverResponse.ok) {
        const errorText = await solverResponse.text();
        console.error("OR-Tools solver error:", solverResponse.status, errorText);
        throw new Error(`OR-Tools solver failed: ${solverResponse.status} ${errorText}`);
      }

      const solverResult = await solverResponse.json();
      console.log("OR-Tools solver result:", solverResult);

      if (!solverResult.success) {
        throw new Error(`OR-Tools solver failed: ${solverResult.error || 'Unknown error'}`);
      }

      assignments = (solverResult.assignments as Array<{ user_id: string; shift_id: string; date: string }>) || [];
    } else {
      // Fallback: Generate basic schedule without Python solver
      console.log("Generating basic schedule without Python solver...");
      assignments = generateBasicSchedule(members, typedShifts, availability, basicConstraints, month, year);
    }

    console.log("Final assignments:", assignments);

    if (assignments.length === 0) {
      return NextResponse.json(
        { error: "No valid schedule could be generated with the given constraints" },
        { status: 400 }
      );
    }

    // 9. Check for existing schedule and delete it if it exists
    console.log("Checking for existing schedule...");
    const { data: existingSchedule, error: existingScheduleError } = await supabase
      .from("schedules")
      .select("id")
      .eq("team_id", teamId)
      .eq("month", month)
      .eq("year", year)
      .maybeSingle();

    if (existingScheduleError) {
      console.error("Error checking for existing schedule:", existingScheduleError);
      throw existingScheduleError;
    }

    if (existingSchedule) {
      console.log("Existing schedule found, deleting old assignments and schedule...");
      
      // Delete old assignments first (due to foreign key constraint)
      const { error: deleteAssignmentsError } = await supabase
        .from("schedule_assignments")
        .delete()
        .eq("schedule_id", existingSchedule.id);
      
      if (deleteAssignmentsError) {
        console.error("Error deleting old assignments:", deleteAssignmentsError);
        throw deleteAssignmentsError;
      }
      
      // Delete old schedule
      const { error: deleteScheduleError } = await supabase
        .from("schedules")
        .delete()
        .eq("id", existingSchedule.id);
      
      if (deleteScheduleError) {
        console.error("Error deleting old schedule:", deleteScheduleError);
        throw deleteScheduleError;
      }
      
      console.log("Old schedule and assignments deleted successfully");
    }

    // 10. Create schedule record
    console.log("Creating schedule record...");
    const { data: schedule, error: scheduleError } = await supabase
      .from("schedules")
      .insert({
        team_id: teamId,
        month,
        year,
        generated_by: hostId || null,
        status: "active",
        generated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (scheduleError) {
      console.error("Error creating schedule:", scheduleError);
      throw scheduleError;
    }

    console.log("Schedule created:", schedule);

    // 11. Insert schedule assignments
    const scheduleAssignments = assignments.map((assignment: Record<string, unknown>) => ({
      schedule_id: schedule.id,
      user_id: assignment.user_id as string,
      shift_id: assignment.shift_id as string,
      date: assignment.date as string,
      team_id: teamId,
    }));

    console.log("Inserting schedule assignments...");
    const { error: insertError } = await supabase
      .from("schedule_assignments")
      .insert(scheduleAssignments);

    if (insertError) {
      console.error("Error inserting assignments:", insertError);
      throw insertError;
    }

    // COMMENTED OUT: Trial schedule generation tracking - not used in donation model
    /*
    // Increment trial schedule generation count if user is in trial
    if (hostId) {
      try {
        await incrementTrialScheduleGeneration(hostId);
      } catch (trialIncrementError) {
        console.error("Error incrementing trial schedule generation count:", trialIncrementError);
        // Don't fail the entire operation if trial increment fails
      }
    }
    */

    console.log("=== SCHEDULE GENERATION COMPLETED SUCCESSFULLY ===");
    return NextResponse.json({ 
      message: "Schedule generated successfully", 
      schedule,
      assignments: scheduleAssignments,
      solverStats: usePythonSolver ? { solver_used: "OR-Tools" } : { solver_used: "Basic Fallback" }
    });
  } catch (error: unknown) {
    console.error("Error in generateSchedule:", error);
    
    // TEMPORARY: Show actual error for debugging
    let errorMessage = "Internal Server Error";
    const statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = `DEBUG: ${error.message}`;
      console.error("Full error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}
