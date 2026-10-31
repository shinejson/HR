/* Shared, role-aware record actions for talent and HR lifecycle pages. */
const Records = (() => {
  const text = (name, label, required = false) => ({ name, label, required });
  const area = (name, label) => ({ name, label, type: 'textarea', full: true });
  const date = (name, label) => ({ name, label, type: 'date' });
  const number = (name, label, min, max, value) => ({ name, label, type: 'number', min, max, value });
  const select = (name, label, options) => ({ name, label, type: 'select', options, value: options[0] });
  const ref = (name, label, resource, required = true) => ({ name, label, type: 'select', resource, required });
  const employee = () => ref('employee_id', 'Employee', 'employees');
  const status = values => select('status', 'Status', values.split(' '));
  const specs = {
    goals: ['Goal', [employee(), text('title', 'Goal', true), area('description', 'Description'), number('weight', 'Weight (%)', 1, 100, 25), number('progress', 'Progress (%)', 0, 100, 0), date('due_date', 'Due date'), status('active completed on_hold cancelled')]],
    'appraisal-cycles': ['Appraisal cycle', [text('name', 'Name', true), date('start_date', 'Opens'), date('end_date', 'Closes'), status('open closed draft')]],
    appraisals: ['Appraisal', [employee(), ref('cycle_id', 'Cycle', 'appraisal-cycles'), ref('reviewer_id', 'Reviewer', 'employees', false), ...['self', 'manager', 'final'].map(x => ({ ...number(x + '_score', x + ' score (1–5)', 1, 5), step: '0.1' })), area('self_comments', 'Employee comments'), area('manager_comments', 'Manager comments'), status('draft self_review in_review completed')]],
    'job-postings': ['Job posting', [text('title', 'Title', true), ref('department_id', 'Department', 'departments', false), text('location', 'Location'), select('employment_type', 'Employment type', ['permanent', 'fixed_term', 'casual', 'intern']), number('vacancies', 'Vacancies', 1, 10000, 1), area('description', 'Description'), area('requirements', 'Requirements'), date('posted_at', 'Posted'), date('closes_at', 'Closes'), status('open closed draft')]],
    candidates: ['Candidate', [text('first_name', 'First name', true), text('last_name', 'Last name', true), { ...text('email', 'Email'), type: 'email' }, text('phone', 'Phone'), text('source', 'Source'), area('skills', 'Skills'), area('notes', 'Notes')]],
    applications: ['Application', [ref('job_posting_id', 'Job posting', 'job-postings'), ref('candidate_id', 'Candidate', 'candidates'), select('stage', 'Stage', ['applied', 'screening', 'interview', 'assessment', 'offer', 'hired', 'rejected']), number('score', 'Score', 0, 100), area('cover_letter', 'Cover letter')]],
    interviews: ['Interview', [ref('application_id', 'Application', 'applications'), { name: 'scheduled_at', label: 'Scheduled', type: 'datetime-local', required: true }, select('interview_type', 'Type', ['panel', 'technical', 'hr', 'final']), text('location', 'Location / link'), text('panel', 'Panel members'), area('feedback', 'Feedback'), number('score', 'Score', 0, 100), status('scheduled completed cancelled')]],
    'onboarding-tasks': ['Onboarding task', [employee(), text('title', 'Task', true), text('owner_role', 'Owner role'), date('due_date', 'Due'), status('pending in_progress completed'), area('notes', 'Notes')]],
    offboardings: ['Offboarding case', [employee(), text('reason', 'Reason'), date('last_day', 'Last day'), number('notice_period_days', 'Notice days', 0, 365, 30), status('pending in_progress completed'), area('exit_interview', 'Exit interview')]],
    documents: ['Document', [ref('employee_id', 'Employee (blank for company)', 'employees', false), text('title', 'Title', true), select('category', 'Category', ['contract', 'id', 'certificate', 'policy', 'medical', 'other']), text('file_name', 'File name'), date('expires_at', 'Expires'), area('notes', 'Notes')]],
    policies: ['Policy', [text('title', 'Title', true), text('category', 'Category'), { ...text('version', 'Version', true), value: '1.0' }, area('content', 'Content'), date('published_at', 'Published'), { name: 'requires_ack', label: 'Requires acknowledgement', type: 'checkbox', value: true }]],
  };
  function canWrite(resource, row) {
    if (Store.isReadOnly()) return false;
    if (Store.canManage()) return true;
    if (['job-postings', 'candidates', 'applications', 'interviews'].includes(resource)) return Store.isRole('recruiter');
    if (['goals', 'appraisals'].includes(resource) && Store.isRole('manager')) return true;
    return resource === 'goals' && Store.isRole('employee') && (!row || row.employee_id === Store.user.employee_id);
  }
  function buttons(resource, row) {
    const attrs = ' data-record-resource="' + resource + '" data-record-id="' + row.id + '"';
    return '<button class="btn btn-sm btn-ghost" data-record-action="view"' + attrs + ' title="View">' + icon('eye', 14) + '</button> '
      + (canWrite(resource, row) ? '<button class="btn btn-sm btn-soft" data-record-action="edit"' + attrs + ' title="Edit">' + icon('edit', 14) + '</button> <button class="btn btn-sm btn-danger" data-record-action="delete"' + attrs + ' title="Delete">' + icon('trash', 14) + '</button>' : '');
  }
  function column(resource) { return { label: 'Record actions', sortable: false, render: row => buttons(resource, row) }; }
  async function form(resource, record = {}) {
    const fields = await Promise.all(specs[resource][1].map(async definition => {
      const f = { ...definition };
      if (f.resource) {
        const rows = (await API.get('/' + f.resource, { per_page: 500 })).data;
        f.options = [{ value: '', label: 'Select…' }, ...rows.map(r => ({ value: r.id, label: r.candidate_name ? r.candidate_name + ' — ' + (r.job_title || '') + ' (#' + r.id + ')' : (r.full_name || r.name || r.title || ('#' + r.id)) }))];
      }
      f.value = record[f.name] ?? f.value;
      if (f.name === 'scheduled_at' && f.value) f.value = f.value.slice(0, 16);
      if (resource === 'goals' && f.name === 'employee_id' && Store.isRole('employee')) {
        f.options = [{ value: Store.user.employee_id, label: 'Me' }];
        f.value = Store.user.employee_id;
      }
      return f;
    }));
    formModal({ title: (record.id ? 'Edit ' : 'New ') + specs[resource][0].toLowerCase(), fields, wide: true,
      onSubmit: async data => {
        if (record.id) await API.put('/' + resource + '/' + record.id, data);
        else await API.post('/' + resource, data);
        navigate();
      },
    });
  }
  function mount(root, resources) {
    const allowed = resources.filter(r => canWrite(r));
    if (allowed.length) {
      const anchor = root.querySelector('.page-head') || root;
      anchor.insertAdjacentHTML(anchor === root ? 'afterbegin' : 'afterend', '<div class="card card-pad row wrap" style="gap:10px;margin-bottom:16px"><label for="record-kind">Create record</label><select class="select" id="record-kind" style="width:auto;min-width:180px">' + allowed.map(r => '<option value="' + r + '">' + specs[r][0] + '</option>').join('') + '</select><button class="btn btn-accent" id="record-new">New record</button></div>');
      root.querySelector('#record-new').onclick = () => form(root.querySelector('#record-kind').value).catch(handleErr);
    }
    if (root._recordHandler) root.removeEventListener('click', root._recordHandler);
    root._recordHandler = async event => {
      const button = event.target.closest('[data-record-action]');
      if (!button || !root.contains(button)) return;
      const { recordResource: resource, recordId: id, recordAction: action } = button.dataset;
      button.disabled = true;
      try {
        if (action === 'delete') {
          if (!confirm('Delete this ' + specs[resource][0].toLowerCase() + '? This cannot be undone.')) return;
          await API.del('/' + resource + '/' + id);
          toast('Record deleted', 'success');
          navigate();
        } else {
          const record = (await API.get('/' + resource + '/' + id)).data;
          if (action === 'edit') await form(resource, record);
          else openModal({ title: specs[resource][0], wide: true, body: '<dl>' + specs[resource][1].map(f => '<dt><b>' + esc(f.label) + '</b></dt><dd style="white-space:pre-wrap;margin:4px 0 16px">' + esc(record[f.name] ?? '—') + '</dd>').join('') + '</dl>' });
        }
      } catch (error) { handleErr(error); }
      finally { button.disabled = false; }
    };
    root.addEventListener('click', root._recordHandler);
  }
  return { column, buttons, mount, form, canWrite };
})();
