/**
 * StudioDraftService — localStorage persistence for in-progress workout drafts
 *
 * Single slot, schema-versioned. Stores everything needed to reconstruct
 * Page 1 + Page 2 state when the user returns: name, tags, description,
 * tray items, organize order, blocks, notes, per-instance organize state.
 *
 * Persist on every meaningful mutation (debounced by the controller).
 * Restore silently on init — no modal — and surface a dismissable banner
 * so the user has agency to start fresh if the draft is stale.
 *
 * Maps don't survive JSON.stringify, so they round-trip as arrays of
 * [key, value] entries (the same shape new Map() accepts).
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'ffn:studio:draft:v1';
  const SCHEMA_VERSION = 1;

  const StudioDraftService = {
    KEY: STORAGE_KEY,
    VERSION: SCHEMA_VERSION,

    /** Read the current draft, or null if none / unreadable / wrong version. */
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || data.version !== SCHEMA_VERSION) return null;
        return data;
      } catch (_err) {
        return null;
      }
    },

    /**
     * Persist a snapshot. Silently no-ops on quota errors so we never
     * break the studio just because localStorage is full.
     */
    save(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return;
      try {
        const payload = Object.assign(
          { version: SCHEMA_VERSION, savedAt: Date.now() },
          snapshot
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (_err) {
        /* full disk / private browsing — ignore */
      }
    },

    clear() {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_err) { /* noop */ }
    },

    /** "just now", "5 minutes ago", "3 hours ago", "2 days ago", or a date. */
    relativeTime(ts) {
      if (!ts || typeof ts !== 'number') return '';
      const diff = Date.now() - ts;
      if (diff < 60_000) return 'just now';
      const mins = Math.round(diff / 60_000);
      if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
      const hours = Math.round(diff / 3_600_000);
      if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
      const days = Math.round(diff / 86_400_000);
      if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
      try {
        return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      } catch (_err) {
        return `${days} days ago`;
      }
    },
  };

  window.StudioDraftService = StudioDraftService;
})();
