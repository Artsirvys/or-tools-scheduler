// app/api/generateSchedule/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

interface Member {
  id: string;
  name: string;
}

interface AssignmentFromAI {
  user: string;
  shift: string;
  date: string;
  confidence?: number;
}

interface AssignmentForDB {
  schedule_id: string;
  user_id: string;
  shift_id: string;
  date: string;
  team_id: string;
}

interface Availability {
  user_id: string;
  date: string;
  available: boolean;
}

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
  });

  try {
    const { teamId, month, year } = await req.json();

    if (!teamId || !month || !year) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // 1️⃣ Fetch shifts
    const { data: shifts, error: shiftsError } = await supabase
      .from("shifts")
      .select("*")
      .eq("team_id", teamId);
    if (shiftsError) throw shiftsError;
    if (!shifts?.length) {
      return NextResponse.json({ error: "No shifts found" }, { status: 404 });
    }

    const shiftById = new Map<string, Shift>();
    const shiftByNameLower = new Map<string, Shift>();
    shifts.forEach((shift) => {
      shiftById.set(shift.id, shift);
      shiftByNameLower.set(shift.name.toLowerCase(), shift);
    });

    // 2️⃣ Fetch members
    const { data: members, error: membersError } = await supabase
      .from("team_members")
      .select("user_id, users(name)")
      .eq("team_id", teamId);
    if (membersError) throw membersError;
    if (!members?.length) {
      return NextResponse.json({ error: "No members found" }, { status: 404 });
    }

    const memberById = new Map<string, Member>();
    const memberByNameLower = new Map<string, Member>();
    for (const m of members) {
      const name = (m.users as unknown as { name: string } | undefined)?.name || "";
      memberById.set(m.user_id, { id: m.user_id, name });
      memberByNameLower.set(name.toLowerCase(), { id: m.user_id, name });
    }

    // 3️⃣ Fetch availability
    const { data: availability } = await supabase
      .from("availability")
      .select("*")
      .eq("team_id", teamId);

    const availabilityMap = new Map<string, Set<string>>();
    if (availability) {
      for (const a of availability as Availability[]) {
        if (a.available) {
          if (!availabilityMap.has(a.date)) {
            availabilityMap.set(a.date, new Set());
          }
          availabilityMap.get(a.date)!.add(a.user_id);
        }
      }
    }

    // 4️⃣ Fetch constraints
    const { data: constraints } = await supabase
      .from("ai_constraints")
      .select("*")
      .eq("team_id", teamId)
      .single();

    // 5️⃣ Try AI schedule generation
    let assignmentsForDB: AssignmentForDB[] | null = null;
    let aiError: string | null = null;

    try {
      const aiPrompt = `
Generate a schedule for ${month}/${year}.

Return ONLY valid JSON in this format:
{
  "assignments": [
    { "user": "John Doe", "shift": "Morning Shift", "date": "YYYY-MM-DD", "confidence": 0.9 }
  ]
}

Shifts:
${shifts.map((s) => `${s.id}: ${s.name}`).join("\n")}

Members:
${members.map((m) => `${m.user_id}: ${(m.users as unknown as { name: string })?.name}`).join("\n")}

Availability:
${JSON.stringify(availability)}

Constraints:
${JSON.stringify(constraints)}
`;

      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: aiPrompt }],
        temperature: 0.2,
      });

      const aiText = aiResponse.choices[0]?.message?.content?.trim();
      if (!aiText) throw new Error("AI returned no content");

      const parsed = JSON.parse(aiText) as { assignments: AssignmentFromAI[] };
      if (!parsed.assignments || !Array.isArray(parsed.assignments)) {
        throw new Error("AI did not return valid assignments");
      }

      assignmentsForDB = parsed.assignments.map((a) => {
        let userId = a.user;
        let shiftId = a.shift;

        if (!memberById.has(a.user) && memberByNameLower.has(a.user.toLowerCase())) {
          userId = memberByNameLower.get(a.user.toLowerCase())!.id;
        }
        if (!shiftById.has(a.shift) && shiftByNameLower.has(a.shift.toLowerCase())) {
          shiftId = shiftByNameLower.get(a.shift.toLowerCase())!.id;
        }

        if (!memberById.has(userId)) throw new Error(`Unknown user: ${a.user}`);
        if (!shiftById.has(shiftId)) throw new Error(`Unknown shift: ${a.shift}`);

        return {
          schedule_id: "",
          user_id: userId,
          shift_id: shiftId,
          date: a.date,
          team_id: teamId,
        };
      });
    } catch (err) {
      aiError = err instanceof Error ? err.message : String(err);
    }

    // 6️⃣ Fallback mode — now tracks conflicts
    const conflictList: { date: string; user: string; shifts: string[] }[] = [];

    if (!assignmentsForDB) {
      console.warn("AI failed, generating fallback schedule:", aiError);

      const daysInMonth = new Date(year, month, 0).getDate();
      assignmentsForDB = [];

      const lastAssignedDay: Record<string, number> = {};
      members.forEach((m) => {
        lastAssignedDay[m.user_id] = -Infinity;
      });

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

        const shiftAssignmentsForDay: Record<string, string[]> = {};

        for (const shift of shifts) {
          const availableMembers = availabilityMap.get(dateStr)
            ? members.filter((m) => availabilityMap.get(dateStr)!.has(m.user_id))
            : members;

          let chosenMember = availableMembers[0];
          let oldest = Infinity;
          for (const m of availableMembers) {
            if (lastAssignedDay[m.user_id] < oldest) {
              oldest = lastAssignedDay[m.user_id];
              chosenMember = m;
            }
          }

          assignmentsForDB.push({
            schedule_id: "",
            user_id: chosenMember.user_id,
            shift_id: shift.id,
            date: dateStr,
            team_id: teamId,
          });

          lastAssignedDay[chosenMember.user_id] = day;

          // Track per-day shifts for conflict detection
          if (!shiftAssignmentsForDay[chosenMember.user_id]) {
            shiftAssignmentsForDay[chosenMember.user_id] = [];
          }
          shiftAssignmentsForDay[chosenMember.user_id].push(shift.name);
        }

        // Detect conflicts: same user in multiple shifts in one day
        for (const [userId, shiftsWorked] of Object.entries(shiftAssignmentsForDay)) {
          if (shiftsWorked.length > 1) {
            conflictList.push({
              date: dateStr,
              user: memberById.get(userId)?.name || userId,
              shifts: shiftsWorked,
            });
          }
        }
      }
    }

    // 7️⃣ Create schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from("schedules")
      .insert({
        team_id: teamId,
        month,
        year,
        generated_by: aiError ? "fallback" : "ai",
        status: "generated",
      })
      .select()
      .single();
    if (scheduleError) throw scheduleError;

    assignmentsForDB.forEach((a) => {
      a.schedule_id = schedule.id;
    });

    // 8️⃣ Insert assignments
    const { error: assignmentError } = await supabase
      .from("schedule_assignments")
      .insert(assignmentsForDB);
    if (assignmentError) throw assignmentError;

    return NextResponse.json({
      success: true,
      scheduleId: schedule.id,
      usedFallback: !!aiError,
      fallbackReason: aiError,
      conflicts: conflictList,
    });
  } catch (err) {
    console.error("Error generating schedule:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
