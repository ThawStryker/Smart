import { Hono } from "hono";
import { db, storage } from "edgespark";
import { eq } from "drizzle-orm";
import { projects, buckets } from "@defs";

export const sdkRoutes = new Hono()
  .get("/api/public/smart/icon/:projectId.png", async (c) => {
    const projectId = parseInt(c.req.param("projectId")!, 10);
    const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!p?.iconPath) return c.notFound();
    const obj = await storage.from(buckets.sourceBuckets).get(p.iconPath);
    if (!obj) return c.notFound();
    return new Response(obj.body, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
    });
  })
  .get("/api/public/smart/sdk.js", (c) => {
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
        return apiRequest('GET', '/api/public/smart/data/' + encodeURIComponent(key)).then(function(r) { return r.value; });
      },
      set: function(key, value) {
        return apiRequest('PUT', '/api/public/smart/data/' + encodeURIComponent(key), { value: value, projectId: parseInt(getProjectId()) });
      },
      delete: function(key) {
        return apiRequest('DELETE', '/api/public/smart/data/' + encodeURIComponent(key));
      }
    },
    auth: {
      user: function() {
        return apiRequest('GET', '/api/public/smart/auth/user').then(function(r) { return r.user; });
      },
      signUp: function(email, password, name) {
        var pid = getProjectId();
        return fetch(origin + '/api/public/smart/auth/sign-up', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password, name: name || email.split('@')[0], projectId: parseInt(pid) })
        }).then(function(r) { return r.json(); });
      },
      signIn: function(email, password) {
        var pid = getProjectId();
        return fetch(origin + '/api/public/smart/auth/sign-in', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password, projectId: parseInt(pid) })
        }).then(function(r) { return r.json(); });
      },
      signOut: function() {
        var pid = getProjectId();
        return fetch(origin + '/api/public/smart/auth/sign-out', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: parseInt(pid) })
        }).then(function(r) { return r.json(); });
      }
    }
  };
})();`,
      200,
      { "Content-Type": "application/javascript" }
    );
  });
