"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"

const STEPS: { title: string; body: string; anchor?: string }[] = [
  {
    title: "Welcome",
    body: "This looks like your first team. The page behind this overlay is the real form—nothing is saved until you tap Create Team at the end. Use Next to read each tip, or Skip tour if you prefer to explore on your own.",
  },
  {
    title: "Step 1 — Team details",
    body: "Start with a clear team name (often your unit or group). The description is optional but helps members know what the team is for. You can edit all of this later from team management.",
    anchor: "create-team-basic",
  },
  {
    title: "Step 2 — Shift types",
    body: "Each shift type is a pattern that repeats on the schedule—for example “Day shift” with its hours and how many people you need each time it runs. Add one row per pattern; most teams add at least two (such as day and night).",
    anchor: "create-team-shifts",
  },
  {
    title: "Step 3 — Times and weekdays",
    body: "Pick start and end times for each row, then choose which days that row applies to. If weekdays and weekends use different hours for the same shift name, turn on “Different shift hours between weekdays?” and add a second time row before adding the shift to your list.",
    anchor: "create-team-shifts",
  },
  {
    title: "You’re set",
    body: "When the tour closes, fill in the form at your own pace. Add at least one shift type, then press Create Team. After that you can invite people and adjust scheduling from your dashboard—no need to get everything perfect here.",
    anchor: "create-team-actions",
  },
]

type Props = {
  open: boolean
  onDismiss: () => void
}

export function CreateTeamFirstVisitWizard({ open, onDismiss }: Props) {
  const [step, setStep] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const id = STEPS[step]?.anchor
    const t = window.setTimeout(() => {
      if (id) {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" })
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" })
      }
    }, 100)
    return () => window.clearTimeout(t)
  }, [open, step])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => nextRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [open, step])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onDismiss])

  if (!open) return null

  const last = step >= STEPS.length - 1
  const content = STEPS[step]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] dark:bg-black/70"
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-team-wizard-title"
        className="relative z-[101] w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:max-w-lg sm:p-8"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950/80">
            <Sparkles className="h-5 w-5 text-blue-700 dark:text-blue-300" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Quick tour · {step + 1} of {STEPS.length}
            </p>
            <h2
              id="create-team-wizard-title"
              className="mt-1 text-lg font-semibold text-gray-900 dark:text-white"
            >
              {content.title}
            </h2>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{content.body}</p>

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-5 dark:border-gray-800">
          <Button type="button" variant="ghost" size="sm" className="text-gray-600" onClick={onDismiss}>
            Skip tour
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            {step > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {last ? (
              <Button ref={nextRef} type="button" size="sm" onClick={onDismiss}>
                Start filling out the form
              </Button>
            ) : (
              <Button ref={nextRef} type="button" size="sm" onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
