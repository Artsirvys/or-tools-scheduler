# Database Schema Update: Basic and Custom Constraints Tables

## Overview
This update introduces two new tables to replace the existing `ai_constraints` table:
- `basic_constraints`: For structured, predefined scheduling constraints
- `custom_constraints`: For free-form, AI-processed constraint text

## New Tables

### basic_constraints
Stores structured scheduling constraints for teams.

**Columns:**
- `id` (UUID, Primary Key)
- `team_id` (UUID, Foreign Key to teams.id)
- `max_consecutive_days` (INTEGER) - Maximum consecutive days a worker can be scheduled
- `max_days_per_month` (INTEGER) - Maximum days per month for a worker
- `workers_per_shift` (INTEGER) - Number of workers needed per shift
- `shift_specific_workers` (JSONB) - Specific worker requirements for different shifts
- `created_at` (TIMESTAMP WITH TIME ZONE)
- `updated_at` (TIMESTAMP WITH TIME ZONE)

**Constraints:**
- Unique constraint on `team_id` (one basic constraint set per team)

### custom_constraints
Stores free-form constraint text that can be processed by AI.

**Columns:**
- `id` (UUID, Primary Key)
- `team_id` (UUID, Foreign Key to teams.id)
- `raw_text` (TEXT) - The original constraint text entered by the user
- `ai_translation` (JSONB) - AI-processed translation of the raw text
- `status` (TEXT) - Status of the constraint (default: 'pending')
- `created_at` (TIMESTAMP WITH TIME ZONE)
- `updated_at` (TIMESTAMP WITH TIME ZONE)

## Row Level Security (RLS) Policies

### basic_constraints Policies
1. **Service role bypass**: Allows all operations for service_role
2. **Hosts can view**: SELECT operations for team hosts
3. **Hosts can insert**: INSERT operations for team hosts
4. **Hosts can update**: UPDATE operations for team hosts

### custom_constraints Policies
1. **Service role bypass**: Allows all operations for service_role
2. **Hosts can view**: SELECT operations for team hosts
3. **Hosts can insert**: INSERT operations for team hosts
4. **Hosts can update**: UPDATE operations for team hosts

## Migration Scripts

### 028-create-basic-constraints.sql
Creates the `basic_constraints` table with proper indexes and triggers.

### 029-create-custom-constraints.sql
Creates the `custom_constraints` table with proper indexes and triggers.

### 030-add-constraints-rls-policies.sql
Adds RLS policies for both new tables.

### 031-migrate-ai-constraints-data.sql
Migrates existing data from `ai_constraints` to `basic_constraints` (if applicable).

### 032-drop-ai-constraints-table.sql
Optionally drops the old `ai_constraints` table after successful migration.

## Usage

### Creating Basic Constraints
```sql
INSERT INTO basic_constraints (
    team_id,
    max_consecutive_days,
    max_days_per_month,
    workers_per_shift,
    shift_specific_workers
) VALUES (
    'team-uuid',
    3,
    20,
    2,
    '{"morning": ["nurse", "doctor"], "night": ["nurse"]}'::jsonb
);
```

### Creating Custom Constraints
```sql
INSERT INTO custom_constraints (
    team_id,
    raw_text,
    ai_translation,
    status
) VALUES (
    'team-uuid',
    'Nurses should not work more than 3 consecutive night shifts',
    '{"constraint_type": "consecutive_shifts", "role": "nurse", "shift_type": "night", "max_count": 3}'::jsonb,
    'processed'
);
```

## Indexes
- `idx_basic_constraints_team_id` on `basic_constraints(team_id)`
- `idx_custom_constraints_team_id` on `custom_constraints(team_id)`

## Triggers
Both tables have automatic `updated_at` timestamp triggers that update the `updated_at` column whenever a row is modified.
