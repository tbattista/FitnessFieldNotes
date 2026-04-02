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

  let ridePlan = null;
  let segments = [];
  let currentSegmentIndex = 0;
  let segmentRemaining = 0;
  let totalRemaining = 0;
  let timerInterval = null;
  let rideStartedAt = null;
  let wakeLock = null;
  let audioCtx = null;

  const CIRCUMFERENCE = 2 * Math.PI * 88; // r=88 from SVG viewBox

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
      totalRemaining: $('totalRemaining'),
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
    els.totalRemaining.textContent = formatTime(totalRemaining);

    setProgressColor(seg.segment_type);

    // Update segment progress arc
    const fraction = segmentRemaining / seg.duration_seconds;
    updateProgressArc(fraction);

    // Highlight active in list
    const rows = els.segmentList.querySelectorAll('.spin-segment-row');
    rows.forEach((row, i) => {
      row.classList.toggle('active', i === currentSegmentIndex);
      row.classList.toggle('completed', i < currentSegmentIndex);
    });

    // Auto-scroll active segment into view
    const activeRow = els.segmentList.querySelector('.spin-segment-row.active');
    if (activeRow) activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderSegmentList() {
    els.segmentList.innerHTML = segments.map((seg, i) => {
      const dur = formatTime(seg.duration_seconds);
      return `
        <div class="spin-segment-row" data-index="${i}">
          <span class="spin-segment-type-dot type-${seg.segment_type}"></span>
          <span class="spin-segment-name">${seg.name}</span>
          <span class="spin-segment-meta">R${seg.resistance} &middot; ${seg.rpm_low}-${seg.rpm_high}rpm &middot; ${dur}</span>
        </div>`;
    }).join('');
  }

  // ── Timer ──────────────────────────────────────────────────────────────

  function tick() {
    if (segmentRemaining <= 0) {
      // Advance to next segment
      currentSegmentIndex++;
      if (currentSegmentIndex >= segments.length) {
        finishRide();
        return;
      }
      segmentRemaining = segments[currentSegmentIndex].duration_seconds;
      playBeep();
      vibrate();
    }

    segmentRemaining--;
    totalRemaining--;
    updateSegmentDisplay();
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
    startTimer();
    requestWakeLock();

    // Resume AudioContext if suspended (requires user gesture)
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    els.startBtn.classList.add('d-none');
    els.pauseBtn.classList.remove('d-none');
    els.endBtn.classList.remove('d-none');
  }

  function onPause() {
    stopTimer();
    els.pauseBtn.classList.add('d-none');
    els.resumeBtn.classList.remove('d-none');
  }

  function onResume() {
    startTimer();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    els.resumeBtn.classList.add('d-none');
    els.pauseBtn.classList.remove('d-none');
  }

  function onEnd() {
    finishRide();
  }

  // ── Finish Ride ────────────────────────────────────────────────────────

  async function finishRide() {
    stopTimer();
    releaseWakeLock();

    const actualMs = rideStartedAt ? Date.now() - rideStartedAt.getTime() : 0;
    const actualMinutes = Math.round(actualMs / 60000);
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
      currentSegmentIndex = 0;
      segmentRemaining = segments[0].duration_seconds;
      totalRemaining = ridePlan.total_seconds;

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
    ridePlan = null;
    segments = [];
    currentSegmentIndex = 0;
    segmentRemaining = 0;
    totalRemaining = 0;
    rideStartedAt = null;
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
