/* global EmdmsApi, EmdmsUI, window, document */
(function () {
  const { escapeHtml, fmtDateTime, qsa } = EmdmsUI;
  const content = document.getElementById('content');
  const pageTitle = document.getElementById('page-title');
  const user = JSON.parse(localStorage.getItem('emdms_user') || '{}');

  if (!EmdmsApi.getToken()) window.location.replace('/student/login.html');
  const displayName = user.full_name || 'Student';
  document.getElementById('student-name').textContent = displayName;
  document.getElementById('student-reg').textContent = user.reg_number || '';
  document.getElementById('topbar-name').textContent = displayName;
  document.getElementById('topbar-role').textContent = user.reg_number || 'Student';
  document.getElementById('topbar-avatar').src = `https://ui-avatars.com/api/?background=6C5DD3&color=fff&bold=true&name=${encodeURIComponent(displayName)}`;
  window.addEventListener('emdms:unauthorized', () => window.location.replace('/student/login.html'));
  async function doLogout() {
    await EmdmsApi.post('/api/auth/logout').catch(() => {});
    EmdmsApi.clearAll();
    window.location.replace('/');
  }
  document.getElementById('logout-btn').addEventListener('click', doLogout);
  document.getElementById('topbar-logout-btn').addEventListener('click', doLogout);

  const routes = { profile: renderProfile, exams: renderExams, results: renderResults };
  const ICONS = ['mock-icon', 'mock-icon alt', 'mock-icon warn', 'mock-icon slate'];
  const IFACES = ['fa-solid fa-scale-balanced', 'fa-solid fa-gavel', 'fa-solid fa-book-open', 'fa-solid fa-building-columns', 'fa-solid fa-file-signature', 'fa-solid fa-landmark'];

  async function router() {
    const route = window.location.hash.replace('#', '') || 'profile';
    qsa('nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
    pageTitle.textContent = { profile: 'My Profile', exams: 'Available Exams', results: 'My Results' }[route];
    content.innerHTML = '<div class="loading">Loading…</div>';
    try { await (routes[route] || renderProfile)(); } catch (err) {
      content.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
    }
  }
  window.addEventListener('hashchange', router);

  async function renderProfile() {
    const { data: s } = await EmdmsApi.get('/api/student/profile');
    const initials = (s.full_name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    content.innerHTML = `
      <div class="profile-hero">
        ${s.passport_path
          ? `<img src="${s.passport_path}" alt="${escapeHtml(s.full_name)}"/>`
          : `<div class="avatar-fallback">${escapeHtml(initials)}</div>`}
        <div>
          <h3>${escapeHtml(s.full_name)}</h3>
          <p><i class="fa-solid fa-id-card" style="margin-right:6px;"></i>${escapeHtml(s.reg_number)}</p>
        </div>
      </div>
      <div class="profile-detail-grid">
        <div class="detail-card"><div class="dlabel"><i class="fa-regular fa-envelope"></i> Email</div><div class="dvalue">${escapeHtml(s.email || '—')}</div></div>
        <div class="detail-card"><div class="dlabel"><i class="fa-solid fa-phone"></i> Phone</div><div class="dvalue">${escapeHtml(s.phone || '—')}</div></div>
        <div class="detail-card"><div class="dlabel"><i class="fa-regular fa-calendar"></i> Registered</div><div class="dvalue">${fmtDateTime(s.created_at)}</div></div>
      </div>`;
  }

  async function renderExams() {
    const { data: exams } = await EmdmsApi.get('/api/student/exams');
    if (!exams.length) {
      content.innerHTML = `<div class="empty-state"><i class="fa-regular fa-folder-open"></i>No examinations are currently available for your class.</div>`;
      return;
    }
    content.innerHTML = `
      <div class="section-title"><h3>Mock Tests</h3></div>
      <div class="mock-grid">
        ${exams.map((e, i) => {
          const cfg = {
            not_started: { pct: 0, badgeCls: 'badge-gray', badgeText: 'Not started', btn: 'btn-gold', btnText: 'Take Test', link: true },
            in_progress: { pct: 55, badgeCls: 'badge-amber', badgeText: 'In progress', btn: 'btn-gold', btnText: 'Resume', link: true },
            submitted: { pct: 100, badgeCls: 'badge-green', badgeText: 'Completed', btn: 'btn-outline', btnText: 'Completed', link: false },
            auto_submitted: { pct: 100, badgeCls: 'badge-green', badgeText: 'Completed', btn: 'btn-outline', btnText: 'Completed', link: false },
            force_submitted: { pct: 100, badgeCls: 'badge-red', badgeText: 'Force-submitted', btn: 'btn-outline', btnText: 'Completed', link: false },
          }[e.submission_status] || { pct: 0, badgeCls: 'badge-gray', badgeText: '—', btn: 'btn-outline', btnText: 'Unavailable', link: false };
          const iconCls = ICONS[i % ICONS.length];
          const iface = IFACES[i % IFACES.length];
          return `
          <div class="mock-card">
            <div class="mock-card-top">
              <div class="${iconCls}"><i class="${iface}"></i></div>
              <div style="text-align:right;">
                <div class="mock-progress-label">${cfg.pct}% Completed</div>
                <div class="mock-progress-bar"><span style="width:${cfg.pct}%;"></span></div>
              </div>
            </div>
            <div>
              <h4>${escapeHtml(e.title)}</h4>
              <div class="mock-meta"><i class="fa-regular fa-clock" style="margin-right:5px;"></i>${e.duration_minutes} mins &middot; ${e.exam_date}</div>
            </div>
            <span class="badge ${cfg.badgeCls}" style="align-self:flex-start;">${cfg.badgeText}</span>
            ${cfg.link
              ? `<a class="btn ${cfg.btn} btn-sm" href="/student/exam.html?exam=${e.id}">${cfg.btnText}</a>`
              : `<button class="btn ${cfg.btn} btn-sm" disabled>${cfg.btnText}</button>`}
          </div>`;
        }).join('')}
      </div>`;
  }

  async function renderResults() {
    const { data: results } = await EmdmsApi.get('/api/student/results');
    if (!results.length) {
      content.innerHTML = `<div class="empty-state"><i class="fa-regular fa-chart-bar"></i>No results yet.</div>`;
      return;
    }
    content.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Exam</th><th>Score</th><th>Percentage</th><th>Status</th><th>Date</th></tr></thead><tbody>
      ${results.map((r) => `<tr><td>${escapeHtml(r.exam_title)}</td><td>${r.score}/${r.total_marks}</td><td>${Number(r.percentage).toFixed(1)}%</td>
        <td>${r.passed ? '<span class="badge badge-green">PASS</span>' : '<span class="badge badge-red">FAIL</span>'}</td><td>${fmtDateTime(r.graded_at)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  router();
})();
