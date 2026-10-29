"""Talent and lifecycle CRUD tests use the shared in-memory application."""
import unittest
import test_finance_crud as finance


class HrCrudTest(unittest.TestCase):
    setUp = finance.FinanceCrudTest.setUp
    tearDown = finance.FinanceCrudTest.tearDown
    call = finance.FinanceCrudTest.call

    def create(self, resource, data):
        response = self.call('POST', resource, data)
        self.assertEqual(response.status_code, 201, response.json)
        return response.json['data']['id']

    def test_full_lifecycle_crud(self):
        employee_id = self.employee.employee_id
        cycle = self.create('appraisal-cycles', {'name': 'CRUD cycle', 'start_date': '2026-10-01', 'end_date': '2026-10-31'})
        job = self.create('job-postings', {'title': 'CRUD role', 'vacancies': 1})
        candidate = self.create('candidates', {'first_name': 'CRUD', 'last_name': 'Candidate'})
        application = self.create('applications', {'job_posting_id': job, 'candidate_id': candidate})
        records = [
            ('goals', {'employee_id': employee_id, 'title': 'CRUD goal'}, {'title': 'Updated goal'}),
            ('appraisals', {'employee_id': employee_id, 'cycle_id': cycle}, {'manager_score': '4.5'}),
            ('interviews', {'application_id': application, 'scheduled_at': '2026-10-30T10:00'}, {'feedback': 'Updated feedback'}),
            ('onboarding-tasks', {'employee_id': employee_id, 'title': 'CRUD task'}, {'title': 'Updated task'}),
            ('offboardings', {'employee_id': employee_id, 'reason': 'Test'}, {'reason': 'Updated reason'}),
            ('documents', {'title': 'CRUD document', 'employee_id': employee_id, 'uploaded_by': 99999}, {'notes': 'Updated notes'}),
            ('policies', {'title': 'CRUD policy', 'content': 'Test content'}, {'content': 'Updated content'}),
        ]
        for resource, payload, changes in records:
            with self.subTest(resource=resource):
                rid = self.create(resource, payload)
                self.assertEqual(self.call('GET', f'{resource}/{rid}').status_code, 200)
                response = self.call('PUT', f'{resource}/{rid}', changes)
                self.assertEqual(response.status_code, 200, response.json)
                if resource == 'documents':
                    self.assertEqual(response.json['data']['uploaded_by'], self.admin.id)
                self.assertEqual(self.call('DELETE', f'{resource}/{rid}').status_code, 200)
                self.assertEqual(self.call('GET', f'{resource}/{rid}').status_code, 404)
        for resource, rid, changes in [
            ('applications', application, {'cover_letter': 'Updated'}),
            ('candidates', candidate, {'first_name': 'Updated'}),
            ('job-postings', job, {'title': 'Updated job'}),
            ('appraisal-cycles', cycle, {'name': 'Updated cycle'}),
        ]:
            self.assertEqual(self.call('GET', f'{resource}/{rid}').status_code, 200)
            self.assertEqual(self.call('PUT', f'{resource}/{rid}', changes).status_code, 200)
            self.assertEqual(self.call('DELETE', f'{resource}/{rid}').status_code, 200)

    def test_validation_and_permissions(self):
        for resource, data in [
            ('goals', {'employee_id': self.employee.employee_id, 'title': 'Invalid', 'progress': 101}),
            ('appraisal-cycles', {'name': 'Invalid', 'start_date': '2026-10-31', 'end_date': '2026-10-01'}),
            ('appraisals', {'employee_id': self.employee.employee_id, 'cycle_id': 999999}),
            ('job-postings', {'title': 'Invalid', 'vacancies': 0}),
            ('candidates', {'first_name': ' ', 'last_name': 'Candidate'}),
            ('applications', {'candidate_id': 999999, 'job_posting_id': 999999}),
            ('interviews', {'application_id': 999999}),
            ('onboarding-tasks', {'employee_id': 999999, 'title': 'Invalid'}),
            ('offboardings', {'employee_id': self.employee.employee_id, 'notice_period_days': -1}),
            ('documents', {'title': ' '}), ('policies', {'title': ' '}),
        ]:
            with self.subTest(resource=resource):
                self.assertEqual(self.call('POST', resource, data).status_code, 422)
                if resource != 'goals':
                    self.assertEqual(self.call('POST', resource, data, employee=True).status_code, 403)

    def test_linked_record_delete_protection(self):
        job = self.create('job-postings', {'title': 'Linked role'})
        candidate = self.create('candidates', {'first_name': 'Linked', 'last_name': 'Candidate'})
        application = self.create('applications', {'job_posting_id': job, 'candidate_id': candidate})
        self.assertEqual(self.call('POST', 'applications', {'job_posting_id': job, 'candidate_id': candidate}).status_code, 422)
        interview = self.create('interviews', {'application_id': application})
        for resource, rid in [('job-postings', job), ('candidates', candidate), ('applications', application)]:
            self.assertEqual(self.call('DELETE', f'{resource}/{rid}').status_code, 409)
        for resource, rid in [('interviews', interview), ('applications', application), ('candidates', candidate), ('job-postings', job)]:
            self.assertEqual(self.call('DELETE', f'{resource}/{rid}').status_code, 200)

    def test_policy_acknowledgement_cleanup_and_cycle_guard(self):
        from models import db, PolicyAck
        policy = self.create('policies', {'title': 'Acknowledged policy'})
        db.session.add(PolicyAck(policy_id=policy, employee_id=self.employee.employee_id))
        db.session.commit()
        self.assertEqual(self.call('DELETE', f'policies/{policy}').status_code, 200)
        self.assertEqual(PolicyAck.query.filter_by(policy_id=policy).count(), 0)
        cycle = self.create('appraisal-cycles', {'name': 'Linked cycle'})
        appraisal = self.create('appraisals', {'cycle_id': cycle, 'employee_id': self.employee.employee_id})
        self.assertEqual(self.call('DELETE', f'appraisal-cycles/{cycle}').status_code, 409)
        self.assertEqual(self.call('DELETE', f'appraisals/{appraisal}').status_code, 200)
        self.assertEqual(self.call('DELETE', f'appraisal-cycles/{cycle}').status_code, 200)
