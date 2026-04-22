import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient as createSessionClient } from "@supabase/ssr"
import { createServerClient } from "@/utils/supabase/server"
import { sendEmail } from "@/utils/email"
import { routing } from "@/i18n/routing"

function parseMonthBounds(ym: string): { startDate: string; endDate: string } | null {
  const m = ym.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const year = Number(m[1])
  const monthNum = Number(m[2])
  if (monthNum < 1 || monthNum > 12) return null
  const startDate = `${year}-${String(monthNum).padStart(2, "0")}-01`
  const lastDay = new Date(year, monthNum, 0).getDate()
  const endDate = `${year}-${String(monthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  return { startDate, endDate }
}

/** Same six-month window as the host team availability UI. */
function isMonthInHostWindow(ym: string): boolean {
  const now = new Date()
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    if (s === ym) return true
  }
  return false
}

function getEmailFromUsersJoin(users: unknown): string | null {
  if (!users || typeof users !== "object") return null
  const row = Array.isArray(users) ? users[0] : users
  if (!row || typeof row !== "object") return null
  const email = (row as { email?: string }).email
  return typeof email === "string" && email.trim() ? email.trim() : null
}

function getFirstName(users: unknown): string | null {
  if (!users || typeof users !== "object") return null
  const row = Array.isArray(users) ? users[0] : users
  if (!row || typeof row !== "object") return null
  const name = (row as { first_name?: string }).first_name
  return typeof name === "string" && name.trim() ? name.trim() : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: teamId } = await params
    const body = await request.json().catch(() => ({}))
    const month = typeof body.month === "string" ? body.month : ""

    const bounds = parseMonthBounds(month)
    if (!teamId || !bounds) {
      return NextResponse.json({ error: "invalid_month" }, { status: 400 })
    }
    if (!isMonthInHostWindow(month)) {
      return NextResponse.json({ error: "invalid_month" }, { status: 400 })
    }

    const cookieStore = await cookies()
    const sessionSupabase = createSessionClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      },
    )

    const {
      data: { user },
      error: userError,
    } = await sessionSupabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createServerClient()

    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, host_id, name, department")
      .eq("id", teamId)
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 })
    }

    if (team.host_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { count: shiftCount, error: shiftErr } = await supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)

    if (shiftErr) {
      console.error("remind-availability shifts:", shiftErr)
      return NextResponse.json({ error: "Failed to load shifts" }, { status: 500 })
    }

    if (!shiftCount || shiftCount === 0) {
      return NextResponse.json({ error: "no_shifts" }, { status: 400 })
    }

    const { data: members, error: membersError } = await supabase
      .from("team_members")
      .select("user_id, users(email, first_name, last_name)")
      .eq("team_id", teamId)

    if (membersError || !members) {
      return NextResponse.json({ error: "Failed to load team members" }, { status: 500 })
    }

    const { data: availRows, error: availError } = await supabase
      .from("availability")
      .select("user_id")
      .eq("team_id", teamId)
      .gte("date", bounds.startDate)
      .lte("date", bounds.endDate)

    if (availError) {
      console.error("remind-availability availability:", availError)
      return NextResponse.json({ error: "Failed to load availability" }, { status: 500 })
    }

    const usersWithAnySlot = new Set((availRows ?? []).map((r) => r.user_id))

    const pending = members.filter(
      (m) => m.user_id !== team.host_id && !usersWithAnySlot.has(m.user_id),
    )

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.aischedulator.com"
    const availabilityLink = `${appUrl}/${routing.defaultLocale}/participant/availability`
    const monthLabel = new Date(`${month}-01`).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    })
    const teamLabel = team.name || team.department || "your team"

    let sent = 0
    let skippedNoEmail = 0
    let failed = 0

    for (const row of pending) {
      const to = getEmailFromUsersJoin(row.users)
      if (!to) {
        skippedNoEmail++
        continue
      }
      const first = getFirstName(row.users)
      const greeting = first ? `Hello ${first},` : "Hello,"

      try {
        await sendEmail({
          to,
          subject: `Reminder: submit availability for ${teamLabel} (${monthLabel})`,
          text: `${greeting}

Your team "${teamLabel}" is collecting availability for ${monthLabel}. We do not have any availability submitted from you for this month yet.

Please sign in and submit your availability here:
${availabilityLink}

Thank you,
AISchedulator`,
        })
        sent++
      } catch (e) {
        console.error("remind-availability send failed:", to, e)
        failed++
      }
    }

    return NextResponse.json({
      sent,
      failed,
      skippedNoEmail,
      pendingCount: pending.length,
    })
  } catch (error) {
    console.error("remind-availability:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
