/* global window */
(function () {
  const TOKEN_KEY = 'emdms_token';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  async function request(method, url, body, options = {}) {
    const headers = { ...(options.headers || {}) };
    let payload = body;
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, { method, headers, body: payload, credentials: 'include' });
    let data;
    try { data = await res.json(); } catch (e) { data = { success: res.ok }; }

    if (res.status === 401) {
      clearToken();
      if (!options.silent401) {
        window.dispatchEvent(new CustomEvent('emdms:unauthorized'));
      }
    }
    if (!res.ok) {
      const err = new Error(data.message || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  window.EmdmsApi = {
    get: (url) => request('GET', url),
    post: (url, body, options) => request('POST', url, body, options),
    put: (url, body) => request('PUT', url, body),
    del: (url) => request('DELETE', url),
    getToken, setToken, clearToken,
  };
})();
