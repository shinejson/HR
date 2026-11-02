"""Shift planning authorization and schedule regression tests."""
import unittest
import test_finance_crud as finance
from app import db, Employee, Department


class ShiftPlannerTest(unittest.TestCase):
    setUp = finance.FinanceCrudTest.setUp
    tearDown = finance.FinanceCrudTest.tearDown
    call = finance.FinanceCrudTest.call

    def test_department_scope_and_personal_sheet(self):
        head = self.admin.employee
        worker = self.employee.employee
        self.assertIsNotNone(head)
        self.assertIsNotNone(worker)
        dept = Department(name='Shift test department', head_id=head.id, status='active')
        other = Department(name='Other shift department', status='active')
        db.session.add_all([dept, other]); db.session.flush()
        old_dept = worker.department_id
        worker.department_id = dept.id
        db.session.commit()
        path = f'shift-planner/{dept.id}'
        default = self.call('GET', f'shift-planner?department_id={dept.id}')
        self.assertEqual(default.status_code, 200)
        shifts = default.json['data']['shifts']
        shifts[1]['enabled'] = False
        self.assertEqual(self.call('PUT', path + '/shifts', {'shifts': shifts}, True).status_code, 403)
        self.assertEqual(self.call('GET', f'shift-planner?department_id={dept.id}', employee=True).status_code, 403)
        self.assertEqual(self.call('GET', f'shift-planner?department_id={other.id}').status_code, 403)
        self.assertEqual(self.call('PUT', path + '/shifts', {'shifts': shifts}).status_code, 200)
        configured = self.call('GET', f'shift-planner?department_id={dept.id}').json['data']['shifts']
        payload = {'employee_id': worker.id, 'work_date': '2099-05-01', 'shift_id': configured[0]['id'], 'note': 'Observe at 09:30'}
        self.assertEqual(self.call('POST', path + '/assignments', dict(payload, shift_id=configured[1]['id'])).status_code, 422)
        outside = Employee.query.filter(Employee.department_id != dept.id, Employee.deleted_at.is_(None)).first()
        self.assertEqual(self.call('POST', path + '/assignments', dict(payload, employee_id=outside.id)).status_code, 422)
        result = self.call('POST', path + '/assignments', payload)
        self.assertEqual(result.status_code, 200, result.json)
        aid = result.json['data']['id']
        personal = self.call('GET', 'shift-planner', employee=True).json['data']['assignments']
        self.assertEqual([a['id'] for a in personal], [aid])
        self.assertEqual(personal[0]['note'], 'Observe at 09:30')
        self.assertEqual(self.call('DELETE', path + f'/assignments/{aid}', employee=True).status_code, 403)
        self.assertEqual(self.call('DELETE', path + f'/assignments/{aid}').status_code, 200)
        worker.department_id = old_dept
        db.session.commit()

    def test_invalid_configuration_and_dates(self):
        self.assertEqual(self.call('GET', 'shift-planner?from_date=bad').status_code, 422)
