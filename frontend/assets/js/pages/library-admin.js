/**
 * Workout Library Admin
 * Lists every public library workout (incl. hidden) and lets the admin hide /
 * publish it or edit its page text. Backed by /api/v3/library admin endpoints.
 */
(function () {
  'use strict';

  const API = '/api/v3/library';
  let workouts = [];

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function waitForUser() {
    return new Promise((resolve) => {
      function check() {
        if (!window.authService) return setTimeout(check, 200);
        if (window.authService.currentUser) return resolve(window.authService.currentUser);
        window.addEventListener('authStateChanged', (e) => {
          if (e.detail && e.detail.user) resolve(e.detail.user);
        });
        setTimeout(() => resolve(window.authService.currentUser || null), 4000);
      }
      check();
    });
  }

  async function api(path, options = {}) {
    const user = window.authService && window.authService.currentUser;
    const headers = { 'Content-Type': 'application/json' };
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
    const res = await fetch(`${API}${path}`, { ...options, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.detail || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  function showMessage(text) {
    const el = document.getElementById('adminMessage');
    el.textContent = text;
    el.classList.toggle('d-none', !text);
  }

  function renderItem(w) {
    const seo = w.seo || {};
    const hidden = w.status !== 'published';
    return `
      <div class="card mb-3" data-id="${escapeHtml(w.id)}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <h6 class="mb-1">${escapeHtml(w.title)}
                <span class="badge ${hidden ? 'bg-secondary' : 'bg-success'} ms-1">${hidden ? 'Hidden' : 'Published'}</span>
              </h6>
              <small class="text-muted">
                ${escapeHtml(w.type)} · ${w.minutes} min · ${escapeHtml(w.category)} · ${escapeHtml(w.source || '')} ·
                served ${w.times_served} · completed ${w.times_completed} ·
                <a href="${escapeHtml(w.url)}" target="_blank" rel="noopener">${escapeHtml(w.url)}</a>
              </small>
            </div>
            <button type="button" class="btn btn-sm ${hidden ? 'btn-success' : 'btn-outline-secondary'} js-toggle">
              ${hidden ? 'Publish' : 'Hide'}
            </button>
          </div>
          <details class="mt-2">
            <summary class="text-muted small" style="cursor: pointer;">Edit page text</summary>
            <div class="mt-2">
              <label class="form-label small">Title</label>
              <input class="form-control form-control-sm js-title" maxlength="80" value="${escapeHtml(seo.title || w.title)}" />
              <label class="form-label small mt-2">Search description</label>
              <textarea class="form-control form-control-sm js-summary" rows="2" maxlength="300">${escapeHtml(seo.summary || '')}</textarea>
              <label class="form-label small mt-2">Intro (blank line between paragraphs)</label>
              <textarea class="form-control form-control-sm js-intro" rows="5">${escapeHtml((seo.intro || []).join('\n\n'))}</textarea>
              <button type="button" class="btn btn-primary btn-sm mt-2 js-save">Save text</button>
              <span class="small text-muted ms-2 js-saved"></span>
            </div>
          </details>
        </div>
      </div>`;
  }

  function render() {
    const type = document.getElementById('typeFilter').value;
    const list = workouts.filter((w) => type === 'all' || w.type === type);
    document.getElementById('libraryCount').textContent = `${list.length} workout${list.length === 1 ? '' : 's'}`;
    const container = document.getElementById('libraryList');
    container.innerHTML = list.length
      ? list.map(renderItem).join('')
      : '<p class="text-muted text-center py-5">No library workouts yet. Generate a Tabata or Spin workout and it will appear here.</p>';
  }

  async function update(id, fields) {
    const updated = await api(`/workouts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    });
    workouts = workouts.map((w) => (w.id === id ? { ...w, ...updated } : w));
  }

  async function onListClick(e) {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    const w = workouts.find((x) => x.id === id);
    try {
      if (e.target.closest('.js-toggle')) {
        await update(id, { status: w.status === 'published' ? 'hidden' : 'published' });
        render();
      } else if (e.target.closest('.js-save')) {
        const intro = card.querySelector('.js-intro').value
          .split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
        await update(id, {
          title: card.querySelector('.js-title').value.trim(),
          summary: card.querySelector('.js-summary').value.trim(),
          intro,
        });
        card.querySelector('.js-saved').textContent = 'Saved';
      }
    } catch (err) {
      showMessage(`Save failed: ${err.message}`);
    }
  }

  // ── Fill library (background generation on the server) ──

  let seedPoll = null;

  function renderSeed(job) {
    const wrap = document.getElementById('seedProgress');
    const btn = document.getElementById('seedBtn');
    if (!job || !job.total) return;
    wrap.classList.remove('d-none');
    const pct = Math.round((job.done / job.total) * 100);
    document.getElementById('seedBar').style.width = `${pct}%`;
    const ok = job.done - job.failed;
    let text = job.running
      ? `Generating ${job.tabata} Tabata + ${job.spin} spin… ${job.done}/${job.total} done`
      : `Finished: ${ok} of ${job.total} published`;
    if (job.failed) text += ` · ${job.failed} failed`;
    if (job.published && job.published.length && job.running) {
      text += ` · latest: ${job.published[job.published.length - 1].title}`;
    }
    if (!job.running && job.errors && job.errors.length) text += ` · last error: ${job.errors[job.errors.length - 1]}`;
    document.getElementById('seedStatus').textContent = text;
    btn.disabled = !!job.running;
  }

  async function pollSeed() {
    try {
      const job = await api('/admin/seed');
      renderSeed(job);
      if (job.running) {
        seedPoll = setTimeout(pollSeed, 3000);
      } else if (job.total) {
        workouts = (await api('/admin/all')).workouts;
        render();
      }
    } catch (err) {
      showMessage(`Couldn't read fill progress: ${err.message}`);
    }
  }

  async function startSeed() {
    showMessage('');
    try {
      renderSeed(await api('/admin/seed', { method: 'POST', body: JSON.stringify({}) }));
      clearTimeout(seedPoll);
      seedPoll = setTimeout(pollSeed, 3000);
    } catch (err) {
      showMessage(`Couldn't start: ${err.message}`);
    }
  }

  async function init() {
    document.getElementById('typeFilter').addEventListener('change', render);
    document.getElementById('libraryList').addEventListener('click', onListClick);
    const user = await waitForUser();
    if (!user) {
      showMessage('Sign in with the admin account to manage the library.');
      return;
    }
    try {
      workouts = (await api('/admin/all')).workouts;
      render();
      document.getElementById('seedBtn').addEventListener('click', startSeed);
      pollSeed(); // resume showing a fill that is already running
    } catch (err) {
      showMessage(err.status === 403 ? 'This account is not a library admin.' : `Failed to load: ${err.message}`);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
