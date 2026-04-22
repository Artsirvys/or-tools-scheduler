"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Calendar,
  ArrowLeft,
  Check,
  X,
  Star,
  Clock,
  Users,
  AlertTriangle,
  CalendarRange,
  Copy,
} from "lucide-react"
import { Link } from "@/i18n/routing"
import { supabase } from "@/lib/supabase"
import { useLocale, useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

const AVAILABILITY_STATUSES = [
  "available",
  "priority",
  "unavailable",
  "vacation",
  "conference",
  "unset",
] as const
type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number]

function getNextCycleStatus(status: string): string {
  switch (status) {
    case "unset":
      return "available"
    case "available":
      return "priority"
    case "priority":
      return "unavailable"
    case "unavailable":
      return "vacation"
    case "vacation":
      return "conference"
    case "conference":
      return "unset"
    default:
      return "unset"
  }
}

/** Movement (px) to start paint-drag before long-press fires (touch + mouse). */
const DRAG_THRESHOLD_PX = 6
/** Hold duration (ms) on a shift cell to start paint with the selected brush (touch). */
const LONG_PRESS_START_MS = 200

/**
 * Block default touch scrolling while painting shift cells.
 * Date column (`[data-date-stripe]`) stays scrollable for vertical page scroll.
 */
function preventTouchScrollWhilePainting(e: TouchEvent) {
  const t = e.touches[0]
  if (!t) return
  const hit = document.elementFromPoint(t.clientX, t.clientY)
  if (hit?.closest("[data-date-stripe]")) return
  e.preventDefault()
}

// TypeScript interfaces for better type safety
interface User {
  id: string
  email?: string
}

interface Team {
  id: string
  name: string
  department: string
}

interface Shift {
  id: string
  name: string
  start_time?: string
  end_time?: string
  day_of_week?: number | null
  shifts?: Array<{
    id: string
    name: string
    start_time: string
    end_time: string
    day_of_week?: number | null
  }>
  timeDisplay?: string
}

/** e.g. "2025-03" -> "2025-02" */
function previousCalendarMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(y, m - 1, 1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** 1-based: first Monday of month = 1, second = 2, ... */
function weekIndexInMonth(year: number, month: number, day: number): number {
  const dow = new Date(year, month - 1, day).getDay()
  let idx = 0
  for (let d = 1; d <= day; d++) {
    if (new Date(year, month - 1, d).getDay() === dow) idx++
  }
  return idx
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  dow: number,
  occurrence: number,
): number | null {
  const dim = new Date(year, month, 0).getDate()
  let seen = 0
  for (let d = 1; d <= dim; d++) {
    if (new Date(year, month - 1, d).getDay() === dow) {
      seen++
      if (seen === occurrence) return d
    }
  }
  return null
}

function mapSourceDayToTargetDateKey(
  sourceY: number,
  sourceM: number,
  sourceD: number,
  targetYm: string,
  mode: "dayOfMonth" | "weekdayPosition",
): string | null {
  const [ty, tm] = targetYm.split("-").map(Number)
  if (mode === "dayOfMonth") {
    const dim = new Date(ty, tm, 0).getDate()
    if (sourceD > dim) return null
    return `${ty}-${String(tm).padStart(2, "0")}-${String(sourceD).padStart(2, "0")}`
  }
  const dow = new Date(sourceY, sourceM - 1, sourceD).getDay()
  const n = weekIndexInMonth(sourceY, sourceM, sourceD)
  const td = nthWeekdayOfMonth(ty, tm, dow, n)
  if (td === null) return null
  return `${ty}-${String(tm).padStart(2, "0")}-${String(td).padStart(2, "0")}`
}

function collectValidShiftIds(teamShifts: Shift[]): Set<string> {
  const ids = new Set<string>()
  for (const s of teamShifts) {
    if (s.shifts?.length) {
      s.shifts.forEach((a) => ids.add(a.id))
    } else {
      ids.add(s.id)
    }
  }
  return ids
}

async function fetchMonthAvailabilityMap(
  userId: string,
  teamId: string,
  monthYYYYMM: string,
): Promise<Record<string, Record<string, string>>> {
  const [year, monthNum] = monthYYYYMM.split("-").map(Number)
  const startDate = `${year}-${String(monthNum).padStart(2, "0")}-01`
  const currentMonthDate = new Date(year, monthNum - 1, 1)
  const nextMonthDate = new Date(
    currentMonthDate.getFullYear(),
    currentMonthDate.getMonth() + 1,
    1,
  )
  const endDate = `${nextMonthDate.getFullYear()}-${String(
    nextMonthDate.getMonth() + 1,
  ).padStart(2, "0")}-01`

  const { data, error } = await supabase
    .from("availability")
    .select("date, shift_id, status")
    .eq("user_id", userId)
    .eq("team_id", teamId)
    .gte("date", startDate)
    .lt("date", endDate)

  if (error) throw error

  const map: Record<string, Record<string, string>> = {}
  data?.forEach((avail) => {
    const dateKey = avail.date ? avail.date.split("T")[0] : avail.date
    if (!dateKey) return
    if (!map[dateKey]) map[dateKey] = {}
    map[dateKey][avail.shift_id] = avail.status
  })
  return map
}

function AvailabilityRangePopover({
  variant,
  shiftName,
  daysInMonth,
  onApply,
  tx,
}: {
  variant: "all" | "single"
  shiftName?: string
  daysInMonth: number
  onApply: (from: number, to: number, status: AvailabilityStatus) => void
  tx: (key: string, fallback: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [fromDay, setFromDay] = useState(1)
  const [toDay, setToDay] = useState(1)
  const [rangeStatus, setRangeStatus] = useState<AvailabilityStatus>("available")

  useEffect(() => {
    if (open) {
      setFromDay(1)
      setToDay(daysInMonth)
      setRangeStatus("available")
    }
  }, [open, daysInMonth])

  const dayChoices = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth],
  )

  const title =
    variant === "all"
      ? tx("range.titleAll", "All shifts in this row")
      : tx("range.titleShift", "This shift column")

  const handleApply = () => {
    let a = fromDay
    let b = toDay
    if (a > b) [a, b] = [b, a]
    onApply(a, b, rangeStatus)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1.5 h-9 w-full min-h-[36px] gap-1.5 px-2 text-xs font-normal"
          aria-label={
            variant === "all"
              ? tx("range.ariaAll", "Set availability for a date range for all shifts")
              : `${tx("range.ariaShiftPrefix", "Set date range for column")}: ${shiftName ?? ""}`
          }
        >
          <CalendarRange className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          <span className="truncate">{tx("range.trigger", "Range")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(100vw-1.5rem,20rem)] p-3 sm:w-80"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold leading-tight text-foreground">{title}</p>
            {variant === "single" && shiftName && (
              <p className="text-xs text-muted-foreground mt-0.5">{shiftName}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2 leading-snug">
              {variant === "all"
                ? tx(
                    "range.hintAll",
                    "Every shift column is updated for days in this range (only where that shift applies on that day).",
                  )
                : tx(
                    "range.hintShift",
                    "Only days where this shift appears in the grid are updated (same as tapping each cell).",
                  )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`range-from-${variant}-${shiftName ?? "all"}`} className="text-xs">
                {tx("range.from", "From")}
              </Label>
              <Select
                value={String(fromDay)}
                onValueChange={(v) => setFromDay(Number(v))}
              >
                <SelectTrigger id={`range-from-${variant}-${shiftName ?? "all"}`} className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {dayChoices.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`range-to-${variant}-${shiftName ?? "all"}`} className="text-xs">
                {tx("range.to", "To")}
              </Label>
              <Select
                value={String(toDay)}
                onValueChange={(v) => setToDay(Number(v))}
              >
                <SelectTrigger id={`range-to-${variant}-${shiftName ?? "all"}`} className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {dayChoices.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tx("range.statusLabel", "Availability")}</Label>
            <Select
              value={rangeStatus}
              onValueChange={(v) => setRangeStatus(v as AvailabilityStatus)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABILITY_STATUSES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st === "unset"
                      ? tx("status.notSet", "Not Set")
                      : tx(`status.${st}`, st)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" className="w-full h-10" onClick={handleApply}>
            {tx("range.apply", "Apply to range")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function AvailabilityPage() {
  const t = useTranslations("participant.availability")
  const locale = useLocale()
  const dateLocale = {
    en: "en-US",
    lt: "lt-LT",
    pl: "pl-PL",
    it: "it-IT",
    de: "de-DE",
  }[locale] || "en-US"
  const tx = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback)

  const [selectedTeam, setSelectedTeam] = useState("")
  const [selectedMonth, setSelectedMonth] = useState("")
  const [teams, setTeams] = useState<Team[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [availability, setAvailability] = useState<Record<string, Record<string, string>>>({})
  const [isSaving, setIsSaving] = useState(false)
  /** Shift column ids (group_*) selected for bulk “by shift type”. */
  const [bulkShiftIds, setBulkShiftIds] = useState<Set<string>>(new Set())
  /** 0=Sun … 6=Sat */
  const [bulkWeekdays, setBulkWeekdays] = useState<Set<number>>(new Set())
  const [copyDialogOpen, setCopyDialogOpen] = useState(false)
  const [copyMode, setCopyMode] = useState<"dayOfMonth" | "weekdayPosition">(
    "dayOfMonth",
  )
  const [isCopying, setIsCopying] = useState(false)
  /** Status applied when dragging across cells (paint). */
  const [brushStatus, setBrushStatus] =
    useState<AvailabilityStatus>("unavailable")
  const [isDragPainting, setIsDragPainting] = useState(false)
  const brushStatusRef = useRef<AvailabilityStatus>("unavailable")
  const skipClickRef = useRef(false)
  const dragStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    day: number
    shiftId: string
    dragging: boolean
  } | null>(null)
  const strokeKeysRef = useRef<Set<string>>(new Set())
  /** Ref on the scroll wrapper around the calendar table (touch-action lock during drag). */
  const gridScrollRef = useRef<HTMLDivElement | null>(null)
  const touchScrollBlockActiveRef = useRef(false)

  useEffect(() => {
    brushStatusRef.current = brushStatus
  }, [brushStatus])

  useEffect(() => {
    return () => {
      if (touchScrollBlockActiveRef.current) {
        window.removeEventListener(
          "touchmove",
          preventTouchScrollWhilePainting,
        )
        touchScrollBlockActiveRef.current = false
      }
    }
  }, [])

  // Generate month options for the next 6 months
  const generateMonthOptions = () => {
    const options = []
    const now = new Date()
    
    for (let i = 0; i < 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const year = date.getFullYear()
      const month = date.getMonth() + 1
      const monthString = `${year}-${String(month).padStart(2, '0')}`
      const monthName = date.toLocaleDateString(dateLocale, { month: "long", year: "numeric" })
      
      options.push({
        value: monthString,
        label: monthName
      })
    }
    
    return options
  }

  // Generate calendar days for the selected month
  const generateCalendarDays = () => {
    const [year, month] = selectedMonth.split("-").map(Number)
    const daysInMonth = new Date(year, month, 0).getDate()
    const days = []
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day)
    }
    return days
  }

  // Get shifts that apply to a specific date (for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getShiftsForDate = (date: Date) => {
    const dayOfWeek = date.getDay() // 0 = Sunday, 1 = Monday, etc.
    
    return shifts.filter(shift => {
      // If shift has no day_of_week specified, it applies to all days
      if (shift.day_of_week === null || shift.day_of_week === undefined) {
        return true
      }
      // Otherwise, only show if it matches the specific day
      return shift.day_of_week === dayOfWeek
    })
  }

  // Get shift display info for a specific date
  const getShiftDisplayInfo = (shift: Shift, date: Date) => {
    const dayOfWeek = date.getDay()
    const isSpecificDay = shift.day_of_week !== null && shift.day_of_week !== undefined
    
    // If shift is day-specific and doesn't match current date, don't show
    if (isSpecificDay && shift.day_of_week !== dayOfWeek) {
      return null
    }
    
    // If shift is day-specific, show the time
    if (isSpecificDay) {
      return {
        name: shift.name,
        time: `${shift.start_time} - ${shift.end_time}`,
        showTime: true
      }
    }
    
    // If shift applies to all days, only show time if there are other day-specific shifts
    const hasDaySpecificShifts = shifts.some(s => s.day_of_week !== null && s.day_of_week !== undefined)
    return {
      name: shift.name,
      time: `${shift.start_time} - ${shift.end_time}`,
      showTime: hasDaySpecificShifts
    }
  }

  /** Same rules as the grid: only days where a shift cell is interactive (not "—"). */
  const isShiftCellActive = (shift: Shift, rowDate: Date) => {
    if (shift.shifts?.length) {
      const applicable = shift.shifts.filter(
        (s) =>
          s.day_of_week === null ||
          s.day_of_week === undefined ||
          s.day_of_week === rowDate.getDay(),
      )
      return applicable.length > 0
    }
    return getShiftDisplayInfo(shift, rowDate) != null
  }

  /** Bulk set status for the visible month; respects the same grid rules as single cells. */
  const applyBulkStatus = (
    status: string,
    options: {
      /** If omitted, every day in the month is considered. */
      weekdayFilter?: (dow: number) => boolean
      /** If omitted or empty predicate always true, all shift columns are considered. */
      shiftIdFilter?: (shiftId: string) => boolean
    },
  ) => {
    if (!selectedMonth) return
    const [year, monthNum] = selectedMonth.split("-").map(Number)
    const daysInMonth = new Date(year, monthNum, 0).getDate()
    const weekdayOk = options.weekdayFilter ?? (() => true)
    const shiftOk = options.shiftIdFilter ?? (() => true)

    setAvailability((prev) => {
      const out = { ...prev }
      for (let day = 1; day <= daysInMonth; day++) {
        const key = `${selectedMonth}-${String(day).padStart(2, "0")}`
        const rowDate = new Date(`${selectedMonth}-${String(day).padStart(2, "0")}T12:00:00`)
        if (!weekdayOk(rowDate.getDay())) continue

        const bucket = { ...(prev[key] || {}) }
        let changed = false

        for (const shift of shifts) {
          if (!shiftOk(shift.id)) continue
          if (!isShiftCellActive(shift, rowDate)) continue
          changed = true
          if (shift.id.startsWith("group_") && shift.shifts?.length) {
            shift.shifts.forEach((actual) => {
              bucket[actual.id] = status
            })
          } else {
            bucket[shift.id] = status
          }
        }

        if (changed) {
          out[key] = bucket
        }
      }
      return out
    })
  }

  const markWeekendsUnavailable = () => {
    applyBulkStatus("unavailable", {
      weekdayFilter: (d) => d === 0 || d === 6,
    })
  }

  const markWorkdaysUnavailable = () => {
    applyBulkStatus("unavailable", {
      weekdayFilter: (d) => d >= 1 && d <= 5,
    })
  }

  const toggleBulkShift = (shiftId: string, checked: boolean) => {
    setBulkShiftIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(shiftId)
      else next.delete(shiftId)
      return next
    })
  }

  const toggleBulkWeekday = (dow: number, checked: boolean) => {
    setBulkWeekdays((prev) => {
      const next = new Set(prev)
      if (checked) next.add(dow)
      else next.delete(dow)
      return next
    })
  }

  const applyBulkShiftsUnavailable = () => {
    if (bulkShiftIds.size === 0) return
    applyBulkStatus("unavailable", {
      shiftIdFilter: (id) => bulkShiftIds.has(id),
    })
  }

  const applyBulkWeekdaysUnavailable = () => {
    if (bulkWeekdays.size === 0) return
    applyBulkStatus("unavailable", {
      weekdayFilter: (d) => bulkWeekdays.has(d),
    })
  }

  const applyAvailabilityForRange = (
    rawFrom: number,
    rawTo: number,
    status: string,
    scope: "all" | string,
  ) => {
    if (!selectedMonth) return
    const [year, monthNum] = selectedMonth.split("-").map(Number)
    const daysInMonth = new Date(year, monthNum, 0).getDate()
    let from = Math.max(1, Math.min(daysInMonth, rawFrom))
    let to = Math.max(1, Math.min(daysInMonth, rawTo))
    if (from > to) [from, to] = [to, from]

    setAvailability((prev) => {
      const out = { ...prev }
      for (let day = from; day <= to; day++) {
        const key = `${selectedMonth}-${String(day).padStart(2, "0")}`
        const rowDate = new Date(`${selectedMonth}-${String(day).padStart(2, "0")}T12:00:00`)
        const bucket = { ...(prev[key] || {}) }
        let changed = false

        const applyOneShift = (shift: Shift) => {
          if (!isShiftCellActive(shift, rowDate)) return
          changed = true
          if (shift.id.startsWith("group_") && shift.shifts?.length) {
            shift.shifts.forEach((actual) => {
              bucket[actual.id] = status
            })
          } else {
            bucket[shift.id] = status
          }
        }

        if (scope === "all") {
          shifts.forEach(applyOneShift)
        } else {
          const shift = shifts.find((s) => s.id === scope)
          if (shift) applyOneShift(shift)
        }

        if (changed) {
          out[key] = bucket
        }
      }
      return out
    })
  }

  const setDayAvailability = (day: number, shiftId: string, status: string) => {
    const key = `${selectedMonth}-${day.toString().padStart(2, "0")}`
    
    // Handle consolidated shifts - set availability for all underlying shifts
    if (shiftId.startsWith('group_')) {
      const shiftName = shiftId.replace('group_', '')
      const shift = shifts.find(s => s.name === shiftName)
      if (shift && shift.shifts) {
        setAvailability((prev) => {
          const newAvailability = { ...prev }
          if (!newAvailability[key]) newAvailability[key] = {}
          
          // Set the same status for all underlying shifts
          shift.shifts?.forEach(actualShift => {
            newAvailability[key][actualShift.id] = status
          })
          
          return newAvailability
        })
        return
      }
    }
    
    // Handle regular shifts
    setAvailability((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [shiftId]: status,
      },
    }))
  }

  const getDayAvailability = (day: number, shiftId: string) => {
    const key = `${selectedMonth}-${day.toString().padStart(2, "0")}`
    
    // Consolidated shifts: underlying IDs share one control; use first defined value (including explicit "unset")
    if (shiftId.startsWith("group_")) {
      const shiftName = shiftId.replace("group_", "")
      const shift = shifts.find((s) => s.name === shiftName)
      if (shift?.shifts?.length) {
        for (const actualShift of shift.shifts) {
          const status = availability[key]?.[actualShift.id]
          if (status !== undefined) {
            return status
          }
        }
      }
    }

    // No saved row: treat as available (reduces friction vs. "not set")
    return availability[key]?.[shiftId] ?? "available"
  }

  const paintCellIfActive = (day: number, shiftId: string, status: string) => {
    const shift = shifts.find((s) => s.id === shiftId)
    if (!shift || !selectedMonth) return
    const rowDate = new Date(
      `${selectedMonth}-${String(day).padStart(2, "0")}T12:00:00`,
    )
    if (!isShiftCellActive(shift, rowDate)) return
    const k = `${day}:${shiftId}`
    if (strokeKeysRef.current.has(k)) return
    strokeKeysRef.current.add(k)
    setDayAvailability(day, shiftId, status)
  }

  const handleCellPointerDown = (
    e: React.PointerEvent,
    day: number,
    shiftId: string,
  ) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      day,
      shiftId,
      dragging: false,
    }

    let longPressTimer: ReturnType<typeof setTimeout> | null = null
    const clearLongPress = () => {
      if (longPressTimer != null) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
    }

    // Mobile: block page scroll on shift area; date stripe stays scrollable (see preventTouchScrollWhilePainting).
    if (e.pointerType === "touch") {
      window.addEventListener(
        "touchmove",
        preventTouchScrollWhilePainting,
        { passive: false },
      )
      touchScrollBlockActiveRef.current = true
      const el = gridScrollRef.current
      if (el) {
        el.style.touchAction = "none"
        el.style.overscrollBehavior = "contain"
      }
      longPressTimer = setTimeout(() => {
        longPressTimer = null
        const d = dragStateRef.current
        if (!d || d.dragging) return
        d.dragging = true
        setIsDragPainting(true)
        paintCellIfActive(d.day, d.shiftId, brushStatusRef.current)
      }, LONG_PRESS_START_MS)
    }

    const onMove = (ev: PointerEvent) => {
      const d = dragStateRef.current
      if (!d || ev.pointerId !== d.pointerId) return
      const dist = Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY)
      if (!d.dragging && dist > DRAG_THRESHOLD_PX) {
        clearLongPress()
        d.dragging = true
        setIsDragPainting(true)
        paintCellIfActive(d.day, d.shiftId, brushStatusRef.current)
      }
      if (d.dragging) {
        const el = document.elementFromPoint(ev.clientX, ev.clientY)
        const host = el?.closest?.("[data-drag-cell]") as HTMLElement | null
        if (host?.dataset.day && host.dataset.shiftId) {
          paintCellIfActive(
            Number(host.dataset.day),
            host.dataset.shiftId,
            brushStatusRef.current,
          )
        }
      }
    }

    const onEnd = (ev: PointerEvent) => {
      const d = dragStateRef.current
      if (!d || ev.pointerId !== d.pointerId) return
      clearLongPress()
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onEnd)
      window.removeEventListener("pointercancel", onEnd)

      if (touchScrollBlockActiveRef.current) {
        window.removeEventListener(
          "touchmove",
          preventTouchScrollWhilePainting,
        )
        touchScrollBlockActiveRef.current = false
        const el = gridScrollRef.current
        if (el) {
          el.style.removeProperty("touch-action")
          el.style.removeProperty("overscroll-behavior")
        }
      }

      if (!d.dragging) {
        skipClickRef.current = true
        const status = getDayAvailability(d.day, d.shiftId)
        setDayAvailability(d.day, d.shiftId, getNextCycleStatus(status))
      } else {
        skipClickRef.current = true
      }
      strokeKeysRef.current.clear()
      dragStateRef.current = null
      setIsDragPainting(false)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onEnd)
    window.addEventListener("pointercancel", onEnd)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-100 text-green-800 border-green-200"
      case "priority":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "unavailable":
        return "bg-red-100 text-red-800 border-red-200"
      case "vacation":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "conference":
        return "bg-purple-100 text-purple-800 border-purple-200"
      default:
        return "bg-gray-100 text-gray-600 border-gray-200"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "available":
        return <Check className="h-3 w-3" />
      case "priority":
        return <Star className="h-3 w-3" />
      case "unavailable":
        return <X className="h-3 w-3" />
      case "vacation":
        return <Calendar className="h-3 w-3" />
      case "conference":
        return <Users className="h-3 w-3" />
      default:
        return <Clock className="h-3 w-3" />
    }
  }

  const calendarDays = generateCalendarDays()
  const daysInMonth = useMemo(() => {
    if (!selectedMonth) return 31
    const [y, m] = selectedMonth.split("-").map(Number)
    if (Number.isNaN(y) || Number.isNaN(m)) return 31
    return new Date(y, m, 0).getDate()
  }, [selectedMonth])

  const previousMonthLabel = useMemo(() => {
    if (!selectedMonth) return ""
    const prev = previousCalendarMonth(selectedMonth)
    const [y, m] = prev.split("-").map(Number)
    if (Number.isNaN(y) || Number.isNaN(m)) return ""
    return new Date(y, m - 1, 1).toLocaleDateString(dateLocale, {
      month: "long",
      year: "numeric",
    })
  }, [selectedMonth, dateLocale])

  const currentMonthLabel = useMemo(() => {
    if (!selectedMonth) return ""
    const [y, m] = selectedMonth.split("-").map(Number)
    if (Number.isNaN(y) || Number.isNaN(m)) return ""
    return new Date(y, m - 1, 1).toLocaleDateString(dateLocale, {
      month: "long",
      year: "numeric",
    })
  }, [selectedMonth, dateLocale])

  const weekdayPickerMeta = useMemo(() => {
    const mondayRef = new Date(2024, 5, 3)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mondayRef)
      d.setDate(mondayRef.getDate() + i)
      return {
        dow: d.getDay(),
        label: d.toLocaleDateString(dateLocale, { weekday: "short" }),
      }
    })
  }, [dateLocale])

  useEffect(() => {
    setBulkShiftIds(new Set())
    setBulkWeekdays(new Set())
  }, [shifts])

  // Initialize data
  useEffect(() => {
    const init = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.error('No user found')
          setLoading(false)
          return
        }
        setUser(user)

        // Set next month as default
        const nextMonth = new Date()
        nextMonth.setMonth(nextMonth.getMonth() + 1)
        const nextMonthString = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`
        setSelectedMonth(nextMonthString)

        // Fetch user's teams
        console.log('Fetching teams for user:', user.id)
        const { data: teamMembers, error: teamError } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', user.id)

        if (teamError) {
          console.error('Error fetching teams:', teamError)
        }

        console.log('Team members data:', teamMembers)
        console.log('Team members length:', teamMembers?.length || 0)
        console.log('Team members raw data:', JSON.stringify(teamMembers, null, 2))

        if (teamMembers && teamMembers.length > 0) {
          // Fetch team details separately
          const teamIds = teamMembers.map(tm => tm.team_id)
          console.log('Team IDs to fetch:', teamIds)
          
          const { data: teamsData, error: teamsError } = await supabase
            .from('teams')
            .select('id, name, department')
            .in('id', teamIds)

          if (teamsError) {
            console.error('Error fetching team details:', teamsError)
          }

          console.log('Teams data:', teamsData)
          
          if (teamsData && teamsData.length > 0) {
            const userTeams = teamsData.map(team => ({
              id: team.id,
              name: team.name,
              department: team.department
            }))
            console.log('User teams:', userTeams)
            setTeams(userTeams)
            setSelectedTeam(userTeams[0].id) // Set first team as default

            // Load shifts and availability for the selected team
            await loadShifts(userTeams[0].id)
            await loadAvailabilityForTeam(user.id, userTeams[0].id, nextMonthString)
          }
        } else {
          console.log('No team memberships found for user:', user.id)
        }

      } catch (error) {
        console.error('Error initializing:', error)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  const loadShifts = async (teamId: string) => {
    try {
      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts')
        .select('id, name, start_time, end_time, day_of_week')
        .eq('team_id', teamId)

      if (shiftsError) {
        console.error('Error fetching shifts:', shiftsError)
        return
      }

      if (shiftsData) {
        // Consolidate shifts by name, keeping unique time configurations
        const shiftMap = new Map()
        shiftsData.forEach(shift => {
          const key = shift.name
          if (!shiftMap.has(key)) {
            shiftMap.set(key, [])
          }
          shiftMap.get(key).push(shift)
        })

        // Convert to array format for display
        const consolidatedShifts = Array.from(shiftMap.entries()).map(([name, shiftList]) => ({
          id: `group_${name}`,
          name: name,
          shifts: shiftList as Array<{
            id: string
            name: string
            start_time: string
            end_time: string
            day_of_week?: number | null
          }>,
          // Show time range if there are multiple time configurations
          timeDisplay: shiftList.length === 1 
            ? `${shiftList[0].start_time} - ${shiftList[0].end_time}`
            : `${shiftList.length} time configs`
        }))
        
        setShifts(consolidatedShifts)
      }
    } catch (error) {
      console.error('Error loading shifts:', error)
    }
  }

  const loadAvailabilityForTeam = async (userId: string, teamId: string, month: string) => {
    try {
      const [year, monthNum] = month.split('-').map(Number)
      
      // Calculate the start date (first day of the month)
      const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`
      
      // Calculate the end date (first day of the next month) - handle year rollover
      // Date constructor uses 0-based months (0=Jan, 11=Dec), so monthNum (1-12) becomes monthNum-1
      // But we want next month, so use monthNum directly (which will be 1-12, but Date treats it as next month)
      // Actually, let's be explicit: create date for current month, then add 1 month
      const currentMonthDate = new Date(year, monthNum - 1, 1) // monthNum is 1-12, convert to 0-11
      const nextMonthDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1)
      const endYear = nextMonthDate.getFullYear()
      const endMonth = nextMonthDate.getMonth() + 1 // getMonth() returns 0-11, convert back to 1-12
      const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`
      
      // Load availability specifically for the selected team
      const { data: availabilityData, error } = await supabase
        .from('availability')
        .select('date, shift_id, status')
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .gte('date', startDate)
        .lt('date', endDate)

      if (error) {
        console.error('Error loading availability:', error)
        return
      }

      // Transform availability data to our format
      // The key format should match what getDayAvailability expects: "YYYY-MM-DD"
      const availabilityMap: Record<string, Record<string, string>> = {}
      availabilityData?.forEach(avail => {
        // Normalize the date to ensure it matches the format used in getDayAvailability
        // Database date might be in format "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss.sssZ"
        // We need to extract just the date part (YYYY-MM-DD)
        const dateKey = avail.date ? avail.date.split('T')[0] : avail.date
        if (!availabilityMap[dateKey]) {
          availabilityMap[dateKey] = {}
        }
        // Store availability with shift_id (this will match the actual shift IDs from database)
        availabilityMap[dateKey][avail.shift_id] = avail.status
      })

      setAvailability(availabilityMap)
    } catch (error) {
      console.error('Error loading availability:', error)
    }
  }

  const saveAvailability = async () => {
    if (!user || !selectedTeam || !selectedMonth) return

    setIsSaving(true)
    try {
      // Prepare availability entries for upsert
      const availabilityEntries = []
      for (const [dateKey, shiftStatuses] of Object.entries(availability)) {
        for (const [shiftId, status] of Object.entries(shiftStatuses)) {
          if (status !== 'unset') {
            // Find the actual shift ID if this is a consolidated shift
            let actualShiftId = shiftId
            if (shiftId.startsWith('group_')) {
              const shiftName = shiftId.replace('group_', '')
              const shift = shifts.find(s => s.name === shiftName)
              if (shift && shift.shifts && shift.shifts.length > 0) {
                // Use the first actual shift ID for saving
                actualShiftId = shift.shifts[0].id
              }
            }
            
            availabilityEntries.push({
              user_id: user.id,
              team_id: selectedTeam,
              shift_id: actualShiftId,
              date: dateKey,
              status
            })
          }
        }
      }

      if (availabilityEntries.length > 0) {
        // Use upsert to handle both insert and update cases
        const { error } = await supabase
          .from('availability')
          .upsert(availabilityEntries, {
            onConflict: 'user_id,team_id,shift_id,date'
          })

        if (error) {
          console.error('Error saving availability:', error)
          alert(tx("alerts.saveFailed", "Failed to save availability"))
          return
        }
      }

      alert(tx("alerts.saveSuccess", "Availability saved successfully!"))
    } catch (error) {
      console.error('Error saving availability:', error)
      alert(tx("alerts.saveFailed", "Failed to save availability"))
    } finally {
      setIsSaving(false)
    }
  }

  const handleCopyLastMonth = async () => {
    if (!user || !selectedTeam || !selectedMonth) return
    setIsCopying(true)
    try {
      const prevYm = previousCalendarMonth(selectedMonth)
      const sourceMap = await fetchMonthAvailabilityMap(
        user.id,
        selectedTeam,
        prevYm,
      )
      if (Object.keys(sourceMap).length === 0) {
        alert(
          tx(
            "copy.empty",
            "No saved availability found for last month.",
          ),
        )
        return
      }
      const validIds = collectValidShiftIds(shifts)
      setAvailability((prevAvail) => {
        const merged = { ...prevAvail }
        for (const [sourceKey, shiftMap] of Object.entries(sourceMap)) {
          const parts = sourceKey.split("-")
          if (parts.length < 3) continue
          const sy = Number(parts[0])
          const sm = Number(parts[1])
          const sd = Number(parts[2])
          if (Number.isNaN(sy) || Number.isNaN(sm) || Number.isNaN(sd)) continue
          const targetKey = mapSourceDayToTargetDateKey(
            sy,
            sm,
            sd,
            selectedMonth,
            copyMode,
          )
          if (!targetKey) continue
          const filtered: Record<string, string> = {}
          for (const [sid, st] of Object.entries(shiftMap)) {
            if (validIds.has(sid)) filtered[sid] = st
          }
          if (Object.keys(filtered).length === 0) continue
          merged[targetKey] = { ...(merged[targetKey] || {}), ...filtered }
        }
        return merged
      })
      setCopyDialogOpen(false)
      alert(
        tx(
          "copy.success",
          "Availability copied from last month. Review and save when ready.",
        ),
      )
    } catch (e) {
      console.error(e)
      alert(
        tx("copy.failed", "Could not copy availability. Please try again."),
      )
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            {/* Update the back button link */}
            <Link href="/participant/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {tx("backToDashboard", "Back to Dashboard")}
              </Button>
            </Link>
            <div className="flex items-center space-x-2">
              <Calendar className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">{tx("title", "Set Availability")}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">{tx("loading", "Loading your availability settings...")}</p>
          </div>
        ) : teams.length === 0 ? (
          <div className="text-center py-12">
            <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">{tx("noTeamTitle", "You are not assigned to any team yet")}</h2>
            <p className="text-gray-600 mb-4">{tx("noTeamDesc", "Please contact your administrator to be added to a team before setting availability.")}</p>
            <Link href="/participant/dashboard">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {tx("backToDashboard", "Back to Dashboard")}
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="mb-8 space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">{tx("selectTeam", "Select Team")}</label>
                <Select value={selectedTeam} onValueChange={async (teamId) => {
                  setSelectedTeam(teamId)
                  if (user) {
                    await loadShifts(teamId)
                    // Load availability specifically for the selected team
                    await loadAvailabilityForTeam(user.id, teamId, selectedMonth)
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">{tx("selectMonth", "Select Month")}</label>
                <Select value={selectedMonth} onValueChange={async (month) => {
                  setSelectedMonth(month)
                  if (user && selectedTeam) {
                    await loadAvailabilityForTeam(user.id, selectedTeam, month)
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {generateMonthOptions().map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              </div>

              <div>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={!selectedMonth || !user || !selectedTeam}
                  onClick={() => setCopyDialogOpen(true)}
                >
                  <Copy className="h-4 w-4 shrink-0" aria-hidden />
                  {tx("copy.trigger", "Copy from previous month")}
                </Button>
                <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>
                        {tx("copy.title", "Copy previous month")}
                      </DialogTitle>
                      <DialogDescription className="text-left">
                        {tx(
                          "copy.desc",
                          "Load saved availability from {prev} into {current}. Overwrites overlapping dates in the grid for shift types that still exist.",
                        )
                          .replace("{prev}", previousMonthLabel || "—")
                          .replace("{current}", currentMonthLabel || "—")}
                      </DialogDescription>
                    </DialogHeader>
                    <RadioGroup
                      value={copyMode}
                      onValueChange={(v) =>
                        setCopyMode(v as "dayOfMonth" | "weekdayPosition")
                      }
                      className="space-y-3 py-2"
                    >
                      <div className="flex gap-3 rounded-md border p-3">
                        <RadioGroupItem
                          value="dayOfMonth"
                          id="copy-dom"
                          className="mt-1 shrink-0"
                        />
                        <div className="grid gap-1">
                          <Label
                            htmlFor="copy-dom"
                            className="cursor-pointer font-medium leading-snug"
                          >
                            {tx("copy.dayOfMonth", "Same day of month")}
                          </Label>
                          <p className="text-xs text-muted-foreground leading-snug">
                            {tx(
                              "copy.dayOfMonthHelp",
                              "The 10th maps to the 10th. Days that do not exist in this month are skipped (e.g. 31st in a 30-day month).",
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3 rounded-md border p-3">
                        <RadioGroupItem
                          value="weekdayPosition"
                          id="copy-wd"
                          className="mt-1 shrink-0"
                        />
                        <div className="grid gap-1">
                          <Label
                            htmlFor="copy-wd"
                            className="cursor-pointer font-medium leading-snug"
                          >
                            {tx("copy.weekday", "Same weekday position")}
                          </Label>
                          <p className="text-xs text-muted-foreground leading-snug">
                            {tx(
                              "copy.weekdayHelp",
                              "Matches by weekday order in the month (e.g. 2nd Tuesday → 2nd Tuesday). Skipped if that occurrence does not exist.",
                            )}
                          </p>
                        </div>
                      </div>
                    </RadioGroup>
                    <DialogFooter className="gap-2 sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCopyDialogOpen(false)}
                        disabled={isCopying}
                      >
                        {tx("copy.cancel", "Cancel")}
                      </Button>
                      <Button
                        type="button"
                        onClick={handleCopyLastMonth}
                        disabled={isCopying}
                      >
                        {isCopying
                          ? tx("copy.applying", "Copying…")
                          : tx("copy.apply", "Copy")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">{tx("bulk.title", "Quick: mark unavailable")}</CardTitle>
            <CardDescription>
              {tx(
                "bulk.desc",
                "Applies to the month shown below. Only cells that appear in the grid are updated.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-10"
                onClick={markWeekendsUnavailable}
              >
                {tx("bulk.weekends", "Mark all weekends unavailable")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="min-h-10"
                onClick={markWorkdaysUnavailable}
              >
                {tx("bulk.workdays", "Mark all workdays unavailable")}
              </Button>
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/30 p-4 dark:bg-muted/15">
              <div>
                <p className="text-sm font-medium">{tx("bulk.shiftSection", "By shift type")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {tx("bulk.shiftHint", "Select one or more shift columns for this team.")}
                </p>
              </div>
              {shifts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tx("bulk.noShifts", "No shifts for this team.")}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="text-sm text-primary underline-offset-4 hover:underline"
                      onClick={() =>
                        setBulkShiftIds(new Set(shifts.map((s) => s.id)))
                      }
                    >
                      {tx("bulk.selectAllShifts", "Select all")}
                    </button>
                    <button
                      type="button"
                      className="text-sm text-primary underline-offset-4 hover:underline"
                      onClick={() => setBulkShiftIds(new Set())}
                    >
                      {tx("bulk.clearShifts", "Clear")}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {shifts.map((shift) => {
                      const cid = `bulk-shift-${shift.id}`
                      return (
                        <div key={shift.id} className="flex items-center gap-2">
                          <Checkbox
                            id={cid}
                            checked={bulkShiftIds.has(shift.id)}
                            onCheckedChange={(c) =>
                              toggleBulkShift(shift.id, c === true)
                            }
                          />
                          <Label htmlFor={cid} className="cursor-pointer text-sm font-normal">
                            {shift.name}
                          </Label>
                        </div>
                      )
                    })}
                  </div>
                  <Button
                    type="button"
                    disabled={bulkShiftIds.size === 0}
                    onClick={applyBulkShiftsUnavailable}
                  >
                    {tx("bulk.applyShifts", "Mark selected shifts unavailable")}
                  </Button>
                </>
              )}
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/30 p-4 dark:bg-muted/15">
              <div>
                <p className="text-sm font-medium">
                  {tx("bulk.weekdaySection", "By day of the week")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {tx(
                    "bulk.weekdayHint",
                    "Select days; every shift column is set unavailable on those days in this month.",
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                  onClick={() =>
                    setBulkWeekdays(new Set(weekdayPickerMeta.map((w) => w.dow)))
                  }
                >
                  {tx("bulk.selectAllDays", "Select all")}
                </button>
                <button
                  type="button"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                  onClick={() => setBulkWeekdays(new Set())}
                >
                  {tx("bulk.clearDays", "Clear")}
                </button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {weekdayPickerMeta.map(({ dow, label }) => {
                  const wid = `bulk-dow-${dow}`
                  return (
                    <div key={dow} className="flex min-w-[5.5rem] items-center gap-2">
                      <Checkbox
                        id={wid}
                        checked={bulkWeekdays.has(dow)}
                        onCheckedChange={(c) => toggleBulkWeekday(dow, c === true)}
                      />
                      <Label htmlFor={wid} className="cursor-pointer text-sm font-normal">
                        {label}
                      </Label>
                    </div>
                  )
                })}
              </div>
              <Button
                type="button"
                disabled={bulkWeekdays.size === 0}
                onClick={applyBulkWeekdaysUnavailable}
              >
                {tx("bulk.applyWeekdays", "Mark selected days unavailable")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">{tx("legendTitle", "Availability Legend")}</CardTitle>
            <CardDescription>{tx("legendDesc", "Click on any date/shift combination to set your availability")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center space-x-2">
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <Check className="h-3 w-3 mr-1" />
                  {tx("status.available", "Available")}
                </Badge>
                <span className="text-sm text-gray-600">{tx("status.availableDesc", "I can work this shift")}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                  <Star className="h-3 w-3 mr-1" />
                  {tx("status.priority", "Priority")}
                </Badge>
                <span className="text-sm text-gray-600">{tx("status.priorityDesc", "I prefer to work this shift")}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className="bg-red-100 text-red-800 border-red-200">
                  <X className="h-3 w-3 mr-1" />
                  {tx("status.unavailable", "Unavailable")}
                </Badge>
                <span className="text-sm text-gray-600">{tx("status.unavailableDesc", "I cannot work this shift")}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                  <Calendar className="h-3 w-3 mr-1" />
                  {tx("status.vacation", "Vacation")}
                </Badge>
                <span className="text-sm text-gray-600">{tx("status.vacationDesc", "On vacation")}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className="bg-purple-100 text-purple-800 border-purple-200">
                  <Users className="h-3 w-3 mr-1" />
                  {tx("status.conference", "Conference")}
                </Badge>
                <span className="text-sm text-gray-600">{tx("status.conferenceDesc", "At conference")}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className="bg-gray-100 text-gray-600 border-gray-200">
                  <Clock className="h-3 w-3 mr-1" />
                  {tx("status.notSet", "Not Set")}
                </Badge>
                <span className="text-sm text-gray-600">{tx("status.notSetDesc", "No preference marked")}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendar - Swapped Layout: Dates as Rows, Shifts as Columns */}
        <Card>
          <CardHeader>
            <CardTitle>
              {new Date(selectedMonth + "-01").toLocaleDateString(dateLocale, {
                month: "long",
                year: "numeric",
              })}{" "}
              - {teams.find((t) => t.id === selectedTeam)?.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                {tx(
                  "dragFill.lead",
                  "Tap a shift cell to cycle. Pick a brush below, then hold (~0.2s) or drag to paint. Scroll the page using the date column on the left.",
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {tx("dragFill.brush", "Drag fills with")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABILITY_STATUSES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setBrushStatus(st)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        brushStatus === st
                          ? "border-primary bg-primary/10 ring-2 ring-primary ring-offset-1"
                          : "border-border bg-background hover:bg-muted/60",
                      )}
                    >
                      {st === "unset"
                        ? tx("status.notSet", "Not Set")
                        : tx(`status.${st}`, st)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div
              ref={gridScrollRef}
              className={cn(
                "overflow-x-auto overscroll-contain",
                isDragPainting && "touch-none select-none",
              )}
            >
              <table className="w-full border-collapse">
                {/* Header Row - Shifts */}
                <thead>
                  <tr>
                    <th
                      data-date-stripe="true"
                      className="touch-pan-y border p-2 sm:p-3 bg-gray-50 dark:bg-gray-800 text-left font-medium sticky left-0 z-10 min-w-[100px] sm:min-w-[120px] align-top"
                    >
                      <div className="text-sm font-medium">{tx("date", "Date")}</div>
                      <AvailabilityRangePopover
                        variant="all"
                        daysInMonth={daysInMonth}
                        tx={tx}
                        onApply={(from, to, status) =>
                          applyAvailabilityForRange(from, to, status, "all")
                        }
                      />
                    </th>
                    {shifts.map((shift) => (
                      <th
                        key={shift.id}
                        className="border p-2 sm:p-3 bg-gray-50 dark:bg-gray-800 text-center min-w-[100px] sm:min-w-[120px] align-top"
                      >
                        <div className="font-medium text-sm leading-tight">{shift.name}</div>
                        <AvailabilityRangePopover
                          variant="single"
                          shiftName={shift.name}
                          daysInMonth={daysInMonth}
                          tx={tx}
                          onApply={(from, to, status) =>
                            applyAvailabilityForRange(from, to, status, shift.id)
                          }
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Each Row is a Date */}
                  {calendarDays.map((day) => {
                    const rowDate = new Date(selectedMonth + `-${day.toString().padStart(2, "0")}`)
                    const isWeekend = rowDate.getDay() === 0 || rowDate.getDay() === 6
                    const weekendCellClass = isWeekend ? "bg-red-100/60 dark:bg-red-900/35" : ""
                    const weekendDateCellClass = isWeekend
                      ? "bg-red-100/80 dark:bg-red-900/45"
                      : "bg-gray-50 dark:bg-gray-800"

                    return (
                    <tr key={day}>
                      <td
                        data-date-stripe="true"
                        className={cn(
                          "touch-pan-y border p-2 sm:p-3 font-medium sticky left-0 z-10",
                          weekendDateCellClass,
                        )}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center">
                          <span className="text-base sm:text-lg font-bold">{day}</span>
                          <span className="text-xs sm:text-sm text-gray-500 sm:ml-2">
                            {rowDate.toLocaleDateString(
                              dateLocale,
                              {
                                weekday: "short",
                              },
                            )}
                          </span>

                        </div>
                      </td>
                      {/* Each Column is a Shift */}
                      {(() => {
                        const currentDate = rowDate
                        
                        return shifts.map((shift) => {
                          // Handle consolidated shifts
                          if (shift.shifts) {
                            // Find shifts that apply to this date
                            const applicableShifts = shift.shifts.filter(s => {
                              if (s.day_of_week === null || s.day_of_week === undefined) return true
                              return s.day_of_week === currentDate.getDay()
                            })
                            
                            if (applicableShifts.length === 0) {
                              return (
                                <td key={shift.id} className={`border p-1 sm:p-2 ${weekendCellClass}`}>
                                  <div className={`w-full h-12 sm:h-16 flex items-center justify-center ${isWeekend ? "bg-red-100/70 dark:bg-red-900/40" : "bg-gray-50 dark:bg-gray-800"}`}>
                                    <span className="text-xs text-gray-400">-</span>
                                  </div>
                                </td>
                              )
                            }
                            
                            // Always show time for this specific day
                            const timeDisplay = applicableShifts.length === 1 
                              ? `${applicableShifts[0].start_time} - ${applicableShifts[0].end_time}`
                              : applicableShifts.map(s => `${s.start_time} - ${s.end_time}`).join(', ')
                            
                            const status = getDayAvailability(day, shift.id)
                            return (
                              <td key={shift.id} className={`border p-1 sm:p-2 ${weekendCellClass}`}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  type="button"
                                  data-drag-cell="true"
                                  data-day={day}
                                  data-shift-id={shift.id}
                                  className={cn(
                                    "w-full h-12 sm:h-16 text-xs touch-manipulation",
                                    getStatusColor(status),
                                  )}
                                  onPointerDown={(e) =>
                                    handleCellPointerDown(e, day, shift.id)
                                  }
                                  onClick={() => {
                                    if (skipClickRef.current) {
                                      skipClickRef.current = false
                                      return
                                    }
                                    const cur = getDayAvailability(day, shift.id)
                                    setDayAvailability(
                                      day,
                                      shift.id,
                                      getNextCycleStatus(cur),
                                    )
                                  }}
                                >
                                  <div className="flex flex-col items-center">
                                    {getStatusIcon(status)}
                                    <span className="text-xs mt-1 capitalize leading-tight">
                                      {status === "unset" ? tx("status.notSet", "Not Set") : tx(`status.${status}`, status)}
                                    </span>
                                    <span className="text-xs text-gray-600 mt-1">
                                      {timeDisplay}
                                    </span>
                                  </div>
                                </Button>
                              </td>
                            )
                          }
                          
                          // Handle single shifts (fallback)
                          const shiftInfo = getShiftDisplayInfo(shift, currentDate)
                          if (!shiftInfo) {
                            return (
                              <td key={shift.id} className={`border p-1 sm:p-2 ${weekendCellClass}`}>
                                <div className={`w-full h-12 sm:h-16 flex items-center justify-center ${isWeekend ? "bg-red-100/70 dark:bg-red-900/40" : "bg-gray-50 dark:bg-gray-800"}`}>
                                  <span className="text-xs text-gray-400">-</span>
                                </div>
                              </td>
                            )
                          }
                          
                          const status = getDayAvailability(day, shift.id)
                          return (
                            <td key={shift.id} className={`border p-1 sm:p-2 ${weekendCellClass}`}>
                              <Button
                                variant="outline"
                                size="sm"
                                type="button"
                                data-drag-cell="true"
                                data-day={day}
                                data-shift-id={shift.id}
                                className={cn(
                                  "w-full h-12 sm:h-16 text-xs touch-manipulation",
                                  getStatusColor(status),
                                )}
                                onPointerDown={(e) =>
                                  handleCellPointerDown(e, day, shift.id)
                                }
                                onClick={() => {
                                  if (skipClickRef.current) {
                                    skipClickRef.current = false
                                    return
                                  }
                                  const cur = getDayAvailability(day, shift.id)
                                  setDayAvailability(
                                    day,
                                    shift.id,
                                    getNextCycleStatus(cur),
                                  )
                                }}
                              >
                                                                  <div className="flex flex-col items-center">
                                    {getStatusIcon(status)}
                                    <span className="text-xs mt-1 capitalize leading-tight">
                                      {status === "unset" ? tx("status.notSet", "Not Set") : tx(`status.${status}`, status)}
                                    </span>
                                    <span className="text-xs text-gray-600 mt-1">
                                      {shiftInfo.time}
                                    </span>
                                  </div>
                              </Button>
                            </td>
                          )
                        })
                      })()}
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>

            {/* Save Button */}
            <div className="mt-8 flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-4">
              <Button
                variant="outline"
                className="w-full sm:w-auto bg-transparent"
                disabled={isSaving}
                onClick={() => {
                  alert(tx("alerts.draftSaved", "Availability saved as draft! You can continue editing later."))
                }}
              >
                {tx("saveDraft", "Save as Draft")}
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={isSaving}
                onClick={saveAvailability}
              >
                {isSaving ? tx("saving", "Saving...") : tx("saveAvailability", "Save Availability")}
              </Button>
            </div>
          </CardContent>
        </Card>
          </>
        )}
      </div>
    </div>
  )
}
