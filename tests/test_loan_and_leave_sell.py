import unittest
import json
from decimal import Decimal
from datetime import datetime, date, timedelta

from app import app, db
from models import Employee, User, Role, Department, Designation, LeaveType, LeaveBalance, Loan, LoanRepayment, LeaveEncashment


class TestLoanAndLeaveEncashment(unittest.TestCase):
    def setUp(self):
        self.app = app
        self.client = self.app.test_client()
        self.ctx = self.app.app_context()
        self.ctx.push()

        # Find or create super_admin user
        self.admin = User.query.filter(User.role.has(slug="super_admin")).first() or User.query.first()
        self.admin.status = "active"
        self.admin.token = "test-admin-token-12345"
        self.admin.token_expires_at = datetime.utcnow() + timedelta(days=1)
        db.session.commit()

        self.headers = {
            "Authorization": f"Bearer {self.admin.token}",
            "Content-Type": "application/json",
        }

        # Active test employee
        self.employee = Employee.query.filter(Employee.deleted_at.is_(None), Employee.status == "active").first()
        self.assertIsNotNone(self.employee, "Active employee required for tests")

    def tearDown(self):
        self.ctx.pop()

    def test_loan_lifecycle_and_realtime_tracking(self):
        # 1. Request loan
        req_payload = {
            "employee_id": self.employee.id,
            "principal": 1200.0,
            "repayment_months": 6,
            "loan_type": "salary_advance",
            "start_date": date.today().isoformat(),
            "reason": "Test Tuition Support",
        }
        resp = self.client.post("/api/v1/loans/request", headers=self.headers, data=json.dumps(req_payload))
        self.assertEqual(resp.status_code, 200, resp.data)
        loan_data = resp.get_json()["data"]
        loan_id = loan_data["id"]
        self.assertTrue(loan_data["reference_no"].startswith("LOAN-"))
        self.assertEqual(loan_data["status"], "pending")
        self.assertEqual(loan_data["principal"], 1200.0)
        self.assertEqual(loan_data["instalment"], 200.0)

        # 2. Approve loan
        appr_resp = self.client.post(f"/api/v1/loans/{loan_id}/approve", headers=self.headers, data=json.dumps({"notes": "Approved by MD"}))
        self.assertEqual(appr_resp.status_code, 200)
        appr_data = appr_resp.get_json()["data"]
        self.assertEqual(appr_data["status"], "active")
        self.assertEqual(appr_data["balance"], 1200.0)

        # 3. Real-time tracking
        track_resp = self.client.get(f"/api/v1/loans/{loan_id}/tracking", headers=self.headers)
        self.assertEqual(track_resp.status_code, 200)
        track_data = track_resp.get_json()["data"]
        self.assertEqual(track_data["principal"], 1200.0)
        self.assertEqual(track_data["balance"], 1200.0)
        self.assertEqual(track_data["total_paid"], 0.0)
        self.assertEqual(track_data["progress_pct"], 0.0)

        # 4. Record real-time repayment
        repay_payload = {
            "amount": 400.0,
            "repayment_date": date.today().isoformat(),
            "source": "manual_payment",
            "notes": "First 2 months lump sum",
        }
        repay_resp = self.client.post(f"/api/v1/loans/{loan_id}/repay", headers=self.headers, data=json.dumps(repay_payload))
        self.assertEqual(repay_resp.status_code, 200)
        repay_data = repay_resp.get_json()["data"]
        self.assertEqual(repay_data["balance"], 800.0)
        self.assertEqual(repay_data["total_paid"], 400.0)
        self.assertEqual(repay_data["progress_pct"], 33.3)
        self.assertEqual(len(repay_data["repayments"]), 1)

        # 5. Loan agreement letter preview & PDF
        prev_resp = self.client.get(f"/api/v1/loans/{loan_id}/letter/preview", headers=self.headers)
        self.assertEqual(prev_resp.status_code, 200)
        self.assertIn("STAFF LOAN &amp; SALARY ADVANCE APPROVAL AGREEMENT", prev_resp.get_json()["data"]["html"])

        pdf_resp = self.client.get(f"/api/v1/loans/{loan_id}/letter/pdf", headers=self.headers)
        self.assertEqual(pdf_resp.status_code, 200)
        self.assertEqual(pdf_resp.mimetype, "application/pdf")
        self.assertGreater(len(pdf_resp.data), 1000)

        # Clean up
        loan = db.session.get(Loan, loan_id)
        if loan:
            db.session.delete(loan)
            db.session.commit()

    def test_leave_encashment_and_accumulated_deduction(self):
        # Find annual leave
        anl = LeaveType.query.filter_by(code="ANL").first() or LeaveType.query.first()
        year = date.today().year

        # Get initial leave summary
        sum_resp1 = self.client.get(f"/api/v1/leave/summary?employee_id={self.employee.id}", headers=self.headers)
        self.assertEqual(sum_resp1.status_code, 200, sum_resp1.data)
        metrics1 = sum_resp1.get_json()["metrics"]
        initial_avail = float(metrics1["available"])

        # Request to sell leaves
        enc_payload = {
            "employee_id": self.employee.id,
            "leave_type_id": anl.id,
            "year": year,
            "days_sold": 3.0,
            "daily_rate": 150.0,
            "reason": "Family financial assistance",
        }
        enc_resp = self.client.post("/api/v1/leave-encashments", headers=self.headers, data=json.dumps(enc_payload))
        self.assertEqual(enc_resp.status_code, 200, enc_resp.data)
        enc_data = enc_resp.get_json()["data"]
        enc_id = enc_data["id"]
        self.assertTrue(enc_data["reference_no"].startswith("LENC-"))
        self.assertEqual(enc_data["days_sold"], 3.0)
        self.assertEqual(enc_data["total_amount"], 450.0)
        self.assertEqual(enc_data["status"], "pending")

        # Approve leave encashment
        appr_resp = self.client.post(f"/api/v1/leave-encashments/{enc_id}/approve", headers=self.headers)
        self.assertEqual(appr_resp.status_code, 200, appr_resp.data)
        self.assertEqual(appr_resp.get_json()["data"]["status"], "approved")

        # Verify deduction from accumulated leave balance
        sum_resp2 = self.client.get(f"/api/v1/leave/summary?employee_id={self.employee.id}", headers=self.headers)
        self.assertEqual(sum_resp2.status_code, 200, sum_resp2.data)
        metrics2 = sum_resp2.get_json()["metrics"]
        self.assertAlmostEqual(float(metrics2["available"]), initial_avail - 3.0, places=1)
        self.assertGreaterEqual(float(metrics2["encashed"]), 3.0)

        # Leave Encashment letter preview & PDF
        prev_resp = self.client.get(f"/api/v1/leave-encashments/{enc_id}/letter/preview", headers=self.headers)
        self.assertEqual(prev_resp.status_code, 200)
        self.assertIn("APPROVAL OF ANNUAL LEAVE ENCASHMENT", prev_resp.get_json()["data"]["html"])

        pdf_resp = self.client.get(f"/api/v1/leave-encashments/{enc_id}/letter/pdf", headers=self.headers)
        self.assertEqual(pdf_resp.status_code, 200)
        self.assertEqual(pdf_resp.mimetype, "application/pdf")
        self.assertGreater(len(pdf_resp.data), 1000)

        # Clean up
        enc_obj = db.session.get(LeaveEncashment, enc_id)
        if enc_obj:
            bal = LeaveBalance.query.filter_by(employee_id=self.employee.id, leave_type_id=anl.id, year=year).first()
            if bal:
                bal.encashed = max(Decimal("0"), Decimal(bal.encashed or 0) - Decimal("3.0"))
            db.session.delete(enc_obj)
            db.session.commit()


if __name__ == "__main__":
    unittest.main()
