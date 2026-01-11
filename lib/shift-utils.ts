export interface Shift {
  id: string;
  team_id: string;
  name: string;
  start_time: string;
  end_time: string;
  day_specific_times?: Record<string, { start_time: string; end_time: string }>;
  created_at: string;
}

export interface ConsolidatedShift {
  id: string;
  name: string;
  baseStartTime: string;
  baseEndTime: string;
  daySpecificTimes: Record<string, { start_time: string; end_time: string }>;
  shiftIds: string[]; // IDs of all shifts that were consolidated
  workersPerShift: number;
}

export function consolidateShifts(shifts: Shift[], workersPerShift: number): ConsolidatedShift[] {
  const shiftGroups = new Map<string, Shift[]>();
  
  // Group shifts by name (case-insensitive)
  shifts.forEach(shift => {
    const normalizedName = shift.name.toLowerCase().trim();
    if (!shiftGroups.has(normalizedName)) {
      shiftGroups.set(normalizedName, []);
    }
    shiftGroups.get(normalizedName)!.push(shift);
  });
  
  // Consolidate each group
  const consolidated: ConsolidatedShift[] = [];
  
  shiftGroups.forEach((shiftGroup) => {
    if (shiftGroup.length === 0) return;
    
    // Use the first shift as the base
    const baseShift = shiftGroup[0];
    
    // Collect all day-specific times
    const daySpecificTimes: Record<string, { start_time: string; end_time: string }> = {};
    
    shiftGroup.forEach(shift => {
      // Add base times if no day-specific times exist
      if (!shift.day_specific_times || Object.keys(shift.day_specific_times).length === 0) {
        daySpecificTimes['default'] = {
          start_time: shift.start_time,
          end_time: shift.end_time
        };
      } else {
        // Add day-specific times
        Object.entries(shift.day_specific_times).forEach(([day, times]) => {
          daySpecificTimes[day] = times;
        });
      }
    });
    
    consolidated.push({
      id: baseShift.id,
      name: baseShift.name,
      baseStartTime: baseShift.start_time,
      baseEndTime: baseShift.end_time,
      daySpecificTimes,
      shiftIds: shiftGroup.map(s => s.id),
      workersPerShift
    });
  });
  
  return consolidated;
}

export function getShiftTimeForDay(
  consolidatedShift: ConsolidatedShift, 
  dayOfWeek: number
): { start_time: string; end_time: string } {
  // Check if there's a specific time for this day
  const dayKey = dayOfWeek.toString();
  if (consolidatedShift.daySpecificTimes[dayKey]) {
    return consolidatedShift.daySpecificTimes[dayKey];
  }
  
  // Fall back to default/base times
  if (consolidatedShift.daySpecificTimes['default']) {
    return consolidatedShift.daySpecificTimes['default'];
  }
  
  // Final fallback to base times
  return {
    start_time: consolidatedShift.baseStartTime,
    end_time: consolidatedShift.baseEndTime
  };
}

export function formatShiftTimeDisplay(consolidatedShift: ConsolidatedShift): string {
  const { daySpecificTimes } = consolidatedShift;
  
  if (!daySpecificTimes || Object.keys(daySpecificTimes).length === 0) {
    return `${consolidatedShift.baseStartTime}–${consolidatedShift.baseEndTime}`;
  }
  
  // If there are day-specific times, show them
  const timeEntries = Object.entries(daySpecificTimes);
  
  if (timeEntries.length === 1) {
    const [, times] = timeEntries[0];
    return `${times.start_time}–${times.end_time}`;
  }
  
  // Multiple time variations - show a summary
  const uniqueTimes = new Set(
    timeEntries.map(([, times]) => `${times.start_time}–${times.end_time}`)
  );
  
  if (uniqueTimes.size === 1) {
    return Array.from(uniqueTimes)[0];
  }
  
  // Multiple different times - show count
  return `${uniqueTimes.size} time variations`;
}
