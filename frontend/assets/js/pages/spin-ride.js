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
  // If the current ride was launched from a saved history entry, this holds
  // its document ID. On finish we bump the existing record's completion_count
  // instead of creating a duplicate.
  let savedRideId = null;
  let segments = [];
  let segmentOffsets = [];    // Cumulative start-time (seconds) of each segment
  let currentSegmentIndex = 0;
  let lastScrolledIndex = -1; // Tracks last segment index we auto-scrolled to in the side list
  let segmentRemaining = 0;
  let totalRemaining = 0;
  let timerInterval = null;
  let rideStartedAt = null;   // Date — wall-clock start. Adjusted forward on resume to discount paused time.
  let pausedAt = null;        // Date — set while paused, null while running.
  let wakeLock = null;
  let audioCtx = null;

  const CIRCUMFERENCE = 2 * Math.PI * 88; // r=88 from SVG viewBox
  const SESSION_KEY = 'spinRideSession';
  const BIKE_GEARS_KEY = 'spinRideBikeGears';
  const BIKE_RPM_KEY = 'spinRideBikeRpm';
  const INCLUDE_ALL_OUTS_KEY = 'spinRideIncludeAllOuts';
  const DIFFICULTY_KEY = 'spinRideDifficulty';
  const WINDOW_MODE_KEY = 'spinRideWindowMode';

  // The AI's RPM range — anything it outputs maps from this interval onto
  // the user's configured min/max when RPM mapping is enabled.
  const AI_RPM_MIN = 50;
  const AI_RPM_MAX = 130;

  // Number of upcoming segments visible in windowed mode (kept in sync with
  // the adjacent-sibling chains in spin-ride.css).
  const WINDOW_AHEAD = 3;

  let windowMode = (() => {
    try { return localStorage.getItem(WINDOW_MODE_KEY) === 'full' ? 'full' : 'windowed'; }
    catch (e) { return 'windowed'; }
  })();

  const DIFFICULTY_DESCRIPTIONS = {
    easy: 'Gentle rolling hills. Comfortable the whole time. Great for beginners or recovery days.',
    moderate: 'Solid workout with clear peaks and valleys. Work-to-recovery ratio ~3:1.',
    hard: 'Demanding climbs, sprint intervals, short recovery. You earn every rest. ~5:1 work-to-recovery.',
    intense: 'Near-max efforts, minimal recovery. The kind of ride you talk about for days.',
  };

  // ── Bike gear mapping ──────────────────────────────────────────────────
  // Users can map the abstract resistance scale (1..10) onto their own bike's
  // gears (e.g., 10..21). When configured, the UI shows "Gear 15" instead of
  // "R 5". Stored in localStorage so it persists across sessions/devices.

  let bikeGears = null; // { min: number, max: number } or null

  function loadBikeGears() {
    try {
      const raw = localStorage.getItem(BIKE_GEARS_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.min === 'number' && typeof data.max === 'number' && data.max > data.min) {
        return data;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function saveBikeGears(min, max) {
    try {
      localStorage.setItem(BIKE_GEARS_KEY, JSON.stringify({ min, max }));
    } catch (e) { /* ignore */ }
  }

  function clearBikeGears() {
    try { localStorage.removeItem(BIKE_GEARS_KEY); } catch (e) { /* ignore */ }
  }

  /**
   * Map abstract resistance (1..10) to the user's bike gear via linear
   * interpolation between min (recovery) and max (climb). Returns the
   * rounded gear number, or null if no mapping is configured.
   */
  function mapResistanceToGear(resistance) {
    if (!bikeGears) return null;
    const r = Math.max(1, Math.min(10, Number(resistance) || 1));
    const gear = bikeGears.min + ((r - 1) / 9) * (bikeGears.max - bikeGears.min);
    return Math.round(gear);
  }

  // ── Bike RPM mapping ───────────────────────────────────────────────────
  // Mirrors the gear mapping above: the AI emits RPM values in 50..130, and
  // the user can remap that range onto whatever min/max their bike reads.
  // Stored in localStorage so it persists across sessions/devices.

  let bikeRpm = null; // { min: number, max: number } or null

  function loadBikeRpm() {
    try {
      const raw = localStorage.getItem(BIKE_RPM_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.min === 'number' && typeof data.max === 'number' && data.max > data.min) {
        return data;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function saveBikeRpm(min, max) {
    try {
      localStorage.setItem(BIKE_RPM_KEY, JSON.stringify({ min, max }));
    } catch (e) { /* ignore */ }
  }

  function clearBikeRpm() {
    try { localStorage.removeItem(BIKE_RPM_KEY); } catch (e) { /* ignore */ }
  }

  /**
   * Map an AI RPM value (50..130) onto the user's configured range via
   * linear interpolation. Returns the rounded mapped RPM, or null if no
   * mapping is configured.
   */
  function mapRpm(rpm) {
    if (!bikeRpm) return null;
    const clamped = Math.max(AI_RPM_MIN, Math.min(AI_RPM_MAX, Number(rpm) || AI_RPM_MIN));
    const span = AI_RPM_MAX - AI_RPM_MIN;
    const mapped = bikeRpm.min + ((clamped - AI_RPM_MIN) / span) * (bikeRpm.max - bikeRpm.min);
    return Math.round(mapped);
  }

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
      customDurationInput: $('customDurationInput'),
      allOutsButtons: $('allOutsButtons'),
      difficultyButtons: $('difficultyButtons'),
      difficultyDescription: $('difficultyDescription'),
      generateBtn: $('generateBtn'),
      rideSummaryValue: $('rideSummaryValue'),
      rideSummarySub: $('rideSummarySub'),
      ctaHint: document.querySelector('.sr-cta-hint'),
      recoveryGearInput: $('recoveryGearInput'),
      maxGearInput: $('maxGearInput'),
      bikeGearsSaveBtn: $('bikeGearsSaveBtn'),
      bikeGearsClearBtn: $('bikeGearsClearBtn'),
      bikeGearsStatus: $('bikeGearsStatus'),
      lowRpmInput: $('lowRpmInput'),
      maxRpmInput: $('maxRpmInput'),
      bikeRpmSaveBtn: $('bikeRpmSaveBtn'),
      bikeRpmClearBtn: $('bikeRpmClearBtn'),
      bikeRpmStatus: $('bikeRpmStatus'),
      segmentResistanceLabel: $('segmentResistanceLabel'),
      segmentResistanceSuffix: $('segmentResistanceSuffix'),
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
      windowToggleWrap: $('windowToggleWrap'),
      windowToggleBtn: $('windowToggleBtn'),
      startBtn: $('startBtn'),
      pauseBtn: $('pauseBtn'),
      resumeBtn: $('resumeBtn'),
      endBtn: $('endBtn'),
      newRideBtn: $('newRideBtn'),
      finishedSummary: $('finishedSummary'),
      finishedSaveStatus: $('finishedSaveStatus'),
      finishedNewRideBtn: $('finishedNewRideBtn'),
      rideFeedbackWidget: $('rideFeedbackWidget'),
      rideFeedbackStars: $('rideFeedbackStars'),
      rideFeedbackComment: $('rideFeedbackComment'),
      rideFeedbackSubmitBtn: $('rideFeedbackSubmitBtn'),
      rideFeedbackStatus: $('rideFeedbackStatus'),
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
    // Custom input takes priority when it has a valid value.
    const customRaw = els.customDurationInput && els.customDurationInput.value;
    if (customRaw) {
      const custom = parseInt(customRaw, 10);
      if (!Number.isNaN(custom) && custom >= 5 && custom <= 120) {
        return custom;
      }
    }
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
    const gear = mapResistanceToGear(seg.resistance);
    const resistanceLabel = gear !== null ? `G${gear}` : `R${seg.resistance}`;
    const rpmLow = mapRpm(seg.rpm_low) ?? seg.rpm_low;
    const rpmHigh = mapRpm(seg.rpm_high) ?? seg.rpm_high;
    return `<div class="spin-segment-row" data-index="${i}">
      <span class="spin-segment-type-dot type-${seg.segment_type}"></span>
      <span class="spin-segment-name">${seg.name}</span>
      <span class="spin-segment-meta">${resistanceLabel} &middot; ${rpmLow}-${rpmHigh}rpm &middot; ${dur}</span>
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

    // Resistance / Gear display
    const gear = mapResistanceToGear(seg.resistance);
    if (gear !== null) {
      els.segmentResistanceLabel.textContent = 'Gear';
      els.segmentResistance.textContent = gear;
      els.segmentResistanceSuffix.textContent = `(R${seg.resistance})`;
    } else {
      els.segmentResistanceLabel.textContent = 'Resistance';
      els.segmentResistance.textContent = seg.resistance;
      els.segmentResistanceSuffix.textContent = '/10';
    }

    const displayRpmLow = mapRpm(seg.rpm_low) ?? seg.rpm_low;
    const displayRpmHigh = mapRpm(seg.rpm_high) ?? seg.rpm_high;
    els.segmentRpm.textContent = displayRpmLow === displayRpmHigh
      ? `${displayRpmLow}`
      : `${displayRpmLow}-${displayRpmHigh}`;
    els.segmentCue.textContent = seg.cue || '';
    els.totalElapsed.textContent = formatTime(getElapsedSeconds());

    setProgressColor(seg.segment_type);

    // Update segment progress arc
    const fraction = segmentRemaining / seg.duration_seconds;
    updateProgressArc(fraction);

    // Highlight active + next in full list. Current row is emphasized most,
    // the next row slightly emphasized, others use the base font size.
    const rows = els.segmentList.querySelectorAll('.spin-segment-row');
    let activeRow = null;
    rows.forEach((row, i) => {
      const isActive = i === currentSegmentIndex;
      row.classList.toggle('active', isActive);
      row.classList.toggle('next', i === currentSegmentIndex + 1);
      row.classList.toggle('completed', i < currentSegmentIndex);
      // Tag the most recent completed row so windowed mode can keep it visible
      // as a "last finished" anchor.
      row.classList.toggle('last-completed', i === currentSegmentIndex - 1);
      if (isActive) activeRow = row;
    });

    updateSegmentSummaries();

    // Keep the active row visible when the list scrolls within its column.
    // Only scroll within the segments column itself — never the page — so
    // the stacked mobile layout doesn't jump on segment transitions.
    if (activeRow && currentSegmentIndex !== lastScrolledIndex) {
      lastScrolledIndex = currentSegmentIndex;
      const col = activeRow.closest('.spin-ride-segments-col');
      if (col && col.scrollHeight > col.clientHeight + 1) {
        const colRect = col.getBoundingClientRect();
        const rowRect = activeRow.getBoundingClientRect();
        const offset = (rowRect.top - colRect.top) - (col.clientHeight / 2 - activeRow.clientHeight / 2);
        col.scrollBy({ top: offset, behavior: 'smooth' });
      }
    }
  }

  function renderSegmentList() {
    const completedSummary = `<div class="spin-segment-summary spin-segment-summary-completed d-none" id="completedSummary">
        <i class="bx bx-check"></i><span class="spin-segment-summary-text">0 completed</span>
      </div>`;
    const upcomingSummary = `<div class="spin-segment-summary spin-segment-summary-upcoming d-none" id="upcomingSummary">
        <i class="bx bx-time-five"></i><span class="spin-segment-summary-text">+0 more upcoming</span>
      </div>`;
    const rows = segments.map((seg, i) => segmentRowHtml(seg, i)).join('');
    els.segmentList.innerHTML = completedSummary + rows + upcomingSummary;
    els.segmentList.classList.toggle('windowed', windowMode === 'windowed');
    els.windowToggleWrap.classList.toggle('d-none', segments.length <= WINDOW_AHEAD + 2);
    updateWindowToggleLabel();
    lastScrolledIndex = -1;
    updateSegmentSummaries();
  }

  function updateSegmentSummaries() {
    const completedSummaryEl = document.getElementById('completedSummary');
    const upcomingSummaryEl = document.getElementById('upcomingSummary');
    if (!completedSummaryEl || !upcomingSummaryEl) return;

    const completedCount = Math.max(0, currentSegmentIndex);
    // In windowed mode we keep one completed row visible (the last one), so
    // the "completed" pill should reflect what's collapsed — count - 1.
    const completedHidden = Math.max(0, completedCount - 1);
    const upcomingHidden = Math.max(0, segments.length - currentSegmentIndex - 1 - WINDOW_AHEAD);

    completedSummaryEl.classList.toggle('d-none', completedHidden === 0);
    completedSummaryEl.querySelector('.spin-segment-summary-text').textContent =
      `${completedHidden} completed`;

    upcomingSummaryEl.classList.toggle('d-none', upcomingHidden === 0);
    upcomingSummaryEl.querySelector('.spin-segment-summary-text').textContent =
      `+${upcomingHidden} more upcoming`;
  }

  function updateWindowToggleLabel() {
    if (!els.windowToggleBtn) return;
    const isWindowed = windowMode === 'windowed';
    const icon = els.windowToggleBtn.querySelector('i');
    const text = els.windowToggleBtn.querySelector('.spin-window-toggle-text');
    if (icon) icon.className = `bx ${isWindowed ? 'bx-chevron-down' : 'bx-chevron-up'} me-1`;
    if (text) text.textContent = isWindowed ? 'Show full plan' : 'Show focused view';
  }

  function setWindowMode(mode) {
    windowMode = mode === 'full' ? 'full' : 'windowed';
    try { localStorage.setItem(WINDOW_MODE_KEY, windowMode); } catch (e) { /* ignore */ }
    els.segmentList.classList.toggle('windowed', windowMode === 'windowed');
    updateWindowToggleLabel();
    updateSegmentSummaries();
    // Re-trigger auto-scroll on the newly-laid-out list.
    lastScrolledIndex = -1;
    updateSegmentDisplay();
  }

  // ── Session Persistence ─────────────────────────────────────────────────

  function saveSession(timerRunning) {
    try {
      const data = {
        ridePlan,
        savedRideId,
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
    savedRideId = data.savedRideId || null;
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

  // ── Ride Feedback Widget ───────────────────────────────────────────────

  function setupRideFeedbackWidget(context) {
    const widget = els.rideFeedbackWidget;
    const starsContainer = els.rideFeedbackStars;
    const commentEl = els.rideFeedbackComment;
    const statusEl = els.rideFeedbackStatus;
    if (!widget || !starsContainer || !els.rideFeedbackSubmitBtn) return;

    // Clone the stars + submit button FIRST to drop any listeners left
    // attached from a previous ride. Capturing references before cloning
    // would leave us holding detached nodes — clicks would update DOM the
    // user never sees.
    Array.from(starsContainer.querySelectorAll('.ride-feedback-star')).forEach((btn) => {
      btn.parentNode.replaceChild(btn.cloneNode(true), btn);
    });
    const oldSubmit = els.rideFeedbackSubmitBtn;
    const submitBtn = oldSubmit.cloneNode(true);
    oldSubmit.parentNode.replaceChild(submitBtn, oldSubmit);
    els.rideFeedbackSubmitBtn = submitBtn;

    // Now query the fresh nodes — these are the ones in the DOM.
    const starButtons = Array.from(starsContainer.querySelectorAll('.ride-feedback-star'));

    // Reset widget state every time finishRide runs (handles "Start Another Ride").
    widget.classList.remove('d-none');
    if (commentEl) {
      commentEl.value = '';
      commentEl.disabled = false;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submit feedback';
    if (statusEl) statusEl.textContent = 'Optional — helps tune future rides.';

    let selectedRating = 0;

    function paintStars(active) {
      starButtons.forEach((btn) => {
        const r = parseInt(btn.dataset.rating, 10);
        const icon = btn.querySelector('i');
        if (!icon) return;
        const filled = r <= active;
        icon.classList.toggle('bx-star', !filled);
        icon.classList.toggle('bxs-star', filled);
        icon.classList.toggle('text-warning', filled);
        btn.setAttribute('aria-checked', String(r === active));
      });
    }

    starButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedRating = parseInt(btn.dataset.rating, 10) || 0;
        paintStars(selectedRating);
        submitBtn.disabled = selectedRating < 1;
      });
    });

    submitBtn.addEventListener('click', async () => {
      if (selectedRating < 1) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      try {
        if (!window.spinRideFeedbackService) {
          throw new Error('Feedback service not loaded');
        }
        await window.spinRideFeedbackService.submit({
          ridePlan: context.ridePlan,
          rating: selectedRating,
          comment: commentEl ? commentEl.value : '',
          segmentsCompleted: context.segmentsCompleted,
          actualSeconds: context.actualSeconds,
          includeAllOuts: context.includeAllOuts,
        });
        if (statusEl) statusEl.textContent = 'Thanks — feedback submitted.';
        submitBtn.textContent = 'Submitted';
        if (commentEl) commentEl.disabled = true;
        starButtons.forEach((b) => { b.disabled = true; });
      } catch (err) {
        console.error('Spin ride feedback submission failed:', err);
        if (statusEl) statusEl.textContent = `Couldn't submit: ${err.message}`;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Try again';
      }
    });

    paintStars(0);
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

    // Persist to personal history (fire-and-forget — never blocks the
    // activity-log save flow or the rating widget).
    persistRideToHistory(actualSeconds);
    const startedAtIso = rideStartedAt ? rideStartedAt.toISOString() : new Date().toISOString();

    // Build summary
    const summaryText = allCompleted
      ? `${ridePlan.title} — ${actualMinutes} min, all ${segments.length} segments completed`
      : `${ridePlan.title} — ${actualMinutes} min, ${segmentsCompleted}/${segments.length} segments`;
    els.finishedSummary.textContent = summaryText;

    showState('finishedState');
    setupRideFeedbackWidget({
      ridePlan,
      segmentsCompleted,
      actualSeconds,
      includeAllOuts: getIncludeAllOuts(),
    });

    // Build notes once — shared between confirm and fallback paths.
    const notesLines = [
      `Spin Ride: ${ridePlan.title}`,
      `Difficulty: ${ridePlan.difficulty}`,
      `Segments: ${segmentsCompleted}/${segments.length}`,
    ];
    segments.slice(0, segmentsCompleted).forEach((seg) => {
      const noteRpmLow = mapRpm(seg.rpm_low) ?? seg.rpm_low;
      const noteRpmHigh = mapRpm(seg.rpm_high) ?? seg.rpm_high;
      notesLines.push(`  ${seg.name}: R${seg.resistance}, ${noteRpmLow}-${noteRpmHigh}rpm, ${formatTime(seg.duration_seconds)}`);
    });
    const notes = notesLines.join('\n').substring(0, 500);

    const saveCardio = async (durationMinutes, calories) => {
      if (!window.universalLogService || !window.universalLogService.saveCardio) {
        throw new Error('Log service not available');
      }
      await window.universalLogService.saveCardio({
        activity_type: 'cycling',
        activity_name: ridePlan.title,
        duration_minutes: durationMinutes || 1,
        calories: calories || null,
        notes,
        sessionDate: startedAtIso,
      });
    };

    // If the unified offcanvas factory isn't on the page, fall back to the
    // previous auto-save behavior so we never silently lose the activity.
    const factory = window.UnifiedOffcanvasFactory;
    if (!factory || !factory.createCompleteWorkout) {
      try {
        await saveCardio(actualMinutes, ridePlan.estimated_calories);
        els.finishedSaveStatus.textContent = 'Activity saved to your log.';
      } catch (err) {
        console.error('Failed to save spin ride activity:', err);
        els.finishedSaveStatus.textContent = `Save failed: ${err.message}`;
      }
      return;
    }

    // Show the same "Session Complete" offcanvas used by workouts so the user
    // can confirm duration and enter calories before the activity is logged.
    els.finishedSaveStatus.textContent = 'Confirm below to save this ride to your log.';

    const offcanvas = factory.createCompleteWorkout({
      workoutName: ridePlan.title,
      minutes: actualMinutes,
      totalExercises: segments.length,
      isBuildMode: false,
    }, async (durationMinutes, _templateOpts, sessionCalories) => {
      try {
        const finalDuration = durationMinutes || actualMinutes;
        const finalCalories = sessionCalories ?? ridePlan.estimated_calories;
        await saveCardio(finalDuration, finalCalories);
        els.finishedSaveStatus.textContent = 'Activity saved to your log.';
      } catch (err) {
        console.error('Failed to save spin ride activity:', err);
        els.finishedSaveStatus.textContent = `Save failed: ${err.message}`;
        throw err;
      }
    });

    // Prefill calories with the AI estimate so users can accept/adjust it.
    setTimeout(() => {
      const caloriesInput = document.getElementById('sessionCaloriesInput');
      if (caloriesInput && ridePlan.estimated_calories) {
        caloriesInput.value = ridePlan.estimated_calories;
        const unitLabel = caloriesInput.nextElementSibling;
        if (unitLabel && unitLabel.tagName === 'SPAN') {
          unitLabel.textContent = 'cal (est.)';
        }
        const statRow = caloriesInput.closest('.session-stat');
        if (statRow) {
          statRow.title = 'AI-estimated calories — tap to adjust';
        }
      }
    }, 50);

    return offcanvas;
  }

  // ── Generate Ride ──────────────────────────────────────────────────────

  async function generateRide(durationMinutes) {
    // A freshly generated plan is brand-new history, not a re-ride.
    savedRideId = null;
    showState('generatingState');

    try {
      const headers = { 'Content-Type': 'application/json' };
      // Add auth header
      if (window.authService && window.authService.currentUser) {
        const token = await window.authService.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }

      const includeAllOuts = getIncludeAllOuts();
      const difficulty = getSelectedDifficulty();

      const response = await fetch('/api/v3/spin-ride/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          duration_minutes: durationMinutes,
          include_all_outs: includeAllOuts,
          difficulty: difficulty,
        }),
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
    savedRideId = null;
    segments = [];
    segmentOffsets = [];
    currentSegmentIndex = 0;
    segmentRemaining = 0;
    totalRemaining = 0;
    rideStartedAt = null;
    pausedAt = null;
    // Clear ?savedId from the URL so a "New ride" press doesn't re-trigger
    // the saved-ride loader on the next reload.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('savedId')) {
        url.searchParams.delete('savedId');
        window.history.replaceState({}, '', url.toString());
      }
    } catch (e) { /* ignore */ }
    showState('selectState');
  }

  // ── Saved Ride History ─────────────────────────────────────────────────
  //
  // Auto-save every completed ride to the user's history so they can star
  // favorites and re-ride them later. The two helpers below also handle the
  // re-ride hand-off: when ?savedId=... is present, loadSavedRide() fetches
  // the stored plan and drops straight into the ride state, skipping
  // generation.

  const SAVED_RIDES_API = '/api/v3/firebase/spin-rides';

  async function authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (window.authService && window.authService.currentUser) {
      try {
        const token = await window.authService.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      } catch (e) { /* ignore */ }
    }
    return headers;
  }

  async function persistRideToHistory(actualSeconds) {
    if (!ridePlan) return;
    try {
      if (savedRideId) {
        // Re-ride of an existing saved entry: bump completion + refresh timestamp.
        await fetch(`${SAVED_RIDES_API}/${encodeURIComponent(savedRideId)}`, {
          method: 'PATCH',
          headers: await authHeaders(),
          body: JSON.stringify({
            increment_completion: true,
            last_actual_seconds: actualSeconds,
          }),
        });
      } else {
        // Brand-new ride: save it to history.
        const res = await fetch(SAVED_RIDES_API, {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({
            plan: ridePlan,
            last_actual_seconds: actualSeconds,
          }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && data.id) savedRideId = data.id;
        }
      }
    } catch (err) {
      // Never block ride completion on history persistence.
      console.warn('Failed to persist ride to history:', err);
    }
  }

  async function loadSavedRide(rideId) {
    try {
      const res = await fetch(`${SAVED_RIDES_API}/${encodeURIComponent(rideId)}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || !data.plan || !Array.isArray(data.plan.segments) || !data.plan.segments.length) {
        throw new Error('Saved ride is missing its plan');
      }

      savedRideId = data.id;
      ridePlan = data.plan;
      segments = ridePlan.segments;

      computeSegmentOffsets();
      currentSegmentIndex = 0;
      segmentRemaining = segments[0].duration_seconds;
      totalRemaining = ridePlan.total_seconds;
      rideStartedAt = null;
      pausedAt = null;

      populateRideUI();
      updateSegmentDisplay();

      // Reset controls — ride is loaded but not yet started.
      els.startBtn.classList.remove('d-none');
      els.pauseBtn.classList.add('d-none');
      els.resumeBtn.classList.add('d-none');
      els.endBtn.classList.add('d-none');

      showState('rideState');
      saveSession(false);
      return true;
    } catch (err) {
      console.error('Failed to load saved ride:', err);
      els.errorMessage.textContent = `Couldn't load saved ride: ${err.message}`;
      showState('errorState');
      return false;
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────

  function refreshGenerateButtonState() {
    const hasDuration = getSelectedDuration() !== null;
    els.generateBtn.disabled = !hasDuration;
    if (els.ctaHint) {
      els.ctaHint.textContent = hasDuration ? '' : 'Pick a duration to continue';
    }
    updateSummaryCard();
  }

  /**
   * Update the setup-screen summary card with the current duration, difficulty,
   * all-outs, and gear mapping. Called whenever any input changes.
   */
  function updateSummaryCard() {
    if (!els.rideSummaryValue || !els.rideSummarySub) return;
    const duration = getSelectedDuration();
    if (duration === null) {
      els.rideSummaryValue.textContent = '—';
      els.rideSummarySub.textContent = 'choose a duration';
      return;
    }
    els.rideSummaryValue.textContent = `${duration} min`;

    const difficulty = getSelectedDifficulty() || 'moderate';
    const difficultyLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    const allOutsLabel = getIncludeAllOuts() ? 'all-outs on' : 'efforts only';
    const gearLabel = bikeGears
      ? `gears ${bikeGears.min}–${bikeGears.max}`
      : 'default 1-10';
    els.rideSummarySub.textContent = `${difficultyLabel} · ${allOutsLabel} · ${gearLabel}`;
  }

  function getIncludeAllOuts() {
    if (!els.allOutsButtons) return false;
    const active = els.allOutsButtons.querySelector('.spin-all-out-btn.active');
    return !!(active && active.dataset.value === '1');
  }

  function setIncludeAllOuts(value) {
    if (!els.allOutsButtons) return;
    const target = value ? '1' : '0';
    els.allOutsButtons.querySelectorAll('.spin-all-out-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.value === target);
    });
  }

  function getSelectedDifficulty() {
    if (!els.difficultyButtons) return 'moderate';
    const active = els.difficultyButtons.querySelector('.spin-difficulty-btn.active');
    return active ? active.dataset.value : 'moderate';
  }

  function setSelectedDifficulty(value) {
    if (!els.difficultyButtons) return;
    const validValues = ['easy', 'moderate', 'hard', 'intense'];
    const target = validValues.includes(value) ? value : 'moderate';
    els.difficultyButtons.querySelectorAll('.spin-difficulty-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.value === target);
    });
    if (els.difficultyDescription) {
      els.difficultyDescription.textContent = DIFFICULTY_DESCRIPTIONS[target] || '';
    }
  }

  function updateBikeGearsStatus() {
    if (!els.bikeGearsStatus) return;
    if (bikeGears) {
      els.bikeGearsStatus.textContent = `Mapped: gears ${bikeGears.min}–${bikeGears.max} → resistance 1-10.`;
    } else {
      els.bikeGearsStatus.textContent = '';
    }
  }

  function updateBikeRpmStatus() {
    if (!els.bikeRpmStatus) return;
    if (bikeRpm) {
      els.bikeRpmStatus.textContent = `Mapped: AI RPM ${AI_RPM_MIN}–${AI_RPM_MAX} → your ${bikeRpm.min}–${bikeRpm.max}.`;
    } else {
      els.bikeRpmStatus.textContent = '';
    }
  }

  function bindEvents() {
    // Duration preset buttons
    els.durationButtons.addEventListener('click', (e) => {
      const btn = e.target.closest('.spin-duration-btn');
      if (!btn) return;
      els.durationButtons.querySelectorAll('.spin-duration-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      // Selecting a preset clears the custom field so it's clear which is active.
      if (els.customDurationInput) els.customDurationInput.value = '';
      refreshGenerateButtonState();
    });

    // Custom duration input
    if (els.customDurationInput) {
      els.customDurationInput.addEventListener('input', () => {
        // Typing a custom duration deselects any preset.
        if (els.customDurationInput.value) {
          els.durationButtons.querySelectorAll('.spin-duration-btn').forEach((b) => b.classList.remove('active'));
        }
        refreshGenerateButtonState();
      });
    }

    // All-outs button pair (persist preference)
    if (els.allOutsButtons) {
      els.allOutsButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('.spin-all-out-btn');
        if (!btn) return;
        const value = btn.dataset.value === '1';
        setIncludeAllOuts(value);
        try {
          localStorage.setItem(INCLUDE_ALL_OUTS_KEY, value ? '1' : '0');
        } catch (err) { /* ignore */ }
        updateSummaryCard();
      });
    }

    // Difficulty button group (persist preference)
    if (els.difficultyButtons) {
      els.difficultyButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('.spin-difficulty-btn');
        if (!btn) return;
        setSelectedDifficulty(btn.dataset.value);
        try {
          localStorage.setItem(DIFFICULTY_KEY, btn.dataset.value);
        } catch (err) { /* ignore */ }
        updateSummaryCard();
      });
    }

    // Generate
    els.generateBtn.addEventListener('click', () => {
      const dur = getSelectedDuration();
      if (dur) generateRide(dur);
    });

    // Bike gear save / clear
    if (els.bikeGearsSaveBtn) {
      els.bikeGearsSaveBtn.addEventListener('click', () => {
        const min = parseInt(els.recoveryGearInput.value, 10);
        const max = parseInt(els.maxGearInput.value, 10);
        if (Number.isNaN(min) || Number.isNaN(max) || min < 1 || max < 1) {
          els.bikeGearsStatus.textContent = 'Enter both gears as positive numbers.';
          return;
        }
        if (max <= min) {
          els.bikeGearsStatus.textContent = 'Max gear must be higher than recovery gear.';
          return;
        }
        saveBikeGears(min, max);
        bikeGears = { min, max };
        updateBikeGearsStatus();
        updateSummaryCard();
        // If a ride is loaded, re-render so it picks up the new mapping.
        if (ridePlan && segments.length) {
          renderSegmentList();
          updateSegmentDisplay();
        }
      });
    }
    if (els.bikeGearsClearBtn) {
      els.bikeGearsClearBtn.addEventListener('click', () => {
        clearBikeGears();
        bikeGears = null;
        els.recoveryGearInput.value = '';
        els.maxGearInput.value = '';
        els.bikeGearsStatus.textContent = 'Using default 1-10 resistance scale.';
        updateSummaryCard();
        if (ridePlan && segments.length) {
          renderSegmentList();
          updateSegmentDisplay();
        }
      });
    }

    // Bike RPM save / clear (mirrors gear save / clear above)
    if (els.bikeRpmSaveBtn) {
      els.bikeRpmSaveBtn.addEventListener('click', () => {
        const min = parseInt(els.lowRpmInput.value, 10);
        const max = parseInt(els.maxRpmInput.value, 10);
        if (Number.isNaN(min) || Number.isNaN(max) || min < 1 || max < 1) {
          els.bikeRpmStatus.textContent = 'Enter both RPMs as positive numbers.';
          return;
        }
        if (max <= min) {
          els.bikeRpmStatus.textContent = 'Max RPM must be higher than low RPM.';
          return;
        }
        saveBikeRpm(min, max);
        bikeRpm = { min, max };
        updateBikeRpmStatus();
        if (ridePlan && segments.length) {
          renderSegmentList();
          updateSegmentDisplay();
        }
      });
    }
    if (els.bikeRpmClearBtn) {
      els.bikeRpmClearBtn.addEventListener('click', () => {
        clearBikeRpm();
        bikeRpm = null;
        els.lowRpmInput.value = '';
        els.maxRpmInput.value = '';
        els.bikeRpmStatus.textContent = `Using AI RPM range ${AI_RPM_MIN}-${AI_RPM_MAX}.`;
        if (ridePlan && segments.length) {
          renderSegmentList();
          updateSegmentDisplay();
        }
      });
    }

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

    // Toggle between focused (windowed) and full segment list views
    if (els.windowToggleBtn) {
      els.windowToggleBtn.addEventListener('click', () => {
        setWindowMode(windowMode === 'windowed' ? 'full' : 'windowed');
      });
    }

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

    // Load saved bike-gear mapping and prefill the setup form.
    bikeGears = loadBikeGears();
    if (bikeGears) {
      if (els.recoveryGearInput) els.recoveryGearInput.value = bikeGears.min;
      if (els.maxGearInput) els.maxGearInput.value = bikeGears.max;
    }
    updateBikeGearsStatus();

    // Load saved bike-RPM mapping and prefill the setup form.
    bikeRpm = loadBikeRpm();
    if (bikeRpm) {
      if (els.lowRpmInput) els.lowRpmInput.value = bikeRpm.min;
      if (els.maxRpmInput) els.maxRpmInput.value = bikeRpm.max;
    }
    updateBikeRpmStatus();

    // Restore include-all-outs preference
    try {
      setIncludeAllOuts(localStorage.getItem(INCLUDE_ALL_OUTS_KEY) === '1');
    } catch (e) { /* ignore */ }

    // Restore difficulty preference
    try {
      const savedDifficulty = localStorage.getItem(DIFFICULTY_KEY);
      if (savedDifficulty) setSelectedDifficulty(savedDifficulty);
    } catch (e) { /* ignore */ }

    // Prime the summary card + CTA hint from the restored preferences
    refreshGenerateButtonState();

    const isAuth = await waitForAuth();
    if (!isAuth) {
      showState('authRequired');
      return;
    }

    // Re-ride hand-off: ?savedId=... loads a stored plan and jumps straight
    // to the ride screen, skipping the generator. An in-progress session in
    // sessionStorage takes precedence so a refresh during a ride doesn't
    // discard the user's progress.
    const savedIdParam = (() => {
      try { return new URLSearchParams(window.location.search).get('savedId'); }
      catch (e) { return null; }
    })();

    const saved = loadSession();
    if (saved && saved.ridePlan) {
      restoreSession(saved);
    } else if (savedIdParam) {
      const ok = await loadSavedRide(savedIdParam);
      if (!ok) showState('selectState');
    } else {
      showState('selectState');
    }
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────

  // Test-only hook for exercising the feedback widget without going
  // through the auth-gated ride flow. Read by tests/spin-ride-feedback.spec.js.
  window.__spinRideTestHooks = { setupRideFeedbackWidget };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
