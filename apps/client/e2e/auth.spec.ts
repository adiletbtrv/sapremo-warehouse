import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('неверный логин показывает ошибку', async ({ page }) => {
    await page.goto('/login');
    
    // Fill the login form with wrong credentials
    await page.fill('input[name="username"]', 'wronguser');
    await page.fill('input[name="password"]', 'wrongpass');
    
    // Click submit
    await page.click('button[type="submit"]');
    
    // We expect an error message to appear (depends on exactly how we render it)
    // Wait for the alert or error text to be visible
    await expect(page.locator('.ant-alert-error, .ant-form-item-explain-error').first()).toBeVisible({ timeout: 5000 });
    
    // Ensure we are still on the login page
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('успешный вход через DEV offline mode перенаправляет на dashboard', async ({ page }) => {
    await page.goto('/login');
    
    // Click the DEV offline login button
    await page.click('button:has-text("Войти без сервера")');
    
    // Should be redirected to dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
    
    // The user menu should contain the name
    await expect(page.locator('text=Разработчик')).toBeVisible();
  });
});
