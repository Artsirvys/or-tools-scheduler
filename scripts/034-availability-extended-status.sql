-- Persist vacation and conference on availability (participant UI); scheduling treats them like unavailable.

ALTER TABLE availability DROP CONSTRAINT IF EXISTS availability_status_check;

ALTER TABLE availability ADD CONSTRAINT availability_status_check
  CHECK (status IN ('available', 'unavailable', 'priority', 'vacation', 'conference'));
