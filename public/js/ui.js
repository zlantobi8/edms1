/* global window, document */
(function () {
  function ensureStack() {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  function toast(message, type = 'info', duration = 4500) {
    const stack = ensureStack();
    const el = document.createElement('div');
    el.className = `toast${type === 'warn' ? ' warn' : ''}${type === 'danger' ? ' danger' : ''}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function fmtDateTime(value) {
    if (!value) return '-';
    const d = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return value;
    return d.toLocaleString();
  }

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  window.EmdmsUI = { toast, escapeHtml, fmtDateTime, qs, qsa };
})();
