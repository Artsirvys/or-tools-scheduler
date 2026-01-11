# Export Schedule Feature for Hosts

## Overview
The Export Schedule feature allows hosts to export their team schedules in PDF or Excel format. This feature is only available when schedules have been generated for teams, and provides a comprehensive export interface with format selection.

## Key Features

### 1. Conditional Button State
- **No Schedules Available**: Button is disabled and shows "No schedules available" when no schedules exist
- **Schedules Available**: Button is enabled and shows "Export Schedule" when schedules exist

### 2. Modal Interface
- **Team Selection**: Dropdown to choose which team's schedule to export
- **Month Selection**: Dropdown showing available months with generated schedules
- **Format Selection**: Choice between PDF and Excel formats
- **Export Action**: Button to initiate the export process

### 3. Export Formats
- **PDF Format**: Exports as a formatted text file (.txt) that can be opened in any text editor
- **Excel Format**: Exports as a CSV file (.csv) that can be opened in Excel or other spreadsheet applications

### 4. Schedule Page Integration
- **Direct Navigation**: Opens the schedule page with export parameters
- **Auto-Export**: Automatically triggers export when accessed via export modal
- **Manual Export**: Export buttons available directly on the schedule page

### 5. Supabase Integration
- **Schedule Detection**: Checks for existing schedules in the `schedules` table
- **Activity Logging**: Records export actions for audit trail
- **Data Validation**: Ensures schedules exist before allowing export

## Database Operations

### Data Flow
1. **Fetch Schedules**: Get available schedules for user's teams
2. **Validate Schedule**: Ensure selected schedule exists and is active
3. **Generate Export**: Create formatted content based on schedule data
4. **Log Activity**: Record the export action in activity_log

### Tables Involved
- `schedules` - Stores generated schedule metadata
- `schedule_assignments` - Stores individual shift assignments
- `teams` - Team information
- `shifts` - Shift definitions
- `team_members` - Team member information
- `users` - User details
- `activity_log` - Audit trail of actions

## User Interface

### Modal Layout
```
┌─────────────────────────────────────────────────────────┐
│ Export Schedule                                         │
│ Export your team schedule in PDF or Excel format       │
├─────────────────────────────────────────────────────────┤
│ [Team Selection]                                        │
│ [Month Selection]                                       │
│ [Format Selection]                                      │
├─────────────────────────────────────────────────────────┤
│ [Cancel] [Export Schedule]                              │
└─────────────────────────────────────────────────────────┘
```

### Schedule Page Layout
```
┌─────────────────────────────────────────────────────────┐
│ Schedule for Emergency Department    [Export PDF] [Export Excel]
├─────────────────────────────────────────────────────────┤
│ December 2024 Schedule                                 │
│ Generated AI schedule for your team members            │
├─────────────────────────────────────────────────────────┤
│ Day    │ Day Shift │ Night Shift                       │
├────────┼───────────┼───────────────────────────────────┤
│ 1      │ Dr. Sarah │ Nurse Mike                        │
│ 2      │ Nurse Mike│ Dr. Sarah                         │
│ ...    │ ...       │ ...                               │
└─────────────────────────────────────────────────────────┘
```

## Technical Implementation

### State Management
```typescript
const [availableSchedules, setAvailableSchedules] = useState<Array<{teamId: string, month: number, year: number}>>([])
const [exportForm, setExportForm] = useState({
  selectedTeam: "",
  selectedMonth: "",
  format: "pdf"
})
const [isExporting, setIsExporting] = useState(false)
```

### Export Functions
- `exportSchedule()`: Main export function that handles format selection
- `exportToPDF()`: Generates and downloads PDF format
- `exportToExcel()`: Generates and downloads Excel format
- `generateScheduleContent()`: Creates formatted text content
- `generateCSVContent()`: Creates CSV content for Excel

### Data Structure
```typescript
// Schedule data structure
{
  teamId: string,
  month: number,
  year: number
}

// Export form structure
{
  selectedTeam: string,
  selectedMonth: string, // "month-year" format
  format: "pdf" | "excel"
}
```

## Export Formats

### PDF Format (Text File)
```
Emergency Department - December 2024 Schedule
==================================================

Date		Day Shift		Night Shift		
1 (Mon)		Dr. Sarah Johnson		Nurse Mike Chen		
2 (Tue)		Nurse Mike Chen		Dr. Sarah Johnson		
3 (Wed)		Dr. Sarah Johnson		Nurse Mike Chen		
...
```

### Excel Format (CSV File)
```csv
Date,Day Shift,Night Shift
"1 (Mon)","Dr. Sarah Johnson","Nurse Mike Chen"
"2 (Tue)","Nurse Mike Chen","Dr. Sarah Johnson"
"3 (Wed)","Dr. Sarah Johnson","Nurse Mike Chen"
...
```

## Error Handling

### Common Scenarios
1. **No Schedules**: No generated schedules available for export
2. **Network Errors**: Connection issues with Supabase
3. **Invalid Data**: Missing or corrupted schedule data
4. **Browser Issues**: Download blocked by browser settings

### User Feedback
- Loading states during export operations
- Success messages with confirmation
- Error messages with specific failure reasons
- Form validation for required selections

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

2. Ensure you have at least one team with a generated schedule

### Test Scenarios

#### Scenario 1: No Schedules Available
1. Create a new host account with no generated schedules
2. Navigate to dashboard
3. **Expected**: "Export Schedule" button shows "No schedules available" and is disabled

#### Scenario 2: Export Schedule
1. Navigate to dashboard with existing schedules
2. Click "Export Schedule"
3. Select team, month, and format
4. Click "Export Schedule"
5. **Expected**: File downloads and success message appears

#### Scenario 3: Direct Schedule Page Export
1. Navigate to a team's schedule page
2. Click "Export PDF" or "Export Excel"
3. **Expected**: File downloads immediately

#### Scenario 4: Validation
1. Open export modal without selecting team or month
2. Try to export
3. **Expected**: Export button is disabled

## File Changes

### Modified Files:
- `app/dashboard/page.tsx` - Added Export Schedule modal and functionality
- `app/schedule/host/[teamId]/page.tsx` - Enhanced with export functionality

### New Files:
- `EXPORT_SCHEDULE_FEATURE.md` - This documentation

### Updated Files:
- `scripts/003-sample-data.sql` - Added sample schedule data for testing

## Future Enhancements

1. **True PDF Generation**: Use libraries like jsPDF for proper PDF formatting
2. **Advanced Excel Features**: Use libraries like xlsx for rich Excel formatting
3. **Email Export**: Send schedules directly via email
4. **Batch Export**: Export multiple schedules at once
5. **Custom Templates**: Allow users to create custom export templates
6. **Schedule Preview**: Show preview before export
7. **Export History**: Track and display export history
8. **Scheduled Exports**: Automatically export schedules on schedule
9. **Mobile Export**: Optimize export for mobile devices
10. **Integration**: Export to Google Calendar, Outlook, etc.

## Sample Data

The feature includes sample schedule data for testing:
- Emergency Department team with 4 members
- December 2024 schedule with 10 assignments
- Day and Night shifts
- Various team members assigned to different shifts

This allows immediate testing of the export functionality without needing to generate new schedules. 