# Dynamic Shifts Feature for Participants

## Overview
The Dynamic Shifts feature replaces static shift data with real-time, personalized shift information from Supabase. Each participant sees only their assigned shifts for the current and next month, with the ability to request shift changes.

## Key Features

### 1. Personalized Shift Display
- **Real Data**: Fetches actual schedule assignments from Supabase
- **User-Specific**: Shows only shifts assigned to the current participant
- **Current/Next Month**: Focuses on upcoming shifts (current and next month)
- **Dynamic Loading**: Shows loading state while fetching data

### 2. Shift Information Display
- **Formatted Dates**: Shows dates in "Mon, Dec 15" format
- **Shift Details**: Displays shift name, time range, and team
- **Status Badges**: Shows "Confirmed" or "Change Requested" status
- **Empty State**: Shows helpful message when no shifts are found

### 3. Shift Change Functionality
- **Change Button**: Available for confirmed shifts
- **Navigation**: Links to shift change page with parameters
- **Parameters**: Passes shiftId, date, and teamId for context

### 4. Supabase Integration
- **Multi-Table Query**: Fetches from schedule_assignments, shifts, schedules, and teams
- **Efficient Loading**: Uses separate queries to avoid complex joins
- **Error Handling**: Graceful error handling with user feedback
- **Real-time Updates**: Data updates when schedules change

## Database Operations

### Data Flow
1. **Fetch Assignments**: Get schedule assignments for current user
2. **Get Shift Details**: Fetch shift information (name, times)
3. **Get Team Info**: Fetch team information (department, name)
4. **Transform Data**: Combine all data into display format

### Tables Involved
- `schedule_assignments` - Links users to specific shifts on specific dates
- `shifts` - Shift definitions (name, start_time, end_time)
- `schedules` - Schedule metadata (team_id)
- `teams` - Team information (department, name)
- `users` - User information (for authentication)

### Query Structure
```sql
-- 1. Get user's schedule assignments
SELECT id, date, shift_id, schedule_id 
FROM schedule_assignments 
WHERE user_id = ? 
  AND date >= current_month_start 
  AND date <= next_month_end
ORDER BY date ASC

-- 2. Get shift details
SELECT id, name, start_time, end_time 
FROM shifts 
WHERE id IN (shift_ids)

-- 3. Get team information
SELECT id, department, name 
FROM teams 
WHERE id IN (team_ids)
```

## User Interface

### Loading State
```
┌─────────────────────────────────────────────────────────┐
│ My Next Shifts                                          │
├─────────────────────────────────────────────────────────┤
│ [Loading Spinner]                                       │
│ Loading your shifts...                                  │
└─────────────────────────────────────────────────────────┘
```

### Empty State
```
┌─────────────────────────────────────────────────────────┐
│ My Next Shifts                                          │
├─────────────────────────────────────────────────────────┤
│ No upcoming shifts found                                │
│ Your schedule will appear here once shifts are assigned │
└─────────────────────────────────────────────────────────┘
```

### Shift Display
```
┌─────────────────────────────────────────────────────────┐
│ My Next Shifts                                          │
├─────────────────────────────────────────────────────────┤
│ Mon, Dec 15 [Confirmed]                                 │
│ Day Shift (08:00 - 20:00) • Emergency Department       │
│                                              [Change]   │
├─────────────────────────────────────────────────────────┤
│ Tue, Dec 16 [Change Requested]                          │
│ Night Shift (20:00 - 08:00) • Emergency Department     │
└─────────────────────────────────────────────────────────┘
```

## Technical Implementation

### State Management
```typescript
const [upcomingShifts, setUpcomingShifts] = useState<Array<{
  id: string
  date: string
  shift: string
  time: string
  team: string
  status: string
  shiftId: string
  teamId: string
}>>([])
const [loading, setLoading] = useState(true)
```

### Key Functions
- `fetchUpcomingShifts()`: Main function to fetch and process shift data
- `handleShiftChangeRequest()`: Handles navigation to shift change page
- `formatDate()`: Formats dates for display

### Data Transformation
```typescript
// Transform raw data into display format
const shiftsData = assignments.map(assignment => {
  const shift = shifts?.find(s => s.id === assignment.shift_id)
  const schedule = schedules?.find(s => s.id === assignment.schedule_id)
  const team = teams?.find(t => t.id === schedule?.team_id)
  
  return {
    id: assignment.id,
    date: assignment.date,
    shift: shift?.name || 'Unknown Shift',
    time: shift ? `${shift.start_time} - ${shift.end_time}` : 'Unknown Time',
    team: team?.department || team?.name || 'Unknown Team',
    status: 'confirmed',
    shiftId: assignment.shift_id,
    teamId: schedule?.team_id || ''
  }
})
```

## Error Handling

### Common Scenarios
1. **No Shifts**: Participant has no assigned shifts
2. **Network Errors**: Connection issues with Supabase
3. **Invalid Data**: Missing or corrupted schedule data
4. **Authentication**: User not properly authenticated

### User Feedback
- Loading spinner during data fetch
- Empty state message when no shifts found
- Error handling with console logging
- Graceful fallbacks for missing data

## Testing the Feature

### Prerequisites
1. Run database setup scripts:
   ```sql
   -- Execute in order:
   scripts/001-initial-schema.sql
   scripts/002-add-deadline-field.sql
   scripts/004-add-activity-log.sql
   scripts/003-sample-data.sql
   ```

2. Ensure you have a participant account with assigned shifts

### Test Scenarios

#### Scenario 1: Participant with Shifts
1. Log in as a participant with assigned shifts
2. Navigate to dashboard
3. **Expected**: See loading state, then list of assigned shifts

#### Scenario 2: Participant without Shifts
1. Log in as a participant without assigned shifts
2. Navigate to dashboard
3. **Expected**: See empty state message

#### Scenario 3: Shift Change Request
1. Click "Change" button on a confirmed shift
2. **Expected**: Navigate to shift change page with parameters

#### Scenario 4: Date Formatting
1. View shifts with different dates
2. **Expected**: Dates formatted as "Mon, Dec 15"

## File Changes

### Modified Files:
- `app/participant/dashboard/page.tsx` - Added dynamic shifts functionality

### New Files:
- `DYNAMIC_SHIFTS_FEATURE.md` - This documentation

## Future Enhancements

1. **Real-time Updates**: WebSocket integration for live updates
2. **Shift Status**: Track pending, approved, rejected change requests
3. **Notifications**: Push notifications for shift changes
4. **Calendar View**: Monthly calendar view of shifts
5. **Export Shifts**: Export personal schedule to calendar
6. **Shift History**: View past shifts and changes
7. **Team View**: See other team members' shifts
8. **Mobile Optimization**: Better mobile interface
9. **Offline Support**: Cache shifts for offline viewing
10. **Analytics**: Track shift patterns and preferences

## Sample Data

The feature works with the existing sample data:
- Emergency Department team with 4 members
- December 2024 schedule with 10 assignments
- Day and Night shifts
- Various team members assigned to different shifts

This allows immediate testing of the dynamic shifts functionality without needing to generate new schedules. 