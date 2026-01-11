# Set Availability Feature for Hosts

## Overview
The Set Availability feature allows hosts to mark their own availability for shifts in their teams. This is a comprehensive modal-based interface that integrates with Supabase to save availability data.

## Key Features

### 1. Conditional Button State
- **No Teams Available**: Button is disabled and shows "No teams available" when user has no teams
- **Teams Available**: Button is enabled and shows "Set Availability" when teams exist

### 2. Modal Interface
- **Team Selection**: Dropdown to choose which team to set availability for
- **Month Selection**: Dropdown to select the month for availability
- **Calendar View**: Interactive calendar showing all days of the selected month
- **Shift Types**: Day and Night shift columns for each date

### 3. Availability Status Options
- **Available** (Green): Can work this shift
- **Priority** (Blue): Prefer to work this shift
- **Unavailable** (Red): Cannot work this shift
- **Not Set** (Gray): No preference marked

### 4. Interactive Features
- **Click to Toggle**: Click any shift to cycle through status options
- **Clear All**: Button to clear all availability for the month
- **Set All Available**: Button to mark all shifts as available
- **Save**: Persist changes to database

### 5. Supabase Integration
- **Data Persistence**: Saves availability to the `availability` table
- **Overwrite Logic**: Replaces existing availability for the month
- **Activity Logging**: Records availability updates for audit trail
- **Error Handling**: Comprehensive error handling with user feedback

## Database Operations

### Data Flow
1. **Fetch Shifts**: Get available shifts for the selected team
2. **Delete Existing**: Remove any existing availability for the month
3. **Insert New**: Save new availability records
4. **Log Activity**: Record the action in activity_log

### Tables Involved
- `availability` - Stores user availability records
- `shifts` - Team shift definitions
- `activity_log` - Audit trail of actions

## User Interface

### Modal Layout
```
┌─────────────────────────────────────────────────────────┐
│ Set Your Availability                                   │
│ Mark your availability for shifts in your teams        │
├─────────────────────────────────────────────────────────┤
│ [Team Selection] [Month Selection]                      │
├─────────────────────────────────────────────────────────┤
│ December 2024                    [Clear All] [Set All]  │
├─────────────────────────────────────────────────────────┤
│ Date        │ Day Shift │ Night Shift                  │
├─────────────┼───────────┼──────────────────────────────┤
│ 1 (Mon)     │ [✓]      │ [✗]                          │
│ 2 (Tue)     │ [★]      │ [✓]                          │
│ 3 (Wed)     │ [✓]      │ [✓]                          │
│ ...         │ ...      │ ...                          │
├─────────────────────────────────────────────────────────┤
│ [Cancel] [Save Availability]                            │
└─────────────────────────────────────────────────────────┘
```

### Status Indicators
- **✓ Available**: Green background, check icon
- **★ Priority**: Blue background, star icon  
- **✗ Unavailable**: Red background, X icon
- **⏰ Not Set**: Gray background, clock icon

## Technical Implementation

### State Management
```typescript
const [availabilityForm, setAvailabilityForm] = useState({
  selectedTeam: "",
  selectedMonth: "",
  availability: {} as Record<string, Record<string, string>>
})
const [isSavingAvailability, setIsSavingAvailability] = useState(false)
```

### Helper Functions
- `generateCalendarDays()`: Creates array of days for selected month
- `getAvailabilityStatusColor()`: Returns CSS classes for status colors
- `getAvailabilityStatusIcon()`: Returns appropriate icon for status
- `toggleAvailability()`: Cycles through status options
- `saveAvailability()`: Persists data to Supabase

### Data Structure
```typescript
availability: {
  "2024-12-01": {
    "1": "available",    // Day shift
    "2": "unavailable"   // Night shift
  },
  "2024-12-02": {
    "1": "priority",
    "2": "available"
  }
}
```

## Error Handling

### Common Scenarios
1. **Network Errors**: Connection issues with Supabase
2. **Validation Errors**: Missing team or month selection
3. **Database Errors**: Constraint violations, foreign key issues
4. **User Authentication**: Host user not authenticated

### User Feedback
- Loading states during save operations
- Success messages with confirmation
- Error messages with specific failure reasons
- Form reset after successful operations

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

2. Ensure you have at least one team with shifts created

### Test Scenarios

#### Scenario 1: No Teams Available
1. Create a new host account with no teams
2. Navigate to dashboard
3. **Expected**: "Set Availability" button shows "No teams available" and is disabled

#### Scenario 2: Set Availability for Team
1. Navigate to dashboard with existing teams
2. Click "Set Availability"
3. Select team and month
4. Click on various shifts to set different statuses
5. Click "Save Availability"
6. **Expected**: Success message and data saved to database

#### Scenario 3: Bulk Operations
1. Open availability modal
2. Click "Set All Available" to mark all shifts as available
3. Click "Clear All" to reset all shifts
4. **Expected**: All shifts update accordingly

#### Scenario 4: Validation
1. Open modal without selecting team or month
2. Try to save
3. **Expected**: Save button is disabled

## File Changes

### Modified Files:
- `app/dashboard/page.tsx` - Added Set Availability modal and functionality

### New Files:
- `SET_AVAILABILITY_FEATURE.md` - This documentation

## Future Enhancements

1. **Load Existing Data**: Pre-populate modal with existing availability
2. **Copy Previous Month**: Copy availability from previous month
3. **Bulk Import**: Import availability from CSV/Excel
4. **Notifications**: Email reminders for availability deadlines
5. **Conflict Detection**: Warn about scheduling conflicts
6. **Mobile Optimization**: Better mobile interface for touch devices
7. **Quick Templates**: Pre-defined availability patterns (e.g., "Weekends off")
8. **Integration**: Sync with external calendar systems 