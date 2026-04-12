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

      protocolButtons: $('protocolButtons'),
      focusButtons: $('focusButtons'),
      lengthButtons: $('lengthButtons'),
      setsDisplay: $('setsDisplay'),
      setsDownBtn: $('setsDownBtn'),
      setsUpBtn: $('setsUpBtn'),
      roundsPerSetSelect: $('roundsPerSetSelect'),
      totalTimeHelper: $('totalTimeHelper'),
      generateBtn: $('generateBtn'),

      totalValue: document.querySelector('#totalTimeHelper .tk-total-value'),
      totalSub: document.querySelector('#totalTimeHelper .tk-total-sub'),
      ctaHint: document.querySelector('.tk-cta-hint'),

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
          els.segmentRound.textContent = `${(seg.round_index || 0) + 1}/${workoutPlan.rounds_per_set}`;
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

  function populateWorkoutUI() {
    els.workoutTitle.textContent = workoutPlan.title;
    const focusText = (workoutPlan.focus_areas || []).map((f) => f.replace(/_/g, ' ')).join(' · ');
    const totalMin = Math.round(workoutPlan.total_seconds / 60);
    els.workoutMeta.textContent = `${workoutPlan.protocol} · ${workoutPlan.sets} sets × ${workoutPlan.rounds_per_set} rounds · ${totalMin} min · ${focusText}`;
    renderSegmentList();
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

    try {
      if (window.universalLogService && window.universalLogService.saveCardio) {
        const notesLines = [
          `Tabata Kettlebell: ${workoutPlan.title}`,
          `Protocol: ${workoutPlan.protocol}`,
          `Focus: ${(workoutPlan.focus_areas || []).join(', ')}`,
          `Sets: ${workoutPlan.sets} × ${workoutPlan.rounds_per_set} rounds`,
          `Rounds completed: ${completedRounds}/${totalRounds}`,
        ];

        await window.universalLogService.saveCardio({
          activity_type: 'kettlebell',
          activity_name: workoutPlan.title,
          duration_minutes: actualMinutes || 1,
          calories: workoutPlan.estimated_calories || null,
          notes: notesLines.join('\n').substring(0, 500),
          sessionDate: workoutStartedAt ? workoutStartedAt.toISOString() : new Date().toISOString(),
        });

        els.finishedSaveStatus.textContent = 'Workout saved to your log.';
      } else {
        els.finishedSaveStatus.textContent = 'Could not save — log service not available.';
      }
    } catch (err) {
      console.error('Failed to save tabata kettlebell workout:', err);
      els.finishedSaveStatus.textContent = `Save failed: ${err.message}`;
    }
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
    workoutPlan = null;
    segments = [];
    segmentOffsets = [];
    currentSegmentIndex = 0;
    segmentRemaining = 0;
    totalRemaining = 0;
    workoutStartedAt = null;
    pausedAt = null;
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
        `${selectedSets} set${selectedSets !== 1 ? 's' : ''} × ${selectedRoundsPerSet} rounds · ${work}s / ${rest}s · no warmup`;
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

  function setRoundsPerSet(n) {
    selectedRoundsPerSet = n;
    els.roundsPerSetSelect.value = String(n);
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

    els.roundsPerSetSelect.addEventListener('change', () => {
      const n = parseInt(els.roundsPerSetSelect.value, 10);
      if (!Number.isNaN(n)) setRoundsPerSet(n);
    });

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
    els.roundsPerSetSelect.value = String(selectedRoundsPerSet);

    selectedSets = setsForPresetLength(selectedProtocol, selectedRoundsPerSet, selectedLength);
    updateSetsDisplay();
    updateTotalTimeHelper();
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

  async function init() {
    cacheDom();
    bindEvents();
    restorePreferences();

    const isAuth = await waitForAuth();
    if (!isAuth) {
      showState('authRequired');
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
