"""Finance API regression tests; database initialization is redirected to memory."""
import unittest
from unittest.mock import patch
from flask_sqlalchemy import SQLAlchemy

original_init = SQLAlchemy.init_app

def memory_init(self, application):
    application.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite://'
    return original_init(self, application)

with patch.object(SQLAlchemy, 'init_app', memory_init):
    from app import app, db, User, Employee, ExpenseClaim, Approval, PayrollRun, Payslip, PayslipItem


class FinanceCrudTest(unittest.TestCase):
    def setUp(self):
        self.ctx = app.app_context()
        self.ctx.push()
        self.client = app.test_client()
        self.admin = User.query.filter(User.role.has(slug='super_admin')).first()
        self.admin.token = 'finance-test-admin'
        self.employee = User.query.filter(User.role.has(slug='employee')).first()
        self.employee.token = 'finance-test-employee'
        db.session.commit()

    def tearDown(self):
        db.session.rollback()
        self.ctx.pop()

    def call(self, method, path, data=None, employee=False):
        return self.client.open('/api/v1/' + path, method=method, json=data,
            headers={'Authorization': 'Bearer finance-test-' + ('employee' if employee else 'admin')})

    def test_claim_crud_and_protections(self):
        cat = self.call('POST', 'expense-categories', {'name': 'Test travel'}).json['data']['id']
        payload = dict(title='Taxi', category_id=cat, amount='45.50', claim_date='2026-10-29')
        r = self.call('POST', 'claims', payload, employee=True)
        self.assertEqual(r.status_code, 201, r.json)
        cid = r.json['data']['id']
        self.assertEqual(self.call('GET', f'claims/{cid}', employee=True).status_code, 200)
        self.assertEqual(self.call('PUT', f'claims/{cid}', {'amount': '-1'}, True).status_code, 422)
        r = self.call('PUT', f'claims/{cid}', {'title': 'Updated taxi', 'status': 'paid'}, True)
        self.assertEqual(r.status_code, 200, r.json)
        self.assertEqual(r.json['data']['status'], 'pending')
        self.assertEqual(self.call('DELETE', f'expense-categories/{cat}').status_code, 409)
        self.assertEqual(self.call('DELETE', f'claims/{cid}', employee=True).status_code, 200)
        self.assertFalse(Approval.query.filter_by(request_type='expense', request_id=cid).first())
        self.assertEqual(self.call('DELETE', f'expense-categories/{cat}').status_code, 200)

    def test_claim_ownership_and_finalized_protection(self):
        cat = self.call('POST', 'expense-categories', {'name': 'Ownership test'}).json['data']['id']
        other = Employee.query.filter(Employee.id != self.employee.employee_id).first()
        payload = dict(title='Own claim', category_id=cat, amount='10', claim_date='2026-10-29',
                       employee_id=other.id, status='paid', approved_by=self.admin.id)
        response = self.call('POST', 'claims', payload, employee=True)
        self.assertEqual(response.status_code, 201, response.json)
        claim = response.json['data']
        self.assertEqual(claim['employee_id'], self.employee.employee_id)
        self.assertEqual(claim['status'], 'pending')
        cid = claim['id']
        response = self.call('PUT', f'claims/{cid}', {'employee_id': other.id}, employee=True)
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json['data']['employee_id'], self.employee.employee_id)
        record = db.session.get(ExpenseClaim, cid)
        for status in ('approved', 'rejected', 'paid'):
            record.status = status
            db.session.commit()
            self.assertEqual(self.call('PUT', f'claims/{cid}', {'amount': '20'}).status_code, 422)
            self.assertEqual(self.call('DELETE', f'claims/{cid}').status_code, 409)
        record.status = 'pending'
        record.employee_id = other.id
        db.session.commit()
        self.assertEqual(self.call('PUT', f'claims/{cid}', {'amount': '20'}, employee=True).status_code, 403)
        self.assertEqual(self.call('DELETE', f'claims/{cid}', employee=True).status_code, 403)
        self.assertEqual(self.call('DELETE', f'claims/{cid}').status_code, 200)
        self.assertEqual(self.call('DELETE', f'expense-categories/{cat}').status_code, 200)

    def test_category_and_component_crud(self):
        for resource, payload, update in (
            ('expense-categories', {'name': 'Test meals', 'limit_amount': '200'}, {'name': 'Updated meals'}),
            ('salary-components', {'name': 'Test bonus', 'code': 'TEST_BONUS'}, {'name': 'Updated bonus'}),
        ):
            with self.subTest(resource=resource):
                self.assertEqual(self.call('POST', resource, payload, employee=True).status_code, 403)
                response = self.call('POST', resource, payload)
                self.assertEqual(response.status_code, 201, response.json)
                rid = response.json['data']['id']
                self.assertEqual(self.call('GET', f'{resource}/{rid}').status_code, 200)
                response = self.call('PUT', f'{resource}/{rid}', update)
                self.assertEqual(response.status_code, 200, response.json)
                self.assertEqual(response.json['data']['name'], update['name'])
                self.assertEqual(self.call('PUT', f'{resource}/{rid}', {'name': ' '}).status_code, 422)
                self.assertEqual(self.call('DELETE', f'{resource}/{rid}').status_code, 200)
                self.assertEqual(self.call('GET', f'{resource}/{rid}').status_code, 404)
        self.assertEqual(self.call('POST', 'expense-categories', {'name': 'Invalid', 'limit_amount': '-1'}).status_code, 422)
        self.assertEqual(self.call('POST', 'salary-components', {'name': 'Invalid', 'code': 'BAD', 'kind': 'invalid'}).status_code, 422)

    def test_payroll_crud_cleanup_and_finalization(self):
        payload = dict(period_month=2, period_year=2099, notes='Test run')
        r = self.call('POST', 'payroll-runs', payload)
        self.assertEqual(r.status_code, 201, r.json)
        rid = r.json['data']['id']
        self.assertEqual(self.call('POST', 'payroll-runs', payload).status_code, 422)
        self.assertEqual(self.call('PUT', f'payroll-runs/{rid}', {'period_month': 13}).status_code, 422)
        run = db.session.get(PayrollRun, rid)
        run.status = 'calculated'
        ps = Payslip(run_id=rid, employee_id=self.employee.employee_id)
        db.session.add(ps)
        db.session.flush()
        pid = ps.id
        db.session.add(PayslipItem(payslip_id=pid, name='Test earning', amount=1))
        db.session.commit()
        r = self.call('PUT', f'payroll-runs/{rid}', {'notes': 'Changed'})
        self.assertEqual(r.status_code, 200, r.json)
        self.assertEqual(r.json['data']['status'], 'draft')
        self.assertEqual(Payslip.query.filter_by(run_id=rid).count(), 0)
        self.assertEqual(PayslipItem.query.filter_by(payslip_id=pid).count(), 0)
        run.status = 'approved'
        db.session.commit()
        self.assertEqual(self.call('POST', f'payroll-runs/{rid}/calculate').status_code, 409)
        run.status = 'paid'
        db.session.commit()
        self.assertEqual(self.call('PUT', f'payroll-runs/{rid}', {'notes': 'No'}).status_code, 422)
        self.assertEqual(self.call('DELETE', f'payroll-runs/{rid}').status_code, 409)
        self.assertEqual(self.call('DELETE', f'payroll-runs/{rid}', employee=True).status_code, 403)
        run.status = 'draft'
        db.session.commit()
        self.assertEqual(self.call('DELETE', f'payroll-runs/{rid}').status_code, 200)

if __name__ == '__main__':
    unittest.main()
