#!/usr/bin/env python3
"""
Database migration to add multi-level approval fields to leave_requests table
Run this script once to update the database schema
"""

from app import app, db
from sqlalchemy import text

def migrate():
    with app.app_context():
        print("Adding multi-level approval fields to leave_requests table...")
        
        # Add new columns
        with db.engine.connect() as conn:
            try:
                # Check if columns already exist
                result = conn.execute(text("PRAGMA table_info(leave_requests)"))
                columns = [row[1] for row in result]
                
                if 'leave_already_taken' not in columns:
                    conn.execute(text("ALTER TABLE leave_requests ADD COLUMN leave_already_taken NUMERIC(6,2) DEFAULT 0"))
                    print("✓ Added leave_already_taken column")
                
                if 'resumption_date' not in columns:
                    conn.execute(text("ALTER TABLE leave_requests ADD COLUMN resumption_date DATE"))
                    print("✓ Added resumption_date column")
                
                if 'employee_signature' not in columns:
                    conn.execute(text("ALTER TABLE leave_requests ADD COLUMN employee_signature VARCHAR(255)"))
                    print("✓ Added employee_signature column")
                
                if 'hod_approved_at' not in columns:
                    conn.execute(text("ALTER TABLE leave_requests ADD COLUMN hod_approved_at DATETIME"))
                    print("✓ Added hod_approved_at column")
                
                if 'hod_approved_by' not in columns:
                    conn.execute(text("ALTER TABLE leave_requests ADD COLUMN hod_approved_by INTEGER REFERENCES employees(id)"))
                    print("✓ Added hod_approved_by column")
                
                if 'accountant_approved_at' not in columns:
                    conn.execute(text("ALTER TABLE leave_requests ADD COLUMN accountant_approved_at DATETIME"))
                    print("✓ Added accountant_approved_at column")
                
                if 'accountant_approved_by' not in columns:
                    conn.execute(text("ALTER TABLE leave_requests ADD COLUMN accountant_approved_by INTEGER REFERENCES employees(id)"))
                    print("✓ Added accountant_approved_by column")
                
                if 'md_approved_at' not in columns:
                    conn.execute(text("ALTER TABLE leave_requests ADD COLUMN md_approved_at DATETIME"))
                    print("✓ Added md_approved_at column")
                
                if 'md_approved_by' not in columns:
                    conn.execute(text("ALTER TABLE leave_requests ADD COLUMN md_approved_by INTEGER REFERENCES employees(id)"))
                    print("✓ Added md_approved_by column")
                
                conn.commit()
                print("\n✅ Migration completed successfully!")
                print("\nThe leave request form now supports:")
                print("  • Leave already taken tracking")
                print("  • Resumption date calculation")
                print("  • Employee signature")
                print("  • 3-level approval workflow (HOD → Accountant → Managing Director)")
                
            except Exception as e:
                print(f"❌ Error during migration: {e}")
                conn.rollback()
                raise

if __name__ == '__main__':
    migrate()
