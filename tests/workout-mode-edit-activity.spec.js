// @ts-check
const { test, expect } = require('playwright/test');

const BASE = 'http://localhost:8001';

/**
 * Verifies the "Edit activity" actions in workout mode route to the
 * shared cardio editor offcanvas (same as workout builder), instead of
 * dispatching the inline-editor event.
 */
test('workout mode cardio pen icon and kebab menu route to cardio editor offcanvas', async ({ request }) => {
  const res = await request.get(`${BASE}/static/assets/js/services/workout-render-manager.js`);
  expect(res.ok()).toBeTruthy();
  const src = await res.text();

  // Pen icon (workout-edit-btn) must call handleEditActivity
  const penMatch = src.match(/class="workout-edit-btn[^"]*"\s*\n?\s*onclick="([^"]+)"/);
  expect(penMatch, 'workout-edit-btn onclick not found').not.toBeNull();
  expect(penMatch[1]).toContain('handleEditActivity');
  expect(penMatch[1]).not.toContain('enterActivityEditMode');

  // Kebab menu "Edit activity" item must call handleEditActivity
  const kebabRegion = src.split('Edit (uncomplete first)')[0];
  expect(kebabRegion).toContain('handleEditActivity');
  // The render-manager file should no longer dispatch the old inline-edit event
  expect(src).not.toContain('enterActivityEditMode');
});
