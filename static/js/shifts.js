Views['shift-planner'] = async function(root) {
  let dept = '', data, from = '', to = '';
  const option = (value, label, selected) => `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;
  async function load() {
    try {
      data = (await API.get('/shift-planner', {department_id: dept, from_date: from, to_date: to})).data;
      render();
    } catch(e) { handleErr(e); }
  }
  function render() {
    const manager = !!dept;
    root.innerHTML = pageHead('Shift schedules', manager ? 'Plan shifts for your department and add observation notes.' : 'View and print your personal shift sheet.') + `
      <div class="card" style="padding:20px;margin-bottom:16px">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end">
          <label>Schedule<br><select id="shift-dept" class="select">${option('', 'My schedule', !dept)}${data.departments.map(d => option(d.id, d.name + ' · Manage', String(d.id) === dept)).join('')}</select></label>
          <label>From<br><input class="input" type="date" id="shift-from" value="${esc(from)}"></label>
          <label>To<br><input class="input" type="date" id="shift-to" value="${esc(to)}"></label>
          <button class="btn btn-primary" id="shift-filter">Apply dates</button><button class="btn" id="shift-print">Print schedule</button>
        </div>
      </div>
      ${manager ? `<div class="card" style="padding:20px;margin-bottom:16px"><h3>Shift configuration</h3><p>Select the shifts your department uses. Times may cross midnight; existing assignments keep their original times.</p>
        <form id="shift-config"><div id="shift-definitions">${data.shifts.map(s => definition(s)).join('')}</div><div style="display:flex;gap:8px;margin-top:12px"><button type="button" class="btn" id="shift-add">Add shift</button><button class="btn btn-primary">Save configuration</button></div></form></div>
        <div class="card" style="padding:20px;margin-bottom:16px"><h3>Assign a shift</h3><p>Saving an employee and date again replaces their existing assignment. Save the configuration first.</p>
        <form id="shift-assign" style="display:flex;gap:12px;flex-wrap:wrap;align-items:end">
          <label>Employee<br><select class="select" name="employee_id" required><option value="">Choose employee</option>${data.employees.map(e => option(e.id,e.name)).join('')}</select></label>
          <label>Date<br><input class="input" type="date" name="work_date" required></label>
          <label>Shift<br><select class="select" name="shift_id" required><option value="">Choose shift</option>${data.shifts.filter(s => s.enabled && s.id).map(s => option(s.id, `${s.name} (${s.start_time}–${s.end_time})`)).join('')}</select></label>
          <label>Observation / time note<br><input class="input" name="note" maxlength="2000" placeholder="e.g. Observe at 09:30"></label><button class="btn btn-primary">Save assignment</button>
        </form></div>` : ''}
      <div class="card" style="padding:20px;overflow:auto"><h3>${manager ? 'Department schedule' : 'My shift sheet'}</h3>
      <table class="table" style="width:100%"><thead><tr><th>Date</th>${manager ? '<th>Employee</th>' : ''}<th>Shift</th><th>Time</th><th>Observation / time note</th>${manager ? '<th></th>' : ''}</tr></thead><tbody>
      ${data.assignments.map(a => `<tr><td>${esc(a.work_date)}</td>${manager ? `<td>${esc(a.employee_name)}</td>` : ''}<td>${esc(a.shift_name)}</td><td>${esc(a.start_time)}–${esc(a.end_time)}</td><td>${esc(a.note)}</td>${manager ? `<td><button class="btn shift-remove" data-id="${a.id}">Remove</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="6">No shifts found for this period.</td></tr>`}</tbody></table></div>`;
    root.querySelector('#shift-dept').onchange = e => { dept = e.target.value; load(); };
    root.querySelector('#shift-filter').onclick = () => { from = root.querySelector('#shift-from').value; to = root.querySelector('#shift-to').value; load(); };
    root.querySelector('#shift-print').onclick = () => {
      const w = window.open('', '_blank'); if (!w) { toast('Please allow pop-ups to print', 'error'); return; }
      const title = manager ? (data.departments.find(d => String(d.id) === dept) || {}).name + ' shift schedule' : 'My shift sheet';
      w.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>body{font:14px sans-serif;padding:30px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#eee}</style></head><body><h1>${esc(title)}</h1><p>${esc(from || 'All dates')} – ${esc(to || 'All dates')}</p><table><thead><tr><th>Date</th>${manager ? '<th>Employee</th>' : ''}<th>Shift</th><th>Time</th><th>Observation / time note</th></tr></thead><tbody>${data.assignments.map(a => `<tr><td>${esc(a.work_date)}</td>${manager ? `<td>${esc(a.employee_name)}</td>` : ''}<td>${esc(a.shift_name)}</td><td>${esc(a.start_time)}–${esc(a.end_time)}</td><td>${esc(a.note)}</td></tr>`).join('')}</tbody></table></body></html>`); w.document.close(); w.focus(); w.print();
    };
    if (!manager) return;
    root.querySelector('#shift-add').onclick = () => root.querySelector('#shift-definitions').insertAdjacentHTML('beforeend', definition({name:'', start_time:'09:00', end_time:'17:00', enabled:true}));
    root.querySelector('#shift-definitions').onclick = e => { if (e.target.matches('.shift-def-remove')) e.target.closest('.shift-definition').remove(); };
    root.querySelector('#shift-config').onsubmit = async e => {
      e.preventDefault();
      const shifts = [...root.querySelectorAll('.shift-definition')].map(r => ({name:r.querySelector('[name=name]').value, start_time:r.querySelector('[name=start]').value, end_time:r.querySelector('[name=end]').value, enabled:r.querySelector('[name=enabled]').checked}));
      try { await API.put(`/shift-planner/${dept}/shifts`, {shifts}); toast('Shift configuration saved'); await load(); } catch(err) { handleErr(err); }
    };
    root.querySelector('#shift-assign').onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target);
      try { await API.post(`/shift-planner/${dept}/assignments`, {employee_id:Number(f.get('employee_id')), shift_id:Number(f.get('shift_id')), work_date:f.get('work_date'), note:f.get('note')}); toast('Shift saved'); await load(); } catch(err) { handleErr(err); }
    };
    root.querySelectorAll('.shift-remove').forEach(b => b.onclick = async () => { if (!confirm('Remove this shift assignment?')) return; try { await API.del(`/shift-planner/${dept}/assignments/${b.dataset.id}`); await load(); } catch(err) { handleErr(err); } });
  }
  function definition(s) { return `<div class="shift-definition" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:10px 0"><label><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''}> Use</label><label>Name<br><input class="input" name="name" maxlength="80" required value="${esc(s.name)}"></label><label>Start<br><input class="input" type="time" name="start" required value="${esc(s.start_time)}"></label><label>End<br><input class="input" type="time" name="end" required value="${esc(s.end_time)}"></label><button class="btn shift-def-remove" type="button">Remove</button></div>`; }
  root.innerHTML = pageHead('Shift schedules', 'Loading…');
  await load();
};
