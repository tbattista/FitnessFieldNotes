/**
 * Library Hand-off
 * Shared by the Tabata and Spin players for workouts from the public library:
 *   - "Do This Workout" links open the player with ?library={id}
 *   - workouts reused instead of generating (response carries `library`)
 * Signed-out visitors can run library workouts; saving to the log waits for
 * sign-in.
 */
(function () {
  'use strict';

  const API = '/api/v3/library';

  function getLibraryIdFromURL() {
    try {
      return new URLSearchParams(window.location.search).get('library');
    } catch (e) {
      return null;
    }
  }

  function currentUser() {
    return (window.authService && window.authService.currentUser) || null;
  }

  async function headers() {
    const h = { 'Content-Type': 'application/json' };
    const user = currentUser();
    if (user) {
      try { h.Authorization = `Bearer ${await user.getIdToken()}`; } catch (e) { /* ignore */ }
    }
    return h;
  }

  /** Fetch a published library workout: { id, url, title, plan, ... }. */
  async function fetchWorkout(id) {
    const res = await fetch(`${API}/workouts/${encodeURIComponent(id)}`, { headers: await headers() });
    if (!res.ok) {
      throw new Error(res.status === 404 ? 'This workout is no longer available.' : `Server error: ${res.status}`);
    }
    const data = await res.json();
    if (!data || !data.plan || !Array.isArray(data.plan.segments) || !data.plan.segments.length) {
      throw new Error('This workout has no intervals to run.');
    }
    return data;
  }

  /** Fire-and-forget completion count (+ per-user history when signed in). */
  async function recordCompletion(id) {
    if (!id) return;
    try {
      await fetch(`${API}/workouts/${encodeURIComponent(id)}/completed`, {
        method: 'POST',
        headers: await headers(),
        keepalive: true,
      });
    } catch (e) { /* never block finishing a workout */ }
  }

  /**
   * Small line under the workout title.
   *   mode 'page'  — opened from a library page: link back to view / print it
   *   mode 'reuse' — handed out instead of generating: offer a fresh generation
   */
  function renderNote(el, { mode, url, onFresh }) {
    if (!el) return;
    el.innerHTML = '';
    el.hidden = false;
    const icon = document.createElement('i');
    icon.className = 'bx bx-library me-1';
    el.appendChild(icon);
    el.appendChild(document.createTextNode(
      mode === 'reuse' ? 'From the workout library, matched to your settings · ' : 'From the free workout library · '
    ));
    if (mode === 'reuse' && onFresh) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-link btn-sm p-0 align-baseline library-fresh-btn';
      btn.textContent = 'Generate a fresh one instead';
      btn.addEventListener('click', onFresh);
      el.appendChild(btn);
    } else if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.textContent = 'View or print';
      el.appendChild(link);
    }
  }

  function hideNote(el) {
    if (el) { el.hidden = true; el.innerHTML = ''; }
  }

  /**
   * Run `onSignedIn` now if signed in; otherwise show a sign-in prompt in
   * `statusEl` and run it once the user signs in.
   */
  function whenSignedIn(statusEl, onSignedIn, message) {
    if (currentUser()) {
      onSignedIn();
      return;
    }
    statusEl.textContent = '';
    statusEl.appendChild(document.createTextNode(`${message || 'Sign in to save this workout to your log.'} `));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline-primary btn-sm ms-1 library-signin-btn';
    btn.innerHTML = '<i class="bx bx-log-in me-1"></i>Sign in to save';
    btn.addEventListener('click', () => {
      if (window.authUI && window.authUI.showAuthModal) window.authUI.showAuthModal('signin');
    });
    statusEl.appendChild(btn);

    function handler(e) {
      if (e.detail && e.detail.user) {
        window.removeEventListener('authStateChanged', handler);
        onSignedIn();
      }
    }
    window.addEventListener('authStateChanged', handler);
  }

  window.LibraryHandoff = {
    getLibraryIdFromURL,
    fetchWorkout,
    recordCompletion,
    renderNote,
    hideNote,
    whenSignedIn,
  };
})();
