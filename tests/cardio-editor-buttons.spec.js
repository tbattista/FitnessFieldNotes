// @ts-check
const { test, expect } = require('playwright/test');

const BASE = 'http://localhost:8001';

/**
 * Verifies the cardio Edit Activity offcanvas footer buttons:
 *  - stack full-width on phones instead of being cramped side-by-side
 *  - use visible btn-outline-secondary for Cancel (replacing faint btn-label-secondary)
 *  - provide tap-press feedback via :active (scale transform)
 */
test.describe('Cardio editor footer buttons', () => {
  test('stacks vertically and has visible Cancel on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/workout-builder.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => !!window.UnifiedOffcanvasFactory?.createCardioEditor,
      { timeout: 10000 }
    );

    await page.evaluate(() => {
      window.UnifiedOffcanvasFactory.createCardioEditor({
        groupId: 'test-group',
        cardioConfig: { activity_type: 'running', duration_minutes: 30 },
        onSave: () => {},
        onDelete: () => {}
      });
    });

    const footer = page.locator('.offcanvas.show .offcanvas-footer .d-flex').first();
    await expect(footer).toBeVisible({ timeout: 5000 });

    await expect(footer).toHaveClass(/cardio-editor-buttons/);
    await expect(footer).not.toHaveClass(/workout-builder-buttons/);

    const direction = await footer.evaluate(el => getComputedStyle(el).flexDirection);
    expect(direction).toBe('column');

    const cancelBtn = page.locator('.offcanvas.show .offcanvas-footer button', { hasText: 'Cancel' });
    await expect(cancelBtn).toHaveClass(/btn-outline-secondary/);

    const btnHeight = await page.locator('.offcanvas.show .offcanvas-footer .btn').first().evaluate(el => el.getBoundingClientRect().height);
    expect(btnHeight).toBeGreaterThanOrEqual(44);
  });

  test('save button scales down on :active for press feedback', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/workout-builder.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => !!window.UnifiedOffcanvasFactory?.createCardioEditor,
      { timeout: 10000 }
    );

    await page.evaluate(() => {
      window.UnifiedOffcanvasFactory.createCardioEditor({
        groupId: 'test-group-2',
        cardioConfig: { activity_type: 'running' },
        onSave: () => {},
      });
    });

    const saveBtn = page.locator('.offcanvas.show [id^="cardioSaveBtn-"]');
    await expect(saveBtn).toBeVisible({ timeout: 5000 });

    const transformActive = await saveBtn.evaluate(el => {
      const rule = [...document.styleSheets]
        .flatMap(sheet => { try { return [...sheet.cssRules]; } catch { return []; } })
        .find(r => r.selectorText && r.selectorText.includes('.offcanvas-bottom-base .btn-primary:active'));
      return rule ? rule.style.transform : null;
    });
    expect(transformActive).toBe('scale(0.98)');
  });
});
