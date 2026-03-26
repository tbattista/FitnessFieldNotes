// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/**
 * Source-file-based tests for workout mode UI fixes.
 * These verify the HTML structure, CSS rules, and JS logic by reading
 * the actual source files — no running server required.
 */
test.describe('Workout Mode UI Fixes (source verification)', () => {

  let workoutModeHtml;
  let bottomBarCss;
  let globalRestTimerJs;
  let timerManagerJs;
  let exerciseCardRendererJs;
  let exerciseOpsManagerJs;

  test.beforeAll(() => {
    workoutModeHtml = fs.readFileSync(path.join(ROOT, 'frontend/workout-mode.html'), 'utf-8');
    bottomBarCss = fs.readFileSync(path.join(ROOT, 'frontend/assets/css/workout-mode/_bottom-bar.css'), 'utf-8');
    globalRestTimerJs = fs.readFileSync(path.join(ROOT, 'frontend/assets/js/components/global-rest-timer.js'), 'utf-8');
    timerManagerJs = fs.readFileSync(path.join(ROOT, 'frontend/assets/js/services/workout-timer-manager.js'), 'utf-8');
    exerciseCardRendererJs = fs.readFileSync(path.join(ROOT, 'frontend/assets/js/components/exercise-card-renderer.js'), 'utf-8');
    exerciseOpsManagerJs = fs.readFileSync(path.join(ROOT, 'frontend/assets/js/services/workout-exercise-operations-manager.js'), 'utf-8');
  });

  test('inline Add Exercise button is removed from workout mode HTML', () => {
    expect(workoutModeHtml).not.toContain('id="workoutModeAddButtons"');
    expect(workoutModeHtml).not.toContain('id="inlineAddExerciseBtn"');
  });

  test('bottom bar has Add dropdown with Exercise option', () => {
    expect(workoutModeHtml).toContain('id="workoutModeBottomBar"');
    expect(workoutModeHtml).toContain('data-action="add-exercise"');
  });

  test('exercise cards do not render inline rest timers', () => {
    // _renderInlineRestTimer should only appear once (its definition), never called
    const occurrences = exerciseCardRendererJs.match(/_renderInlineRestTimer/g) || [];
    expect(occurrences.length).toBeLessThanOrEqual(1); // only the method definition
    // Notes section uses full-width layout (no timer column alongside notes)
    expect(exerciseCardRendererJs).toContain('workout-unified-notes');
  });

  test('rest timer row exists inside the bottom bar HTML', () => {
    // globalRestTimerButton should be inside workoutModeBottomBar
    const bottomBarStart = workoutModeHtml.indexOf('id="workoutModeBottomBar"');
    const timerRowPos = workoutModeHtml.indexOf('id="globalRestTimerButton"');
    expect(bottomBarStart).toBeGreaterThan(-1);
    expect(timerRowPos).toBeGreaterThan(-1);
    // Timer row should appear after the bottom bar opening tag
    expect(timerRowPos).toBeGreaterThan(bottomBarStart);

    // Timer row should have wm-rest-timer-section class
    expect(workoutModeHtml).toContain('wm-rest-timer-section');
  });

  test('GlobalRestTimer class is exported on window', () => {
    expect(globalRestTimerJs).toContain('window.GlobalRestTimer = GlobalRestTimer');
  });

  test('timer manager creates GlobalRestTimer instance', () => {
    // Should create instance if class exists but instance doesn't
    expect(timerManagerJs).toContain('new window.GlobalRestTimer()');
    expect(timerManagerJs).toContain('window.globalRestTimer = new window.GlobalRestTimer()');
  });

  test('bottom bar prevents overscroll while page allows native bounce', () => {
    // Bottom bar itself should prevent overscroll
    expect(bottomBarCss).toContain('overscroll-behavior: none');
    // Page should enable native momentum scrolling for app-like bounce
    expect(bottomBarCss).toContain('-webkit-overflow-scrolling: touch');
  });

  test('exercise cards container has sufficient bottom padding in CSS', () => {
    // Check for padding-bottom on #exerciseCardsContainer
    const paddingMatch = bottomBarCss.match(/#exerciseCardsContainer\s*\{[^}]*padding-bottom:\s*(\d+)px/);
    expect(paddingMatch).not.toBeNull();
    const paddingValue = parseInt(paddingMatch[1]);
    expect(paddingValue).toBeGreaterThanOrEqual(100);
  });

  test('rest timer default is enabled (localStorage defaults to true)', () => {
    // GlobalRestTimer constructor should default enabled to true when localStorage is empty
    expect(globalRestTimerJs).toContain("localStorage.getItem('workoutRestTimerEnabled') !== 'false'");
  });

  test('exercise search offcanvas receives initialQuery parameter', () => {
    // The onSearchClick callback should accept and forward initialQuery
    expect(exerciseOpsManagerJs).toContain('initialQuery');
    // showExerciseSearchOffcanvas should accept initialQuery
    expect(exerciseOpsManagerJs).toMatch(/showExerciseSearchOffcanvas\s*\([^)]*initialQuery/);
  });

  test('iOS momentum scroll is enabled for app-like bounce', () => {
    expect(bottomBarCss).toContain('-webkit-overflow-scrolling: touch');
  });

  test('bottom bar button order is Add, Finish, More', () => {
    const addPos = workoutModeHtml.indexOf('data-action="add-exercise"');
    const finishPos = workoutModeHtml.indexOf('data-action="end"');
    const morePos = workoutModeHtml.indexOf('data-action="options"');
    expect(addPos).toBeGreaterThan(-1);
    expect(finishPos).toBeGreaterThan(-1);
    expect(morePos).toBeGreaterThan(-1);
    // Order: Add < Finish < More
    expect(finishPos).toBeGreaterThan(addPos);
    expect(morePos).toBeGreaterThan(finishPos);
  });

  test('cancel workout redirects to workout-database with pending toast', () => {
    const controllerJs = fs.readFileSync(
      path.join(ROOT, 'frontend/assets/js/controllers/workout-mode-controller.js'), 'utf-8'
    );
    // Should set ffn_pending_toast in sessionStorage
    expect(controllerJs).toContain('ffn_pending_toast');
    expect(controllerJs).toContain("window.location.href = 'workout-database.html'");
  });

  test('syncWithCard updates remainingSeconds in ready state', () => {
    // syncWithCard should update remainingSeconds when not counting/paused
    expect(globalRestTimerJs).toContain('this.remainingSeconds = restSeconds');
  });

  test('showFloatingControls renders timer when bottom bar becomes visible', () => {
    const lifecycleJs = fs.readFileSync(
      path.join(ROOT, 'frontend/assets/js/services/workout-lifecycle-manager.js'), 'utf-8'
    );
    expect(lifecycleJs).toContain('globalRestTimer.updateVisibility()');
    expect(lifecycleJs).toContain('globalRestTimer.render()');
  });

  test('syncTimerWithCard converts rest to string before parsing', () => {
    const cardManagerJs = fs.readFileSync(
      path.join(ROOT, 'frontend/assets/js/components/exercise-card-manager.js'), 'utf-8'
    );
    expect(cardManagerJs).toContain('String(exerciseGroup.rest)');
  });

  test('parseRestTime handles number inputs directly', () => {
    const workoutUtilsJs = fs.readFileSync(
      path.join(ROOT, 'frontend/assets/js/utils/workout-utils.js'), 'utf-8'
    );
    expect(workoutUtilsJs).toContain("typeof restStr === 'number'");
  });

});
