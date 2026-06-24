/**
 * Beta Banner Service
 *
 * Injects a slim, dismissible "BETA — work in progress" banner at the
 * very top of <body> (above the navbar). Self-loads its own CSS so the
 * call sites only need a single <script> tag.
 *
 * Dismissal is sticky via localStorage. The storage key is versioned —
 * bump BANNER_VERSION when the message changes and every browser will
 * see the new banner once.
 */
(function () {
  'use strict';

  // Bump this string when the banner copy changes so users see it again.
  var BANNER_VERSION = 'v1-2026-06';
  var STORAGE_KEY = 'ffn:betaBanner:dismissed:' + BANNER_VERSION;

  function isDismissed() {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
    catch (_) { return false; }
  }

  function setDismissed() {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch (_) {}
  }

  function loadCss() {
    if (document.querySelector('link[href*="beta-banner.css"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/static/assets/css/beta-banner.css';
    document.head.appendChild(link);
  }

  function buildBanner() {
    var el = document.createElement('div');
    el.className = 'ffn-beta-banner';
    el.id = 'ffnBetaBanner';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
      '<span class="ffn-beta-banner-label" aria-hidden="true">' +
        '<i class="bx bx-rocket" aria-hidden="true"></i> BETA' +
      '</span>' +
      '<span class="ffn-beta-banner-text">' +
        "Fitness Field Notes is a work in progress &mdash; feedback welcome." +
      '</span>' +
      '<button type="button" class="ffn-beta-banner-dismiss" ' +
              'id="ffnBetaBannerDismiss" aria-label="Dismiss beta notice">' +
        '<i class="bx bx-x" aria-hidden="true"></i>' +
      '</button>';
    return el;
  }

  function inject() {
    if (isDismissed()) return;
    if (document.getElementById('ffnBetaBanner')) return;
    if (!document.body) return;

    loadCss();
    var banner = buildBanner();
    // Insert as the very first child of <body> so it sits above the
    // navbar (which is injected into .layout-wrapper, also inside body).
    document.body.insertBefore(banner, document.body.firstChild);

    var dismiss = banner.querySelector('#ffnBetaBannerDismiss');
    if (dismiss) {
      dismiss.addEventListener('click', function () {
        setDismissed();
        if (banner.parentNode) banner.parentNode.removeChild(banner);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  // Expose a tiny manual hook for testing / future "show again" flows.
  window.FFNBetaBanner = {
    show: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      inject();
    },
    hide: function () {
      setDismissed();
      var el = document.getElementById('ffnBetaBanner');
      if (el && el.parentNode) el.parentNode.removeChild(el);
    },
    version: BANNER_VERSION,
  };
})();
