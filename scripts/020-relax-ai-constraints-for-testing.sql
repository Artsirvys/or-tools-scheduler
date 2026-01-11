-- Relax AI constraints for testing purposes
-- This script updates AI constraints to be more flexible for small teams

-- Update AI constraints for all teams to be more flexible
UPDATE ai_constraints 
SET 
    max_consecutive_days = CASE 
        WHEN max_consecutive_days < 7 THEN 7 
        ELSE max_consecutive_days 
    END,
    min_rest_hours = CASE 
        WHEN min_rest_hours > 8 THEN 8 
        ELSE min_rest_hours 
    END,
    workers_per_shift = CASE 
        WHEN workers_per_shift > 2 THEN 2 
        ELSE workers_per_shift 
    END
WHERE team_id IN (
    SELECT t.id 
    FROM teams t 
    JOIN team_members tm ON t.id = tm.team_id 
    GROUP BY t.id 
    HAVING COUNT(tm.id) <= 2
);

-- If no AI constraints exist for small teams, create them
INSERT INTO ai_constraints (team_id, max_consecutive_days, min_rest_hours, workers_per_shift, custom_constraints)
SELECT 
    t.id,
    7, -- max consecutive days
    8, -- min rest hours  
    2, -- workers per shift
    'Relaxed constraints for small team testing'
FROM teams t
WHERE NOT EXISTS (
    SELECT 1 FROM ai_constraints ac WHERE ac.team_id = t.id
)
AND t.id IN (
    SELECT t2.id 
    FROM teams t2 
    JOIN team_members tm ON t2.id = tm.team_id 
    GROUP BY t2.id 
    HAVING COUNT(tm.id) <= 2
);
