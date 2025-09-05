# OR-Tools Schedule Solver Service

This Python service uses Google OR-Tools to solve medical shift scheduling problems with guaranteed constraint satisfaction.

## Features

- **Constraint Satisfaction**: Guarantees all scheduling rules are followed
- **Dynamic Constraints**: Handles team-specific rules loaded from database
- **Availability Management**: Respects worker availability and preferences
- **Performance**: Efficient constraint solving for teams of any size

## Setup

### 1. Install Python Dependencies

```bash
cd python-solver
pip install -r requirements.txt
```

### 2. Set Environment Variables

```bash
export OPENAI_API_KEY="your-openai-api-key"
export PYTHON_SERVICE_URL="http://localhost:5000"  # Optional, defaults to localhost:5000
```

### 3. Start the Service

```bash
# Option 1: Direct Python
python start.py

# Option 2: Flask development server
python app.py

# Option 3: Production with gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

## API Endpoints

### Health Check
```
GET /health
```

### Solve Schedule
```
POST /solve
```

**Request Body:**
```json
{
  "members": [
    {"id": "user1", "name": "John Doe", "experience_level": 1},
    {"id": "user2", "name": "Jane Smith", "experience_level": 2}
  ],
  "shifts": [
    {"id": "shift1", "name": "Morning", "start_time": "08:00", "end_time": "16:00"},
    {"id": "shift2", "name": "Night", "start_time": "20:00", "end_time": "08:00"}
  ],
  "availability": [
    {"user_id": "user1", "shift_id": "shift1", "date": "2024-01-15", "status": "available"}
  ],
  "basic_constraints": {
    "workers_per_shift": 2,
    "max_consecutive_days": 5,
    "max_days_per_month": 20,
    "shift_specific_workers": {}
  },
  "custom_constraints": [
    {
      "raw_text": "No night shifts for pregnant staff",
      "ai_translation": {"type": "restriction", "condition": "pregnant", "shifts": ["night"]},
      "status": "translated"
    }
  ],
  "month": 1,
  "year": 2024
}
```

**Response:**
```json
{
  "success": true,
  "assignments": [
    {
      "user_id": "user1",
      "shift_id": "shift1",
      "date": "2024-01-15"
    }
  ],
  "stats": {
    "solver_status": "OPTIMAL",
    "solve_time": 0.5,
    "assignments_count": 1
  }
}
```

## Constraint Types

### Hard Constraints (Must be satisfied)
- **Availability**: Workers only assigned when available
- **No Consecutive Shifts**: Proper rest periods maintained
- **Workers per Shift**: Correct number of workers per shift
- **Max Days per Month**: Limit total assignments per worker

### Soft Constraints (Preferences)
- **Fair Distribution**: Balance workload across team members
- **Shift Preferences**: Preferred/avoided shift types
- **Date Restrictions**: Specific date ranges for workers

## Integration with Next.js

The service is designed to work with your existing Next.js app:

1. **API Route**: `/api/generateSchedule` calls this service
2. **Data Fetching**: Fetches data from Supabase tables (custom_constraints, basic_constraints, availability, team_members, users)
3. **Direct Integration**: No two-phase process needed since AI translation is already done

## Troubleshooting

### Common Issues

1. **Port Already in Use**: Change port in `start.py` or kill existing process
2. **Import Errors**: Ensure all dependencies are installed
3. **Constraint Conflicts**: Check if constraints are mutually exclusive

### Debug Mode

Set `FLASK_DEBUG=true` for detailed logging and error messages.

## Performance

- **Small Teams (2-10 members)**: < 1 second
- **Medium Teams (10-50 members)**: 1-5 seconds  
- **Large Teams (50+ members)**: 5-30 seconds

Performance depends on constraint complexity and team size.
