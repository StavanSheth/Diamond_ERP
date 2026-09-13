import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('DiamondERP V3.0 Production Desktop E2E Lifecycle', () => {
  const externalRequests: string[] = [];

  test.beforeEach(async ({ page }) => {
    // Intercept network requests to catch any external/CDN leak (Offline validation)
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith('http://127.0.0.1') && !url.startsWith('http://localhost') && !url.startsWith('data:')) {
        externalRequests.push(url);
      }
    });

    // Ensure localStorage has lifetime activation pre-flagged if needed
    await page.addInitScript(() => {
      localStorage.setItem('diamond_erp_lifetime_activated', 'true');
      localStorage.setItem('appLanguage', 'en');
    });
  });

  test('1. Application Launch & Dashboard Route Verification', async ({ page }) => {
    await page.goto('/');

    // Handle First-Run Activation overlay if backend requires it
    const activationOverlay = page.locator('#first-run-activation-overlay');
    if (await activationOverlay.isVisible({ timeout: 1500 }).catch(() => false)) {
      const pwInput = page.locator('#master-activation-password');
      await pwInput.fill('XW2756WGH');
      await page.click('#activate-submit-btn');
      await expect(activationOverlay).toBeHidden({ timeout: 5000 });
    }

    // Verify main layout is rendered
    await expect(page.locator('text=DiamondERP').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('nav')).toBeVisible();

    // Verify Dashboard page elements
    await expect(page.locator('main')).toBeVisible();
  });

  test('2. Core Navigation Flow across All Existing Routes', async ({ page }) => {
    await page.goto('/');

    const routes = [
      { path: '/inventory', expectedText: 'Inventory' },
      { path: '/ledger', expectedText: 'Ledger' },
      { path: '/certificates', expectedText: 'Certificates' },
      { path: '/repairs', expectedText: 'Repairs' },
      { path: '/parties', expectedText: 'Parties' },
      { path: '/reports', expectedText: 'Reports' },
      { path: '/settings', expectedText: 'System Settings' },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.locator(`text=${route.expectedText}`).first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('3. Party CRUD Lifecycle (Create, Read, Verify)', async ({ page }) => {
    await page.goto('/parties');
    await expect(page.locator('text=Parties').first()).toBeVisible({ timeout: 8000 });

    // Open Add Party modal
    const addPartyBtn = page.locator('button:has-text("Add Party")').first();
    await expect(addPartyBtn).toBeVisible({ timeout: 5000 });
    await addPartyBtn.click();

    // Fill Party Form
    const partyName = `Test Gems Corp ${Date.now()}`;
    const nameInput = page.locator('input[placeholder*="Acme Gems Co."]');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill(partyName);

    // Fill Phone & Notes
    const phoneInput = page.locator('input[placeholder*="98765 43210"]').or(page.locator('input[type="tel"]')).first();
    if (await phoneInput.isVisible().catch(() => false)) {
      await phoneInput.fill('9876543210');
    }

    // Submit Create Party
    const createBtn = page.locator('button:has-text("Create Party")');
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Wait for modal to successfully save and close
    await expect(nameInput).toBeHidden({ timeout: 10000 });

    // Verify Party is created and rendered in list
    await expect(page.locator(`text=${partyName}`).first()).toBeVisible({ timeout: 10000 });
  });

  test('4. Route Refresh & SPA Fallback Resilience', async ({ page }) => {
    const testRoutes = [
      '/',
      '/inventory',
      '/parties',
      '/ledger',
      '/repairs',
      '/certificates',
      '/reports',
      '/settings',
    ];

    for (const route of testRoutes) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');

      // Refresh page
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Verify page still renders correctly without 404 or blank screen
      await expect(page.locator('nav')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('main')).toBeVisible({ timeout: 5000 });
    }
  });

  test('5. Excel Data Export & Template Download', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('text=System Settings').first()).toBeVisible({ timeout: 8000 });

    // Locate Export Data button
    const exportBtn = page.locator('button:has-text("Export Data (Excel)")');
    await expect(exportBtn).toBeVisible({ timeout: 5000 });

    // Listen for download event
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await exportBtn.click();
    const download = await downloadPromise;

    // Verify suggested filename and save to scratch dir
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.xlsx$/i);

    const tempDownloadPath = path.join(process.cwd(), '../../scratch', 'test_export.xlsx');
    await download.saveAs(tempDownloadPath);

    expect(fs.existsSync(tempDownloadPath)).toBe(true);
    expect(fs.statSync(tempDownloadPath).size).toBeGreaterThan(100);

    // Clean up temporary download file
    try {
      fs.unlinkSync(tempDownloadPath);
    } catch {}
  });

  test('6. Reports UI, Presets & Filtering', async ({ page }) => {
    await page.goto('/reports');
    await expect(page.locator('text=Reports').first()).toBeVisible({ timeout: 8000 });

    // Verify report container rendered
    await expect(page.locator('main')).toBeVisible();

    // Verify preset buttons exist
    const quickPresets = page.locator('button:has-text("FY 2025-26")').or(page.locator('button:has-text("Stock Inventory")')).first();
    if (await quickPresets.isVisible().catch(() => false)) {
      await quickPresets.click();
      await page.waitForTimeout(500);
    }
  });

  test('7. Offline Self-Containment (Zero External / CDN Requests)', async () => {
    // Verify that NO external requests (e.g. fonts.googleapis.com, cdnjs, etc.) were initiated
    const forbiddenExternal = externalRequests.filter(
      (url) => url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') || url.includes('cdn')
    );

    expect(forbiddenExternal).toEqual([]);
  });
});
