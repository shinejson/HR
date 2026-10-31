"""Report catalogue, scoping, filters, branding and print regressions."""
from datetime import date, datetime
import sqlite3
import unittest

import test_finance_crud as finance
from app import (
    app, db, User, Employee, Department, Company, Attendance, LeaveBalance,
    LeaveRequest, LeaveType, Contract, Document, Payslip, PayrollRun, AuditLog,
)
from employee_reports import REPORT_TYPES


class EmployeeReportsApiTest(unittest.TestCase):
    setUp = finance.FinanceCrudTest.setUp
    tearDown = finance.FinanceCrudTest.tearDown

    def setUp(self):
        # The shared test application commits audit/auth changes. Restore its
        # in-memory database between cases so deleted fixtures cannot leak.
        self.snapshot = sqlite3.connect(":memory:")
        with app.app_context():
            db.engine.raw_connection().driver_connection.backup(self.snapshot)
        finance.FinanceCrudTest.setUp(self)
        self.company = Company.query.first()
        self.company.logo_url = "/uploads/branding/report-test-logo.png"
        self.company.name = "Example Hotel <Ltd>"
        self.company.address = "12 Test Street, Accra"
        self.company.phone = "+233 30 000 0000"
        self.company.email = "hr@example.test"
        self.me = self.employee.employee
        self.other = Employee.query.filter(Employee.id.notin_([self.me.id, self.admin.employee_id]),
                                           Employee.department_id != self.me.department_id,
                                           Employee.deleted_at.is_(None)).first()
        self.manager = User.query.filter(User.role.has(slug="manager")).first()
        self.manager.token = "report-test-manager"
        self.team = Employee.query.filter(Employee.manager_id == self.manager.employee_id,
                                          Employee.deleted_at.is_(None)).first()
        if not self.team:
            self.team = self.other
            self.team.manager_id = self.manager.employee_id
        db.session.commit()

    def tearDown(self):
        finance.FinanceCrudTest.tearDown(self)
        with app.app_context():
            db.session.remove()
            self.snapshot.backup(db.engine.raw_connection().driver_connection)
        self.snapshot.close()

    def call(self, path, user="admin", **params):
        tokens = {"admin": "finance-test-admin", "employee": "finance-test-employee",
                  "manager": "report-test-manager"}
        headers = {"Authorization": "Bearer " + tokens[user]} if user else {}
        return self.client.get("/api/v1/employee-reports/" + path, query_string=params, headers=headers)

    def rows(self, response):
        self.assertEqual(response.status_code, 200, response.json)
        return [row for section in response.json["data"]["sections"] for row in section.get("rows", [])]

    def test_catalogue_includes_every_department_and_employee_report_types(self):
        response = self.call("catalog")
        self.assertEqual(response.status_code, 200)
        data = response.json["data"]
        self.assertEqual({d["id"] for d in data["departments"] if d["id"]},
                         {d.id for d in Department.query.all()})
        self.assertEqual(len(data["types"]), 10)
        employee = next(e for e in data["employees"] if e["id"] == self.me.id)
        self.assertIn("profile", employee["report_types"])
        self.assertIn("payroll", employee["report_types"])
        self.assertIn("attendance", employee["report_types"])

    def test_every_report_type_builds_for_admin(self):
        for definition in REPORT_TYPES:
            with self.subTest(report=definition["key"]):
                params = {"type": definition["key"]}
                if definition["scope"] == "employee":
                    params["employee_id"] = self.me.id
                response = self.call("detail", **params)
                self.assertEqual(response.status_code, 200, response.json)
                data = response.json["data"]
                self.assertTrue(data["sections"])
                self.assertEqual(data["record_count"], sum(s["record_count"] for s in data["sections"]))
                self.assertEqual(data["company"]["logo_url"], self.company.logo_url)
                self.assertIn("payroll", data["organisation_types"])
                self.assertNotIn("profile", data["organisation_types"])

    def test_employee_catalogue_and_every_detail_are_limited_to_self(self):
        catalogue = self.call("catalog", "employee").json["data"]
        self.assertEqual([e["id"] for e in catalogue["employees"]], [self.me.id])
        self.assertEqual([d["id"] for d in catalogue["departments"]], [self.me.department_id])
        self.assertFalse(catalogue["can_view_analytics"])
        for definition in REPORT_TYPES:
            with self.subTest(report=definition["key"]):
                params = {"type": definition["key"]}
                if definition["scope"] == "employee":
                    params["employee_id"] = self.me.id
                response = self.call("detail", "employee", **params)
                rows = self.rows(response)
                self.assertTrue(all(r.get("employee_id", self.me.id) == self.me.id for r in rows))
                forbidden = self.call("detail", "employee", type=definition["key"], employee_id=self.other.id)
                self.assertEqual(forbidden.status_code, 403)
                self.assertEqual(self.call("print-report", "employee", type=definition["key"],
                                           employee_id=self.other.id).status_code, 403)

    def test_manager_sees_direct_team_not_entire_organisation(self):
        data = self.call("catalog", "manager").json["data"]
        expected = {self.manager.employee_id} | {e.id for e in Employee.query.filter_by(manager_id=self.manager.employee_id, deleted_at=None).all()}
        self.assertEqual({e["id"] for e in data["employees"]}, expected)
        rows = self.rows(self.call("detail", "manager", type="staff"))
        self.assertEqual({r["employee_id"] for r in rows}, expected)
        stranger = Employee.query.filter(~Employee.id.in_(expected), Employee.deleted_at.is_(None)).first()
        self.assertEqual(self.call("detail", "manager", type="profile", employee_id=stranger.id).status_code, 403)
        self.assertEqual(self.call("detail", "manager", type="payroll", employee_id=self.team.id).status_code, 403)
        self.assertEqual(self.call("detail", "manager", type="payroll", department_id=self.team.department_id).status_code, 403)
        own_payroll = self.rows(self.call("detail", "manager", type="payroll"))
        self.assertTrue(all(r["employee_id"] == self.manager.employee_id for r in own_payroll))

    def test_hr_officer_cannot_read_another_employees_payroll(self):
        officer = User.query.filter(User.role.has(slug="hr_officer")).first()
        officer.token = "report-test-officer"
        db.session.commit()
        headers = {"Authorization": "Bearer report-test-officer"}
        for endpoint in ("detail", "print-report"):
            response = self.client.get("/api/v1/employee-reports/" + endpoint,
                query_string={"type": "payroll", "employee_id": self.other.id}, headers=headers)
            self.assertEqual(response.status_code, 403)
        catalogue = self.client.get("/api/v1/employee-reports/catalog", headers=headers).json["data"]
        self.assertNotIn("payroll", catalogue["organisation_types"])

    def test_attendance_period_status_and_department_filters(self):
        Attendance.query.delete()
        db.session.add_all([
            Attendance(employee_id=self.me.id, work_date=date(2026, 10, 5), status="present", overtime_minutes=60),
            Attendance(employee_id=self.me.id, work_date=date(2026, 10, 6), status="late", overtime_minutes=30),
            Attendance(employee_id=self.other.id, work_date=date(2026, 10, 5), status="absent"),
        ])
        db.session.commit()
        rows = self.rows(self.call("detail", type="attendance", employee_id=self.me.id,
                                   date_from="2026-10-05", date_to="2026-10-05"))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["work_date"], "05 Oct 2026")
        self.assertEqual(self.rows(self.call("detail", type="attendance", status="late"))[0]["employee_id"], self.me.id)
        department_rows = self.rows(self.call("detail", type="attendance", department_id=self.me.department_id))
        self.assertTrue(all(r["employee_id"] == e.id for r in department_rows
                            for e in [db.session.get(Employee, r["employee_id"])] if e.department_id == self.me.department_id))

    def test_leave_period_includes_overlapping_request(self):
        LeaveRequest.query.delete()
        leave_type = LeaveType.query.first()
        db.session.add(LeaveRequest(employee_id=self.me.id, leave_type_id=leave_type.id,
                                    start_date=date(2026, 9, 28), end_date=date(2026, 10, 2), days=5))
        db.session.commit()
        rows = self.rows(self.call("detail", type="leave", employee_id=self.me.id,
                                   date_from="2026-10-01", date_to="2026-10-01"))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["days"], "5")

    def test_leave_balance_includes_carry_over_and_year_filter(self):
        LeaveBalance.query.delete()
        leave_type = LeaveType.query.first()
        db.session.add(LeaveBalance(employee_id=self.me.id, leave_type_id=leave_type.id, year=2026,
                                    entitled=20, carried_over=5, taken=4, pending=3))
        db.session.commit()
        rows = self.rows(self.call("detail", type="leave-balances", employee_id=self.me.id, year=2026))
        self.assertEqual(rows[0]["remaining"], "18")
        self.assertEqual(self.rows(self.call("detail", type="leave-balances", employee_id=self.me.id, year=2025)), [])

    def test_payroll_month_filter_and_totals_use_matching_payslips(self):
        Payslip.query.delete()
        PayrollRun.query.delete()
        first = PayrollRun(period_year=2026, period_month=9, status="paid")
        second = PayrollRun(period_year=2026, period_month=10, status="draft")
        db.session.add_all([first, second]); db.session.flush()
        db.session.add_all([
            Payslip(run_id=first.id, employee_id=self.me.id, gross=1000, net=900),
            Payslip(run_id=second.id, employee_id=self.me.id, gross=2000, net=1700),
            Payslip(run_id=second.id, employee_id=self.other.id, gross=3000, net=2500),
        ]); db.session.commit()
        response = self.call("detail", type="payroll", employee_id=self.me.id,
                             date_from="2026-10-01", date_to="2026-10-31")
        rows = self.rows(response)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["period"], "2026-10")
        self.assertEqual(rows[0]["status"], "draft")
        self.assertIn("2,000.00", response.json["data"]["summary"][1]["value"])

    def test_contract_report_uses_employee_lookup_without_relationship(self):
        db.session.add(Contract(employee_id=self.me.id, type="permanent", status="active", notes="Report contract"))
        db.session.commit()
        rows = self.rows(self.call("detail", type="contracts", employee_id=self.me.id, q="Report contract"))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["employee_name"], self.me.full_name)

    def test_invalid_filters_soft_deleted_and_unknown_employees_are_rejected(self):
        for params in ({"type": "unknown"}, {"type": "staff", "date_from": "bad"},
                       {"type": "staff", "date_from": "2026-10-31", "date_to": "2026-10-01"},
                       {"type": "staff", "employee_id": "1 OR 1=1"},
                       {"type": "staff", "department_id": -1},
                       {"type": "leave-balances", "year": 1800}, {"type": "profile"}):
            with self.subTest(params=params):
                self.assertEqual(self.call("detail", **params).status_code, 422)
        self.assertEqual(self.call("detail", type="staff", department_id=999999).status_code, 404)
        self.assertEqual(self.call("detail", type="profile", employee_id=999999).status_code, 404)
        self.assertEqual(self.call("detail", type="profile", employee_id=self.me.id,
                                   department_id=self.other.department_id).status_code, 422)
        self.other.deleted_at = datetime.utcnow()
        db.session.commit()
        self.assertEqual(self.call("detail", type="profile", employee_id=self.other.id).status_code, 404)

    def test_unauthenticated_json_and_print_endpoints_are_protected(self):
        for endpoint in ("catalog", "detail", "print-report"):
            self.assertEqual(self.call(endpoint, None).status_code, 401)

    def test_print_contains_logo_footer_all_rows_and_escapes_company_name(self):
        Document.query.delete()
        db.session.add_all([
            Document(employee_id=self.me.id, title="Report document %03d" % i, notes="Private notes")
            for i in range(45)
        ]); db.session.commit()
        response = self.call("print-report", type="documents", employee_id=self.me.id)
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn('src="/uploads/branding/report-test-logo.png"', html)
        self.assertIn("Example Hotel &lt;Ltd&gt;", html)
        self.assertNotIn("Example Hotel <Ltd>", html)
        self.assertIn(self.company.address, html)
        self.assertIn(self.company.email, html)
        self.assertIn("CONFIDENTIAL", html)
        self.assertIn("Report document 044", html)
        self.assertIn("table-header-group", html)
        self.assertIn("table-footer-group", html)
        self.assertEqual(response.headers["Cache-Control"], "private, no-store")
        self.assertNotIn("finance-test-admin", html)

    def test_empty_department_report_and_audit_trail(self):
        department = Department(name="Empty report department", code="EMPTY", company_id=self.company.id)
        db.session.add(department); db.session.commit()
        response = self.call("detail", type="staff", department_id=department.id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["data"]["record_count"], 0)
        self.assertEqual(self.rows(response), [])
        self.call("print-report", type="staff", department_id=department.id)
        self.assertIsNotNone(AuditLog.query.filter_by(event="employee_report_viewed", entity_id=department.id).first())
        self.assertIsNotNone(AuditLog.query.filter_by(event="employee_report_printed", entity_id=department.id).first())


if __name__ == "__main__":
    unittest.main()
