-- ============================================================
-- Consolidate employee names: merge middle_name + surname into
-- the name field for all users that have them split.
-- Run on EVERY database (lumos_hrms AND relitrade DB).
--
-- After this: name = "Dhruv Prashant Shere"
--             middle_name = NULL, surname = NULL
--
-- Safe to re-run (WHERE clause only touches rows with split names).
-- ============================================================

-- Pre-check: see which employees have split names
SELECT id, name, middle_name, surname
FROM users
WHERE (middle_name IS NOT NULL AND TRIM(middle_name) <> '')
   OR (surname    IS NOT NULL AND TRIM(surname)    <> '')
ORDER BY name;

-- Consolidate: build full name from all three parts
UPDATE users
SET
  name        = TRIM(CONCAT_WS(' ',
                  NULLIF(TRIM(COALESCE(name,        '')), ''),
                  NULLIF(TRIM(COALESCE(middle_name, '')), ''),
                  NULLIF(TRIM(COALESCE(surname,     '')), '')
                )),
  middle_name = NULL,
  surname     = NULL
WHERE (middle_name IS NOT NULL AND TRIM(middle_name) <> '')
   OR (surname    IS NOT NULL AND TRIM(surname)    <> '');

-- Verify
SELECT id, name, middle_name, surname
FROM users
WHERE role IN ('employee','admin','root_admin')
ORDER BY name
LIMIT 30;
