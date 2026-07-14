# Database Migration Instructions for Helper Form 3 Update

## Problem
The backend is returning errors because the database schema doesn't have the new columns yet.

**Error Message:**
```
column infect_gi_hema_day_logs.meningitis does not exist
```

## Root Cause
SQLAlchemy's `Base.metadata.create_all()` only creates NEW tables - it does NOT alter existing tables. Since `infect_gi_hema_day_logs` already exists, we need to manually add the new columns.

## Solution - Choose ONE Method

### Method 1: Run Python Migration Script (RECOMMENDED)

1. **Stop your backend** (Ctrl+C)

2. **Run the migration script:**
```bash
cd backend
python migrate_infect_gi_hema.py
```

3. **Verify success** - you should see:
```
✅ Migration completed successfully!
  New columns:
    ✓ meningitis
    ✓ meningitis_type
    ✓ men
    ✓ feed_type
    ✓ cumulative_feed_volume
    ✓ iv_fluids
    ✓ cholestasis
    ✓ hb_value
    ✓ enteral_feeds_received
```

4. **Restart backend:**
```bash
uvicorn main:app --reload
```

5. **Refresh frontend** - errors should be gone!

---

### Method 2: Run SQL Script Directly

If the Python script fails, run the SQL manually:

1. **Open pgAdmin** (or your PostgreSQL client)

2. **Connect to your database**

3. **Run the SQL script:**
   - Open `backend/migrate_infect_gi_hema.sql`
   - Copy all SQL statements
   - Execute in pgAdmin query tool

4. **Restart backend**

---

### Method 3: Manual SQL Commands

If you prefer to run commands one by one:

```sql
-- Add new columns
ALTER TABLE infect_gi_hema_day_logs 
ADD COLUMN IF NOT EXISTS meningitis BOOLEAN,
ADD COLUMN IF NOT EXISTS meningitis_type VARCHAR,
ADD COLUMN IF NOT EXISTS men BOOLEAN,
ADD COLUMN IF NOT EXISTS feed_type VARCHAR,
ADD COLUMN IF NOT EXISTS cumulative_feed_volume FLOAT,
ADD COLUMN IF NOT EXISTS iv_fluids BOOLEAN,
ADD COLUMN IF NOT EXISTS cholestasis BOOLEAN,
ADD COLUMN IF NOT EXISTS hb_value FLOAT;

-- Rename column (only if enteral_feeds_started exists)
ALTER TABLE infect_gi_hema_day_logs 
RENAME COLUMN enteral_feeds_started TO enteral_feeds_received;
```

---

## What Gets Updated

**New Columns Added:**
- ✅ `meningitis` (Boolean) - Field #6
- ✅ `meningitis_type` (String) - Field #7 (Probable/Proven)
- ✅ `men` (Boolean) - Field #11 (Minimal Enteral Nutrition)
- ✅ `feed_type` (String) - Field #13 ("PDHM,EBM,FM")
- ✅ `cumulative_feed_volume` (Float) - Field #14
- ✅ `iv_fluids` (Boolean) - Field #16
- ✅ `cholestasis` (Boolean) - Field #22
- ✅ `hb_value` (Float) - Field #23 (g/dL)

**Column Renamed:**
- ✅ `enteral_feeds_started` → `enteral_feeds_received` (Field #12)

**Old Columns:**
- 🔒 `eos`, `los`, `antibiotic_day`, `csf_culture_positive` - remain in DB but unused
- 🔒 `full_feeds`, `nec_surgery` - remain in DB but unused
- No data loss - backward compatible

---

## Verify Migration

After running migration, verify columns exist:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'infect_gi_hema_day_logs'
AND column_name IN (
    'meningitis', 'meningitis_type', 'men', 'feed_type', 
    'cumulative_feed_volume', 'iv_fluids', 'cholestasis', 
    'hb_value', 'enteral_feeds_received'
)
ORDER BY column_name;
```

Should return 9 rows.

---

## Troubleshooting

### If Python script fails with connection error:
- Check `backend/config.py` has correct DATABASE_URL
- Verify PostgreSQL is running
- Test connection: `psql -U <username> -d <database>`

### If SQL fails with permission error:
- Ensure your database user has ALTER TABLE permission
- Run as superuser if needed

### If backend still shows errors after migration:
- Restart backend completely (not just reload)
- Check backend logs for actual error
- Verify migration ran successfully (check column count)

### If frontend still shows old fields:
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+Shift+R)
- Check you're using updated frontend code

---

## Test After Migration

1. Navigate to Helper Form 3
2. You should see all 30 numbered fields
3. No 422 or 500 errors
4. Save/load/submit should work
5. Progress calculation should be correct

---

## Rollback (if needed)

To rollback the migration:

```sql
-- Remove new columns
ALTER TABLE infect_gi_hema_day_logs
DROP COLUMN IF EXISTS meningitis,
DROP COLUMN IF EXISTS meningitis_type,
DROP COLUMN IF EXISTS men,
DROP COLUMN IF EXISTS feed_type,
DROP COLUMN IF EXISTS cumulative_feed_volume,
DROP COLUMN IF EXISTS iv_fluids,
DROP COLUMN IF EXISTS cholestasis,
DROP COLUMN IF EXISTS hb_value;

-- Rename back
ALTER TABLE infect_gi_hema_day_logs
RENAME COLUMN enteral_feeds_received TO enteral_feeds_started;
```

Then restore old backend/frontend code from git.
