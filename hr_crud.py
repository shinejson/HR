"""Validation and referential-integrity rules for talent/lifecycle CRUD."""
from decimal import Decimal
from flask import request
from models import (db, Employee, Department, Goal, Appraisal, AppraisalCycle,
                    JobPosting, Candidate, Application, Interview, OnboardingTask,
                    Offboarding, Document, Policy, PolicyAck)

REQUIRED = {
    Goal: ('title', 'employee_id'), AppraisalCycle: ('name',),
    Appraisal: ('employee_id', 'cycle_id'), JobPosting: ('title',),
    Candidate: ('first_name', 'last_name'), Application: ('job_posting_id', 'candidate_id'),
    Interview: ('application_id',), OnboardingTask: ('employee_id', 'title'),
    Offboarding: ('employee_id',), Document: ('title',), Policy: ('title',),
}
ENUMS = {
    Goal: {'status': ('active', 'completed', 'on_hold', 'cancelled')},
    AppraisalCycle: {'status': ('open', 'closed', 'draft')},
    Appraisal: {'status': ('draft', 'self_review', 'in_review', 'completed', 'submitted')},
    JobPosting: {'status': ('open', 'closed', 'draft')},
    Application: {'stage': ('applied', 'screening', 'interview', 'assessment', 'offer', 'hired', 'rejected')},
    Interview: {'status': ('scheduled', 'completed', 'cancelled')},
    OnboardingTask: {'status': ('pending', 'in_progress', 'completed')},
    Offboarding: {'status': ('pending', 'in_progress', 'completed')},
}
RANGES = {
    Goal: {'progress': (0, 100), 'weight': (1, 100)},
    Appraisal: {key: (1, 5) for key in ('self_score', 'manager_score', 'final_score')},
    Application: {'score': (0, 100)}, Interview: {'score': (0, 100)},
    JobPosting: {'vacancies': (1, 10000)}, Offboarding: {'notice_period_days': (0, 365)},
}


def validate(model, fields, obj=None):
    if model not in REQUIRED:
        return
    value = lambda key: fields.get(key, getattr(obj, key, None))
    if model is Goal and request.user.role.slug == 'employee':
        fields['employee_id'] = request.user.employee_id
    if model is Document:
        fields.pop('uploaded_by', None)
        if obj is None:
            fields['uploaded_by'] = request.user.id
    if model in (Goal, Appraisal) and request.user.role.slug == "manager":
        team = {request.user.employee_id} | {e.id for e in Employee.query.filter_by(manager_id=request.user.employee_id)}
        if value("employee_id") not in team or (obj and obj.employee_id not in team):
            raise ValueError("You can only manage performance records for your team")
    for key in REQUIRED[model]:
        if value(key) is None or not str(value(key)).strip():
            raise ValueError(f'{key.replace("_", " ").capitalize()} is required')
    for key, options in ENUMS.get(model, {}).items():
        if key in fields and fields[key] not in options:
            raise ValueError(f'Invalid {key}')
    for key, (low, high) in RANGES.get(model, {}).items():
        number = value(key)
        if number is not None:
            number = Decimal(str(number))
            if not number.is_finite() or not low <= number <= high:
                raise ValueError(f'{key.replace("_", " ")} must be between {low} and {high}')
    references = {'employee_id': Employee, 'reviewer_id': Employee, 'department_id': Department,
                  'cycle_id': AppraisalCycle, 'job_posting_id': JobPosting,
                  'candidate_id': Candidate, 'application_id': Application}
    for key, target in references.items():
        if key in model.__table__.columns and value(key) is not None:
            record = db.session.get(target, value(key))
            if not record or getattr(record, 'deleted_at', None):
                raise ValueError(f'Select a valid {key[:-3].replace("_", " ")}')
    for start, end in (('start_date', 'end_date'), ('posted_at', 'closes_at')):
        if start in model.__table__.columns and value(start) and value(end) and value(end) < value(start):
            raise ValueError('End date cannot be before start date')
    if model is Candidate and value('email') and '@' not in value('email'):
        raise ValueError('Enter a valid email address')
    if model is Application:
        duplicate = Application.query.filter_by(job_posting_id=value('job_posting_id'), candidate_id=value('candidate_id'))
        if obj:
            duplicate = duplicate.filter(Application.id != obj.id)
        if duplicate.first():
            raise ValueError('This candidate already has an application for this job')


def deletion_conflict(model, obj):
    if model in (Goal, Appraisal) and request.user.role.slug == "manager":
        team = {request.user.employee_id} | {e.id for e in Employee.query.filter_by(manager_id=request.user.employee_id)}
        if obj.employee_id not in team:
            return "You can only manage performance records for your team"
    dependencies = {
        JobPosting: (Application, 'job_posting_id'), Candidate: (Application, 'candidate_id'),
        Application: (Interview, 'application_id'), AppraisalCycle: (Appraisal, 'cycle_id'),
    }
    if model in dependencies:
        child, key = dependencies[model]
        if child.query.filter_by(**{key: obj.id}).first():
            return 'This record has linked records. Delete or reassign those records first.'
    if model is Policy:
        PolicyAck.query.filter_by(policy_id=obj.id).delete(synchronize_session=False)
    return None
