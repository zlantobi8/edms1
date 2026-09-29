/* global EmdmsApi, EmdmsUI, window, document */
(function () {
  const { toast, escapeHtml, fmtDateTime, qs, qsa } = EmdmsUI;
  const content = document.getElementById('content');
  const pageTitle = document.getElementById('page-title');
  const user = JSON.parse(localStorage.getItem('emdms_user') || '{}');

  // Redirect to login if no token.
  if (!EmdmsApi.getToken()) window.location.replace('/admin/login.html');
  document.getElementById('admin-name').textContent = user.full_name || 'Administrator';
  window.addEventListener('emdms:unauthorized', () => window.location.replace('/admin/login.html'));
  async function doLogout() {
    await EmdmsApi.post('/api/auth/logout').catch(() => {});
    EmdmsApi.clearAll();
    window.location.replace('/');
  }
  document.getElementById('logout-btn').addEventListener('click', doLogout);
  document.getElementById('topbar-logout-btn').addEventListener('click', doLogout);

  // ---------------- Cached reference data ----------------
  const cache = { faculties: [], departments: [], sessions: [], semesters: [], classes: [], subjects: [] };

  // Known course codes/titles per department, grouped by level, so admins
  // can pick a course from a dropdown instead of typing it out. Matched
  // against a department's name (case-insensitive "starts with" on its
  // short code, e.g. "CS — Computer Science ..."). Only CS is filled in
  // for now — add more department codes here as their course lists are
  // ready; departments without an entry fall back to manual entry.
  const COURSE_CATALOG = {
    CS: [
      { level: 'ND I', code: 'COM 121', title: 'Programming Using C Language' },
      { level: 'ND I', code: 'COM 123', title: 'Programming Languages Using Java' },
      { level: 'ND I', code: 'COM 124', title: 'Data Structure & Algorithms' },
      { level: 'ND I', code: 'COM 125', title: 'Introduction to System Analysis and Design' },
      { level: 'ND I', code: 'COM 126', title: 'PC Upgrade and Maintenance' },
      { level: 'ND I', code: 'STA 122', title: 'Statistics Theory I' },
      { level: 'ND II', code: 'COM 221', title: 'Basic Computer Networking' },
      { level: 'ND II', code: 'COM 223', title: 'Basic Hardware Maintenance' },
      { level: 'ND II', code: 'COM 224', title: 'Management Information System' },
      { level: 'ND II', code: 'COM 225', title: 'Web Technology' },
      { level: 'ND II', code: 'COM 226', title: 'File Organization & Management' },
      { level: 'ND II', code: 'COM 227', title: 'Data Management I' },
      { level: 'ND II', code: 'MTH 224', title: 'Calculus' },
      { level: 'HND I', code: 'SWD 321', title: 'Python Programming' },
      { level: 'HND I', code: 'AIT 313', title: 'Artificial Intelligence' },
      { level: 'HND I', code: 'SWD 322', title: 'Database Design 2' },
      { level: 'HND I', code: 'CYS 322', title: 'Mobile Wireless Security' },
      { level: 'HND I', code: 'SWD 323', title: 'Frontend Development 1' },
      { level: 'HND I', code: 'SWD 324', title: 'Backend Development 1' },
      { level: 'HND I', code: 'SWD 328', title: 'Rapid Application Development (CMS)' },
      { level: 'HND I', code: 'SWD 326', title: 'Research Methods in SWD' },
      { level: 'HND I', code: 'COM 312', title: 'Database Design' },
      { level: 'HND II', code: 'SWD 421', title: 'Human Computer Interaction' },
      { level: 'HND II', code: 'SWD 422', title: 'Ethical & Professional Practice in SWD' },
      { level: 'HND II', code: 'COM 427', title: 'Computer Hardware System' },
      { level: 'HND II', code: 'SWD 423', title: 'Software Testing & Quality Assurance' },
      { level: 'HND II', code: 'SWD 425', title: 'Security in SWD' },
      { level: 'HND II', code: 'COM 428', title: 'Scientific Programming Language Using Java II' },
      { level: 'HND II', code: 'COM 423', title: 'Expert System & Machine Learning' },
      { level: 'HND II', code: 'COM 422', title: 'Computer Graphic & Animation' },
    ],
    NCC: [
      { level: 'HND I', code: 'NCC 321', title: 'Routing and Switching' },
      { level: 'HND I', code: 'NCC 322', title: 'Cloud Computing 1' },
      { level: 'HND I', code: 'NCC 323', title: 'Advanced Statistics for Computing' },
      { level: 'HND I', code: 'NCC 325', title: 'Advance Wireless Network' },
      { level: 'HND II', code: 'NCC 421', title: 'Cloud Computing II' },
      { level: 'HND II', code: 'NCC 422', title: 'Enterprise Networking, Security & Automation' },
      { level: 'HND II', code: 'NCC 423', title: 'Ethical & Professional Practice' },
      { level: 'HND II', code: 'NCC 424', title: 'Internet of Things (IOT)' },
    ],
  };

  function catalogForDepartment(department) {
    if (!department) return null;
    const name = department.name.toUpperCase();
    const match = name.startsWith('NCC') || name.startsWith('CS-NCC') ? 'NCC' : (name.startsWith('CS-SWD') || name.startsWith('CS —') || name.startsWith('CS-')) ? 'CS' : null;
    return match ? COURSE_CATALOG[match] : null;
  }

  // Faculty/department catalog from the SPAS tentative exam time-table —
  // used to drive the Academic Structure forms as pure select-from-list
  // (faculty -> department -> level/course), no free typing. Add more
  // faculties/departments here the same way as new time-tables come in.
  const FACULTY_CATALOG = ['School of computing and information technology (SCICT)'];
  const DEPARTMENT_CATALOG = {
    'School of computing and information technology (SCICT)': [
      'CS-SWD — Computer Science — Software & Web Development',
      'CS-NCC — Computer Science — Networking & Cloud Computing',
      'FT — Food Technology',
      'GCT — Glass & Ceramics Technology',
      'SA — Statistics',
      'ST — Science Laboratory Technology',
      'HM — Hospitality Management',
    ],
  };
  const LEVEL_CATALOG = ['ND I', 'ND II', 'HND I', 'HND II'];
  const SEMESTER_CATALOG = ['First Semester', 'Second Semester'];
  // A session in this system represents one academic period, so it may have
  // exactly one semester. Never offer/add a second semester to the same session.

  // Session names are academic years (e.g. "2025/2026") — offer a
  // sensible picked-not-typed range around the current year.
  function sessionCatalog() {
    const y = new Date().getFullYear();
    const years = [];
    for (let i = y - 2; i <= y + 2; i += 1) years.push(`${i}/${i + 1}`);
    return years;
  }

  // Builds <option>s from a plain string list, skipping any value already
  // present in `taken` (case-insensitive) so a phase never offers a choice
  // that already exists one level down — keeps every dropdown duplicate-free.
  function catalogOptions(values, taken) {
    const takenLower = new Set((taken || []).map((v) => String(v).toLowerCase()));
    const remaining = values.filter((v) => !takenLower.has(v.toLowerCase()));
    if (!remaining.length) return null;
    return remaining.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  }

  async function loadAcademicCache() {
    const [f, d, s, sem, c, sub] = await Promise.all([
      EmdmsApi.get('/api/academic/faculties'),
      EmdmsApi.get('/api/academic/departments'),
      EmdmsApi.get('/api/academic/sessions'),
      EmdmsApi.get('/api/academic/semesters'),
      EmdmsApi.get('/api/academic/classes'),
      EmdmsApi.get('/api/academic/subjects'),
    ]);
    cache.faculties = f.data; cache.departments = d.data; cache.sessions = s.data;
    cache.semesters = sem.data; cache.classes = c.data; cache.subjects = sub.data;
  }

  function optionsFor(list, valueKey, labelKey, selected) {
    return list.map((item) => `<option value="${item[valueKey]}" ${String(item[valueKey]) === String(selected) ? 'selected' : ''}>${escapeHtml(item[labelKey])}</option>`).join('');
  }

  // Same as optionsFor, but shows a disabled placeholder instead of an
  // empty (blank-looking) <select> when the parent list has nothing in
  // it yet — e.g. "Departments" before any Faculty has been added.
  function optionsForOrPlaceholder(list, valueKey, labelKey, placeholderText) {
    if (!list.length) return `<option value="">${escapeHtml(placeholderText)}</option>`;
    return optionsFor(list, valueKey, labelKey);
  }

  // ---------------- Router ----------------
  const routes = {
    overview: renderOverview,
    academic: renderAcademic,
    students: renderStudents,
    invigilators: renderInvigilators,
    exams: renderExams,
    'exam-detail': renderExamDetail,
    recordings: renderRecordings,
    incidents: renderIncidents,
    results: renderResults,
    backup: renderBackup,
  };

  async function router() {
    const hash = window.location.hash.replace('#', '') || 'overview';
    const [route, param] = hash.split('/');
    qsa('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
    pageTitle.textContent = {
      overview: 'Overview', academic: 'Academic Structure', students: 'Students',
      invigilators: 'Invigilators', exams: 'Examinations', 'exam-detail': 'Examination Detail',
      recordings: 'Surveillance Recordings', incidents: 'Incident Reports', results: 'Results', backup: 'Backup & Restore',
    }[route] || 'Overview';
    content.innerHTML = '<div class="loading">Loading…</div>';
    try {
      await (routes[route] || renderOverview)(param);
    } catch (err) {
      content.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
    }
  }
  window.addEventListener('hashchange', router);

  // ================= OVERVIEW =================
  async function renderOverview() {
    const [students, invigilators, exams, results] = await Promise.all([
      EmdmsApi.get('/api/admin/students'), EmdmsApi.get('/api/admin/invigilators'),
      EmdmsApi.get('/api/exams'), EmdmsApi.get('/api/results'),
    ]);
    const passCount = results.data.filter((r) => r.passed).length;
    content.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="num">${students.data.length}</div><div class="label">Students</div></div>
        <div class="stat-card"><div class="num">${invigilators.data.length}</div><div class="label">Invigilators</div></div>
        <div class="stat-card"><div class="num">${exams.data.length}</div><div class="label">Examinations</div></div>
        <div class="stat-card"><div class="num">${results.data.length}</div><div class="label">Results Recorded</div></div>
        <div class="stat-card"><div class="num">${results.data.length ? Math.round((passCount / results.data.length) * 100) : 0}%</div><div class="label">Pass Rate</div></div>
      </div>
      <div class="section">
        <h3>Recent Examinations</h3>
        <div class="table-wrap"><table><thead><tr><th>Title</th><th>Course</th><th>Level</th><th>Date</th><th>Status</th></tr></thead><tbody>
          ${exams.data.slice(0, 8).map((e) => `<tr><td>${escapeHtml(e.title)}</td><td>${escapeHtml(e.subject_code)}</td><td>${escapeHtml(e.class_name)}</td><td>${e.exam_date}</td>
          <td>${e.is_published ? '<span class="badge badge-green">Published</span>' : '<span class="badge badge-gray">Draft</span>'}</td></tr>`).join('') || '<tr><td colspan="5">No examinations yet.</td></tr>'}
        </tbody></table></div>
      </div>`;
  }

  // ================= ACADEMIC STRUCTURE =================
  // Academic Structure uses one working context. Parent selections are made
  // once at the top (only when there is more than one possible parent), and
  // child forms never repeat the same parent selector.
  const academicContext = { facultyId: '', departmentId: '', sessionId: '' };

  function normalizeLevel(value) {
    const v = String(value || '').trim().toUpperCase();
    return ({ 'ND I': 'ND I', 'ND1': 'ND I', 'ND 1': 'ND I', 'ND II': 'ND II', 'ND2': 'ND II', 'ND 2': 'ND II', 'HND I': 'HND I', 'HND1': 'HND I', 'HND 1': 'HND I', 'HND II': 'HND II', 'HND2': 'HND II', 'HND 2': 'HND II' })[v] || value;
  }

  async function renderAcademic() {
    await loadAcademicCache();

    // Keep only valid context IDs.
    if (academicContext.facultyId && !cache.faculties.some(f => String(f.id) === String(academicContext.facultyId))) academicContext.facultyId = '';
    if (academicContext.departmentId && !cache.departments.some(d => String(d.id) === String(academicContext.departmentId))) academicContext.departmentId = '';
    if (academicContext.sessionId && !cache.sessions.some(s => String(s.id) === String(academicContext.sessionId))) academicContext.sessionId = '';

    // Auto-context is only used when there is exactly one possible parent.
    if (!academicContext.facultyId && cache.faculties.length === 1) academicContext.facultyId = String(cache.faculties[0].id);
    const facultyDepartments = cache.departments.filter(d => String(d.faculty_id) === String(academicContext.facultyId));
    if (academicContext.departmentId && !facultyDepartments.some(d => String(d.id) === String(academicContext.departmentId))) academicContext.departmentId = '';
    if (!academicContext.departmentId && facultyDepartments.length === 1) academicContext.departmentId = String(facultyDepartments[0].id);
    if (!academicContext.sessionId && cache.sessions.length === 1) academicContext.sessionId = String(cache.sessions[0].id);

    const activeFaculty = cache.faculties.find(f => String(f.id) === String(academicContext.facultyId));
    const activeDepartment = cache.departments.find(d => String(d.id) === String(academicContext.departmentId));
    const activeSession = cache.sessions.find(s => String(s.id) === String(academicContext.sessionId));

    const contextSelect = (id, label, list, selected, disabled = false) => {
      if (list.length <= 1) return `<div class="academic-context-item"><span>${escapeHtml(label)}</span><b>${escapeHtml(list[0]?.name || 'Not set')}</b></div>`;
      return `<label class="academic-context-item"><span>${escapeHtml(label)}</span><select id="${id}" ${disabled ? 'disabled' : ''}><option value="">Select ${escapeHtml(label.toLowerCase())}</option>${optionsFor(list, 'id', 'name', selected)}</select></label>`;
    };

    const facultyOptions = FACULTY_CATALOG.filter(v => !cache.faculties.some(f => f.name.toLowerCase() === v.toLowerCase()));
    const departmentCatalog = activeFaculty ? (DEPARTMENT_CATALOG[activeFaculty.name] || []) : [];
    const existingDepartments = new Set(facultyDepartments.map(d => d.name.toLowerCase()));
    const departmentOptions = departmentCatalog.filter(n => !existingDepartments.has(n.toLowerCase()));
    const sessionOptions = sessionCatalog().filter(v => !cache.sessions.some(s => s.name.toLowerCase() === v.toLowerCase()));
    const activeLevels = activeDepartment ? cache.classes.filter(c => String(c.department_id) === String(activeDepartment.id)) : [];
    const activeSessionSemesters = activeSession ? cache.semesters.filter(s => String(s.session_id) === String(activeSession.id)) : [];
    const semesterOptions = activeSessionSemesters.length ? [] : SEMESTER_CATALOG;


    content.innerHTML = `
      <div class="academic-head">
        <div>
          <div class="eyebrow">ACADEMIC SETUP</div>
          <h3>Academic Structure</h3>
          <p>Choose the working context once. Every section below reuses it automatically.</p>
        </div>
        <div class="academic-flow"><span>Faculty</span><i class="fa-solid fa-chevron-right"></i><span>Department</span><i class="fa-solid fa-chevron-right"></i><span>Level</span><i class="fa-solid fa-chevron-right"></i><span>Course</span></div>
      </div>

      <div class="academic-context-bar">
        ${contextSelect('active-faculty', 'Faculty', cache.faculties, academicContext.facultyId)}
        ${contextSelect('active-department', 'Department', facultyDepartments, academicContext.departmentId, !academicContext.facultyId)}
        ${contextSelect('active-session', 'Session', cache.sessions, academicContext.sessionId)}
      </div>

      <div class="academic-grid">
        <section class="academic-card">
          <div class="academic-card-head"><div><span class="step">1</span><div><h3>Faculties</h3><small>Add each faculty once.</small></div></div><span class="count-pill">${cache.faculties.length}</span></div>
          <form id="faculty-form" class="academic-form">
            <select name="name" id="faculty-pick" required><option value="">Select faculty to add</option>${facultyOptions.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}</select>
            <button class="btn btn-primary btn-sm" type="submit" disabled><i class="fa-solid fa-plus"></i> Add</button>
          </form>
          <div class="form-hint">${facultyOptions.length ? 'After adding, it becomes the active faculty automatically.' : 'All configured faculties have already been added.'}</div>
          <div class="academic-list">${cache.faculties.map(f => rowWithDelete(`${escapeHtml(f.name)} ${String(f.id) === String(academicContext.facultyId) ? '<span class="badge badge-green">Active</span>' : ''}`, `faculty:${f.id}`)).join('') || emptyRow()}</div>
        </section>

        <section class="academic-card">
          <div class="academic-card-head"><div><span class="step">2</span><div><h3>Departments</h3><small>Departments belong to the active faculty.</small></div></div><span class="count-pill">${facultyDepartments.length}</span></div>
          <form id="dept-form" class="academic-form">
            <select name="name" id="dept-pick" required ${activeFaculty ? '' : 'disabled'}><option value="">${activeFaculty ? 'Select department to add' : 'Add a faculty first'}</option>${departmentOptions.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')}</select>
            <button class="btn btn-primary btn-sm" type="submit" disabled><i class="fa-solid fa-plus"></i> Add</button>
          </form>
          <div class="form-hint">${activeFaculty ? (departmentOptions.length ? `Active faculty: ${escapeHtml(activeFaculty.name)}.` : 'All configured departments for this faculty have been added.') : 'Add/select a faculty first.'}</div>
          <div class="academic-list">${facultyDepartments.map(d => rowWithDelete(`${escapeHtml(d.name)} ${String(d.id) === String(academicContext.departmentId) ? '<span class="badge badge-green">Active</span>' : ''}`, `dept:${d.id}`)).join('') || emptyRow()}</div>
        </section>

        <section class="academic-card">
          <div class="academic-card-head"><div><span class="step">A</span><div><h3>Sessions</h3><small>Academic years are added once.</small></div></div><span class="count-pill">${cache.sessions.length}</span></div>
          <form id="session-form" class="academic-form">
            <select name="name" id="session-pick" required><option value="">Select session to add</option>${sessionOptions.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}</select>
            <button class="btn btn-primary btn-sm" type="submit" disabled><i class="fa-solid fa-plus"></i> Add</button>
          </form>
          <div class="form-hint">${sessionOptions.length ? 'The new session becomes the active session automatically.' : 'No more sessions in the configured range are available.'}</div>
          <div class="academic-list">${cache.sessions.map(s => rowWithDelete(`${escapeHtml(s.name)} ${String(s.id) === String(academicContext.sessionId) ? '<span class="badge badge-green">Active</span>' : ''}`, `session:${s.id}`)).join('') || emptyRow()}</div>
        </section>

        <section class="academic-card">
          <div class="academic-card-head"><div><span class="step">B</span><div><h3>Semester</h3><small>Each session can have one semester only.</small></div></div><span class="count-pill">${activeSession ? cache.semesters.filter(s => String(s.session_id) === String(activeSession.id)).length : 0}/1</span></div>
          <form id="semester-form" class="academic-form">
            <select name="name" id="semester-pick" required ${activeSession ? '' : 'disabled'}><option value="">${activeSession ? 'Select semester to add' : 'Select a session first'}</option>${semesterOptions.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')}</select>
            <button class="btn btn-primary btn-sm" type="submit" disabled><i class="fa-solid fa-plus"></i> Add</button>
          </form>
          <div class="form-hint">${activeSession ? `Active session: ${escapeHtml(activeSession.name)}. ${semesterOptions.length ? 'Choose the one semester for this session.' : 'A semester is already assigned to this session. A second semester cannot be added.'}` : 'Select or add an academic session first.'}</div>
          <div class="academic-list">${(activeSession ? cache.semesters.filter(s => String(s.session_id) === String(activeSession.id)) : []).map(s => rowWithDelete(`${escapeHtml(s.name)} ${s.is_active ? '<span class="badge badge-green">Active</span>' : ''}`, `semester:${s.id}`)).join('') || emptyRow()}</div>
        </section>

        <section class="academic-card">
          <div class="academic-card-head"><div><span class="step">3</span><div><h3>Levels</h3><small>Levels belong to the active department.</small></div></div><span class="count-pill">${activeLevels.length}</span></div>
          <form id="class-form" class="academic-form">
            <select name="name" id="level-pick" required ${activeDepartment ? '' : 'disabled'}><option value="">${activeDepartment ? 'Select level to add' : 'Select a department first'}</option>${catalogOptions(LEVEL_CATALOG, activeLevels.map(c => normalizeLevel(c.name)) ) || ''}</select>
            <button class="btn btn-primary btn-sm" type="submit" disabled><i class="fa-solid fa-plus"></i> Add</button>
          </form>
          <div class="form-hint">${activeDepartment ? `Active department: ${escapeHtml(activeDepartment.name)}.` : 'Select or add a department first.'}</div>
          <div class="academic-list">${activeLevels.map(c => rowWithDelete(escapeHtml(c.name), `class:${c.id}`)).join('') || emptyRow()}</div>
        </section>

        <section class="academic-card academic-card-wide">
          <div class="academic-card-head"><div><span class="step">4</span><div><h3>Courses</h3><small>Only the active department and selected level are used.</small></div></div><span class="count-pill">${activeDepartment ? cache.subjects.filter(s => String(s.department_id) === String(activeDepartment.id)).length : 0}</span></div>
          <form id="subject-form" class="academic-form academic-course-form">
            <select id="course-level-select" required ${activeLevels.length ? '' : 'disabled'}><option value="">${activeLevels.length ? 'Select level' : 'Add a level first'}</option>${activeLevels.map(c => `<option value="${escapeHtml(normalizeLevel(c.name))}">${escapeHtml(c.name)}</option>`).join('')}</select>
            <select name="course_pick" id="course-pick" required disabled><option value="">Select course</option></select>
            <select name="units" id="course-units" required><option value="">Units</option><option value="1">1 unit</option><option value="2">2 units</option><option value="3">3 units</option><option value="4">4 units</option></select>
            <button class="btn btn-primary btn-sm" type="submit" disabled><i class="fa-solid fa-plus"></i> Add</button>
          </form>
          <div id="course-picker-hint" class="form-hint">${activeDepartment ? 'Choose a level to see its courses.' : 'Select a department first.'}</div>
          <div class="academic-list">${(activeDepartment ? cache.subjects.filter(s => String(s.department_id) === String(activeDepartment.id)) : []).map(s => rowWithDelete(`${escapeHtml(s.code)} — ${escapeHtml(s.title)} <small>${escapeHtml(s.class_name || '')}</small>`, `subject:${s.id}`)).join('') || emptyRow()}</div>
        </section>
      </div>`;

    const $ = id => document.getElementById(id);
    const enableWhenSelected = (formId, selectId) => {
      const form = $(formId), select = $(selectId);
      if (!form || !select) return;
      const button = form.querySelector('button[type="submit"]');
      const update = () => { if (button) button.disabled = !select.value; };
      select.addEventListener('change', update); update();
    };

    // Parent context changes happen only here. No child form repeats these selections.
    const activeFacultySelect = $('active-faculty');
    const activeDepartmentSelect = $('active-department');
    const activeSessionSelect = $('active-session');
    if (activeFacultySelect) activeFacultySelect.addEventListener('change', () => { academicContext.facultyId = activeFacultySelect.value; academicContext.departmentId = ''; renderAcademic(); });
    if (activeDepartmentSelect) activeDepartmentSelect.addEventListener('change', () => { academicContext.departmentId = activeDepartmentSelect.value; renderAcademic(); });
    if (activeSessionSelect) activeSessionSelect.addEventListener('change', () => { academicContext.sessionId = activeSessionSelect.value; renderAcademic(); });

    enableWhenSelected('faculty-form', 'faculty-pick');
    enableWhenSelected('dept-form', 'dept-pick');
    enableWhenSelected('session-form', 'session-pick');
    enableWhenSelected('semester-form', 'semester-pick');
    enableWhenSelected('class-form', 'level-pick');

    const courseLevel = $('course-level-select');
    const coursePick = $('course-pick');
    const courseUnits = $('course-units');
    const courseForm = $('subject-form');
    const courseHint = $('course-picker-hint');
    function refreshCoursePicker() {
      if (!coursePick) return;
      coursePick.innerHTML = '<option value="">Select course</option>';
      coursePick.disabled = true;
      if (!activeDepartment || !courseLevel.value) { courseHint.textContent = activeDepartment ? 'Choose a level to see its courses.' : 'Select a department first.'; return; }
      const catalog = catalogForDepartment(activeDepartment) || [];
      const existing = new Set(cache.subjects.filter(s => String(s.department_id) === String(activeDepartment.id)).map(s => s.code.toLowerCase()));
      const remaining = catalog.filter(c => normalizeLevel(c.level) === normalizeLevel(courseLevel.value) && !existing.has(c.code.toLowerCase()));
      coursePick.innerHTML += remaining.map(c => `<option value="${escapeHtml(c.code)}|${escapeHtml(c.title)}">${escapeHtml(c.code)} — ${escapeHtml(c.title)}</option>`).join('');
      coursePick.disabled = !remaining.length;
      courseHint.textContent = remaining.length ? `Showing ${remaining.length} available course${remaining.length === 1 ? '' : 's'} for ${escapeHtml(activeDepartment.name)}.` : `All ${escapeHtml(courseLevel.value)} courses have already been added.`;
      updateCourseButton();
    }
    function updateCourseButton() {
      const button = courseForm?.querySelector('button[type="submit"]');
      if (button) button.disabled = !(activeDepartment && courseLevel?.value && coursePick?.value && courseUnits?.value);
    }
    courseLevel?.addEventListener('change', refreshCoursePicker);
    coursePick?.addEventListener('change', updateCourseButton);
    courseUnits?.addEventListener('change', updateCourseButton);

    async function submitAcademic(form, endpoint, payload, successText, afterCreate) {
      if (form.dataset.submitting === '1') return;
      const button = form.querySelector('button[type="submit"]');
      form.dataset.submitting = '1';
      if (button) { button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }
      try {
        const res = await EmdmsApi.post(endpoint, payload());
        if (afterCreate) await afterCreate(res);
        toast(successText);
        await renderAcademic();
      } catch (err) {
        toast(err.message || 'Could not save.', 'danger');
        form.dataset.submitting = '0';
        if (button) { button.disabled = false; button.innerHTML = '<i class="fa-solid fa-plus"></i> Add'; }
      }
    }

    $('faculty-form')?.addEventListener('submit', e => { e.preventDefault(); const f = e.currentTarget; submitAcademic(f, '/api/academic/faculties', () => ({ name: $('faculty-pick').value }), 'Faculty added.', async () => { await loadAcademicCache(); const x = cache.faculties.find(v => v.name.toLowerCase() === $('faculty-pick').value.toLowerCase()); if (x) academicContext.facultyId = String(x.id); }); });
    $('dept-form')?.addEventListener('submit', e => { e.preventDefault(); const f = e.currentTarget; submitAcademic(f, '/api/academic/departments', () => ({ faculty_id: academicContext.facultyId, name: $('dept-pick').value }), 'Department added.', async () => { await loadAcademicCache(); const x = cache.departments.find(v => String(v.faculty_id) === String(academicContext.facultyId) && v.name.toLowerCase() === $('dept-pick').value.toLowerCase()); if (x) academicContext.departmentId = String(x.id); }); });
    $('session-form')?.addEventListener('submit', e => { e.preventDefault(); const f = e.currentTarget; submitAcademic(f, '/api/academic/sessions', () => ({ name: $('session-pick').value }), 'Session added.', async () => { await loadAcademicCache(); const x = cache.sessions.find(v => v.name.toLowerCase() === $('session-pick').value.toLowerCase()); if (x) academicContext.sessionId = String(x.id); }); });
    $('semester-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.currentTarget;
      const sessionId = academicContext.sessionId;
      if (!sessionId) return toast('Select a session first.', 'error');
      const alreadyAssigned = cache.semesters.some(v => String(v.session_id) === String(sessionId));
      if (alreadyAssigned) {
        toast('This session already has a semester. A session cannot have two semesters.', 'error');
        return;
      }
      submitAcademic(f, '/api/academic/semesters', () => ({ session_id: sessionId, name: $('semester-pick').value }), 'Semester added.');
    });
    $('class-form')?.addEventListener('submit', e => { e.preventDefault(); const f = e.currentTarget; submitAcademic(f, '/api/academic/classes', () => ({ department_id: academicContext.departmentId, name: $('level-pick').value }), 'Level added.'); });
    $('subject-form')?.addEventListener('submit', e => { e.preventDefault(); const f = e.currentTarget; const parts = String(coursePick.value || '').split('|'); submitAcademic(f, '/api/academic/subjects', () => ({ department_id: academicContext.departmentId, code: parts[0] || '', title: parts.slice(1).join('|') || '', units: courseUnits.value }), 'Course added.'); });

    // Bind this once to the persistent #content element. Rebinding on every
    // render caused stale handlers and made delete feel unreliable.
    if (!content.dataset.academicDeleteBound) {
      content.dataset.academicDeleteBound = '1';
      content.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-delete]');
        if (!btn || btn.dataset.busy === '1') return;
        const [type, id] = btn.dataset.delete.split(':');
        const endpoints = { faculty: 'faculties', dept: 'departments', session: 'sessions', semester: 'semesters', class: 'classes', subject: 'subjects' };
        const labels = { faculty: 'faculty', dept: 'department', session: 'session', semester: 'semester', class: 'level', subject: 'course' };
        if (!endpoints[type] || !id) return;
        const item = type === 'faculty' ? cache.faculties.find(x => String(x.id) === String(id)) : type === 'dept' ? cache.departments.find(x => String(x.id) === String(id)) : type === 'session' ? cache.sessions.find(x => String(x.id) === String(id)) : type === 'semester' ? cache.semesters.find(x => String(x.id) === String(id)) : type === 'class' ? cache.classes.find(x => String(x.id) === String(id)) : cache.subjects.find(x => String(x.id) === String(id));
        const name = item ? (item.name || `${item.code || ''} ${item.title || ''}`).trim() : '';
        if (!confirm(`Delete ${labels[type]}${name ? ` “${name}”` : ''}?\n\nIf other records depend on it, the server will refuse the deletion.`)) return;
        btn.dataset.busy = '1'; btn.disabled = true;
        try {
          await EmdmsApi.del(`/api/academic/${endpoints[type]}/${encodeURIComponent(id)}`);
          if (type === 'faculty' && String(academicContext.facultyId) === String(id)) { academicContext.facultyId = ''; academicContext.departmentId = ''; }
          if (type === 'dept' && String(academicContext.departmentId) === String(id)) academicContext.departmentId = '';
          if (type === 'session' && String(academicContext.sessionId) === String(id)) academicContext.sessionId = '';
          toast(`${labels[type][0].toUpperCase()}${labels[type].slice(1)} deleted.`);
          await renderAcademic();
        } catch (err) {
          toast(err.message || 'Delete failed.', 'danger');
          btn.dataset.busy = '0'; btn.disabled = false;
        }
      });
    }

    refreshCoursePicker();
  }

  function rowWithDelete(label, deleteKey) {
    return `<div class="academic-row"><div class="academic-row-name">${label}</div><button type="button" class="btn btn-outline btn-sm delete-academic" data-delete="${escapeHtml(deleteKey)}"><i class="fa-solid fa-trash-can"></i> Delete</button></div>`;
  }
  function emptyRow() { return '<div class="academic-empty"><i class="fa-regular fa-folder-open"></i><span>Nothing added yet.</span></div>'; }

  // ================= STUDENTS =================
  async function renderStudents() {
    await loadAcademicCache();
    const { data: students } = await EmdmsApi.get('/api/admin/students');
    content.innerHTML = `
      <div class="toolbar"><div class="spacer"></div><button class="btn btn-gold" id="add-student-btn">+ Register Student</button></div>
      <div class="table-wrap"><table><thead><tr><th>Reg. No.</th><th>Name</th><th>Department</th><th>Level</th><th>Status</th><th></th></tr></thead><tbody>
        ${students.map((s) => `<tr>
          <td class="mono">${escapeHtml(s.reg_number)}</td><td>${escapeHtml(s.full_name)}</td>
          <td>${escapeHtml(s.department_name || '-')}</td><td>${escapeHtml(s.class_name || '-')}</td>
          <td>${s.is_locked ? '<span class="badge badge-red">Locked</span>' : '<span class="badge badge-green">Active</span>'}</td>
          <td style="white-space:nowrap;">
            <button class="btn btn-outline btn-sm" data-reset="${s.id}">Reset PW</button>
            <button class="btn btn-outline btn-sm" data-toggle-lock="${s.id}" data-locked="${s.is_locked}">${s.is_locked ? 'Unlock' : 'Lock'}</button>
            <button class="btn btn-danger btn-sm" data-remove-student="${s.id}">Delete</button>
          </td></tr>`).join('') || '<tr><td colspan="6">No students registered yet.</td></tr>'}
      </tbody></table></div>`;

    document.getElementById('add-student-btn').addEventListener('click', () => openStudentModal());
    qsa('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Reset this student\'s password?')) return;
      const res = await EmdmsApi.post(`/api/admin/students/${b.dataset.reset}/reset-password`);
      alert(`New password: ${res.credentials.password}`);
    }));
    qsa('[data-toggle-lock]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.toggleLock;
      const locked = b.dataset.locked === '1' || b.dataset.locked === 'true';
      await EmdmsApi.post(`/api/admin/students/${id}/${locked ? 'unlock' : 'lock'}`);
      toast(locked ? 'Unlocked.' : 'Locked.'); renderStudents();
    }));
    qsa('[data-remove-student]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this student permanently?')) return;
      await EmdmsApi.del(`/api/admin/students/${b.dataset.removeStudent}`);
      toast('Student deleted.'); renderStudents();
    }));
  }

  function openStudentModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3>Register Student</h3>
        <form id="student-form">
          <div class="grid-2">
            <div class="field"><label>Full Name</label><input name="full_name" required/></div>
            <div class="field"><label>Reg. Number (optional — auto-generated if blank)</label><input name="reg_number"/></div>
            <div class="field"><label>Email</label><input name="email" type="email"/></div>
            <div class="field"><label>Phone</label><input name="phone"/></div>
            <div class="field"><label>Department</label><select name="department_id"><option value="">—</option>${optionsFor(cache.departments, 'id', 'name')}</select></div>
            <div class="field"><label>Level</label><select name="class_id"><option value="">—</option>${optionsFor(cache.classes, 'id', 'name')}</select></div>
          </div>
          <div class="field"><label>Passport Photo</label><input name="passport" type="file" accept="image/*"/></div>
          <div id="student-modal-error"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" id="cancel-student">Cancel</button>
            <button class="btn btn-primary">Register</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#cancel-student').addEventListener('click', () => backdrop.remove());
    backdrop.querySelector('#student-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const res = await EmdmsApi.post('/api/admin/students', fd);
        backdrop.remove();
        showCredentials('Student registered', res.credentials, ['reg_number', 'password']);
        renderStudents();
      } catch (err) {
        backdrop.querySelector('#student-modal-error').innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
      }
    });
  }

  function showCredentials(title, credentials, keys) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3>${title}</h3>
        <div class="credential-box">
          ${keys.map((k) => `<div><b>${k.replace('_', ' ')}:</b> <span class="mono">${escapeHtml(credentials[k])}</span></div>`).join('')}
          <p style="margin-top:8px;">Please note these credentials down now — the password will not be shown again.</p>
        </div>
        <div class="modal-actions"><button class="btn btn-primary" id="ok-btn">Done</button></div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#ok-btn').addEventListener('click', () => backdrop.remove());
  }

  // ================= INVIGILATORS =================
  async function renderInvigilators() {
    const { data: invigilators } = await EmdmsApi.get('/api/admin/invigilators');
    content.innerHTML = `
      <div class="toolbar"><div class="spacer"></div><button class="btn btn-gold" id="add-inv-btn">+ Register Invigilator</button></div>
      <div class="table-wrap"><table><thead><tr><th>Staff ID</th><th>Name</th><th>Email</th><th>Phone</th><th></th></tr></thead><tbody>
        ${invigilators.map((i) => `<tr><td class="mono">${escapeHtml(i.staff_id)}</td><td>${escapeHtml(i.full_name)}</td><td>${escapeHtml(i.email || '-')}</td><td>${escapeHtml(i.phone || '-')}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-outline btn-sm" data-reset-inv="${i.id}">Reset PW</button>
          <button class="btn btn-danger btn-sm" data-remove-inv="${i.id}">Delete</button>
        </td></tr>`).join('') || '<tr><td colspan="5">No invigilators registered yet.</td></tr>'}
      </tbody></table></div>`;
    document.getElementById('add-inv-btn').addEventListener('click', openInvigilatorModal);
    qsa('[data-reset-inv]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Reset this invigilator\'s password?')) return;
      const res = await EmdmsApi.post(`/api/admin/invigilators/${b.dataset.resetInv}/reset-password`);
      alert(`New password: ${res.credentials.password}`);
    }));
    qsa('[data-remove-inv]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this invigilator?')) return;
      await EmdmsApi.del(`/api/admin/invigilators/${b.dataset.removeInv}`);
      toast('Deleted.'); renderInvigilators();
    }));
  }

  function openInvigilatorModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3>Register Invigilator</h3>
        <form id="inv-form">
          <div class="field"><label>Full Name</label><input name="full_name" required/></div>
          <div class="field"><label>Staff ID (optional — auto-generated if blank)</label><input name="staff_id"/></div>
          <div class="field"><label>Email</label><input name="email" type="email"/></div>
          <div class="field"><label>Phone</label><input name="phone"/></div>
          <div id="inv-modal-error"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" id="cancel-inv">Cancel</button>
            <button class="btn btn-primary">Register</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#cancel-inv').addEventListener('click', () => backdrop.remove());
    backdrop.querySelector('#inv-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const res = await EmdmsApi.post('/api/admin/invigilators', {
          full_name: fd.get('full_name'), staff_id: fd.get('staff_id'), email: fd.get('email'), phone: fd.get('phone'),
        });
        backdrop.remove();
        showCredentials('Invigilator registered', res.credentials, ['staff_id', 'password']);
        renderInvigilators();
      } catch (err) {
        backdrop.querySelector('#inv-modal-error').innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
      }
    });
  }

  // ================= EXAMS =================
  async function renderExams() {
    await loadAcademicCache();
    const { data: exams } = await EmdmsApi.get('/api/exams');
    content.innerHTML = `
      <div class="toolbar"><div class="spacer"></div><button class="btn btn-gold" id="add-exam-btn">+ Create Examination</button></div>
      <div class="table-wrap"><table><thead><tr><th>Title</th><th>Course</th><th>Level</th><th>Date</th><th>Time</th><th>Status</th><th></th></tr></thead><tbody>
        ${exams.map((e) => `<tr>
          <td><a href="#exam-detail/${e.id}" style="color:var(--biro);font-weight:600;">${escapeHtml(e.title)}</a></td>
          <td>${escapeHtml(e.subject_code)}</td><td>${escapeHtml(e.class_name)}</td><td>${e.exam_date}</td><td>${e.start_time}–${e.end_time}</td>
          <td>${e.is_published ? '<span class="badge badge-green">Published</span>' : '<span class="badge badge-gray">Draft</span>'}</td>
          <td><a class="btn btn-outline btn-sm" href="#exam-detail/${e.id}">Manage</a></td>
        </tr>`).join('') || '<tr><td colspan="7">No examinations created yet.</td></tr>'}
      </tbody></table></div>`;
    document.getElementById('add-exam-btn').addEventListener('click', openExamModal);
  }

  function openExamModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3>Create Examination</h3>
        <form id="exam-form">
          <div class="field"><label>Title</label><input name="title" required/></div>
          <div class="grid-2">
            <div class="field"><label>Course</label><select name="subject_id" required>${optionsFor(cache.subjects, 'id', 'code')}</select></div>
            <div class="field"><label>Level</label><select name="class_id" required>${optionsFor(cache.classes, 'id', 'name')}</select></div>
            <div class="field"><label>Session</label><select name="session_id" required>${optionsFor(cache.sessions, 'id', 'name')}</select></div>
            <div class="field"><label>Semester</label><select name="semester_id" required>${optionsFor(cache.semesters, 'id', 'name')}</select></div>
            <div class="field"><label>Duration (minutes)</label><input name="duration_minutes" type="number" value="60" min="5" required/></div>
            <div class="field"><label>Pass Mark (%)</label><input name="pass_mark" type="number" value="50" min="0" max="100" required/></div>
            <div class="field"><label>Total Marks</label><input name="total_marks" type="number" value="100" min="1" required/></div>
            <div class="field"><label>Exam Date</label><input name="exam_date" type="date" required/></div>
            <div class="field"><label>Start Time</label><input name="start_time" type="time" required/></div>
            <div class="field"><label>End Time</label><input name="end_time" type="time" required/></div>
          </div>
          <div class="field"><label><input type="checkbox" name="randomize_questions" checked style="width:auto;margin-right:6px;"/>Randomize question order</label></div>
          <div class="field"><label><input type="checkbox" name="randomize_options" checked style="width:auto;margin-right:6px;"/>Randomize answer options</label></div>
          <div id="exam-modal-error"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" id="cancel-exam">Cancel</button>
            <button class="btn btn-primary">Create</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#cancel-exam').addEventListener('click', () => backdrop.remove());
    backdrop.querySelector('#exam-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      body.randomize_questions = fd.get('randomize_questions') ? 1 : 0;
      body.randomize_options = fd.get('randomize_options') ? 1 : 0;
      try {
        const res = await EmdmsApi.post('/api/exams', body);
        backdrop.remove();
        window.location.hash = `#exam-detail/${res.data.id}`;
      } catch (err) {
        backdrop.querySelector('#exam-modal-error').innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
      }
    });
  }

  // ================= EXAM DETAIL (questions, invigilators, publish) =================
  async function renderExamDetail(examId) {
    await loadAcademicCache();
    const { data: exam } = await EmdmsApi.get(`/api/exams/${examId}`);
    const { data: invigilators } = await EmdmsApi.get('/api/admin/invigilators');
    const assignedIds = new Set(exam.invigilators.map((i) => i.id));

    content.innerHTML = `
      <div class="toolbar">
        <a href="#exams" class="back-link">&larr; All examinations</a>
        <div class="spacer"></div>
        <a class="btn btn-outline btn-sm" href="#recordings/${examId}">View Recordings</a>
        <a class="btn btn-outline btn-sm" href="#incidents/${examId}">Incident Report</a>
        <button class="btn btn-outline btn-sm" id="exam-report-btn">Result Report (PDF)</button>
        <span class="badge ${exam.is_published ? 'badge-green' : 'badge-gray'}">${exam.is_published ? 'Published' : 'Draft'}</span>
        <button class="btn btn-outline btn-sm" id="toggle-publish">${exam.is_published ? 'Unpublish' : 'Publish'}</button>
      </div>
      <div class="section">
        <h3>${escapeHtml(exam.title)}</h3>
        <p>${escapeHtml(exam.subject_code)} — ${escapeHtml(exam.subject_title)} · ${escapeHtml(exam.class_name)} · ${exam.exam_date}, ${exam.start_time}–${exam.end_time} · ${exam.duration_minutes} mins · Pass mark ${exam.pass_mark}%</p>
      </div>

      <div class="section">
        <div class="toolbar">
          <h3 style="margin:0;">Questions (${exam.questions.length})</h3>
          <div class="spacer"></div>
          <label class="btn btn-outline btn-sm" style="margin:0;">Import CSV<input type="file" id="csv-file" accept=".csv" style="display:none;"/></label>
          <button class="btn btn-gold btn-sm" id="add-question-btn">+ Add Question</button>
        </div>
        <p style="font-size:12px;">CSV columns: question_text, marks, option_a, option_b, option_c, option_d, correct_option (A/B/C/D)</p>
        <div id="questions-list">
          ${exam.questions.map((q, idx) => `
            <div class="section" style="margin-bottom:10px;padding:14px;">
              <div class="toolbar" style="margin-bottom:8px;">
                <b>Q${idx + 1}. ${escapeHtml(q.question_text)}</b>
                <div class="spacer"></div>
                <span class="badge badge-gray">${q.marks} mark(s)</span>
                <button class="btn btn-outline btn-sm" data-edit-q="${q.id}">Edit</button>
                <button class="btn btn-danger btn-sm" data-del-q="${q.id}">Delete</button>
              </div>
              <ul style="margin:0;padding-left:18px;">
                ${q.options.map((o) => `<li style="color:${o.is_correct ? 'var(--green)' : 'var(--ink-soft)'};font-weight:${o.is_correct ? '700' : '400'}">${escapeHtml(o.option_text)}${o.is_correct ? ' — correct' : ''}</li>`).join('')}
              </ul>
            </div>`).join('') || '<p>No questions added yet.</p>'}
        </div>
      </div>

      <div class="section">
        <h3>Assigned Invigilators</h3>
        <div class="toolbar">
          <select id="invigilator-select" style="padding:8px;border:1px solid var(--line);border-radius:6px;">
            ${invigilators.filter((i) => !assignedIds.has(i.id)).map((i) => `<option value="${i.id}">${escapeHtml(i.full_name)} (${i.staff_id})</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" id="assign-inv-btn">Assign</button>
        </div>
        <div class="table-wrap"><table><tbody>
          ${exam.invigilators.map((i) => `<tr><td>${escapeHtml(i.full_name)} <span class="mono" style="color:var(--ink-faint)">(${i.staff_id})</span></td><td style="text-align:right;width:80px;"><button class="btn btn-outline btn-sm" data-unassign="${i.id}">Remove</button></td></tr>`).join('') || '<tr><td>No invigilators assigned yet.</td></tr>'}
        </tbody></table></div>
      </div>`;

    document.getElementById('toggle-publish').addEventListener('click', async () => {
      try {
        await EmdmsApi.post(`/api/exams/${examId}/${exam.is_published ? 'unpublish' : 'publish'}`);
        toast(exam.is_published ? 'Unpublished.' : 'Published.'); renderExamDetail(examId);
      } catch (err) {
        toast(err.message || 'Could not update publish status.', 'danger');
      }
    });
    document.getElementById('exam-report-btn').addEventListener('click', () => {
      window.open(`/api/results/export/pdf?exam_id=${examId}&token=${EmdmsApi.getToken()}`, '_blank');
    });
    document.getElementById('add-question-btn').addEventListener('click', () => openQuestionModal(examId));
    qsa('[data-edit-q]').forEach((b) => b.addEventListener('click', () => {
      const q = exam.questions.find((x) => String(x.id) === b.dataset.editQ);
      openQuestionModal(examId, q);
    }));
    qsa('[data-del-q]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this question?')) return;
      await EmdmsApi.del(`/api/exams/${examId}/questions/${b.dataset.delQ}`);
      renderExamDetail(examId);
    }));
    document.getElementById('csv-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const fd = new FormData(); fd.append('file', file);
      try {
        const res = await EmdmsApi.post(`/api/exams/${examId}/questions/import`, fd);
        toast(res.message); renderExamDetail(examId);
      } catch (err) { toast(err.message, 'danger'); }
    });
    document.getElementById('assign-inv-btn').addEventListener('click', async () => {
      const invigilator_id = document.getElementById('invigilator-select').value;
      if (!invigilator_id) return toast('No invigilator available to assign.', 'warn');
      await EmdmsApi.post('/api/admin/invigilators/assign', { exam_id: examId, invigilator_id });
      renderExamDetail(examId);
    });
    qsa('[data-unassign]').forEach((b) => b.addEventListener('click', async () => {
      await EmdmsApi.post('/api/admin/invigilators/unassign', { exam_id: examId, invigilator_id: b.dataset.unassign });
      renderExamDetail(examId);
    }));
  }

  function openQuestionModal(examId, question) {
    const isEdit = !!question;
    const opts = question ? question.options : [{ option_text: '', is_correct: 1 }, { option_text: '', is_correct: 0 }, { option_text: '', is_correct: 0 }, { option_text: '', is_correct: 0 }];
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3>${isEdit ? 'Edit' : 'Add'} Question</h3>
        <form id="q-form">
          <div class="field"><label>Question Text</label><textarea name="question_text" required>${escapeHtml(question?.question_text || '')}</textarea></div>
          <div class="field"><label>Marks</label><input name="marks" type="number" min="1" value="${question?.marks || 1}" required/></div>
          <div class="field"><label>Options (select the radio button next to the correct answer)</label>
            <div id="options-container">
              ${opts.map((o, i) => `<div class="toolbar" style="margin-bottom:8px;">
                <input type="radio" name="correct" value="${i}" ${o.is_correct ? 'checked' : ''}/>
                <input type="text" class="opt-text" placeholder="Option ${String.fromCharCode(65 + i)}" value="${escapeHtml(o.option_text)}" style="flex:1;padding:8px;border:1px solid var(--line);border-radius:6px;" required/>
              </div>`).join('')}
            </div>
            <button type="button" class="btn btn-outline btn-sm" id="add-option-btn">+ Add Option</button>
          </div>
          <div id="q-modal-error"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" id="cancel-q">Cancel</button>
            <button class="btn btn-primary">${isEdit ? 'Save' : 'Add'}</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#cancel-q').addEventListener('click', () => backdrop.remove());
    backdrop.querySelector('#add-option-btn').addEventListener('click', () => {
      const container = backdrop.querySelector('#options-container');
      const idx = container.children.length;
      const div = document.createElement('div');
      div.className = 'toolbar'; div.style.marginBottom = '8px';
      div.innerHTML = `<input type="radio" name="correct" value="${idx}"/><input type="text" class="opt-text" placeholder="Option ${String.fromCharCode(65 + idx)}" style="flex:1;padding:8px;border:1px solid var(--line);border-radius:6px;" required/>`;
      container.appendChild(div);
    });
    backdrop.querySelector('#q-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const texts = qsa('.opt-text', backdrop).map((i) => i.value.trim());
      const correctIdx = Number(backdrop.querySelector('input[name="correct"]:checked')?.value);
      const options = texts.map((t, i) => ({ option_text: t, is_correct: i === correctIdx ? 1 : 0 }));
      const body = {
        question_text: backdrop.querySelector('[name="question_text"]').value.trim(),
        marks: Number(backdrop.querySelector('[name="marks"]').value),
        options,
      };
      try {
        if (isEdit) await EmdmsApi.put(`/api/exams/${examId}/questions/${question.id}`, body);
        else await EmdmsApi.post(`/api/exams/${examId}/questions`, body);
        backdrop.remove();
        renderExamDetail(examId);
      } catch (err) {
        backdrop.querySelector('#q-modal-error').innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
      }
    });
  }

  // ================= RECORDINGS =================
  async function renderRecordings(param) {
    const { data: exams } = await EmdmsApi.get('/api/exams');
    const { data: storage } = await EmdmsApi.get('/api/recordings/storage/summary');
    const selectedExamId = param || (exams[0] && exams[0].id);

    content.innerHTML = `
      <div class="toolbar">
        <select id="rec-exam-select" style="padding:8px;border:1px solid var(--line);border-radius:6px;">
          ${exams.map((e) => `<option value="${e.id}" ${String(e.id) === String(selectedExamId) ? 'selected' : ''}>${escapeHtml(e.title)} — ${e.exam_date}</option>`).join('') || '<option>No examinations yet</option>'}
        </select>
        <div class="spacer"></div>
        <span style="font-size:12.5px;color:var(--ink-faint);">Total storage used by recordings: <b>${formatBytes(storage.total_bytes)}</b></span>
      </div>
      <p style="font-size:12.5px;">Every student's webcam is recorded automatically at low resolution for later spot-checking — independent of whether an invigilator watched live. Recordings are stored on this server machine only.</p>
      <div id="recordings-list"><div class="loading">Loading…</div></div>`;

    async function loadList(examId) {
      if (!examId) { document.getElementById('recordings-list').innerHTML = '<div class="empty-state">No examinations yet.</div>'; return; }
      const { data: recs } = await EmdmsApi.get(`/api/recordings/exam/${examId}`);
      document.getElementById('recordings-list').innerHTML = `
        <div class="table-wrap"><table><thead><tr><th>Student</th><th>Reg. No.</th><th>Status</th><th>Duration (approx.)</th><th>Size</th><th></th></tr></thead><tbody>
          ${recs.map((r) => `<tr>
            <td>${escapeHtml(r.full_name)}</td><td class="mono">${escapeHtml(r.reg_number)}</td>
            <td>${r.status === 'completed' ? '<span class="badge badge-green">Completed</span>' : '<span class="badge badge-amber">Recording…</span>'}</td>
            <td>~${Math.round((r.chunk_count * 15) / 60)} min</td>
            <td>${formatBytes(r.total_bytes)}</td>
            <td style="white-space:nowrap;">
              <button class="btn btn-outline btn-sm" data-play="${r.id}" data-name="${escapeHtml(r.full_name)}">▶ Play</button>
              <a class="btn btn-outline btn-sm" href="/api/recordings/${r.id}/stream?token=${EmdmsApi.getToken()}" download="${escapeHtml(r.reg_number)}.webm">⬇ Download</a>
              <button class="btn btn-danger btn-sm" data-delete-rec="${r.id}">Delete</button>
            </td></tr>`).join('') || '<tr><td colspan="6">No recordings for this examination yet.</td></tr>'}
        </tbody></table></div>`;

      qsa('[data-play]').forEach((b) => b.addEventListener('click', () => openPlayerModal(b.dataset.play, b.dataset.name)));
      qsa('[data-delete-rec]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Delete this recording permanently? This cannot be undone.')) return;
        await EmdmsApi.del(`/api/recordings/${b.dataset.deleteRec}`);
        toast('Recording deleted.');
        loadList(document.getElementById('rec-exam-select').value);
      }));
    }

    document.getElementById('rec-exam-select').addEventListener('change', (e) => loadList(e.target.value));
    if (selectedExamId) loadList(selectedExamId);
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
  }

  function openPlayerModal(recordingId, studentName) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" style="max-width:640px;">
        <h3>${escapeHtml(studentName)} — Recording</h3>
        <video controls style="width:100%;border-radius:6px;background:#000;" src="/api/recordings/${recordingId}/stream?token=${EmdmsApi.getToken()}"></video>
        <div class="modal-actions"><button class="btn btn-primary" id="close-player">Close</button></div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#close-player').addEventListener('click', () => backdrop.remove());
  }

  // ================= INCIDENT REPORTS =================
  const HIGH_SEVERITY_EVENTS = new Set(['no_face', 'multiple_faces', 'unusual_noise', 'fullscreen_exit', 'identity_mismatch', 'suspicious_object']);

  async function renderIncidents(param) {
    const { data: exams } = await EmdmsApi.get('/api/exams');
    const selectedExamId = param || (exams[0] && exams[0].id);

    content.innerHTML = `
      <div class="toolbar">
        <select id="inc-exam-select" style="padding:8px;border:1px solid var(--line);border-radius:6px;">
          ${exams.map((e) => `<option value="${e.id}" ${String(e.id) === String(selectedExamId) ? 'selected' : ''}>${escapeHtml(e.title)} — ${e.exam_date}</option>`).join('') || '<option>No examinations yet</option>'}
        </select>
        <div class="spacer"></div>
        <button class="btn btn-outline btn-sm" id="inc-export-csv">Export CSV</button>
        <button class="btn btn-outline btn-sm" id="inc-export-pdf">Export / Print PDF</button>
      </div>
      <p style="font-size:12.5px;">Combines behavior-based flags (tab switches, full-screen exits, copy/paste attempts) with AI-based flags (no face, multiple faces, head turned away, unusual noise) into one report per examination.</p>
      <div id="incidents-body"><div class="loading">Loading…</div></div>`;

    async function load(examId) {
      if (!examId) { document.getElementById('incidents-body').innerHTML = '<div class="empty-state">No examinations yet.</div>'; return; }
      const { data } = await EmdmsApi.get(`/api/incidents/exam/${examId}`);
      const { summary, timeline, labels } = data;

      document.getElementById('incidents-body').innerHTML = `
        <div class="section">
          <h3>Summary — Flagged Students</h3>
          <div class="table-wrap"><table><thead><tr><th>Student</th><th>Reg. No.</th><th>Total Events</th><th>Breakdown</th></tr></thead><tbody>
            ${summary.map((s) => `<tr>
              <td>${escapeHtml(s.full_name || '(unknown)')}</td><td class="mono">${escapeHtml(s.reg_number || '-')}</td>
              <td><span class="badge ${s.total_events >= 5 ? 'badge-red' : 'badge-amber'}">${s.total_events}</span></td>
              <td style="font-size:12.5px;">${Object.entries(s.by_type).map(([type, count]) => `<span class="badge ${HIGH_SEVERITY_EVENTS.has(type) ? 'badge-red' : 'badge-gray'}" style="margin:0 4px 4px 0;">${escapeHtml(labels[type] || type)} × ${count}</span>`).join('')}</td>
            </tr>`).join('') || '<tr><td colspan="4">No incidents flagged for this examination.</td></tr>'}
          </tbody></table></div>
        </div>
        <div class="section">
          <h3>Full Timeline</h3>
          <div class="table-wrap"><table><thead><tr><th>Time</th><th>Student</th><th>Event</th><th>Severity</th></tr></thead><tbody>
            ${timeline.map((t) => `<tr>
              <td>${fmtDateTime(t.created_at)}</td><td>${escapeHtml(t.full_name || '(unknown)')}</td>
              <td>${escapeHtml(labels[t.event_type] || t.event_type)}</td>
              <td>${HIGH_SEVERITY_EVENTS.has(t.event_type) ? '<span class="badge badge-red">High</span>' : '<span class="badge badge-gray">Normal</span>'}</td>
            </tr>`).join('') || '<tr><td colspan="4">No events recorded.</td></tr>'}
          </tbody></table></div>
        </div>`;
    }

    document.getElementById('inc-exam-select').addEventListener('change', (e) => load(e.target.value));
    document.getElementById('inc-export-csv').addEventListener('click', () => {
      const examId = document.getElementById('inc-exam-select').value;
      window.open(`/api/incidents/exam/${examId}/export/csv?token=${EmdmsApi.getToken()}`, '_blank');
    });
    document.getElementById('inc-export-pdf').addEventListener('click', () => {
      const examId = document.getElementById('inc-exam-select').value;
      window.open(`/api/incidents/exam/${examId}/export/pdf?token=${EmdmsApi.getToken()}`, '_blank');
    });

    if (selectedExamId) load(selectedExamId);
  }

  // ================= RESULTS =================
  async function renderResults() {
    await loadAcademicCache();
    const { data: exams } = await EmdmsApi.get('/api/exams');
    const { data: results } = await EmdmsApi.get('/api/results');
    content.innerHTML = `
      <div class="toolbar">
        <select id="filter-exam" style="padding:8px;border:1px solid var(--line);border-radius:6px;"><option value="">All Examinations</option>${exams.map((e) => `<option value="${e.id}">${escapeHtml(e.title)}</option>`).join('')}</select>
        <select id="filter-dept" style="padding:8px;border:1px solid var(--line);border-radius:6px;"><option value="">All Departments</option>${optionsFor(cache.departments, 'id', 'name')}</select>
        <select id="filter-class" style="padding:8px;border:1px solid var(--line);border-radius:6px;"><option value="">All Levels</option>${optionsFor(cache.classes, 'id', 'name')}</select>
        <div class="spacer"></div>
        <button class="btn btn-outline btn-sm" id="export-csv">Export CSV</button>
        <button class="btn btn-outline btn-sm" id="export-pdf">Generate Report (PDF)</button>
      </div>
      <div class="stat-grid" id="results-summary"></div>
      <div class="table-wrap"><table><thead><tr><th>Reg. No.</th><th>Name</th><th>Exam</th><th>Score</th><th>%</th><th>Status</th><th>Submitted</th></tr></thead><tbody id="results-body">
        ${resultsRows(results)}
      </tbody></table></div>`;

    document.getElementById('results-summary').innerHTML = resultsSummaryHtml(results);

    async function refresh() {
      const params = await currentParams();
      const { data } = await EmdmsApi.get(`/api/results?${params.toString()}`);
      document.getElementById('results-body').innerHTML = resultsRows(data);
      document.getElementById('results-summary').innerHTML = resultsSummaryHtml(data);
      return params;
    }
    document.getElementById('filter-exam').addEventListener('change', refresh);
    document.getElementById('filter-dept').addEventListener('change', refresh);
    document.getElementById('filter-class').addEventListener('change', refresh);
    document.getElementById('export-csv').addEventListener('click', async () => {
      const params = await currentParams();
      window.open(`/api/results/export/csv?${params.toString()}&token=${EmdmsApi.getToken()}`, '_blank');
    });
    document.getElementById('export-pdf').addEventListener('click', async () => {
      const params = await currentParams();
      window.open(`/api/results/export/pdf?${params.toString()}&token=${EmdmsApi.getToken()}`, '_blank');
    });
    async function currentParams() {
      const exam_id = document.getElementById('filter-exam').value;
      const department_id = document.getElementById('filter-dept').value;
      const class_id = document.getElementById('filter-class').value;
      const params = new URLSearchParams();
      if (exam_id) params.set('exam_id', exam_id);
      if (department_id) params.set('department_id', department_id);
      if (class_id) params.set('class_id', class_id);
      return params;
    }
  }

  // Aggregate stats card shown above the results table — total candidates,
  // average score, pass rate, highest/lowest — recomputed on every filter
  // change so the summary always matches what's on screen (and what the
  // PDF export will contain).
  function resultsSummaryHtml(results) {
    if (!results.length) {
      return '<div class="stat-card"><div class="num">0</div><div class="label">No results for this filter</div></div>';
    }
    const total = results.length;
    const passCount = results.filter((r) => r.passed).length;
    const avg = results.reduce((sum, r) => sum + Number(r.percentage), 0) / total;
    const highest = Math.max(...results.map((r) => Number(r.percentage)));
    const lowest = Math.min(...results.map((r) => Number(r.percentage)));
    return `
      <div class="stat-card"><div class="num">${total}</div><div class="label">Candidates</div></div>
      <div class="stat-card"><div class="num">${avg.toFixed(1)}%</div><div class="label">Average Score</div></div>
      <div class="stat-card"><div class="num">${Math.round((passCount / total) * 100)}%</div><div class="label">Pass Rate (${passCount}/${total})</div></div>
      <div class="stat-card"><div class="num">${highest.toFixed(1)}%</div><div class="label">Highest</div></div>
      <div class="stat-card"><div class="num">${lowest.toFixed(1)}%</div><div class="label">Lowest</div></div>`;
  }

  function resultsRows(results) {
    if (!results.length) return '<tr><td colspan="7">No results recorded yet.</td></tr>';
    return results.map((r) => `<tr>
      <td class="mono">${escapeHtml(r.reg_number)}</td><td>${escapeHtml(r.full_name)}</td><td>${escapeHtml(r.exam_title)}</td>
      <td>${r.score}/${r.total_marks}</td><td>${Number(r.percentage).toFixed(1)}%</td>
      <td>${r.passed ? '<span class="badge badge-green">PASS</span>' : '<span class="badge badge-red">FAIL</span>'}</td>
      <td>${fmtDateTime(r.submitted_at)}</td></tr>`).join('');
  }

  // ================= BACKUP =================
  async function renderBackup() {
    const { data: backups } = await EmdmsApi.get('/api/backup');
    content.innerHTML = `
      <div class="section">
        <h3>Create Backup</h3>
        <p>Creates a full snapshot of the current database (students, exams, questions, results, logs).</p>
        <button class="btn btn-primary" id="backup-now">Backup Now</button>
      </div>
      <div class="section">
        <h3>Restore from Backup</h3>
        <p><strong>Warning:</strong> restoring will replace all current data with the contents of the selected backup file, and the server will need to be restarted afterwards.</p>
        <form id="restore-form" class="toolbar">
          <input type="file" name="file" accept=".db" required/>
          <button class="btn btn-danger btn-sm">Restore</button>
        </form>
      </div>
      <div class="section">
        <h3>Existing Backups</h3>
        <div class="table-wrap"><table><thead><tr><th>File</th><th>Size</th><th>Created</th><th></th></tr></thead><tbody>
          ${backups.map((b) => `<tr><td class="mono">${escapeHtml(b.name)}</td><td>${(b.size / 1024).toFixed(1)} KB</td><td>${fmtDateTime(b.created_at)}</td>
          <td><a class="btn btn-outline btn-sm" href="/api/backup/${encodeURIComponent(b.name)}/download?token=${EmdmsApi.getToken()}">Download</a></td></tr>`).join('') || '<tr><td colspan="4">No backups yet.</td></tr>'}
        </tbody></table></div>
      </div>`;
    document.getElementById('backup-now').addEventListener('click', async () => {
      const res = await EmdmsApi.post('/api/backup');
      toast(res.message); renderBackup();
    });
    document.getElementById('restore-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!confirm('This will overwrite all current data. Continue?')) return;
      const fd = new FormData(e.target);
      const res = await EmdmsApi.post('/api/backup/restore', fd);
      alert(res.message);
    });
  }

  router();
})();
