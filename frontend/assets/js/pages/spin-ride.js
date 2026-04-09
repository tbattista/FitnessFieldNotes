/**
 * Spin Ride Controller
 * AI-generated spin bike interval timer with structured ride plans.
 *
 * State machine: selecting → generating → ready → riding → paused → finished
 * @version 1.0.0
 */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────
  //
  // Timer is fully time-based: rideStartedAt + pausedAt are the source of truth.
  // currentSegmentIndex / segmentRemaining / totalRemaining are DERIVED from
  // wall-clock elapsed time on every tick, so both the total and current-lap
  // timers stay correct across tab backgrounding, browser close, and reload.

  let ridePlan = null;
  let segments = [];
  let segmentOffsets = [];    // Cumulative start-time (seconds) of each segment
  let currentSegmentIndex = 0;
  let segmentRemaining = 0;
  let totalRemaining = 0;
  let timerInterval = null;
  let rideStartedAt = null;   // Date — wall-clock start. Adjusted forward on resume to discount paused time.
  let pausedAt = null;        // Date — set while paused, null while running.
  let wakeLock = null;
  let audioCtx = null;

  const CIRCUMFERENCE = 2 * Math.PI * 88; // r=88 from SVG viewBox
  const SESSION_KEY = 'spinRideSession';

  // ── DOM refs ───────────────────────────────────────────────────────────

  const $ = (id) => document.getElementById(id);

  let els = {};

  function cacheDom() {
    els = {
      selectState: $('selectState'),
      generatingState: $('generatingState'),
      rideState: $('rideState'),
      finishedState: $('finishedState'),
      authRequired: $('authRequired'),
      errorState: $('errorState'),
      durationButtons: $('durationButtons'),
      generateBtn: $('generateBtn'),
      rideTitle: $('rideTitle'),
      rideMeta: $('rideMeta'),
      timerProgress: $('timerProgress'),
      totalElapsed: $('totalElapsed'),
      segmentName: $('segmentName'),
      segmentTime: $('segmentTime'),
      segmentResistance: $('segmentResistance'),
      segmentRpm: $('segmentRpm'),
      segmentCue: $('segmentCue'),
      segmentList: $('segmentList'),
      startBtn: $('startBtn'),
      pauseBtn: $('pauseBtn'),
      resumeBtn: $('resumeBtn'),
      endBtn: $('endBtn'),
      newRideBtn: $('newRideBtn'),
      finishedSummary: $('finishedSummary'),
      finishedSaveStatus: $('finishedSaveStatus'),
      finishedNewRideBtn: $('finishedNewRideBtn'),
      errorMessage: $('errorMessage'),
      errorRetryBtn: $('errorRetryBtn'),
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function showState(stateId) {
    ['selectState', 'generatingState', 'rideState', 'finishedState', 'authRequired', 'errorState'].forEach((id) => {
      const el = els[id];
      if (el) el.classList.toggle('d-none', id !== stateId);
    });
  }

  function getSelectedDuration() {
    const active = els.durationButtons.querySelector('.active');
    return active ? parseInt(active.dataset.minutes, 10) : null;
  }

  // ── Audio cue ──────────────────────────────────────────────────────────

  function playBeep() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) { /* ignore audio errors */ }
  }

  function vibrate() {
    try {
      if (navigator.vibrate) navigator.vibrate(200);
    } catch (e) { /* ignore */ }
  }

  // ── Wake Lock ──────────────────────────────────────────────────────────

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) { /* ignore */ }
  }

  function releaseWakeLock() {
    try {
      if (wakeLock) { wakeLock.release(); wakeLock = null; }
    } catch (e) { /* ignore */ }
  }

  // ── SVG Progress ───────────────────────────────────────────────────────

  function updateProgressArc(fraction) {
    // fraction: 0 = empty, 1 = full circle
    const offset = CIRCUMFERENCE * (1 - fraction);
    els.timerProgress.style.strokeDasharray = CIRCUMFERENCE;
    els.timerProgress.style.strokeDashoffset = offset;
  }

  function setProgressColor(segmentType) {
    const el = els.timerProgress;
    // Remove all type classes
    // SVG elements have className as SVGAnimatedString; use classList instead
    el.classList.forEach(cls => { if (/^type-\w+/.test(cls)) el.classList.remove(cls); });
    el.classList.add('spin-timer-progress');
    if (segmentType) el.classList.add(`type-${segmentType}`);
  }

  // ── Segment Display ────────────────────────────────────────────────────

  function segmentRowHtml(seg, i) {
    const dur = formatTime(seg.duration_seconds);
    return `<div class="spin-segment-row" data-index="${i}">
      <span class="spin-segment-type-dot type-${seg.segment_type}"></span>
      <span class="spin-segment-name">${seg.name}</span>
      <span class="spin-segment-meta">R${seg.resistance} &middot; ${seg.rpm_low}-${seg.rpm_high}rpm &middot; ${dur}</span>
    </div>`;
  }

  function computeSegmentOffsets() {
    segmentOffsets = [];
    let acc = 0;
    for (const seg of segments) {
      segmentOffsets.push(acc);
      acc += seg.duration_seconds;
    }
  }

  function getElapsedSeconds() {
    if (!rideStartedAt) return 0;
    // When paused, freeze elapsed at the moment of pause.
    const ref = pausedAt ? pausedAt.getTime() : Date.now();
    return Math.max(0, Math.floor((ref - rideStartedAt.getTime()) / 1000));
  }

  /**
   * Recompute currentSegmentIndex / segmentRemaining / totalRemaining from
   * wall-clock elapsed time. This is the single source of truth for timer
   * display, so both timers survive tab suspension and browser close.
   *
   * Returns { segmentChanged, finished }.
   */
  function deriveSegmentState() {
    if (!ridePlan || segments.length === 0) {
      return { segmentChanged: false, finished: false };
    }
    const elapsed = getElapsedSeconds();
    const total = ridePlan.total_seconds || 0;
    totalRemaining = Math.max(0, total - elapsed);

    let idx = segments.length; // default: finished
    for (let i = 0; i < segments.length; i++) {
      const segEnd = segmentOffsets[i] + segments[i].duration_seconds;
      if (elapsed < segEnd) {
        idx = i;
        break;
      }
    }

    const prevIndex = currentSegmentIndex;
    currentSegmentIndex = idx;

    if (idx < segments.length) {
      const segEnd = segmentOffsets[idx] + segments[idx].duration_seconds;
      segmentRemaining = Math.max(0, segEnd - elapsed);
    } else {
      segmentRemaining = 0;
    }

    return {
      segmentChanged: idx !== prevIndex,
      finished: idx >= segments.length,
    };
  }

  function updateSegmentDisplay() {
    const seg = segments[currentSegmentIndex];
    if (!seg) return;

    els.segmentName.textContent = seg.name;
    els.segmentTime.textContent = formatTime(segmentRemaining);
    els.segmentResistance.textContent = seg.resistance;
    els.segmentRpm.textContent = seg.rpm_low === seg.rpm_high
      ? `${seg.rpm_low}`
      : `${seg.rpm_low}-${seg.rpm_high}`;
    els.segmentCue.textContent = seg.cue || '';
    els.totalElapsed.textContent = formatTime(getElapsedSeconds());

    setProgressColor(seg.segment_type);

    // Update segment progress arc
    const fraction = segmentRemaining / seg.duration_seconds;
    updateProgressArc(fraction);

    // Highlight active + next in full list. Current row is emphasized most,
    // the next row slightly emphasized, others use the base font size.
    const rows = els.segmentList.querySelectorAll('.spin-segment-row');
    rows.forEach((row, i) => {
      row.classList.toggle('active', i === currentSegmentIndex);
      row.classList.toggle('next', i === currentSegmentIndex + 1);
      row.classList.toggle('completed', i < currentSegmentIndex);
    });
  }

  function renderSegmentList() {
    els.segmentList.innerHTML = segments.map((seg, i) => segmentRowHtml(seg, i)).join('');
  }

  // ── Session Persistence ─────────────────────────────────────────────────

  function saveSession(timerRunning) {
    try {
      const data = {
        ridePlan,
        rideStartedAt: rideStartedAt ? rideStartedAt.toISOString() : null,
        pausedAt: pausedAt ? pausedAt.toISOString() : null,
        timerRunning: !!timerRunning,
        savedAt: Date.now(),
        // Legacy fields kept for any stale readers; not used on restore.
        currentSegmentIndex,
        segmentRemaining,
        totalRemaining,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch (e) { /* storage full or unavailable */ }
  }

  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Discard sessions older than 2 hours
      if (Date.now() - data.savedAt > 2 * 60 * 60 * 1000) {
        clearSession();
        return null;
      }
      return data;
    } catch (e) { return null; }
  }

  function restoreSession(data) {
    ridePlan = data.ridePlan;
    segments = ridePlan.segments || [];
    computeSegmentOffsets();

    rideStartedAt = data.rideStartedAt ? new Date(data.rideStartedAt) : null;
    pausedAt = data.pausedAt ? new Date(data.pausedAt) : null;

    // Back-compat: an old saved session may not have pausedAt but have
    // timerRunning=false with a rideStartedAt — treat as paused at savedAt.
    if (!pausedAt && rideStartedAt && !data.timerRunning && data.savedAt) {
      pausedAt = new Date(data.savedAt);
    }

    // Derive the current segment / remaining from wall-clock timestamps.
    if (rideStartedAt) {
      const { finished } = deriveSegmentState();
      if (finished) {
        populateRideUI();
        finishRide();
        return;
      }
    } else {
      currentSegmentIndex = 0;
      segmentRemaining = segments[0] ? segments[0].duration_seconds : 0;
      totalRemaining = ridePlan.total_seconds || 0;
    }

    populateRideUI();
    updateSegmentDisplay();

    // Restore correct button state
    if (rideStartedAt && !pausedAt) {
      // Running
      els.startBtn.classList.add('d-none');
      els.pauseBtn.classList.remove('d-none');
      els.resumeBtn.classList.add('d-none');
      els.endBtn.classList.remove('d-none');
      startTimer();
      requestWakeLock();
    } else if (rideStartedAt && pausedAt) {
      // Paused
      els.startBtn.classList.add('d-none');
      els.pauseBtn.classList.add('d-none');
      els.resumeBtn.classList.remove('d-none');
      els.endBtn.classList.remove('d-none');
    } else {
      // Generated but not started
      els.startBtn.classList.remove('d-none');
      els.pauseBtn.classList.add('d-none');
      els.resumeBtn.classList.add('d-none');
      els.endBtn.classList.add('d-none');
    }

    showState('rideState');
  }

  function populateRideUI() {
    els.rideTitle.textContent = ridePlan.title;
    const capDifficulty = ridePlan.difficulty.charAt(0).toUpperCase() + ridePlan.difficulty.slice(1);
    els.rideMeta.textContent = `${ridePlan.duration_minutes} min · ${capDifficulty} · ${segments.length} segments`;
    renderSegmentList();
  }

  // ── Timer ──────────────────────────────────────────────────────────────
  //
  // The tick is just a UI refresh — all timer values are derived from
  // wall-clock timestamps via deriveSegmentState(). This means the timer
  // can never "drift" or get stuck: one tick after the page becomes visible
  // (or is reloaded) the display jumps to the correct elapsed time.

  function tick() {
    const { segmentChanged, finished } = deriveSegmentState();

    if (finished) {
      updateSegmentDisplay();
      finishRide();
      return;
    }

    // Play cue on segment transition (but not on the first derivation
    // after load — we're either starting the ride or resuming).
    if (segmentChanged && currentSegmentIndex > 0) {
      playBeep();
      vibrate();
    }

    updateSegmentDisplay();
    saveSession(true);
  }

  /**
   * Handle page becoming visible again — re-derive from wall-clock immediately.
   */
  function onVisibilityChange() {
    if (document.visibilityState === 'visible' && timerInterval) {
      const { finished } = deriveSegmentState();
      if (finished) {
        updateSegmentDisplay();
        finishRide();
        return;
      }
      updateSegmentDisplay();
      // Re-request wake lock (released by OS when backgrounded)
      requestWakeLock();
    }
  }

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(tick, 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  // ── Ride Controls ──────────────────────────────────────────────────────

  function onStart() {
    rideStartedAt = new Date();
    pausedAt = null;
    deriveSegmentState();
    updateSegmentDisplay();
    startTimer();
    requestWakeLock();

    // Resume AudioContext if suspended (requires user gesture)
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    els.startBtn.classList.add('d-none');
    els.pauseBtn.classList.remove('d-none');
    els.endBtn.classList.remove('d-none');
    saveSession(true);
  }

  function onPause() {
    pausedAt = new Date();
    stopTimer();
    updateSegmentDisplay();
    els.pauseBtn.classList.add('d-none');
    els.resumeBtn.classList.remove('d-none');
    saveSession(false);
  }

  function onResume() {
    // Adjust rideStartedAt forward by the paused duration so elapsed math
    // stays simple: elapsed = now - rideStartedAt.
    if (pausedAt && rideStartedAt) {
      const pauseDurationMs = Date.now() - pausedAt.getTime();
      rideStartedAt = new Date(rideStartedAt.getTime() + pauseDurationMs);
    }
    pausedAt = null;
    deriveSegmentState();
    updateSegmentDisplay();
    startTimer();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    els.resumeBtn.classList.add('d-none');
    els.pauseBtn.classList.remove('d-none');
    saveSession(true);
  }

  function onEnd() {
    finishRide();
  }

  // ── Finish Ride ────────────────────────────────────────────────────────

  async function finishRide() {
    stopTimer();
    releaseWakeLock();
    clearSession();

    // Use elapsed-seconds helper so paused time is excluded correctly.
    const actualSeconds = getElapsedSeconds();
    const actualMinutes = Math.round(actualSeconds / 60);
    const segmentsCompleted = Math.min(currentSegmentIndex + 1, segments.length);
    const allCompleted = currentSegmentIndex >= segments.length;

    // Build summary
    const summaryText = allCompleted
      ? `${ridePlan.title} — ${actualMinutes} min, all ${segments.length} segments completed`
      : `${ridePlan.title} — ${actualMinutes} min, ${segmentsCompleted}/${segments.length} segments`;
    els.finishedSummary.textContent = summaryText;

    showState('finishedState');

    // Save as cardio activity
    try {
      if (window.universalLogService && window.universalLogService.saveCardio) {
        const notesLines = [
          `Spin Ride: ${ridePlan.title}`,
          `Difficulty: ${ridePlan.difficulty}`,
          `Segments: ${segmentsCompleted}/${segments.length}`,
        ];
        // Include segment summary
        segments.slice(0, segmentsCompleted).forEach((seg) => {
          notesLines.push(`  ${seg.name}: R${seg.resistance}, ${seg.rpm_low}-${seg.rpm_high}rpm, ${formatTime(seg.duration_seconds)}`);
        });

        await window.universalLogService.saveCardio({
          activity_type: 'cycling',
          activity_name: ridePlan.title,
          duration_minutes: actualMinutes || 1,
          calories: ridePlan.estimated_calories || null,
          notes: notesLines.join('\n').substring(0, 500),
          sessionDate: rideStartedAt ? rideStartedAt.toISOString() : new Date().toISOString(),
        });

        els.finishedSaveStatus.textContent = 'Activity saved to your log.';
      } else {
        els.finishedSaveStatus.textContent = 'Could not save — log service not available.';
      }
    } catch (err) {
      console.error('Failed to save spin ride activity:', err);
      els.finishedSaveStatus.textContent = `Save failed: ${err.message}`;
    }
  }

  // ── Generate Ride ──────────────────────────────────────────────────────

  async function generateRide(durationMinutes) {
    showState('generatingState');

    try {
      const headers = { 'Content-Type': 'application/json' };
      // Add auth header
      if (window.authService && window.authService.currentUser) {
        const token = await window.authService.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/v3/spin-ride/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ duration_minutes: durationMinutes }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Generation failed' }));
        throw new Error(err.detail || `Server error: ${response.status}`);
      }

      ridePlan = await response.json();
      segments = ridePlan.segments || [];

      if (segments.length === 0) throw new Error('Empty ride plan received');

      // Initialize timer state
      computeSegmentOffsets();
      currentSegmentIndex = 0;
      segmentRemaining = segments[0].duration_seconds;
      totalRemaining = ridePlan.total_seconds;
      rideStartedAt = null;
      pausedAt = null;

      // Populate UI
      els.rideTitle.textContent = ridePlan.title;
      const capDifficulty = ridePlan.difficulty.charAt(0).toUpperCase() + ridePlan.difficulty.slice(1);
      els.rideMeta.textContent = `${durationMinutes} min · ${capDifficulty} · ${segments.length} segments`;

      renderSegmentList();
      updateSegmentDisplay();

      // Reset controls
      els.startBtn.classList.remove('d-none');
      els.pauseBtn.classList.add('d-none');
      els.resumeBtn.classList.add('d-none');
      els.endBtn.classList.add('d-none');

      showState('rideState');
      saveSession(false);

    } catch (err) {
      console.error('Spin ride generation failed:', err);
      els.errorMessage.textContent = err.message;
      showState('errorState');
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────

  function resetToSelection() {
    stopTimer();
    releaseWakeLock();
    clearSession();
    ridePlan = null;
    segments = [];
    segmentOffsets = [];
    currentSegmentIndex = 0;
    segmentRemaining = 0;
    totalRemaining = 0;
    rideStartedAt = null;
    pausedAt = null;
    showState('selectState');
  }

  // ── Init ───────────────────────────────────────────────────────────────

  function bindEvents() {
    // Duration buttons
    els.durationButtons.addEventListener('click', (e) => {
      const btn = e.target.closest('.spin-duration-btn');
      if (!btn) return;
      els.durationButtons.querySelectorAll('.spin-duration-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      els.generateBtn.disabled = false;
    });

    // Generate
    els.generateBtn.addEventListener('click', () => {
      const dur = getSelectedDuration();
      if (dur) generateRide(dur);
    });

    // Ride controls
    els.startBtn.addEventListener('click', onStart);
    els.pauseBtn.addEventListener('click', onPause);
    els.resumeBtn.addEventListener('click', onResume);
    els.endBtn.addEventListener('click', onEnd);

    // New ride
    els.newRideBtn.addEventListener('click', resetToSelection);
    els.finishedNewRideBtn.addEventListener('click', resetToSelection);

    // Error retry
    els.errorRetryBtn.addEventListener('click', resetToSelection);

    // Catch up timer when returning from background (mobile tab switch, screen off, etc.)
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  function waitForAuth() {
    // Check auth state — show auth gate if not signed in
    return new Promise((resolve) => {
      function check() {
        if (window.authService) {
          if (window.authService.currentUser) {
            resolve(true);
          } else {
            // Listen for auth state changes
            window.addEventListener('authStateChanged', function handler(e) {
              if (e.detail && e.detail.user) {
                window.removeEventListener('authStateChanged', handler);
                resolve(true);
              }
            });
            // Also give it a few seconds for initial load
            setTimeout(() => resolve(!!window.authService.currentUser), 3000);
          }
        } else {
          // Auth service not loaded yet, wait
          setTimeout(check, 200);
        }
      }
      check();
    });
  }

  async function init() {
    cacheDom();
    bindEvents();

    const isAuth = await waitForAuth();
    if (!isAuth) {
      showState('authRequired');
      return;
    }

    // Restore in-progress ride if session exists
    const saved = loadSession();
    if (saved && saved.ridePlan) {
      restoreSession(saved);
    } else {
      showState('selectState');
    }
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
