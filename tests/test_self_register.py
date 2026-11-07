"""Self-registration API tests (in-memory database).

Run with:  python -m unittest tests.test_self_register -q
"""
import unittest
from unittest.mock import patch

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash

original_init = SQLAlchemy.init_app


def memory_init(self, application):
    application.config["SQLALCHEMY_DATABASE_URI"] = "sqlite://"
    return original_init(self, application)


with patch.object(SQLAlchemy, "init_app", memory_init):
    from app import app, db, User, Employee, Role


class SelfRegisterTest(unittest.TestCase):
    def setUp(self):
        self.ctx = app.app_context()
        self.ctx.push()
        self.client = app.test_client()

    def tearDown(self):
        db.session.remove()
        self.ctx.pop()

    def post_register(self, payload):
        return self.client.post("/api/v1/auth/register", json=payload)

    def test_register_creates_employee_user_with_generated_password(self):
        role = Role.query.filter_by(slug="employee").first()
        self.assertIsNotNone(role, "employee role must be seeded")

        res = self.post_register({
            "first_name": "Kwame",
            "last_name": "Osei",
            "email": "kwame.osei.selfreg@example.com",
        })
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        data = res.get_json()["data"]
        self.assertTrue(data.get("registered"), "account should be registered")
        self.assertEqual(data.get("email"), "kwame.osei.selfreg@example.com")
        self.assertTrue("temporary password" in data.get("message", "").lower())

        user = User.query.filter_by(email="kwame.osei.selfreg@example.com").first()
        self.assertIsNotNone(user)
        self.assertEqual(user.role_id, role.id)
        self.assertEqual(user.employee_id, user.employee.id)
        self.assertEqual(user.employee.first_name, "Kwame")
        self.assertEqual(user.employee.last_name, "Osei")
        self.assertTrue(user.employee.employee_no, "employee number should be auto-generated")
        self.assertEqual(user.employee.status, "active")
        self.assertTrue(user.must_change_password, "must_change_password must be true for generated password")
        self.assertTrue(user.password_hash and len(user.password_hash) > 20)

    def test_register_rejects_incomplete_required_fields(self):
        res = self.post_register({"first_name": "Kwame"})
        self.assertEqual(res.status_code, 422)

        res = self.post_register({
            "first_name": "Kwame", "last_name": "Osei",
            "email": "invalid-email-address",
        })
        self.assertEqual(res.status_code, 422)

        res = self.post_register({
            "first_name": "Kwame", "last_name": "Osei",
            "email": "valid.selfreg@example.com",
        })
        self.assertEqual(res.status_code, 200)

    def test_register_rejects_duplicate_email(self):
        self.post_register({
            "first_name": "Kwame", "last_name": "Osei",
            "email": "dup.selfreg@example.com",
        })
        res = self.post_register({
            "first_name": "Kwame", "last_name": "Osei",
            "email": "dup.selfreg@example.com",
        })
        self.assertEqual(res.status_code, 409)

    def test_registered_employee_uses_login_route_not_register(self):
        self.post_register({
            "first_name": "Ama", "last_name": "Mensah",
            "email": "ama.mensah.selfreg@example.com",
        })
        res = self.post_register({
            "first_name": "Ama", "last_name": "Mensah",
            "email": "AMA.MENSAH.SELFREG@EXAMPLE.COM",
        })
        self.assertEqual(res.status_code, 409)


if __name__ == "__main__":
    unittest.main()
