# Dynamic Team Availability Feature

## Overview
This feature allows hosts to view real-time availability status of their team members in a calendar format. The system shows which members have filled their availability and which haven't, with completion percentages.

## Key Features

### 1. Dynamic Team Member Display
- Fetches real team members from the database
- Shows member names, roles, and email addresses
- Displays completion status with visual indicators

### 2. Real Availability Data
- Pulls actual availability records from the database
- Shows availability status for each day/shift combination
- Color-coded status indicators (Available, Priority, Unavailable, Not Set)

### 3. Completion Tracking
- Visual indicators showing who has filled availability (✓) and who hasn't (✗)
- Completion percentage for each member
- Summary statistics at the top of the page

### 4. Multiple Access Points
- Quick Actions section in host dashboard (shows buttons for each team)
- Team management page sidebar
- Direct URL access: `/teams/{teamId}/availability`

## Database Schema

The feature uses these tables:
- `teams` - Team information
- `team_members` - Team membership
- `users` - User details (joined via team_members)
- `shifts` - Shift definitions
- `availability` - Actual availability records

## Sample Data

Run the sample data script to test the functionality:
```sql
-- Execute scripts/003-sample-data.sql
```

This creates:
- 1 host user (Dr. John Smith)
- 4 team members with different availability statuses
- 1 team (Emergency Department)
- 2 shifts (Day and Night)
- Sample availability data for December 2024

## Testing the Feature

1. **Setup Database**: Run the sample data script
2. **Access Dashboard**: Navigate to the host dashboard
3. **View Availability**: Click "View Emergency Department Availability" in Quick Actions
4. **Expected Results**:
   - Dr. Sarah Johnson: ✓ (has filled some availability)
   - Nurse Mike Chen: ✓ (has filled some availability)
   - Dr. Emily Davis: ✗ (has not filled any availability)
   - Nurse Lisa Wong: ✓ (has filled some availability)

## File Changes

### Modified Files:
- `app/dashboard/page.tsx` - Updated Quick Actions to show team-specific availability buttons
- `app/teams/[id]/availability/page.tsx` - Completely rewritten to fetch real data
- `app/teams/[id]/manage/page.tsx` - Added Quick Actions sidebar with availability link

### New Files:
- `scripts/003-sample-data.sql` - Sample data for testing
- `AVAILABILITY_FEATURE.md` - This documentation

## Technical Implementation

### Data Fetching
The availability page fetches:
1. Team information
2. Team members with user details
3. Shift definitions
4. Availability records for the selected month

### State Management
- Uses React hooks for state management
- Fetches data on component mount
- Refetches availability when month changes

### Error Handling
- Loading states while fetching data
- Error handling for missing teams
- Graceful fallbacks for missing data

## Future Enhancements

1. **Real-time Updates**: WebSocket integration for live updates
2. **Bulk Actions**: Send reminders to members who haven't filled availability
3. **Export Functionality**: Export availability data to Excel/PDF
4. **Filtering**: Filter by completion status, role, etc.
5. **Notifications**: Email reminders for pending availability submissions 