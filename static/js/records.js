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
    documents: ['Document', [ref('employee_id', 'Employee (blank for company)', 'employees', false), text('title', 'Title', true), select('category', 'Category', ['contract', 'id', 'certificate', 'policy', 'medical', 'employment_letter', 'other']), text('file_name', 'File name'), date('expires_at', 'Expires'), area('notes', 'Notes')]],
    policies: ['Policy', [text('title', 'Title', true), text('category', 'Category'), { ...text('version', 'Version', true), value: '1.0' }, area('content', 'Content'), date('published_at', 'Published'), { name: 'requires_ack', label: 'Requires acknowledgement', type: 'checkbox', value: true }]],
  };

  function canWrite(resource, row) {
    if (Store.isReadOnly()) return false;
    if (Store.canManage()) return true;
    if (['job-postings', 'candidates', 'applications', 'interviews'].includes(resource)) return Store.isRole('recruiter');
    if (['goals', 'appraisals'].includes(resource) && Store.isRole('manager')) return true;
    return resource === 'goals' && Store.isRole('employee') && (!row || row.employee_id === Store.user.employee_id);
  }

  function buttons(resource, row, opts = {}) {
    const attrs = ' data-record-resource="' + resource + '" data-record-id="' + row.id + '"';
    const isRight = opts.align === 'right' || opts.right !== false;
    let html = '<div class="row record-actions" style="gap:5px;align-items:center;' + (isRight ? 'justify-content:flex-end;' : '') + 'flex-wrap:nowrap">';

    if (resource === 'documents' && row.category === 'employment_letter' && row.employee_id) {
      html += '<button type="button" class="btn btn-sm btn-teal" data-doc-open-letter="' + row.employee_id + '" title="View and print official appointment letter">' + icon('printer', 13) + ' <span>Letter</span></button>';
    }

    html += '<button type="button" class="btn btn-sm btn-ghost" data-record-action="view"' + attrs + ' title="View details">' + icon('eye', 13) + ' <span>View</span></button>';

    if (canWrite(resource, row)) {
      html += '<button type="button" class="btn btn-sm btn-soft" data-record-action="edit"' + attrs + ' title="Edit record">' + icon('edit', 13) + ' <span>Edit</span></button>';
      html += '<button type="button" class="btn btn-sm btn-soft btn-record-delete" data-record-action="delete"' + attrs + ' title="Delete record" style="color:var(--red,#dc2626)">' + icon('trash', 13) + '</button>';
    }

    html += '</div>';
    return html;
  }

  function column(resource, opts = {}) {
    return {
      label: opts.label || 'Actions',
      class: (opts.align === 'right' || opts.right !== false) ? 'right' : (opts.class || ''),
      sortable: false,
      render: row => buttons(resource, row, { right: true, ...opts })
    };
  }

  function openDocumentDetailsModal(record, root) {
    const isExpired = record.expires_at && record.expires_at < todayISO();
    const isLetter = record.category === 'employment_letter' && record.employee_id;
    const body = ''
      + '<div style="margin-bottom:16px;display:flex;align-items:center;gap:14px;padding:14px 18px;background:var(--paper-2,#f8fafc);border-radius:10px;border:1px solid var(--line,#e2e8f0)">'
      + '  <div style="width:42px;height:42px;border-radius:10px;background:var(--card,#fff);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-sm);color:var(--teal,#0f766e)">'
      +      icon('file', 24)
      + '  </div>'
      + '  <div style="flex:1;min-width:0">'
      + '    <h3 style="margin:0 0 5px 0;font-size:16.5px;font-weight:600;color:var(--text,#0f172a)">' + esc(record.title) + '</h3>'
      + '    <div class="row" style="gap:8px;align-items:center">'
      + '      <span class="pill-tag">' + esc((record.category || 'document').replace(/_/g, ' ')) + '</span>'
      + (record.employee_name ? '      <span class="small muted">Employee: <b>' + esc(record.employee_name) + '</b></span>' : '<span class="small muted">Scope: <b>Company-wide</b></span>')
      + '    </div>'
      + '  </div>'
      + '</div>'
      + '<div class="grid grid-2" style="gap:12px;margin-bottom:16px">'
      + '  <div class="card card-pad" style="background:var(--card,#fff);border:1px solid var(--line,#e2e8f0);padding:12px 14px">'
      + '    <div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">File / Reference</div>'
      + '    <div style="font-family:var(--mono,monospace);font-size:12.5px;word-break:break-all">' + esc(record.file_name || 'No file attached') + '</div>'
      + '  </div>'
      + '  <div class="card card-pad" style="background:var(--card,#fff);border:1px solid var(--line,#e2e8f0);padding:12px 14px">'
      + '    <div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Expiry Date</div>'
      + '    <div>' + (record.expires_at ? fmtDate(record.expires_at) + (isExpired ? ' <span class="chip chip-red" style="margin-left:6px">Expired</span>' : ' <span class="chip chip-green" style="margin-left:6px">Active</span>') : '<span class="muted">No expiration</span>') + '</div>'
      + '  </div>'
      + '  <div class="card card-pad" style="background:var(--card,#fff);border:1px solid var(--line,#e2e8f0);padding:12px 14px">'
      + '    <div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Date Uploaded</div>'
      + '    <div>' + (record.created_at ? fmtDateTime(record.created_at) : '—') + '</div>'
      + '  </div>'
      + '  <div class="card card-pad" style="background:var(--card,#fff);border:1px solid var(--line,#e2e8f0);padding:12px 14px">'
      + '    <div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Target Employee</div>'
      + '    <div>' + (record.employee_name ? esc(record.employee_name) : 'Company-wide record') + '</div>'
      + '  </div>'
      + '</div>'
      + (record.notes ? '<div style="margin-top:10px;padding:12px 14px;background:var(--paper-2,#f8fafc);border-radius:8px;border:1px solid var(--line,#e2e8f0)"><div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Notes & Description</div><div style="white-space:pre-wrap;font-size:13px;line-height:1.6">' + esc(record.notes) + '</div></div>' : '');

    let footer = '<button class="btn btn-ghost" data-close-modal>Close</button>';
    if (isLetter) {
      footer += '<button class="btn btn-teal" id="modal-view-letter">' + icon('printer', 14) + ' View & Print Letter</button>';
    }
    if (canWrite('documents', record)) {
      footer += '<button class="btn btn-accent" id="modal-edit-doc">' + icon('edit', 14) + ' Edit Document</button>';
    }

    openModal({
      title: "Document Details",
      wide: true,
      body: body,
      footer: footer,
      onMount(card) {
        if (isLetter) {
          const lBtn = card.querySelector('#modal-view-letter');
          if (lBtn) lBtn.onclick = () => {
            closeModal();
            openEmploymentLetterModal(record.employee_id, () => {
              if (typeof Views.documents === 'function') Views.documents(root);
            });
          };
        }
        if (canWrite('documents', record)) {
          const eBtn = card.querySelector('#modal-edit-doc');
          if (eBtn) eBtn.onclick = async () => {
            closeModal();
            await form('documents', record);
          };
        }
      }
    });
  }

  function openRecordDetailsModal(resource, record, root) {
    const spec = specs[resource];
    const fields = spec[1];
    const gridItems = fields.map(f => {
      let val = record[f.name];
      if (val === null || val === undefined || val === '') val = '—';
      else if (f.type === 'date') val = fmtDate(val);
      else if (f.type === 'datetime-local') val = fmtDateTime(val);
      return '<div class="card card-pad" style="background:var(--card,#fff);border:1px solid var(--line,#e2e8f0);padding:12px 14px">'
        + '  <div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">' + esc(f.label) + '</div>'
        + '  <div style="font-size:13px;white-space:pre-wrap;word-break:break-word">' + esc(val) + '</div>'
        + '</div>';
    }).join('');

    let footer = '<button class="btn btn-ghost" data-close-modal>Close</button>';
    if (canWrite(resource, record)) {
      footer += '<button class="btn btn-accent" id="modal-edit-rec">' + icon('edit', 14) + ' Edit ' + esc(spec[0]) + '</button>';
    }

    openModal({
      title: spec[0] + ' Details',
      wide: true,
      body: '<div class="grid grid-2" style="gap:12px">' + gridItems + '</div>',
      footer: footer,
      onMount(card) {
        if (canWrite(resource, record)) {
          const eBtn = card.querySelector('#modal-edit-rec');
          if (eBtn) eBtn.onclick = async () => {
            closeModal();
            await form(resource, record);
          };
        }
      }
    });
  }

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
    formModal({
      title: (record.id ? 'Edit ' : 'New ') + specs[resource][0].toLowerCase(),
      fields,
      wide: true,
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
    
    // Dropdown toggle handler (support for dropdown menus if rendered)
    if (root._dropdownHandler) root.removeEventListener('click', root._dropdownHandler);
    root._dropdownHandler = (event) => {
      const toggle = event.target.closest('[data-dropdown-toggle]');
      if (toggle) {
        event.stopPropagation();
        const dropdownId = toggle.dataset.dropdownToggle;
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) {
          const isOpen = dropdown.style.display !== 'none';
          document.querySelectorAll('.dropdown-menu').forEach(d => d.style.display = 'none');
          if (!isOpen) {
            dropdown.style.display = 'block';
            const rect = toggle.getBoundingClientRect();
            if (rect.left < 260) {
              dropdown.style.left = '0';
              dropdown.style.right = 'auto';
            } else {
              dropdown.style.right = '0';
              dropdown.style.left = 'auto';
            }
          }
        }
      } else {
        const dropdownItem = event.target.closest('.dropdown-item');
        if (!dropdownItem) {
          document.querySelectorAll('.dropdown-menu').forEach(d => d.style.display = 'none');
        }
      }
    };
    root.addEventListener('click', root._dropdownHandler);
    
    if (!document._globalDropdownHandler) {
      document._globalDropdownHandler = (event) => {
        if (!event.target.closest('.dropdown-container')) {
          document.querySelectorAll('.dropdown-menu').forEach(d => d.style.display = 'none');
        }
      };
      document.addEventListener('click', document._globalDropdownHandler);
    }
    
    if (root._recordHandler) root.removeEventListener('click', root._recordHandler);
    root._recordHandler = async event => {
      const button = event.target.closest('[data-record-action]');
      if (!button || !root.contains(button)) return;
      const { recordResource: resource, recordId: id, recordAction: action } = button.dataset;
      
      const dropdown = button.closest('.dropdown-menu');
      if (dropdown) dropdown.style.display = 'none';
      
      button.disabled = true;
      try {
        if (action === 'delete') {
          confirmDialog(
            'Delete ' + specs[resource][0],
            'Are you sure you want to permanently delete this ' + specs[resource][0].toLowerCase() + '? This action cannot be undone.',
            async () => {
              await API.del('/' + resource + '/' + id);
              toast(specs[resource][0] + ' deleted successfully', 'success');
              if (window.location.hash.includes('documents') && typeof Views.documents === 'function') {
                Views.documents(root);
              } else {
                navigate();
              }
            },
            { danger: true, confirmLabel: 'Delete ' + specs[resource][0] }
          );
        } else {
          const record = (await API.get('/' + resource + '/' + id)).data;
          if (action === 'edit') {
            await form(resource, record);
          } else {
            if (resource === 'documents') {
              openDocumentDetailsModal(record, root);
            } else {
              openRecordDetailsModal(resource, record, root);
            }
          }
        }
      } catch (error) { handleErr(error); }
      finally { button.disabled = false; }
    };
    root.addEventListener('click', root._recordHandler);
  }

  return { column, buttons, mount, form, canWrite };
})();
