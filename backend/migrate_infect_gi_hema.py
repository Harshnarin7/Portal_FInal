"""
Migration script to add new columns to infect_gi_hema_day_logs table.
Run this script to update the database schema for Helper Form 3.

Usage:
    python migrate_infect_gi_hema.py
"""

from sqlalchemy import create_engine, text
from db import DATABASE_URL
import sys

def run_migration():
    """Add new columns to infect_gi_hema_day_logs table."""
    
    print("🔄 Starting migration for Helper Form 3 (Infect-GI-Hema)...")
    
    try:
        engine = create_engine(DATABASE_URL)
        
        with engine.connect() as conn:
            # Start transaction
            trans = conn.begin()
            
            try:
                # Add new INFECTION columns
                print("  Adding infection columns: meningitis, meningitis_type...")
                conn.execute(text("""
                    ALTER TABLE infect_gi_hema_day_logs 
                    ADD COLUMN IF NOT EXISTS meningitis BOOLEAN,
                    ADD COLUMN IF NOT EXISTS meningitis_type VARCHAR
                """))
                
                # Add new GASTROINTESTINAL columns
                print("  Adding GI columns: men, feed_type, cumulative_feed_volume, iv_fluids, cholestasis...")
                conn.execute(text("""
                    ALTER TABLE infect_gi_hema_day_logs
                    ADD COLUMN IF NOT EXISTS men BOOLEAN,
                    ADD COLUMN IF NOT EXISTS feed_type VARCHAR,
                    ADD COLUMN IF NOT EXISTS cumulative_feed_volume FLOAT,
                    ADD COLUMN IF NOT EXISTS iv_fluids BOOLEAN,
                    ADD COLUMN IF NOT EXISTS cholestasis BOOLEAN
                """))
                
                # Add new HEMATOLOGY column
                print("  Adding hematology column: hb_value...")
                conn.execute(text("""
                    ALTER TABLE infect_gi_hema_day_logs
                    ADD COLUMN IF NOT EXISTS hb_value FLOAT
                """))
                
                # Rename column
                print("  Renaming enteral_feeds_started → enteral_feeds_received...")
                conn.execute(text("""
                    DO $$
                    BEGIN
                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name = 'infect_gi_hema_day_logs' 
                            AND column_name = 'enteral_feeds_started'
                        ) AND NOT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name = 'infect_gi_hema_day_logs' 
                            AND column_name = 'enteral_feeds_received'
                        ) THEN
                            ALTER TABLE infect_gi_hema_day_logs 
                            RENAME COLUMN enteral_feeds_started TO enteral_feeds_received;
                        END IF;
                    END $$;
                """))
                
                # Commit transaction
                trans.commit()
                
                # Verify migration
                print("\n✅ Migration completed successfully!")
                print("\n📊 Verifying new columns...")
                
                result = conn.execute(text("""
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_name = 'infect_gi_hema_day_logs'
                    AND column_name IN (
                        'meningitis', 'meningitis_type', 'men', 'feed_type', 
                        'cumulative_feed_volume', 'iv_fluids', 'cholestasis', 
                        'hb_value', 'enteral_feeds_received'
                    )
                    ORDER BY column_name
                """))
                
                print("\n  New columns:")
                for row in result:
                    print(f"    ✓ {row[0]:<30} {row[1]:<20} nullable={row[2]}")
                
                print("\n🎉 Database is now ready for Helper Form 3!")
                print("   You can now use the updated form with all 30 fields.\n")
                
                return True
                
            except Exception as e:
                trans.rollback()
                raise e
                
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        print("\nTroubleshooting:")
        print("  1. Check if DATABASE_URL in config.py is correct")
        print("  2. Verify database is running and accessible")
        print("  3. Check if you have ALTER TABLE permissions")
        print(f"  4. Manual fix: Run backend/migrate_infect_gi_hema.sql in pgAdmin\n")
        return False

if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
