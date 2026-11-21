/**
 * Analytics Loader - single place that wires up site analytics.
 *
 * Included synchronously in <head> on every page:
 *   <script src="/static/assets/js/services/analytics-loader.js"></script>
 *
 * Migration: Matomo (self-hosted on Railway) -> Cloudflare Web Analytics (free).
 *   1. Paste the Cloudflare beacon token below (Cloudflare dashboard >
 *      Analytics & Logs > Web Analytics > your site > "Manage site" snippet,
 *      the value of "token" in data-cf-beacon). It is public, not a secret.
 *   2. Confirm visits show up in Cloudflare.
 *   3. Set MATOMO_ENABLED = false, then delete the Matomo project on Railway.
 *
 * Both tools are cookieless.
 */
(function () {
    'use strict';

    var CF_BEACON_TOKEN = '';
    var MATOMO_ENABLED = true;
    var MATOMO_URL = '//matomo-production-72c8.up.railway.app/';
    var MATOMO_SITE_ID = '2';

    // Optional override (used by tests): window.FFN_ANALYTICS = { cfToken, matomo }
    var override = window.FFN_ANALYTICS || {};
    var cfToken = override.cfToken !== undefined ? override.cfToken : CF_BEACON_TOKEN;
    var matomoOn = override.matomo !== undefined ? override.matomo : MATOMO_ENABLED;

    function addScript(src, attrs) {
        var g = document.createElement('script');
        g.async = true;
        g.src = src;
        Object.keys(attrs || {}).forEach(function (k) { g.setAttribute(k, attrs[k]); });
        (document.head || document.documentElement).appendChild(g);
        return g;
    }

    // Matomo. window._paq is always defined so analytics-service.js calls are safe.
    var _paq = window._paq = window._paq || [];
    if (matomoOn) {
        _paq.push(['disableCookies']);
        _paq.push(['trackPageView']);
        _paq.push(['enableLinkTracking']);
        _paq.push(['setTrackerUrl', MATOMO_URL + 'matomo.php']);
        _paq.push(['setSiteId', MATOMO_SITE_ID]);
        addScript(MATOMO_URL + 'matomo.js', { 'data-analytics': 'matomo' });
    }

    // Cloudflare Web Analytics (page views, referrers, Web Vitals; no custom events).
    if (cfToken) {
        addScript('https://static.cloudflareinsights.com/beacon.min.js', {
            'defer': '',
            'data-analytics': 'cloudflare',
            'data-cf-beacon': JSON.stringify({ token: cfToken })
        });
    }
})();
