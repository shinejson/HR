-- Migration: Add Shift Roster Management
-- Date: 2026-11-02
-- Description: Adds shift_assignments table and updates shifts table for weekly roster management

-- Add color column to shifts table
ALTER TABLE shifts ADD COLUMN color VARCHAR(20) DEFAULT '#0f766e';

-- Create shift_assignments table
CREATE TABLE IF NOT EXISTS shift_assignments (
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
);

CREATE INDEX idx_shift_dept_week ON shift_assignments(department_id, week_start);
CREATE INDEX idx_shift_employee ON shift_assignments(employee_id);
CREATE INDEX idx_shift_date ON shift_assignments(work_date);

-- Insert default shifts if they don't exist
INSERT OR IGNORE INTO shifts (name, code, start_time, end_time, grace_minutes, overtime_multiplier, is_default, color, created_at, updated_at)
VALUES 
    ('Evening Shift', 'E', '17:30', '02:00', 15, 1.5, 1, '#0f766e', datetime('now'), datetime('now')),
    ('Late Shift', 'L', '22:00', '06:00', 10, 2.0, 0, '#7c3aed', datetime('now'), datetime('now')),
    ('Mid Shift', 'MID', '11:00', '19:00', 10, 1.5, 0, '#ea580c', datetime('now'), datetime('now')),
    ('Day Off', 'OFF', '00:00', '00:00', 0, 0, 0, '#94a3b8', datetime('now'), datetime('now'));
