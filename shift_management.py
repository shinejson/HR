"""Department-scoped shift planning and personal schedules."""
import re
from datetime import date
from flask import request, jsonify
from models import db, Department, DepartmentHead, Employee, DepartmentShift, ShiftAssignment

DEFAULTS = [dict(name='Morning', start_time='06:00', end_time='14:00', enabled=True),
            dict(name='Mid', start_time='10:00', end_time='18:00', enabled=True),
            dict(name='Afternoon', start_time='14:00', end_time='22:00', enabled=True)]


def register_shift_routes(app, login_required, error):
    def departments(user):
        if not user.employee_id or not user.employee or user.employee.deleted_at or user.employee.status != 'active':
            return []
        ids = {d.id for d in Department.query.filter_by(head_id=user.employee_id).all()}
        ids.update(h.department_id for h in DepartmentHead.query.filter_by(employee_id=user.employee_id, role_type='head', status='active').all() if h.department_id)
        return Department.query.filter(Department.id.in_(ids), Department.status == 'active').order_by(Department.name).all()

    def authorized(dept_id):
        return any(d.id == dept_id for d in departments(request.user))

    def serialize(a):
        emp = db.session.get(Employee, a.employee_id)
        return dict(id=a.id, employee_id=a.employee_id, employee_name=emp.full_name if emp else '',
                    work_date=a.work_date.isoformat(), shift_name=a.shift_name,
                    start_time=a.start_time, end_time=a.end_time, note=a.note or '')

    @app.get('/api/v1/shift-planner')
    @login_required
    def shift_planner_get():
        user = request.user
        managed = departments(user)
        dept_id = request.args.get('department_id', type=int)
        if dept_id is not None:
            if not authorized(dept_id):
                return error('Only the department head can manage this department', 403)
            employees = Employee.query.filter_by(department_id=dept_id, deleted_at=None, status='active').order_by(Employee.first_name, Employee.last_name).all()
            shifts = DepartmentShift.query.filter_by(department_id=dept_id).order_by(DepartmentShift.id).all()
            definitions = [dict(id=s.id, name=s.name, start_time=s.start_time, end_time=s.end_time, enabled=s.enabled) for s in shifts] if shifts else DEFAULTS
            query = ShiftAssignment.query.join(Employee, Employee.id == ShiftAssignment.employee_id).filter(ShiftAssignment.department_id == dept_id, Employee.department_id == dept_id, Employee.deleted_at.is_(None))
        else:
            employees, definitions = [], []
            query = ShiftAssignment.query.filter_by(employee_id=user.employee_id) if user.employee_id else ShiftAssignment.query.filter(False)
            if user.employee:
                query = query.filter_by(department_id=user.employee.department_id)
        try:
            start = date.fromisoformat(request.args['from_date']) if request.args.get('from_date') else None
            end = date.fromisoformat(request.args['to_date']) if request.args.get('to_date') else None
            if start and end and start > end:
                raise ValueError()
        except ValueError:
            return error('Invalid date range', 422)
        if start: query = query.filter(ShiftAssignment.work_date >= start)
        if end: query = query.filter(ShiftAssignment.work_date <= end)
        rows = query.order_by(ShiftAssignment.work_date, ShiftAssignment.employee_id).all()
        return jsonify(data=dict(departments=[dict(id=d.id, name=d.name) for d in managed],
                                 employees=[dict(id=e.id, name=e.full_name) for e in employees],
                                 shifts=definitions, assignments=[serialize(a) for a in rows]))

    @app.put('/api/v1/shift-planner/<int:dept_id>/shifts')
    @login_required
    def shift_planner_config(dept_id):
        if not authorized(dept_id): return error('Only the department head can manage this department', 403)
        data = request.get_json(silent=True) or {}
        shifts = data.get('shifts')
        if not isinstance(shifts, list) or not 1 <= len(shifts) <= 20:
            return error('Provide between 1 and 20 shifts', 422)
        names = set()
        for s in shifts:
            if not isinstance(s, dict): return error('Invalid shift', 422)
            name = s.get('name')
            if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80 or name.strip().lower() in names:
                return error('Shift names must be unique and between 1 and 80 characters', 422)
            names.add(name.strip().lower())
            if not isinstance(s.get('enabled'), bool) or any(not isinstance(s.get(k), str) or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', s[k]) for k in ('start_time', 'end_time')) or s['start_time'] == s['end_time']:
                return error('Provide valid, different start and end times and an enabled status', 422)
        DepartmentShift.query.filter_by(department_id=dept_id).delete()
        for s in shifts:
            db.session.add(DepartmentShift(department_id=dept_id, name=s['name'].strip(), start_time=s['start_time'], end_time=s['end_time'], enabled=s['enabled']))
        db.session.commit()
        return jsonify(data={'saved': True})

    @app.post('/api/v1/shift-planner/<int:dept_id>/assignments')
    @login_required
    def shift_planner_assign(dept_id):
        if not authorized(dept_id): return error('Only the department head can manage this department', 403)
        data = request.get_json(silent=True) or {}
        employee = db.session.get(Employee, data.get('employee_id')) if type(data.get('employee_id')) is int else None
        shift = db.session.get(DepartmentShift, data.get('shift_id')) if type(data.get('shift_id')) is int else None
        if not employee or employee.department_id != dept_id or employee.deleted_at or employee.status != 'active': return error('Choose an active employee in your department', 422)
        if not shift or shift.department_id != dept_id or not shift.enabled: return error('Choose an enabled shift in your department', 422)
        try: work_date = date.fromisoformat(data.get('work_date', ''))
        except (ValueError, TypeError): return error('Enter a valid date', 422)
        note = data.get('note', '')
        if not isinstance(note, str) or len(note) > 2000: return error('Note must be at most 2000 characters', 422)
        a = ShiftAssignment.query.filter_by(employee_id=employee.id, work_date=work_date).first()
        if a and a.department_id != dept_id: return error('An assignment already exists for this employee and date in another department', 409)
        if not a:
            a = ShiftAssignment(department_id=dept_id, employee_id=employee.id, work_date=work_date)
            db.session.add(a)
        a.shift_name, a.start_time, a.end_time, a.note = shift.name, shift.start_time, shift.end_time, note.strip()
        db.session.commit()
        return jsonify(data=serialize(a))

    @app.delete('/api/v1/shift-planner/<int:dept_id>/assignments/<int:assignment_id>')
    @login_required
    def shift_planner_delete(dept_id, assignment_id):
        if not authorized(dept_id): return error('Only the department head can manage this department', 403)
        a = db.session.get(ShiftAssignment, assignment_id)
        emp = db.session.get(Employee, a.employee_id) if a else None
        if not a or a.department_id != dept_id or not emp or emp.department_id != dept_id: return error('Assignment not found', 404)
        db.session.delete(a)
        db.session.commit()
        return jsonify(data={'deleted': True})
