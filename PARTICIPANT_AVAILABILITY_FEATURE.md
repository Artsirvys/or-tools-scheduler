# Participant Availability Feature

## Overview
The Participant Availability page has been enhanced to provide personalized availability management for participants. The page now dynamically loads the participant's assigned teams, shows the next month by default, and provides a comprehensive calendar interface for setting availability preferences.

## Key Features Implemented

### 1. **Personalized Team Selection**
- ✅ **Dynamic Teams**: Fetches teams from `team_members` table based on current user
- ✅ **Department Display**: Shows team department name in dropdown
- ✅ **No Team State**: Displays helpful message when participant has no team assignments
- ✅ **Auto-Selection**: Automatically selects first team if multiple teams exist

### 2. **Dynamic Month Selection**
- ✅ **Next Month Default**: Automatically sets to next month (e.g., if current month is March, shows April)
- ✅ **Extended Options**: Includes all months from March to December 2024
- ✅ **Smart Calendar**: Generates correct number of days for selected month

### 3. **Real-time Availability Management**
- ✅ **Load Existing**: Fetches and displays previously saved availability
- ✅ **Interactive Calendar**: Click to cycle through availability statuses
- ✅ **Visual Feedback**: Color-coded status indicators
- ✅ **Save Functionality**: Saves to Supabase `availability` table

### 4. **Enhanced User Experience**
- ✅ **Loading States**: Shows spinner while fetching data
- ✅ **Error Handling**: Graceful error handling with user feedback
- ✅ **Responsive Design**: Works on mobile and desktop
- ✅ **Status Cycling**: Available → Priority → Unavailable → Vacation → Conference → Sick Day → Unset

## Technical Implementation

### Database Integration
- **Tables Used**:
  - `team_members`: Get user's team assignments
  - `teams`: Get team details (name, department)
  - `shifts`: Get available shifts for the team
  - `availability`: Store/retrieve availability preferences

### Key Functions
1. **`init()`**: Initializes page data (user, teams, shifts, availability)
2. **`loadAvailability()`**: Fetches existing availability for selected month/team
3. **`saveAvailability()`**: Saves availability preferences to database
4. **`generateCalendarDays()`**: Creates calendar days for selected month
5. **`setDayAvailability()`**: Updates local state for availability changes

### State Management
```typescript
const [selectedTeam, setSelectedTeam] = useState("")
const [selectedMonth, setSelectedMonth] = useState("")
const [teams, setTeams] = useState<Array<{ id: string, name: string, department: string }>>([])
const [shifts, setShifts] = useState<Array<{ id: string, name: string, time: string }>>([])
const [loading, setLoading] = useState(true)
const [user, setUser] = useState<any>(null)
const [availability, setAvailability] = useState<Record<string, Record<string, string>>>({})
const [isSaving, setIsSaving] = useState(false)
```

## User Flow

### 1. **Page Load**
- Shows loading spinner
- Fetches current user from Supabase auth
- Gets user's team assignments
- Sets next month as default
- Loads existing availability

### 2. **No Team Assignment**
- Shows warning message with AlertTriangle icon
- Displays "You are not assigned to any team yet"
- Provides helpful guidance to contact administrator
- Shows "Back to Dashboard" button

### 3. **Has Team Assignment**
- Shows team selection dropdown (with department names)
- Shows month selection dropdown
- Displays availability calendar
- Shows legend with all status types

### 4. **Setting Availability**
- Click any date/shift combination
- Cycles through: Available → Priority → Unavailable → Vacation → Conference → Sick Day → Unset
- Visual feedback with colors and icons
- Real-time updates to local state

### 5. **Saving Availability**
- Click "Save Availability" button
- Deletes existing availability for month/team
- Inserts new availability entries
- Shows success/error messages
- Disables buttons during save operation

## Status Types & Colors

| Status | Color | Icon | Description |
|--------|-------|------|-------------|
| Available | Green | Check | I can work this shift |
| Priority | Blue | Star | I prefer to work this shift |
| Unavailable | Red | X | I cannot work this shift |
| Vacation | Yellow | Calendar | On vacation |
| Conference | Purple | Users | At conference |
| Sick Day | Orange | AlertCircle | Sick leave |
| Not Set | Gray | Clock | No preference marked |

## Files Modified

### `app/participant/availability/page.tsx`
- **Complete Rewrite**: Converted from static to dynamic data
- **Supabase Integration**: Added all database operations
- **State Management**: Added comprehensive state handling
- **UI Enhancements**: Added loading states, error handling, no-team state
- **Save Functionality**: Implemented real save to database

## Database Schema Requirements

### Required Tables
1. **`team_members`**: Links users to teams
2. **`teams`**: Team information (id, name, department)
3. **`shifts`**: Available shifts (id, name, start_time, end_time)
4. **`availability`**: User availability preferences (user_id, team_id, shift_id, date, status)

### Sample Data
The feature works with the existing sample data in `scripts/003-sample-data.sql`

## Testing

### Test Scenarios
1. **User with no teams**: Should show "not assigned" message
2. **User with one team**: Should auto-select team and show calendar
3. **User with multiple teams**: Should allow team selection
4. **Setting availability**: Should cycle through statuses correctly
5. **Saving availability**: Should persist to database
6. **Loading existing**: Should display previously saved preferences

### Expected Behavior
- Page loads with next month selected
- Team dropdown shows department names
- Calendar shows correct number of days
- Clicking dates cycles through statuses
- Save button persists data to database
- Loading states provide good UX

## Future Enhancements

### Potential Improvements
1. **Bulk Operations**: "Set all available" / "Clear all" buttons
2. **Validation**: Prevent saving if no availability set
3. **Notifications**: Alert when availability deadline approaches
4. **Export**: Allow participants to export their availability
5. **History**: Show availability history/trends
6. **Mobile Optimization**: Better touch interactions for mobile

## Notes

### Current Issues
- There are some TypeScript linter errors related to team mapping that need to be resolved
- The team mapping structure in the Supabase query needs proper typing
- Consider adding proper TypeScript interfaces for all data structures

### Dependencies
- Requires Supabase client setup
- Uses existing UI components from `@/components/ui`
- Uses Lucide React icons
- Requires proper environment variables for Supabase connection

## Conclusion

The Participant Availability feature provides a comprehensive, personalized experience for participants to manage their availability preferences. It dynamically adapts to the user's team assignments and provides an intuitive interface for setting and saving availability preferences. 