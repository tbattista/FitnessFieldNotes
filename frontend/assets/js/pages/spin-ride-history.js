/**
 * Spin Ride History Controller
 * Lists the current user's saved spin rides. Lets them favorite, re-ride, or delete.
 */
(function () {
  'use strict';

  const API_BASE = '/api/v3/firebase/spin-rides';

  const els = {};
  let rides = [];
  let currentFilter = 'all';

  function $(id) { return document.getElementById(id); }

  function cacheDom() {
    els.authRequired = $('authRequired');
    els.loadingState = $('loadingState');
    els.emptyState = $('emptyState');
    els.errorState = $('errorState');
    els.errorMessage = $('errorMessage');
    els.ridesList = $('ridesList');
    els.ridesCount = $('ridesCount');
    els.retryBtn = $('retryBtn');
    els.filterAllBtn = $('filterAllBtn');
    els.filterFavoritesBtn = $('filterFavoritesBtn');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showOnly(stateEl) {
    [els.authRequired, els.loadingState, els.emptyState, els.errorState].forEach((el) => {
      if (!el) return;
      el.classList.toggle('d-none', el !== stateEl);
    });
    // Always hide the list when showing a state panel; renderList toggles it back.
    if (stateEl !== null) els.ridesList.innerHTML = '';
  }

  function showList() {
    [els.authRequired, els.loadingState, els.emptyState, els.errorState].forEach((el) => {
      if (el) el.classList.add('d-none');
    });
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const diffMs = Date.now() - then;
    const min = Math.round(diffMs / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const hours = Math.round(min / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.round(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    return new Date(iso).toLocaleDateString();
  }

  async function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (window.authService && window.authService.currentUser) {
      try {
        const token = await window.authService.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      } catch (e) { /* ignore */ }
    }
    return headers;
  }

  function waitForAuth() {
    return new Promise((resolve) => {
      function check() {
        if (window.authService) {
          if (window.authService.currentUser) {
            resolve(true);
          } else {
            window.addEventListener('authStateChanged', function handler(e) {
              if (e.detail && e.detail.user) {
                window.removeEventListener('authStateChanged', handler);
                resolve(true);
              }
            });
            setTimeout(() => resolve(!!window.authService.currentUser), 3000);
          }
        } else {
          setTimeout(check, 200);
        }
      }
      check();
    });
  }

  async function fetchRides() {
    showOnly(els.loadingState);
    try {
      const url = `${API_BASE}?favorites_only=${currentFilter === 'favorites'}&page=1&page_size=100`;
      const res = await fetch(url, { headers: await getAuthHeaders() });
      if (res.status === 401) {
        showOnly(els.authRequired);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const body = await res.json();
      rides = Array.isArray(body.rides) ? body.rides : [];
      renderList();
    } catch (err) {
      console.error('Failed to load spin rides:', err);
      els.errorMessage.textContent = err.message || 'Something went wrong.';
      showOnly(els.errorState);
    }
  }

  function renderRow(ride) {
    const plan = ride.plan || {};
    const segments = Array.isArray(plan.segments) ? plan.segments : [];
    const title = escapeHtml(plan.title || 'Untitled ride');
    const difficulty = escapeHtml(plan.difficulty || '');
    const duration = plan.duration_minutes ? `${plan.duration_minutes} min` : '';
    const completed = ride.completion_count > 1
      ? ` · Ridden ${ride.completion_count}×`
      : '';
    const last = relativeTime(ride.last_ridden_at);
    const starIcon = ride.is_favorite ? 'bxs-star text-warning' : 'bx-star text-muted';

    return `
      <div class="card mb-3 spin-history-card" data-id="${escapeHtml(ride.id)}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div class="flex-grow-1" style="min-width: 0;">
              <h6 class="mb-1 text-truncate">${title}</h6>
              <small class="text-muted">
                ${duration} · ${difficulty} · ${segments.length} segments${completed}
              </small>
              <div class="text-muted small mt-1">
                <i class="bx bx-time-five me-1"></i>Last ridden ${last}
              </div>
            </div>
            <div class="d-flex align-items-center gap-1">
              <button type="button"
                      class="btn btn-icon btn-text-secondary js-toggle-favorite"
                      aria-label="${ride.is_favorite ? 'Remove favorite' : 'Mark favorite'}"
                      aria-pressed="${ride.is_favorite ? 'true' : 'false'}">
                <i class="bx ${starIcon}" style="font-size: 1.25rem;"></i>
              </button>
              <a href="spin-ride.html?savedId=${encodeURIComponent(ride.id)}"
                 class="btn btn-sm btn-primary js-ride-again">
                <i class="bx bx-play me-1"></i>Ride again
              </a>
              <button type="button"
                      class="btn btn-icon btn-text-secondary js-delete"
                      aria-label="Delete saved ride">
                <i class="bx bx-trash" style="font-size: 1.1rem;"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderList() {
    if (!rides.length) {
      showOnly(els.emptyState);
      els.ridesCount.textContent = '0 rides';
      return;
    }
    showList();
    els.ridesList.innerHTML = rides.map(renderRow).join('');
    const favCount = rides.filter((r) => r.is_favorite).length;
    els.ridesCount.textContent = currentFilter === 'favorites'
      ? `${rides.length} favorite${rides.length === 1 ? '' : 's'}`
      : `${rides.length} ride${rides.length === 1 ? '' : 's'} · ${favCount} favorite${favCount === 1 ? '' : 's'}`;
  }

  async function toggleFavorite(rideId) {
    const ride = rides.find((r) => r.id === rideId);
    if (!ride) return;
    const target = !ride.is_favorite;
    // Optimistic UI
    ride.is_favorite = target;
    renderList();
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(rideId)}`, {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ is_favorite: target }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Re-fetch to pick up canonical sort order (favorites bubble to top).
      fetchRides();
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      // Revert on failure.
      ride.is_favorite = !target;
      renderList();
    }
  }

  async function deleteRide(rideId) {
    const ride = rides.find((r) => r.id === rideId);
    if (!ride) return;
    const title = (ride.plan && ride.plan.title) || 'this ride';
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete "${title}" from your history? This can't be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(rideId)}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
      });
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      rides = rides.filter((r) => r.id !== rideId);
      renderList();
    } catch (err) {
      console.error('Failed to delete ride:', err);
      // eslint-disable-next-line no-alert
      window.alert(`Couldn't delete ride: ${err.message}`);
    }
  }

  function bindEvents() {
    if (els.retryBtn) els.retryBtn.addEventListener('click', fetchRides);

    function selectFilter(filter) {
      currentFilter = filter;
      els.filterAllBtn.classList.toggle('active', filter === 'all');
      els.filterFavoritesBtn.classList.toggle('active', filter === 'favorites');
      fetchRides();
    }
    if (els.filterAllBtn) {
      els.filterAllBtn.addEventListener('click', () => selectFilter('all'));
    }
    if (els.filterFavoritesBtn) {
      els.filterFavoritesBtn.addEventListener('click', () => selectFilter('favorites'));
    }

    // Event delegation for per-row actions.
    els.ridesList.addEventListener('click', (e) => {
      const card = e.target.closest('.spin-history-card');
      if (!card) return;
      const rideId = card.dataset.id;
      if (e.target.closest('.js-toggle-favorite')) {
        e.preventDefault();
        toggleFavorite(rideId);
        return;
      }
      if (e.target.closest('.js-delete')) {
        e.preventDefault();
        deleteRide(rideId);
        return;
      }
      // Ride-again is a plain <a>, browser handles navigation.
    });
  }

  async function init() {
    cacheDom();
    bindEvents();
    const isAuth = await waitForAuth();
    if (!isAuth) {
      showOnly(els.authRequired);
      return;
    }
    fetchRides();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Test hook so Playwright can drive the UI directly.
  window.__spinHistoryTestHooks = {
    setRides: (next) => { rides = next; renderList(); },
    getRides: () => rides,
  };
})();
