-- Make client_id optional in assessments table to allow standalone reports
ALTER TABLE assessments ALTER COLUMN client_id DROP NOT NULL;

-- Ensure display_name is populated from client name if it's missing but client_id exists
UPDATE assessments a
SET display_name = c.name
FROM clients c
WHERE a.client_id = c.id
AND (a.display_name IS NULL OR a.display_name = '');
