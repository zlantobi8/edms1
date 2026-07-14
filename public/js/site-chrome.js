/* global document, window */
(function () {
  const INSTITUTION_NAME = 'Federal Polytechnic Ado-Ekiti'; // change this to your institution's name
  const CURRENT_YEAR = new Date().getFullYear();

  const NAV_LINKS = [
    { href: '/', label: 'Home', key: 'home' },
    { href: '/about.html', label: 'About', key: 'about' },
    { href: '/features.html', label: 'Features', key: 'features' },
    { href: '/contact.html', label: 'Contact', key: 'contact' },
  ];

  function navbarHtml(activeKey) {
    const links = NAV_LINKS.map((l) => `<a href="${l.href}" class="${l.key === activeKey ? 'active' : ''}">${l.label}</a>`).join('');
    return `
      <nav class="site-navbar">
        <div class="navbar-inner">
          <a href="/" class="site-brand">
            <span class="mark"><i class="fa-solid fa-graduation-cap"></i></span>
            <span>EMDMS<small>${INSTITUTION_NAME}</small></span>
          </a>
          <div class="site-nav-links" id="site-nav-links">${links}</div>
          <div class="site-nav-actions">
            <a class="btn btn-outline btn-sm" href="/student/login.html">Student Login</a>
            <a class="btn btn-gold btn-sm" href="/">Portal Directory</a>
            <button class="navbar-toggle" id="navbar-toggle" aria-label="Toggle menu">&#9776;</button>
          </div>
        </div>
      </nav>`;
  }

  function footerHtml() {
    return `
      <footer class="site-footer">
        <div class="footer-inner">
          <div class="footer-grid">
            <div>
              <div class="footer-brand"><span class="mark"><i class="fa-solid fa-graduation-cap"></i></span><b>EMDMS</b></div>
              <p style="color:#9B9BB5;font-size:13px;max-width:280px;">Examination Malpractice Detection &amp; Management System — an offline, LAN-based CBT platform for ${escapeHtml(INSTITUTION_NAME)}.</p>
            </div>
            <div>
              <h4>Site</h4>
              <a href="/">Home</a>
              <a href="/about.html">About</a>
              <a href="/features.html">Features</a>
              <a href="/contact.html">Contact</a>
            </div>
            <div>
              <h4>Portals</h4>
              <a href="/admin/login.html" class="admin-only-link">Administrator</a>
              <a href="/invigilator/login.html">Invigilator</a>
              <a href="/student/login.html">Student</a>
            </div>
            <div>
              <h4>System</h4>
              <a href="/api/health">Server status</a>
              <span style="display:block;color:#9B9BB5;font-size:13.5px;">Runs entirely on your local network</span>
            </div>
          </div>
          <div class="footer-bottom">
            <span>&copy; ${CURRENT_YEAR} ${escapeHtml(INSTITUTION_NAME)}. EMDMS CBT System.</span>
            <span>No internet connection required to run an examination.</span>
          </div>
        </div>
      </footer>`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function isLocalHost() {
    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  }

  function hideAdminLinksIfRemote() {
    if (isLocalHost()) return;
    document.querySelectorAll('.admin-only-link').forEach((el) => el.remove());
  }

  function mount(activeKey) {
    const navHost = document.getElementById('site-navbar-root');
    const footerHost = document.getElementById('site-footer-root');
    if (navHost) navHost.outerHTML = navbarHtml(activeKey);
    if (footerHost) footerHost.outerHTML = footerHtml();

    const toggle = document.getElementById('navbar-toggle');
    const links = document.getElementById('site-nav-links');
    if (toggle && links) {
      toggle.addEventListener('click', () => links.classList.toggle('open'));
    }
    hideAdminLinksIfRemote();
  }

  window.EmdmsSiteChrome = { mount, hideAdminLinksIfRemote, INSTITUTION_NAME };
})();
