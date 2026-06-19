"""
One-time migration: adds all new columns across participant_pii,
maternal_details, and postnatal_day1.
Run once from backend folder: python migrate_pii_columns.py
"""
from db import engine
from sqlalchemy import text

ALL_PATCHES = [
    # participant_pii — individual address fields
    ("participant_pii", "email_address",               "VARCHAR"),
    ("participant_pii", "house",                       "VARCHAR"),
    ("participant_pii", "city",                        "VARCHAR"),
    ("participant_pii", "district",                    "VARCHAR"),
    ("participant_pii", "state",                       "VARCHAR"),
    ("participant_pii", "pincode",                     "VARCHAR"),
    ("participant_pii", "landmark",                    "VARCHAR"),
    # maternal_details — missing fields
    ("maternal_details", "artificial_other",           "VARCHAR"),
    ("maternal_details", "steroid_courses",            "INTEGER"),
    ("maternal_details", "lddi_known",                 "VARCHAR"),
    ("maternal_details", "maternal_tachycardia",       "VARCHAR"),
    ("maternal_details", "maternal_abdominal_tenderness", "VARCHAR"),
    # postnatal_day1 — FormD new fields
    ("postnatal_day1", "surfactant_brand_other",       "VARCHAR"),
    ("postnatal_day1", "lisa_catheter_type",           "VARCHAR"),
    ("postnatal_day1", "adverse_type_other",           "VARCHAR"),
    ("postnatal_day1", "device_type_other",            "VARCHAR"),
    ("postnatal_day1", "caffeine_loading",             "BOOLEAN"),
    ("postnatal_day1", "caffeine_loading_abs",         "FLOAT"),
    ("postnatal_day1", "caffeine_maint_abs",           "FLOAT"),
    ("postnatal_day1", "caffeine_date",                "DATE"),
    ("postnatal_day1", "caffeine_time",                "VARCHAR"),
]

with engine.begin() as conn:
    for table, col, typ in ALL_PATCHES:
        try:
            conn.execute(text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {typ}"
            ))
            print(f"✓  {table}.{col}")
        except Exception as e:
            print(f"⚠  {table}.{col}: {e}")

print("\nMigration complete.")

# Fix: convert BOOLEAN columns to VARCHAR (created with wrong type)
BOOL_TO_VARCHAR = [
    "ALTER TABLE maternal_details ALTER COLUMN maternal_tachycardia TYPE VARCHAR USING CASE WHEN maternal_tachycardia THEN 'Yes' ELSE 'No' END",
    "ALTER TABLE maternal_details ALTER COLUMN maternal_abdominal_tenderness TYPE VARCHAR USING CASE WHEN maternal_abdominal_tenderness THEN 'Yes' ELSE 'No' END",
]

print("\nFixing column types...")
with engine.begin() as conn:
    for stmt in BOOL_TO_VARCHAR:
        try:
            conn.execute(text(stmt))
            col = stmt.split("COLUMN ")[1].split(" ")[0]
            print(f"✓  Fixed type: maternal_details.{col}")
        except Exception as e:
            print(f"⚠  {e}")
print("Done.")

# Add temp_dr to nicu_admission
print("\nAdding nicu_admission.temp_dr...")
with engine.begin() as conn:
    try:
        conn.execute(text("ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS temp_dr FLOAT"))
        print("✓  nicu_admission.temp_dr")
    except Exception as e:
        print(f"⚠  {e}")

# Add missing nicu_admission columns
NICU_PATCHES = [
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS transport_cpap FLOAT",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS transport_pip  FLOAT",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS transport_peep FLOAT",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS transport_map  FLOAT",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS nicu_cpap FLOAT",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS nicu_pip  FLOAT",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS nicu_peep FLOAT",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS nicu_map  FLOAT",
]
print("\nAdding nicu_admission parameter columns...")
with engine.begin() as conn:
    for stmt in NICU_PATCHES:
        col = stmt.split("COLUMN IF NOT EXISTS ")[1].split(" ")[0]
        try:
            conn.execute(text(stmt))
            print(f"✓  nicu_admission.{col}")
        except Exception as ex:
            print(f"⚠  {col}: {ex}")
