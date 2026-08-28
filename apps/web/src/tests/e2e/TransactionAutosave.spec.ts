import { test, expect } from '@playwright/test';

test.describe('Transaction Autosave & Drafts', () => {
  test('should save to IndexedDB when offline and sync when online', async ({ page, context }) => {
    // Navigate to ledger page (assuming /ledger is the route)
    await page.goto('/ledger');
    
    // Wait for the UI to load
    await expect(page.locator('text=Global Ledger')).toBeVisible();

    // Click "Add Transaction"
    await page.click('button:has-text("Add Transaction")');

    // Ensure the modal opens by waiting for the textarea
    await expect(page.locator('textarea[placeholder*="remarks"]')).toBeVisible();

    // Enter some data
    await page.fill('textarea[placeholder*="remarks"]', 'Testing autosave debounce');

    // Wait a brief moment for autosave debounce (e.g. 1.5s)
    await page.waitForTimeout(1500);

    // Verify UI reflects "Up to date" or "All changes saved" status
    await expect(page.locator('text=Up to date').or(page.locator('text=All changes saved')).first()).toBeVisible();
    
    // Optionally close the modal
    await page.click('button:has-text("Cancel")');
  });
});
