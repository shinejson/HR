#!/usr/bin/env python
"""Database migration script for Shift Roster Management"""

import sqlite3
import sys
from datetime import datetime

DB_PATH = 'instance/hrms.db'

def run_migration():
    """Run the shift roster migration"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        print("=" * 60)
        print("SHIFT ROSTER MIGRATION")
        print("=" * 60)
        
        # Step 1: Add color column to shifts table
        print("\n[1/4] Checking shifts table...")
        cursor.execute("PRAGMA table_info(shifts)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'color' not in columns:
            print("  → Adding 'color' column to shifts table...")
            cursor.execute("ALTER TABLE shifts ADD COLUMN color VARCHAR(20) DEFAULT '#0f766e'")
            print("  ✓ Column added successfully")
        else:
            print("  ✓ Column 'color' already exists")
        
        # Step 2: Check if shift_assignments table exists
        print("\n[2/4] Checking shift_assignments table...")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='shift_assignments'")
        table_exists = cursor.fetchone() is not None
        
        if not table_exists:
            print("  → Creating shift_assignments table...")
            cursor.execute("""
                CREATE TABLE shift_assignments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    employee_id INTEGER NOT NULL,
                    department_id INTEGER NOT NULL,
                    shift_id INTEGER,
                    work_date DATE NOT NULL,
                    week_start DATE NOT NULL,
                    notes VARCHAR(255),
                    created_by_id INTEGER,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    created_by INTEGER,
                    updated_by INTEGER,
                    FOREIGN KEY (employee_id) REFERENCES employees(id),
                    FOREIGN KEY (department_id) REFERENCES departments(id),
                    FOREIGN KEY (shift_id) REFERENCES shifts(id),
                    FOREIGN KEY (created_by_id) REFERENCES employees(id),
                    UNIQUE (employee_id, work_date)
                )
            """)
            print("  ✓ Table created successfully")
            
            # Create indexes
            print("  → Creating indexes...")
            cursor.execute("CREATE INDEX idx_shift_dept_week ON shift_assignments(department_id, week_start)")
            cursor.execute("CREATE INDEX idx_shift_employee ON shift_assignments(employee_id)")
            cursor.execute("CREATE INDEX idx_shift_date ON shift_assignments(work_date)")
            print("  ✓ Indexes created successfully")
        else:
            print("  ✓ Table 'shift_assignments' already exists")
        
        # Step 3: Insert default shifts if they don't exist
        print("\n[3/4] Checking default shifts...")
        cursor.execute("SELECT COUNT(*) FROM shifts WHERE code IN ('E', 'L', 'MID', 'OFF')")
        existing_shifts = cursor.fetchone()[0]
        
        if existing_shifts < 4:
            print("  → Inserting default shift types...")
            now = datetime.now().isoformat()
            
            default_shifts = [
                ('Evening Shift', 'E', '17:30', '02:00', 15, 1.5, 1, '#0f766e'),
                ('Late Shift', 'L', '22:00', '06:00', 10, 2.0, 0, '#7c3aed'),
                ('Mid Shift', 'MID', '11:00', '19:00', 10, 1.5, 0, '#ea580c'),
                ('Day Off', 'OFF', '00:00', '00:00', 0, 0, 0, '#94a3b8'),
            ]
            
            for shift in default_shifts:
                cursor.execute("""
                    SELECT id FROM shifts WHERE code = ?
                """, (shift[1],))
                exists = cursor.fetchone()
                
                if not exists:
                    cursor.execute("""
                        INSERT INTO shifts (name, code, start_time, end_time, grace_minutes, 
                                          overtime_multiplier, is_default, color, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (*shift, now, now))
                    print(f"    ✓ Added: {shift[0]} ({shift[1]})")
                else:
                    print(f"    ✓ Already exists: {shift[0]} ({shift[1]})")
        else:
            print("  ✓ Default shifts already exist")
        
        # Step 4: Update existing shifts with colors if they don't have them
        print("\n[4/4] Updating shift colors...")
        cursor.execute("UPDATE shifts SET color = '#0f766e' WHERE color IS NULL OR color = ''")
        updated = cursor.rowcount
        if updated > 0:
            print(f"  ✓ Updated {updated} shift(s) with default color")
        else:
            print("  ✓ All shifts already have colors")
        
        # Commit all changes
        conn.commit()
        
        print("\n" + "=" * 60)
        print("✓ MIGRATION COMPLETED SUCCESSFULLY")
        print("=" * 60)
        
        # Show summary
        cursor.execute("SELECT COUNT(*) FROM shifts")
        total_shifts = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM shift_assignments")
        total_assignments = cursor.fetchone()[0]
        
        print(f"\nDatabase summary:")
        print(f"  • Total shift types: {total_shifts}")
        print(f"  • Total assignments: {total_assignments}")
        print(f"\nYou can now:")
        print(f"  1. Add roster API endpoints to app.py")
        print(f"  2. Create the frontend roster view")
        print(f"  3. Access shift management at: http://127.0.0.1:5000/#/shifts")
        
        return True
        
    except Exception as e:
        conn.rollback()
        print(f"\n✗ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        conn.close()

if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
