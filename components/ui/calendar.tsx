"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <div className={cn("p-16", className)}>
      <style jsx>{`
        .rdp-table {
          width: 100%;
          border-collapse: collapse;
        }
        
        .rdp-head_row {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2rem;
          margin-bottom: 4rem;
        }
        
        .rdp-head_cell {
          height: 10rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 3.5rem;
          font-weight: 600;
          color: hsl(var(--foreground));
          background-color: hsl(var(--muted) / 0.5);
          border-radius: 2rem;
          text-transform: uppercase;
          letter-spacing: 0.15em;
        }
        
        .rdp-row {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2rem;
          margin-bottom: 2.5rem;
        }
        
        .rdp-cell {
          height: 11rem;
          position: relative;
          text-align: center;
        }
        
        .rdp-day {
          width: 100%;
          height: 11rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 4rem;
          font-weight: 500;
          border-radius: 2rem;
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          transition: all 0.2s ease-in-out;
          color: hsl(var(--foreground));
        }
        
        .rdp-day:hover {
          background-color: hsl(var(--accent));
          border-color: hsl(var(--border));
          transform: scale(1.05);
        }
        
        .rdp-day_selected {
          background-color: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          border-color: hsl(var(--primary));
          font-weight: 600;
          box-shadow: 0 2px 8px hsl(var(--primary) / 0.3);
        }
        
        .rdp-day_today {
          background-color: hsl(var(--accent));
          color: hsl(var(--accent-foreground));
          border-color: hsl(var(--border));
          font-weight: 600;
        }
        
        .rdp-day_outside {
          color: hsl(var(--muted-foreground));
          opacity: 0.6;
        }
        
        .rdp-day_disabled {
          color: hsl(var(--muted-foreground));
          opacity: 0.4;
          cursor: not-allowed;
        }
        
        .rdp-day_disabled:hover {
          transform: none;
          background: transparent;
          border-color: transparent;
        }
      `}</style>
      <DayPicker
        showOutsideDays={showOutsideDays}
        weekStartsOn={1} // Start week on Monday
        classNames={{
          months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
          month: "space-y-4",
          caption: "flex justify-center pt-1 relative items-center mb-4",
          caption_label: "text-4xl font-medium",
          nav: "space-x-1 flex items-center",
          nav_button: cn(
            buttonVariants({ variant: "outline" }),
            "h-16 w-16 bg-transparent p-0 opacity-50 hover:opacity-100 text-2xl"
          ),
          nav_button_previous: "absolute left-1",
          nav_button_next: "absolute right-1",
          table: "rdp-table",
          head_row: "rdp-head_row",
          head_cell: "rdp-head_cell",
          row: "rdp-row",
          cell: "rdp-cell",
          day: "rdp-day",
          day_range_end: "day-range-end",
          day_selected: "rdp-day_selected",
          day_today: "rdp-day_today",
          day_outside: "rdp-day_outside",
          day_disabled: "rdp-day_disabled",
          day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
          day_hidden: "invisible",
          ...classNames,
        }}
        {...props}
      />
    </div>
  )
}

Calendar.displayName = "Calendar"

export { Calendar }


