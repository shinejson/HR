"""Operations maintenance schedule, validation, and report delivery tests."""
import unittest
from datetime import date, timedelta
from decimal import Decimal

import test_finance_crud as finance
from app import (
    Employee, MaintenanceWork, Notification, NotificationDelivery, Setting, User, db,
)


class MaintenanceApiTest(unittest.TestCase):
    setUp = finance.FinanceCrudTest.setUp
    tearDown = finance.FinanceCrudTest.tearDown
    call = finance.FinanceCrudTest.call

    def payload(self, **overrides):
        tomorrow = date.today() + timedelta(days=1)
        data = {
            "title": "Maintenance API test — pump service",
            "category": "Preventive",
            "location": "Water pump room",
            "scheduled_at": f"{tomorrow.isoformat()}T09:30",
            "worker_id": Employee.query.filter(Employee.deleted_at.is_(None)).first().id,
            "amount": "250.00",
            "description": "Inspect pump and replace the worn seal.",
            "remarks": "Coordinate access with facilities.",
        }
        data.update(overrides)
        return data

    def test_schedule_internal_and_external_workers_and_update_status(self):
        response = self.call("POST", "operations/maintenance", self.payload())
        self.assertEqual(response.status_code, 201, response.json)
        work = response.json["data"]
        self.assertTrue(work["reference_no"].startswith("MW-"))
        self.assertEqual(work["worker_name"], db.session.get(Employee, work["worker_id"]).full_name)
        self.assertEqual(work["amount"], 250.0)
        self.assertEqual(work["status"], "scheduled")

        external = self.call("POST", "operations/maintenance", self.payload(
            title="External contractor test job", worker_id=None,
            worker_name="Kwesi Mechanical Services", amount="75.50",
        ))
        self.assertEqual(external.status_code, 201, external.json)
        self.assertEqual(external.json["data"]["worker_name"], "Kwesi Mechanical Services")
        self.assertIsNone(external.json["data"]["worker_id"])

        work_id = work["id"]
        updated = self.call("PUT", f"operations/maintenance/{work_id}", {"status": "completed"})
        self.assertEqual(updated.status_code, 200, updated.json)
        self.assertEqual(updated.json["data"]["status"], "completed")
        self.assertIsNotNone(updated.json["data"]["completed_at"])

        filtered = self.call("GET", "operations/maintenance?q=pump+service&status=completed")
        self.assertEqual(filtered.status_code, 200, filtered.json)
        self.assertEqual([row["id"] for row in filtered.json["data"]], [work_id])

        invalid_range = self.call("GET", "operations/maintenance?from_date=2026-10-30&to_date=2026-10-01")
        self.assertEqual(invalid_range.status_code, 422)

    def test_validation_prevents_invalid_charges_and_missing_worker(self):
        existing_count = MaintenanceWork.query.count()
        negative = self.call("POST", "operations/maintenance", self.payload(amount="-1"))
        self.assertEqual(negative.status_code, 422)

        no_worker = self.call("POST", "operations/maintenance", self.payload(worker_id=None, worker_name=" "))
        self.assertEqual(no_worker.status_code, 422)

        invalid_employee = self.call("POST", "operations/maintenance", self.payload(worker_id=99999999))
        self.assertEqual(invalid_employee.status_code, 422)

        # Operations routes remain restricted to authorized operations users.
        self.assertEqual(self.call("POST", "operations/maintenance", self.payload(), employee=True).status_code, 403)
        self.assertEqual(MaintenanceWork.query.count(), existing_count)

    def test_send_report_to_managing_director_records_email_and_in_app_notice(self):
        created = self.call("POST", "operations/maintenance", self.payload(
            title="Report-only generator inspection", amount="320.75",
            remarks="Noise check passed; quote required for next service.",
        ))
        self.assertEqual(created.status_code, 201, created.json)
        work = created.json["data"]

        email_enabled = Setting.query.filter_by(key="delivery.email_enabled").first()
        email_mode = Setting.query.filter_by(key="delivery.email_mode").first()
        email_enabled.value = "1"
        email_mode.value = "sandbox"
        db.session.commit()

        response = self.call("POST", "operations/maintenance/report/send", {
            "q": "Report-only generator inspection",
        })
        self.assertEqual(response.status_code, 200, response.json)
        result = response.json["data"]
        self.assertEqual(result["email_status"], "simulated")
        self.assertEqual(result["record_count"], 1)
        self.assertEqual(result["total_amount"], 320.75)
        self.assertTrue(result["recipient_email"])

        delivery = (NotificationDelivery.query
                    .filter_by(event_key="maintenance_report", channel="email",
                               recipient=result["recipient_email"])
                    .order_by(NotificationDelivery.id.desc()).first())
        self.assertIsNotNone(delivery)
        self.assertIn(work["reference_no"], delivery.body)
        self.assertIn("GHS 320.75", delivery.body)
        self.assertIn("Noise check passed", delivery.body)
        self.assertIn("Report-only generator inspection", delivery.html_body)

        md = Employee.query.filter(Employee.email == result["recipient_email"]).first()
        self.assertIsNotNone(md)
        md_user = User.query.filter_by(employee_id=md.id).first()
        if md_user:
            self.assertIsNotNone(Notification.query.filter_by(
                user_id=md_user.id, title="Maintenance report shared",
            ).first())


if __name__ == "__main__":
    unittest.main()
