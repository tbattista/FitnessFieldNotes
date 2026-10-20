/**
 * Tabata Kettlebell Controller
 * AI-generated kettlebell tabata interval timer.
 *
 * State machine: selecting → generating → ready → working → paused → finished
 * Reuses the Spin Ride wall-clock timer pattern for pause/resume/reload-safe timing.
 */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────

  let workoutPlan = null;
  let segments = [];
  let segmentOffsets = [];
  let currentSegmentIndex = 0;
  let lastScrolledIndex = -1; // Last segment index the side list auto-scrolled to
  let segmentRemaining = 0;
  let totalRemaining = 0;
  let timerInterval = null;
  let workoutStartedAt = null;
  let pausedAt = null;
  let wakeLock = null;
  let audioCtx = null;

  const CIRCUMFERENCE = 2 * Math.PI * 88;
  const SESSION_KEY = 'tabataKettlebellSession';
  const PROTOCOL_KEY = 'tabataKBProtocol';
  const FOCUS_KEY = 'tabataKBFocusAreas';
  const SETS_KEY = 'tabataKBSets';
  const ROUNDS_PER_SET_KEY = 'tabataKBRoundsPerSet';
  const LENGTH_KEY = 'tabataKBLength';
  const INCLUDE_EX_KEY = 'tabataKBIncludeExercises';
  const EXCLUDE_EX_KEY = 'tabataKBExcludeExercises';
  const VARIETY_KEY = 'tabataKBExerciseVariety';
  const NOTES_KEY = 'tabataKBNotes';
  const WINDOW_MODE_KEY = 'tabataKBWindowMode';
  const NOTES_MAX = 500;

  // Rows visible after the active one in windowed mode. Rest intervals sit
  // between every work interval, so 5 rows = the next three exercises.
  const WINDOW_AHEAD = 5;

  let windowMode = (() => {
    try { return localStorage.getItem(WINDOW_MODE_KEY) === 'full' ? 'full' : 'windowed'; }
    catch (e) { return 'windowed'; }
  })();

  // How exercises repeat inside a set — must match ExerciseVariety in
  // backend/models/tabata_kettlebell.py.
  const VARIETY_LABELS = {
    mixed: "Coach's mix",
    same: 'Same per set',
    alternating: 'Alternate 2',
    all_different: 'All different',
  };

  // Greatest-hits list of kettlebell movements offered for include/exclude
  // in the "Fine tune" section. Kept short so the chip grid stays scannable
  // on mobile. Canonical names match the exercise library in the backend
  // generator prompt so the AI recognizes them as-is.
  const EXERCISE_CHIPS = [
    { id: 'two_hand_swing',       label: 'Swing (2H)',     name: 'Two-Hand KB Swing' },
    { id: 'one_arm_swing',        label: 'Swing (1-arm)',  name: 'Single-Arm KB Swing' },
    { id: 'goblet_squat',         label: 'Goblet Squat',   name: 'KB Goblet Squat' },
    { id: 'front_squat',          label: 'Front Squat',    name: 'KB Front Squat' },
    { id: 'kb_lunge',             label: 'Lunge',          name: 'KB Lunge' },
    { id: 'kb_clean',             label: 'Clean',          name: 'KB Clean' },
    { id: 'clean_and_press',      label: 'Clean & Press',  name: 'KB Clean and Press' },
    { id: 'kb_snatch',            label: 'Snatch',         name: 'KB Snatch' },
    { id: 'strict_press',         label: 'Strict Press',   name: 'KB Strict Press' },
    { id: 'push_press',           label: 'Push Press',     name: 'KB Push Press' },
    { id: 'thruster',             label: 'Thruster',       name: 'KB Thruster' },
    { id: 'single_arm_row',       label: 'Row',            name: 'KB Single-Arm Row' },
    { id: 'renegade_row',         label: 'Renegade Row',   name: 'KB Renegade Row' },
    { id: 'high_pull',            label: 'High Pull',      name: 'KB High Pull' },
    { id: 'kb_halo',              label: 'Halo',           name: 'KB Halo' },
    { id: 'turkish_get_up',       label: 'Get-Up',         name: 'KB Turkish Get-Up' },
    { id: 'kb_windmill',          label: 'Windmill',       name: 'KB Windmill' },
    { id: 'russian_twist',        label: 'Russian Twist',  name: 'KB Russian Twist' },
    { id: 'figure_8',             label: 'Figure 8',       name: 'KB Figure 8' },
    { id: 'kb_burpee',            label: 'KB Burpee',      name: 'KB Burpee with Clean' },
  ];

  // Map from chip id → the actual exercise name sent to the backend
  const EXERCISE_BY_ID = Object.fromEntries(EXERCISE_CHIPS.map((c) => [c.id, c.name]));

  // Fixed timing constants (must match backend generator)
  //
  // Terminology (Tabata standard):
  //   Work Interval  = 20s (or 40s) all-out effort
  //   Rest Interval  = 10s (or 20s) recovery
  //   Round          = 1 Work Interval + 1 Rest Interval
  //   Set            = N Rounds back-to-back (classic Tabata = 8 Rounds = 4 min)
  //   Set Rest       = recovery between Sets
  const SET_REST_SECONDS = 60;
  const MIN_SETS = 1;
  const MAX_SETS = 12;

  // Config / inputs
  let selectedProtocol = '20/10';
  let selectedFocus = new Set();
  let selectedSets = 5;
  let selectedRoundsPerSet = 8;
  let selectedLength = 20; // preset minutes
  let selectedVariety = 'mixed';
  // Chip id → 'include' | 'exclude'. Absent = neutral.
  let exercisePrefs = {};

  // ── DOM refs ───────────────────────────────────────────────────────────

  const $ = (id) => document.getElementById(id);
  let els = {};

  function cacheDom() {
    els = {
      selectState: $('selectState'),
      generatingState: $('generatingState'),
      workoutState: $('workoutState'),
      finishedState: $('finishedState'),
      authRequired: $('authRequired'),
      errorState: $('errorState'),
      audioHint: $('audioHint'),

      protocolButtons: $('protocolButtons'),
      focusButtons: $('focusButtons'),
      lengthButtons: $('lengthButtons'),
      setsDisplay: $('setsDisplay'),
      setsDownBtn: $('setsDownBtn'),
      setsUpBtn: $('setsUpBtn'),
      roundsPerSetButtons: $('roundsPerSetButtons'),
      varietyButtons: $('varietyButtons'),
      notesInput: $('notesInput'),
      notesCount: $('notesCount'),
      totalTimeHelper: $('totalTimeHelper'),
      generateBtn: $('generateBtn'),

      totalValue: document.querySelector('#totalTimeHelper .tk-total-value'),
      totalSub: document.querySelector('#totalTimeHelper .tk-total-sub'),
      ctaHint: document.querySelector('.tk-cta-hint'),
      finetuneToggleBtn: $('finetuneToggleBtn'),
      finetunePanel: $('finetunePanel'),
      finetuneSummary: $('finetuneSummary'),
      finetuneResetBtn: $('finetuneResetBtn'),
      exerciseGrid: $('exerciseGrid'),

      workoutTitle: $('workoutTitle'),
      workoutMeta: $('workoutMeta'),
      timerProgress: $('timerProgress'),
      totalElapsed: $('totalElapsed'),
      segmentName: $('segmentName'),
      segmentTime: $('segmentTime'),
      currentExerciseName: $('currentExerciseName'),
      segmentSet: $('segmentSet'),
      segmentRound: $('segmentRound'),
      segmentCue: $('segmentCue'),
      segmentList: $('segmentList'),
      windowToggleWrap: $('windowToggleWrap'),
      windowToggleBtn: $('windowToggleBtn'),

      startBtn: $('startBtn'),
      pauseBtn: $('pauseBtn'),
      resumeBtn: $('resumeBtn'),
      endBtn: $('endBtn'),
      newWorkoutBtn: $('newWorkoutBtn'),
      finishedSummary: $('finishedSummary'),
      finishedSaveStatus: $('finishedSaveStatus'),
      finishedNewWorkoutBtn: $('finishedNewWorkoutBtn'),
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
    ['selectState', 'generatingState', 'workoutState', 'finishedState', 'authRequired', 'errorState'].forEach((id) => {
      const el = els[id];
      if (el) el.classList.toggle('d-none', id !== stateId);
    });
    scheduleFitToViewport();
  }

  // ── Fit-to-screen workout layout ──────────────────────────────────────
  //
  // While a workout is on screen the page itself should never scroll: the
  // workout state is sized to exactly the viewport height left below its top
  // edge, and only the segment list scrolls inside it (see .tk-fit in
  // tabata-kettlebell.css).

  let fitFrame = null;
  let lastFitHeight = null;

  function scheduleFitToViewport() {
    if (fitFrame) cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => {
      fitFrame = null;
      fitWorkoutToViewport();
    });
  }

  // Below this the workout can't fit legibly (e.g. phone landscape with the
  // banner showing) — fall back to the normal scrolling page.
  const MIN_FIT_HEIGHT = 260;

  function unfitWorkout() {
    const el = els.workoutState;
    el.classList.remove('tk-fit');
    el.style.removeProperty('--tk-fit-height');
  }

  function fitWorkoutToViewport() {
    const el = els.workoutState;
    if (!el) return;
    const active = !el.classList.contains('d-none');
    document.body.classList.toggle('tk-workout-active', active);
    if (!active) {
      unfitWorkout();
      lastFitHeight = null;
      return;
    }
    el.classList.add('tk-fit');
    const top = el.getBoundingClientRect().top + window.scrollY;
    const container = el.closest('.container-p-y');
    const padBottom = container ? parseFloat(getComputedStyle(container).paddingBottom) || 0 : 0;
    let height = Math.floor(window.innerHeight - top - padBottom);
    el.style.setProperty('--tk-fit-height', `${height}px`);
    // Anything below the content (backdrops, footers) still adds page height —
    // trim by whatever overflow remains so the page lands exactly on 100%.
    const overflow = document.documentElement.scrollHeight - window.innerHeight;
    if (overflow > 0) {
      height -= overflow;
      el.style.setProperty('--tk-fit-height', `${height}px`);
    }
    if (height < MIN_FIT_HEIGHT) unfitWorkout();
    // The list only becomes scrollable once it's constrained, so re-anchor
    // the active row whenever the available height changes.
    if (height !== lastFitHeight) {
      lastFitHeight = height;
      scrollActiveRowToTop(null, 'auto');
    }
  }

  function protocolSeconds(protocol) {
    return protocol === '40/20' ? { work: 40, rest: 20 } : { work: 20, rest: 10 };
  }

  /**
   * Compute total workout seconds from current inputs.
   * No warmup — user is assumed to be already warmed up.
   *   1 Round = 1 work + 1 rest interval
   *   1 Set   = rounds_per_set rounds back-to-back
   *   total   = sets * (rounds_per_set * (work + rest)) + (sets - 1) * set_rest
   */
  function computeTotalSeconds(protocol, sets, roundsPerSet) {
    const { work, rest } = protocolSeconds(protocol);
    const setLen = roundsPerSet * (work + rest);
    const setRests = Math.max(0, sets - 1) * SET_REST_SECONDS;
    return sets * setLen + setRests;
  }

  /**
   * For a preset length (minutes), compute the smallest integer SET count
   * whose total time is >= presetMinutes * 60. We always go OVER the preset
   * (never under) so the user gets a complete workout.
   *
   * Solve s such that s*setLen + (s-1)*setRest >= target
   *   => s*(setLen + setRest) >= target + setRest
   *   => s >= (target + setRest) / (setLen + setRest)
   */
  function setsForPresetLength(protocol, roundsPerSet, presetMinutes) {
    const target = presetMinutes * 60;
    const { work, rest } = protocolSeconds(protocol);
    const setLen = roundsPerSet * (work + rest);
    const numerator = target + SET_REST_SECONDS;
    const denom = setLen + SET_REST_SECONDS;
    let s = Math.ceil(numerator / denom);
    if (s < MIN_SETS) s = MIN_SETS;
    if (s > MAX_SETS) s = MAX_SETS;
    return s;
  }

  // ── Audio / Vibration ──────────────────────────────────────────────────

  function playBeep(frequency = 880, duration = 0.15) {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.value = 0.3;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) { /* ignore audio errors */ }
  }

  function vibrate(ms = 200) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
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
    const offset = CIRCUMFERENCE * (1 - fraction);
    els.timerProgress.style.strokeDasharray = CIRCUMFERENCE;
    els.timerProgress.style.strokeDashoffset = offset;
  }

  function setProgressColor(segmentType) {
    const el = els.timerProgress;
    el.classList.forEach((cls) => { if (/^type-\w+/.test(cls)) el.classList.remove(cls); });
    el.classList.add('spin-timer-progress');
    if (segmentType) el.classList.add(`type-${segmentType}`);
  }

  // ── Segment Display ────────────────────────────────────────────────────

  function segmentRowHtml(seg, i) {
    const dur = formatTime(seg.duration_seconds);
    const displayLabel = seg.name || seg.exercise || seg.segment_type;
    const metaBits = [];
    if (seg.segment_type === 'work' && seg.set_index) {
      // "S2·R3" → Set 2, Round 3 (1-based display)
      metaBits.push(`S${seg.set_index}·R${(seg.round_index || 0) + 1}`);
    } else if (seg.segment_type === 'rest') {
      metaBits.push('rest interval');
    } else if (seg.segment_type === 'set_rest') {
      metaBits.push('set rest');
    }
    metaBits.push(dur);
    return `<div class="spin-segment-row" data-index="${i}">
      <span class="spin-segment-type-dot type-${seg.segment_type}"></span>
      <span class="spin-segment-name">${displayLabel}</span>
      <span class="spin-segment-meta">${metaBits.join(' · ')}</span>
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
    if (!workoutStartedAt) return 0;
    const ref = pausedAt ? pausedAt.getTime() : Date.now();
    return Math.max(0, Math.floor((ref - workoutStartedAt.getTime()) / 1000));
  }

  function deriveSegmentState() {
    if (!workoutPlan || segments.length === 0) {
      return { segmentChanged: false, finished: false };
    }
    const elapsed = getElapsedSeconds();
    const total = workoutPlan.total_seconds || 0;
    totalRemaining = Math.max(0, total - elapsed);

    let idx = segments.length;
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

    // Timer center — show the full human label
    const typeLabel = {
      work: 'WORK INTERVAL',
      rest: 'REST INTERVAL',
      set_rest: 'SET REST',
    }[seg.segment_type] || (seg.segment_type || '').toUpperCase();
    els.segmentName.textContent = typeLabel;
    els.segmentTime.textContent = formatTime(segmentRemaining);
    els.totalElapsed.textContent = formatTime(getElapsedSeconds());

    // Big exercise name
    if (seg.segment_type === 'work') {
      els.currentExerciseName.textContent = seg.exercise || seg.name || '';
    } else if (seg.segment_type === 'rest') {
      els.currentExerciseName.textContent = 'Rest Interval';
    } else if (seg.segment_type === 'set_rest') {
      els.currentExerciseName.textContent = 'Set Rest';
    } else {
      els.currentExerciseName.textContent = seg.name || '';
    }

    // Set / Round badges
    if (workoutPlan) {
      if (seg.segment_type === 'work' || seg.segment_type === 'rest' || seg.segment_type === 'set_rest') {
        els.segmentSet.textContent = `${seg.set_index || 1}/${workoutPlan.sets}`;
        if (seg.segment_type === 'work' || seg.segment_type === 'rest') {
          // User-built workouts: rounds-per-section varies, so prefer the
          // segment's own section_rounds when available.
          const denom = seg.section_rounds || workoutPlan.rounds_per_set;
          els.segmentRound.textContent = `${(seg.round_index || 0) + 1}/${denom}`;
        } else {
          els.segmentRound.textContent = '—';
        }
      } else {
        els.segmentSet.textContent = '—';
        els.segmentRound.textContent = '—';
      }
    }

    els.segmentCue.textContent = seg.cue || '';
    setProgressColor(seg.segment_type);

    const fraction = segmentRemaining / seg.duration_seconds;
    updateProgressArc(fraction);

    // Highlight active + next. In windowed mode only the last completed row,
    // the active row and the next WINDOW_AHEAD rows stay visible, so the
    // current interval always sits at the top of the list.
    const windowed = windowMode === 'windowed';
    const rows = els.segmentList.querySelectorAll('.spin-segment-row');
    let activeRow = null;
    rows.forEach((row, i) => {
      const isActive = i === currentSegmentIndex;
      row.classList.toggle('active', isActive);
      row.classList.toggle('next', i === currentSegmentIndex + 1);
      row.classList.toggle('completed', i < currentSegmentIndex);
      row.classList.toggle('last-completed', i === currentSegmentIndex - 1);
      row.classList.toggle('win-hidden',
        windowed && (i < currentSegmentIndex - 1 || i > currentSegmentIndex + WINDOW_AHEAD));
      if (isActive) activeRow = row;
    });

    updateSegmentSummaries();

    if (activeRow && currentSegmentIndex !== lastScrolledIndex) {
      lastScrolledIndex = currentSegmentIndex;
      scrollActiveRowToTop(activeRow, 'smooth');
    }
  }

  // Scroll the list (never the page) so the active row moves to the top,
  // with the just-finished row left visible above it.
  function scrollActiveRowToTop(activeRow, behavior) {
    const row = activeRow || els.segmentList.querySelector('.spin-segment-row.active');
    const col = row && row.closest('.spin-ride-segments-col');
    if (!col || col.scrollHeight <= col.clientHeight + 1) return;
    const prev = row.previousElementSibling;
    const anchor = prev && prev.classList.contains('spin-segment-row') && prev.offsetParent !== null
      ? prev : row;
    const offset = anchor.getBoundingClientRect().top - col.getBoundingClientRect().top - 4;
    col.scrollBy({ top: offset, behavior });
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
    els.segmentList.classList.toggle('tk-windowed', windowMode === 'windowed');
    if (els.windowToggleWrap) {
      els.windowToggleWrap.classList.toggle('d-none', segments.length <= WINDOW_AHEAD + 2);
    }
    updateWindowToggleLabel();
    lastScrolledIndex = -1;
    updateSegmentSummaries();
  }

  function updateSegmentSummaries() {
    const completedSummaryEl = document.getElementById('completedSummary');
    const upcomingSummaryEl = document.getElementById('upcomingSummary');
    if (!completedSummaryEl || !upcomingSummaryEl) return;

    // Counts reflect what windowed mode collapses: every completed row but
    // the last one, and everything past the WINDOW_AHEAD upcoming rows.
    const completedHidden = Math.max(0, currentSegmentIndex - 1);
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
    els.segmentList.classList.toggle('tk-windowed', windowMode === 'windowed');
    updateWindowToggleLabel();
    // Re-trigger auto-scroll on the newly-laid-out list.
    lastScrolledIndex = -1;
    updateSegmentDisplay();
  }

  function populateWorkoutUI() {
    els.workoutTitle.textContent = workoutPlan.title;
    const totalMin = Math.round(workoutPlan.total_seconds / 60);
    if (workoutPlan.is_user_built) {
      // User-built tabata workouts don't have a single protocol / focus area —
      // show section + round counts instead so the meta line is still useful.
      const sections = workoutPlan.sets || 0;
      const workCount = (workoutPlan.segments || []).filter((s) => s.segment_type === 'work').length;
      const bits = [];
      if (sections > 0) bits.push(`${sections} section${sections !== 1 ? 's' : ''}`);
      if (workCount > 0) bits.push(`${workCount} work interval${workCount !== 1 ? 's' : ''}`);
      bits.push(`${totalMin} min`);
      els.workoutMeta.textContent = bits.join(' · ');
    } else {
      const focusText = (workoutPlan.focus_areas || []).map((f) => f.replace(/_/g, ' ')).join(' · ');
      const varietyText = VARIETY_LABELS[workoutPlan.exercise_variety];
      const varietyBit = varietyText && workoutPlan.exercise_variety !== 'mixed' ? ` · ${varietyText}` : '';
      els.workoutMeta.textContent = `${workoutPlan.protocol} · ${workoutPlan.sets} sets × ${workoutPlan.rounds_per_set} rounds · ${totalMin} min · ${focusText}${varietyBit}`;
    }
    renderSegmentList();
    scheduleFitToViewport();
  }

  // ── Session Persistence ─────────────────────────────────────────────────

  function saveSession(timerRunning) {
    try {
      const data = {
        workoutPlan,
        workoutStartedAt: workoutStartedAt ? workoutStartedAt.toISOString() : null,
        pausedAt: pausedAt ? pausedAt.toISOString() : null,
        timerRunning: !!timerRunning,
        savedAt: Date.now(),
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.savedAt > 2 * 60 * 60 * 1000) {
        clearSession();
        return null;
      }
      return data;
    } catch (e) { return null; }
  }

  function restoreSession(data) {
    workoutPlan = data.workoutPlan;
    segments = workoutPlan.segments || [];
    computeSegmentOffsets();

    workoutStartedAt = data.workoutStartedAt ? new Date(data.workoutStartedAt) : null;
    pausedAt = data.pausedAt ? new Date(data.pausedAt) : null;
    if (!pausedAt && workoutStartedAt && !data.timerRunning && data.savedAt) {
      pausedAt = new Date(data.savedAt);
    }

    if (workoutStartedAt) {
      const { finished } = deriveSegmentState();
      if (finished) {
        populateWorkoutUI();
        finishWorkout();
        return;
      }
    } else {
      currentSegmentIndex = 0;
      segmentRemaining = segments[0] ? segments[0].duration_seconds : 0;
      totalRemaining = workoutPlan.total_seconds || 0;
    }

    populateWorkoutUI();
    updateSegmentDisplay();

    if (workoutStartedAt && !pausedAt) {
      els.startBtn.classList.add('d-none');
      els.pauseBtn.classList.remove('d-none');
      els.resumeBtn.classList.add('d-none');
      els.endBtn.classList.remove('d-none');
      startTimer();
      requestWakeLock();
    } else if (workoutStartedAt && pausedAt) {
      els.startBtn.classList.add('d-none');
      els.pauseBtn.classList.add('d-none');
      els.resumeBtn.classList.remove('d-none');
      els.endBtn.classList.remove('d-none');
    } else {
      els.startBtn.classList.remove('d-none');
      els.pauseBtn.classList.add('d-none');
      els.resumeBtn.classList.add('d-none');
      els.endBtn.classList.add('d-none');
    }

    showState('workoutState');
  }

  // ── Timer ──────────────────────────────────────────────────────────────

  function tick() {
    const { segmentChanged, finished } = deriveSegmentState();

    if (finished) {
      updateSegmentDisplay();
      finishWorkout();
      return;
    }

    if (segmentChanged && currentSegmentIndex > 0) {
      // Transition cue: different pitch for work vs rest
      const seg = segments[currentSegmentIndex];
      if (seg && seg.segment_type === 'work') {
        playBeep(1100, 0.2);
        vibrate(250);
      } else {
        playBeep(660, 0.15);
        vibrate(120);
      }
    }

    updateSegmentDisplay();
    saveSession(true);
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible' && timerInterval) {
      const { finished } = deriveSegmentState();
      if (finished) {
        updateSegmentDisplay();
        finishWorkout();
        return;
      }
      updateSegmentDisplay();
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

  // ── Workout Controls ───────────────────────────────────────────────────

  function onStart() {
    workoutStartedAt = new Date();
    pausedAt = null;
    deriveSegmentState();
    updateSegmentDisplay();
    startTimer();
    requestWakeLock();

    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    if (els.audioHint) els.audioHint.hidden = true;

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
    if (pausedAt && workoutStartedAt) {
      const pauseDurationMs = Date.now() - pausedAt.getTime();
      workoutStartedAt = new Date(workoutStartedAt.getTime() + pauseDurationMs);
    }
    pausedAt = null;
    deriveSegmentState();
    updateSegmentDisplay();
    startTimer();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    els.resumeBtn.classList.add('d-none');
    els.pauseBtn.classList.remove('d-none');
    saveSession(true);
  }

  function onEnd() {
    finishWorkout();
  }

  // ── Finish ─────────────────────────────────────────────────────────────

  async function finishWorkout() {
    stopTimer();
    releaseWakeLock();
    clearSession();

    const actualSeconds = getElapsedSeconds();
    const actualMinutes = Math.round(actualSeconds / 60);

    // Count completed Work Intervals (Rounds completed)
    const completedRounds = segments
      .slice(0, currentSegmentIndex)
      .filter((s) => s.segment_type === 'work').length;
    const totalRounds = segments.filter((s) => s.segment_type === 'work').length;

    const summaryText = currentSegmentIndex >= segments.length
      ? `${workoutPlan.title} — ${actualMinutes} min, all ${totalRounds} rounds completed`
      : `${workoutPlan.title} — ${actualMinutes} min, ${completedRounds}/${totalRounds} rounds`;
    els.finishedSummary.textContent = summaryText;

    showState('finishedState');

    const isUserBuilt = !!workoutPlan.is_user_built;
    const notesLines = isUserBuilt
      ? [
          `Tabata: ${workoutPlan.title}`,
          `Sections: ${workoutPlan.sets}`,
          `Rounds completed: ${completedRounds}/${totalRounds}`,
        ]
      : [
          `Tabata Kettlebell: ${workoutPlan.title}`,
          `Protocol: ${workoutPlan.protocol}`,
          `Focus: ${(workoutPlan.focus_areas || []).join(', ')}`,
          `Sets: ${workoutPlan.sets} × ${workoutPlan.rounds_per_set} rounds`,
          `Rounds completed: ${completedRounds}/${totalRounds}`,
        ];
    const notes = notesLines.join('\n').substring(0, 500);
    const sessionDate = workoutStartedAt ? workoutStartedAt.toISOString() : new Date().toISOString();
    const plan = workoutPlan;

    const saveCardio = async (durationMinutes, calories) => {
      if (!window.universalLogService || !window.universalLogService.saveCardio) {
        throw new Error('log service not available');
      }
      await window.universalLogService.saveCardio({
        activity_type: isUserBuilt ? 'workout' : 'kettlebell',
        activity_name: plan.title,
        duration_minutes: durationMinutes || 1,
        calories: calories || null,
        notes,
        sessionDate,
      });
    };

    // Without the unified offcanvas factory, fall back to saving straight
    // away so the workout is never silently lost.
    const factory = window.UnifiedOffcanvasFactory;
    if (!factory || !factory.createCompleteWorkout) {
      try {
        await saveCardio(actualMinutes, plan.estimated_calories);
        els.finishedSaveStatus.textContent = 'Workout saved to your log.';
      } catch (err) {
        console.error('Failed to save tabata kettlebell workout:', err);
        els.finishedSaveStatus.textContent = `Save failed: ${err.message}`;
      }
      return;
    }

    // Same "Session Complete" offcanvas as spin rides and workouts, so the
    // user can confirm duration and calories before the activity is logged.
    els.finishedSaveStatus.textContent = 'Confirm below to save this workout to your log.';

    const offcanvas = factory.createCompleteWorkout({
      workoutName: plan.title,
      minutes: actualMinutes,
      totalExercises: totalRounds,
      isBuildMode: false,
    }, async (durationMinutes, _templateOpts, sessionCalories) => {
      try {
        await saveCardio(durationMinutes || actualMinutes, sessionCalories ?? plan.estimated_calories);
        els.finishedSaveStatus.textContent = 'Workout saved to your log.';
      } catch (err) {
        console.error('Failed to save tabata kettlebell workout:', err);
        els.finishedSaveStatus.textContent = `Save failed: ${err.message}`;
        throw err;
      }
    });

    // Prefill calories with the estimate so users can accept/adjust it.
    setTimeout(() => {
      const caloriesInput = document.getElementById('sessionCaloriesInput');
      if (caloriesInput && plan.estimated_calories) {
        caloriesInput.value = plan.estimated_calories;
        const unitLabel = caloriesInput.nextElementSibling;
        if (unitLabel && unitLabel.tagName === 'SPAN') {
          unitLabel.textContent = 'cal (est.)';
        }
        const statRow = caloriesInput.closest('.session-stat');
        if (statRow) {
          statRow.title = 'Estimated calories — tap to adjust';
        }
      }
    }, 50);

    return offcanvas;
  }

  // ── Generate ───────────────────────────────────────────────────────────

  async function generateWorkout() {
    showState('generatingState');

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (window.authService && window.authService.currentUser) {
        const token = await window.authService.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }

      const body = {
        protocol: selectedProtocol,
        focus_areas: Array.from(selectedFocus),
        sets: selectedSets,
        rounds_per_set: selectedRoundsPerSet,
        include_exercises: getIncludedExerciseNames(),
        exclude_exercises: getExcludedExerciseNames(),
        exercise_variety: selectedVariety,
        notes: getNotes(),
      };

      const response = await fetch('/api/v3/tabata-kettlebell/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Generation failed' }));
        throw new Error(err.detail || `Server error: ${response.status}`);
      }

      workoutPlan = await response.json();
      segments = workoutPlan.segments || [];

      if (segments.length === 0) throw new Error('Empty workout plan received');

      computeSegmentOffsets();
      currentSegmentIndex = 0;
      segmentRemaining = segments[0].duration_seconds;
      totalRemaining = workoutPlan.total_seconds;
      workoutStartedAt = null;
      pausedAt = null;

      populateWorkoutUI();
      updateSegmentDisplay();

      els.startBtn.classList.remove('d-none');
      els.pauseBtn.classList.add('d-none');
      els.resumeBtn.classList.add('d-none');
      els.endBtn.classList.add('d-none');

      showState('workoutState');
      saveSession(false);
    } catch (err) {
      console.error('Tabata kettlebell generation failed:', err);
      els.errorMessage.textContent = err.message;
      showState('errorState');
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────

  function resetToSelection() {
    stopTimer();
    releaseWakeLock();
    clearSession();
    // For a user-built workout, "New Workout" should take the user back to
    // their library rather than dropping into the AI protocol picker they
    // never used — that picker isn't the entrypoint for this flow.
    const wasUserBuilt = !!(workoutPlan && workoutPlan.is_user_built);
    workoutPlan = null;
    segments = [];
    segmentOffsets = [];
    currentSegmentIndex = 0;
    lastScrolledIndex = -1;
    segmentRemaining = 0;
    totalRemaining = 0;
    workoutStartedAt = null;
    pausedAt = null;
    if (wasUserBuilt) {
      window.location.href = '/workout-database.html';
      return;
    }
    showState('selectState');
  }

  // ── Input handling / setup screen ──────────────────────────────────────

  function refreshGenerateButtonState() {
    const ok = !!selectedProtocol && selectedFocus.size > 0 && selectedSets >= MIN_SETS;
    els.generateBtn.disabled = !ok;
    // Update the CTA hint line under the Generate button with what's missing
    if (els.ctaHint) {
      if (ok) {
        els.ctaHint.textContent = '';
      } else if (selectedFocus.size === 0) {
        els.ctaHint.textContent = 'Pick a focus to continue';
      } else {
        els.ctaHint.textContent = '';
      }
    }
  }

  function updateTotalTimeHelper() {
    const total = computeTotalSeconds(selectedProtocol, selectedSets, selectedRoundsPerSet);
    const totalMin = Math.floor(total / 60);
    const totalSec = total % 60;
    const { work, rest } = protocolSeconds(selectedProtocol);

    if (els.totalValue) {
      els.totalValue.textContent = totalSec === 0
        ? `${totalMin} min`
        : `${totalMin}m ${String(totalSec).padStart(2, '0')}s`;
    }
    if (els.totalSub) {
      els.totalSub.textContent =
        `${selectedSets} set${selectedSets !== 1 ? 's' : ''} × ${selectedRoundsPerSet} rounds · ${work}s / ${rest}s · ${VARIETY_LABELS[selectedVariety].toLowerCase()} · no warmup`;
    }
  }

  function setProtocol(value) {
    selectedProtocol = value === '40/20' ? '40/20' : '20/10';
    els.protocolButtons.querySelectorAll('.tk-protocol-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.value === selectedProtocol);
    });
    try { localStorage.setItem(PROTOCOL_KEY, selectedProtocol); } catch (e) { /* ignore */ }
    // Re-align sets to preset length
    selectedSets = setsForPresetLength(selectedProtocol, selectedRoundsPerSet, selectedLength);
    updateSetsDisplay();
    updateTotalTimeHelper();
  }

  function toggleFocus(value) {
    if (selectedFocus.has(value)) selectedFocus.delete(value);
    else selectedFocus.add(value);
    els.focusButtons.querySelectorAll('.tk-focus-btn').forEach((b) => {
      b.classList.toggle('active', selectedFocus.has(b.dataset.value));
    });
    try {
      localStorage.setItem(FOCUS_KEY, JSON.stringify(Array.from(selectedFocus)));
    } catch (e) { /* ignore */ }
    refreshGenerateButtonState();
  }

  function setVariety(value) {
    selectedVariety = VARIETY_LABELS[value] ? value : 'mixed';
    if (els.varietyButtons) {
      els.varietyButtons.querySelectorAll('.tk-variety-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.value === selectedVariety);
      });
    }
    try { localStorage.setItem(VARIETY_KEY, selectedVariety); } catch (e) { /* ignore */ }
    updateTotalTimeHelper();
  }

  function getNotes() {
    return els.notesInput ? els.notesInput.value.trim().slice(0, NOTES_MAX) : '';
  }

  function updateNotesCount() {
    if (els.notesCount && els.notesInput) {
      els.notesCount.textContent = `${els.notesInput.value.length}/${NOTES_MAX}`;
    }
  }

  function setLength(minutes) {
    selectedLength = minutes;
    els.lengthButtons.querySelectorAll('.tk-length-btn').forEach((b) => {
      b.classList.toggle('active', parseInt(b.dataset.minutes, 10) === minutes);
    });
    selectedSets = setsForPresetLength(selectedProtocol, selectedRoundsPerSet, minutes);
    try { localStorage.setItem(LENGTH_KEY, String(minutes)); } catch (e) { /* ignore */ }
    updateSetsDisplay();
    updateTotalTimeHelper();
  }

  function adjustSets(delta) {
    const next = Math.max(MIN_SETS, Math.min(MAX_SETS, selectedSets + delta));
    if (next === selectedSets) return;
    selectedSets = next;
    // Manual set change → deselect length preset
    els.lengthButtons.querySelectorAll('.tk-length-btn').forEach((b) => b.classList.remove('active'));
    try { localStorage.setItem(SETS_KEY, String(selectedSets)); } catch (e) { /* ignore */ }
    updateSetsDisplay();
    updateTotalTimeHelper();
  }

  function updateSetsDisplay() {
    els.setsDisplay.textContent = String(selectedSets);
    els.setsDownBtn.disabled = selectedSets <= MIN_SETS;
    els.setsUpBtn.disabled = selectedSets >= MAX_SETS;
  }

  // ── Fine-tune exercises ────────────────────────────────────────────────

  function renderExerciseChips() {
    if (!els.exerciseGrid) return;
    els.exerciseGrid.innerHTML = EXERCISE_CHIPS.map((chip) => {
      const state = exercisePrefs[chip.id]; // 'include' | 'exclude' | undefined
      const stateClass = state ? ` ${state}` : '';
      const iconName = state === 'exclude' ? 'bx-minus' : 'bx-plus';
      return `<button type="button" class="tk-exercise-chip${stateClass}" data-chip="${chip.id}">
        <i class="bx ${iconName} tk-chip-icon"></i>${chip.label}
      </button>`;
    }).join('');
  }

  function cycleExerciseState(chipId) {
    const current = exercisePrefs[chipId];
    if (!current) {
      exercisePrefs[chipId] = 'include';
    } else if (current === 'include') {
      exercisePrefs[chipId] = 'exclude';
    } else {
      delete exercisePrefs[chipId];
    }
    saveExercisePrefs();
    renderExerciseChips();
    updateFinetuneSummary();
  }

  function resetExercisePrefs() {
    exercisePrefs = {};
    saveExercisePrefs();
    renderExerciseChips();
    updateFinetuneSummary();
  }

  function saveExercisePrefs() {
    const includes = [];
    const excludes = [];
    for (const [id, state] of Object.entries(exercisePrefs)) {
      if (state === 'include') includes.push(id);
      else if (state === 'exclude') excludes.push(id);
    }
    try {
      localStorage.setItem(INCLUDE_EX_KEY, JSON.stringify(includes));
      localStorage.setItem(EXCLUDE_EX_KEY, JSON.stringify(excludes));
    } catch (e) { /* ignore */ }
  }

  function loadExercisePrefs() {
    exercisePrefs = {};
    try {
      const inc = JSON.parse(localStorage.getItem(INCLUDE_EX_KEY) || '[]');
      const exc = JSON.parse(localStorage.getItem(EXCLUDE_EX_KEY) || '[]');
      if (Array.isArray(inc)) inc.forEach((id) => { if (EXERCISE_BY_ID[id]) exercisePrefs[id] = 'include'; });
      if (Array.isArray(exc)) exc.forEach((id) => { if (EXERCISE_BY_ID[id]) exercisePrefs[id] = 'exclude'; });
    } catch (e) { /* ignore */ }
  }

  function getIncludedExerciseNames() {
    return Object.entries(exercisePrefs)
      .filter(([, state]) => state === 'include')
      .map(([id]) => EXERCISE_BY_ID[id])
      .filter(Boolean);
  }

  function getExcludedExerciseNames() {
    return Object.entries(exercisePrefs)
      .filter(([, state]) => state === 'exclude')
      .map(([id]) => EXERCISE_BY_ID[id])
      .filter(Boolean);
  }

  function updateFinetuneSummary() {
    if (!els.finetuneSummary) return;
    const inc = getIncludedExerciseNames().length;
    const exc = getExcludedExerciseNames().length;
    const parts = [];
    if (inc) parts.push(`${inc} include`);
    if (exc) parts.push(`${exc} exclude`);
    els.finetuneSummary.textContent = parts.join(' · ');
    if (els.finetuneResetBtn) {
      els.finetuneResetBtn.classList.toggle('d-none', inc === 0 && exc === 0);
    }
  }

  function toggleFinetunePanel() {
    if (!els.finetuneToggleBtn || !els.finetunePanel) return;
    const expanded = els.finetuneToggleBtn.getAttribute('aria-expanded') === 'true';
    const next = !expanded;
    els.finetuneToggleBtn.setAttribute('aria-expanded', String(next));
    els.finetunePanel.classList.toggle('d-none', !next);
  }

  function setRoundsPerSet(n) {
    selectedRoundsPerSet = n;
    els.roundsPerSetButtons.querySelectorAll('.tk-rounds-btn').forEach((b) => {
      b.classList.toggle('active', parseInt(b.dataset.value, 10) === n);
    });
    try { localStorage.setItem(ROUNDS_PER_SET_KEY, String(n)); } catch (e) { /* ignore */ }
    // Re-align sets to preset length if a preset is active
    const activePreset = els.lengthButtons.querySelector('.tk-length-btn.active');
    if (activePreset) {
      selectedSets = setsForPresetLength(selectedProtocol, n, parseInt(activePreset.dataset.minutes, 10));
      updateSetsDisplay();
    }
    updateTotalTimeHelper();
  }

  // ── Events ─────────────────────────────────────────────────────────────

  function bindEvents() {
    els.protocolButtons.addEventListener('click', (e) => {
      const btn = e.target.closest('.tk-protocol-btn');
      if (!btn) return;
      setProtocol(btn.dataset.value);
      refreshGenerateButtonState();
    });

    els.focusButtons.addEventListener('click', (e) => {
      const btn = e.target.closest('.tk-focus-btn');
      if (!btn) return;
      toggleFocus(btn.dataset.value);
    });

    els.lengthButtons.addEventListener('click', (e) => {
      const btn = e.target.closest('.tk-length-btn');
      if (!btn) return;
      setLength(parseInt(btn.dataset.minutes, 10));
      refreshGenerateButtonState();
    });

    els.setsDownBtn.addEventListener('click', () => adjustSets(-1));
    els.setsUpBtn.addEventListener('click', () => adjustSets(1));

    els.roundsPerSetButtons.addEventListener('click', (e) => {
      const btn = e.target.closest('.tk-rounds-btn');
      if (!btn) return;
      const n = parseInt(btn.dataset.value, 10);
      if (!Number.isNaN(n)) setRoundsPerSet(n);
    });

    if (els.varietyButtons) {
      els.varietyButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('.tk-variety-btn');
        if (!btn) return;
        setVariety(btn.dataset.value);
      });
    }

    if (els.notesInput) {
      els.notesInput.addEventListener('input', () => {
        updateNotesCount();
        try { localStorage.setItem(NOTES_KEY, els.notesInput.value.slice(0, NOTES_MAX)); } catch (e) { /* ignore */ }
      });
    }

    // Fine-tune panel toggle + chip click + reset
    if (els.finetuneToggleBtn) {
      els.finetuneToggleBtn.addEventListener('click', toggleFinetunePanel);
    }
    if (els.exerciseGrid) {
      els.exerciseGrid.addEventListener('click', (e) => {
        const chip = e.target.closest('.tk-exercise-chip');
        if (!chip) return;
        cycleExerciseState(chip.dataset.chip);
      });
    }
    if (els.finetuneResetBtn) {
      els.finetuneResetBtn.addEventListener('click', resetExercisePrefs);
    }

    els.generateBtn.addEventListener('click', () => {
      if (!els.generateBtn.disabled) generateWorkout();
    });

    els.startBtn.addEventListener('click', onStart);
    els.pauseBtn.addEventListener('click', onPause);
    els.resumeBtn.addEventListener('click', onResume);
    els.endBtn.addEventListener('click', onEnd);

    els.newWorkoutBtn.addEventListener('click', resetToSelection);
    els.finishedNewWorkoutBtn.addEventListener('click', resetToSelection);
    els.errorRetryBtn.addEventListener('click', resetToSelection);

    // Toggle between focused (windowed) and full segment list views
    if (els.windowToggleBtn) {
      els.windowToggleBtn.addEventListener('click', () => {
        setWindowMode(windowMode === 'windowed' ? 'full' : 'windowed');
      });
    }

    // Keep the workout screen sized to the viewport (rotation, browser
    // chrome showing/hiding, banners dismissed above the content).
    window.addEventListener('resize', scheduleFitToViewport);
    window.addEventListener('orientationchange', scheduleFitToViewport);
    if (window.ResizeObserver) new ResizeObserver(scheduleFitToViewport).observe(document.body);

    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  function restorePreferences() {
    try {
      const p = localStorage.getItem(PROTOCOL_KEY);
      if (p === '20/10' || p === '40/20') selectedProtocol = p;
    } catch (e) { /* ignore */ }

    try {
      const raw = localStorage.getItem(FOCUS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) selectedFocus = new Set(arr);
      }
    } catch (e) { /* ignore */ }

    try {
      const l = parseInt(localStorage.getItem(LENGTH_KEY), 10);
      if (!Number.isNaN(l) && l > 0) selectedLength = l;
    } catch (e) { /* ignore */ }

    try {
      const n = parseInt(localStorage.getItem(ROUNDS_PER_SET_KEY), 10);
      if (!Number.isNaN(n) && n >= 4 && n <= 12) selectedRoundsPerSet = n;
    } catch (e) { /* ignore */ }

    try {
      const v = localStorage.getItem(VARIETY_KEY);
      if (v && VARIETY_LABELS[v]) selectedVariety = v;
    } catch (e) { /* ignore */ }

    try {
      const savedNotes = localStorage.getItem(NOTES_KEY);
      if (savedNotes && els.notesInput) els.notesInput.value = savedNotes.slice(0, NOTES_MAX);
    } catch (e) { /* ignore */ }
    updateNotesCount();

    // Apply to UI
    els.protocolButtons.querySelectorAll('.tk-protocol-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.value === selectedProtocol);
    });
    els.focusButtons.querySelectorAll('.tk-focus-btn').forEach((b) => {
      b.classList.toggle('active', selectedFocus.has(b.dataset.value));
    });
    els.lengthButtons.querySelectorAll('.tk-length-btn').forEach((b) => {
      b.classList.toggle('active', parseInt(b.dataset.minutes, 10) === selectedLength);
    });
    els.roundsPerSetButtons.querySelectorAll('.tk-rounds-btn').forEach((b) => {
      b.classList.toggle('active', parseInt(b.dataset.value, 10) === selectedRoundsPerSet);
    });
    if (els.varietyButtons) {
      els.varietyButtons.querySelectorAll('.tk-variety-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.value === selectedVariety);
      });
    }

    selectedSets = setsForPresetLength(selectedProtocol, selectedRoundsPerSet, selectedLength);
    updateSetsDisplay();
    updateTotalTimeHelper();

    // Fine-tune exercise preferences (persisted across sessions)
    loadExercisePrefs();
    renderExerciseChips();
    updateFinetuneSummary();

    refreshGenerateButtonState();
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

  /**
   * Load a saved user-built tabata workout, expand it into segments,
   * and drop straight into the workoutState (skipping the protocol picker).
   */
  async function loadUserBuiltWorkout(workoutId) {
    if (!window.TabataSegmentExpander) {
      els.errorMessage.textContent = 'Tabata runtime missing — please refresh.';
      showState('errorState');
      return;
    }
    showState('generatingState');
    try {
      const headers = {};
      if (window.authService && window.authService.currentUser) {
        const token = await window.authService.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/v3/firebase/workouts/${encodeURIComponent(workoutId)}`, { headers });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Workout not found' }));
        throw new Error(err.detail || `Server error: ${response.status}`);
      }
      const workout = await response.json();
      if (!workout || !Array.isArray(workout.sections)) {
        throw new Error('This workout has no sections to run.');
      }

      const expanded = window.TabataSegmentExpander.expandWorkoutToSegments(workout);
      if (!expanded.segments || expanded.segments.length === 0) {
        throw new Error('This workout has no tabata sections with exercises.');
      }

      workoutPlan = expanded;
      segments = expanded.segments;
      computeSegmentOffsets();
      currentSegmentIndex = 0;
      segmentRemaining = segments[0].duration_seconds;
      totalRemaining = workoutPlan.total_seconds;
      workoutStartedAt = null;
      pausedAt = null;

      populateWorkoutUI();
      updateSegmentDisplay();

      els.startBtn.classList.remove('d-none');
      els.pauseBtn.classList.add('d-none');
      els.resumeBtn.classList.add('d-none');
      els.endBtn.classList.add('d-none');

      if (els.audioHint) els.audioHint.hidden = false;

      showState('workoutState');
      saveSession(false);
    } catch (err) {
      console.error('Failed to load user-built tabata workout:', err);
      els.errorMessage.textContent = err.message || 'Could not load this workout.';
      showState('errorState');
    }
  }

  async function init() {
    cacheDom();
    bindEvents();
    restorePreferences();

    const isAuth = await waitForAuth();
    if (!isAuth) {
      showState('authRequired');
      return;
    }

    // If the URL points us at a saved tabata workout, skip the AI flow entirely.
    const urlWorkoutId = new URLSearchParams(window.location.search).get('workout_id');
    if (urlWorkoutId) {
      clearSession(); // don't resurrect an AI session over a saved workout
      await loadUserBuiltWorkout(urlWorkoutId);
      return;
    }

    const saved = loadSession();
    if (saved && saved.workoutPlan) {
      restoreSession(saved);
    } else {
      showState('selectState');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
