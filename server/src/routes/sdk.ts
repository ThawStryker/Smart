import { Hono } from "hono";

export const sdkRoutes = new Hono()
  .get("/.smart/sdk.js", (c) => {
    return c.body(
      `(function() {
  'use strict';
  const origin = window.location.origin;

  function getProjectId() {
    var m = window.location.pathname.match(/\\/project\\/(\\d+)/);
    if (m) return m[1];
    return window.SMART_PROJECT_ID || null;
  }

  async function apiRequest(method, path, body) {
    var pid = getProjectId();
    var url = origin + path + (path.indexOf('?') > -1 ? '&' : '?') + 'projectId=' + pid;
    var opts = { method: method, credentials: 'include', headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    var res = await fetch(url, opts);
    return res.json();
  }

  window.Smart = {
    data: {
      get: function(key) {
        return apiRequest('GET', '/.smart/data/' + encodeURIComponent(key)).then(function(r) { return r.value; });
      },
      set: function(key, value) {
        return apiRequest('PUT', '/.smart/data/' + encodeURIComponent(key), { value: value, projectId: parseInt(getProjectId()) });
      },
      delete: function(key) {
        return apiRequest('DELETE', '/.smart/data/' + encodeURIComponent(key));
      }
    },
    auth: {
      user: function() {
        return apiRequest('GET', '/.smart/auth/user').then(function(r) { return r.user; });
      }
    }
  };
})();`,
      200,
      { "Content-Type": "application/javascript" }
    );
  });
