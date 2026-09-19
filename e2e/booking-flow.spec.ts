import { expect, test, type Page } from '@playwright/test';

// Walks the public booking flow up to the card step on every device project and fails on
// the layout defects this suite was written to catch: page-level horizontal overflow,
// elements poking past the viewport, overlapping time-slot labels, and undersized buttons.
// Availability is mocked so the suite never depends on real bookings. It stops before card
// entry, so nothing is saved in Stripe or the database.

const SLOTS = [
  { slotId: 'early', arrivalStart: '17:00', arrivalEnd: '17:15', slotEnd: '19:00', label: 'Early', type: 'early', available: true, currentGuests: 0, remainingCapacity: 14 },
  { slotId: 'late', arrivalStart: '19:30', arrivalEnd: '19:45', slotEnd: '21:30', label: 'Late', type: 'late', available: false, currentGuests: 10, remainingCapacity: 0 },
];

async function expectMobileSafeLayout(page: Page) {
  const layout = await page.evaluate(() => {
    const vw = window.innerWidth;
    const offscreen = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => {
        // Page coordinates: WebKit emulation can pan the view a few px while Playwright acts,
        // which would make every element look shifted.
        const box = el.getBoundingClientRect();
        const left = box.left + window.scrollX;
        const right = box.right + window.scrollX;
        return box.width > 0 && box.height > 0 && (right > vw + 1 || left < -1);
      })
      .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`);
    const smallButtons = [...document.querySelectorAll<HTMLElement>('button:not([role=checkbox])')]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width < 24 || box.height < 24; // WCAG 2.2 target size minimum (2.5.8)
      })
      .map((el) => (el.textContent ?? '').trim());
    return { vw, scrollWidth: document.documentElement.scrollWidth, offscreen, smallButtons };
  });

  // Mobile Chrome widens the layout viewport instead of scrolling when content is too wide,
  // so the viewport itself must match the device width.
  expect(layout.vw).toBe(page.viewportSize()!.width);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.vw);
  expect(layout.offscreen).toEqual([]);
  expect(layout.smallButtons).toEqual([]);
}

test('booking flow stays usable from party size through card entry', async ({ page }) => {
  await page.route('**/api/availability', (route) =>
    route.fulfill({ json: { isOpen: true, slots: SLOTS } })
  );

  await page.goto('/');
  // Group bookings start at 7 guests, so the form opens there.
  await expect(page.locator('#partySize')).toHaveValue('7');
  await expectMobileSafeLayout(page);
  await page.fill('#partySize', '8');
  await page.click('#agreement');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Details: date, time slot, contact
  await page.locator('[role=gridcell] button:not([disabled])').first().click();
  const slot = page.getByRole('button', { name: /5:00 PM/ });
  await slot.click();
  const [arrival, departure] = await slot.locator('.text-xl').evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect())
  );
  const overlaps =
    arrival.left < departure.right && departure.left < arrival.right &&
    arrival.top < departure.bottom && departure.top < arrival.bottom;
  expect(overlaps, 'arrival and departure times overlap').toBe(false);

  await page.fill('#firstName', 'Test');
  await page.fill('#lastName', 'Guest');
  await page.fill('#email', 'guest@example.com');
  // A number with too many digits must not get past this step.
  await page.fill('#phone', '4379089907123123');
  await page.locator('#phone').blur();
  await expect(page.getByText('Please enter a valid 10-digit phone number')).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue/ })).toBeDisabled();
  await page.fill('#phone', '5145550000');
  await expectMobileSafeLayout(page);
  await page.getByRole('button', { name: /Continue/ }).click();

  // The Continue button sits at the bottom of a long step; the next step must open with the
  // progress bar in view instead of leaving the guest scrolled down.
  await expect(page.getByText('Step 3', { exact: true })).toBeInViewport();

  await page.click('#menuPolicy');
  await expectMobileSafeLayout(page);
  await page.getByRole('button', { name: /Continue/ }).click();

  await page.getByRole('button', { name: /Yes/ }).click();
  await expect(page.locator('#allergyInfo')).toBeVisible();
  await expectMobileSafeLayout(page);
  await page.getByRole('button', { name: /No/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click();

  await page.click('#houseRules');
  await expectMobileSafeLayout(page);
  await page.getByRole('button', { name: /Continue/ }).click();

  // Card step: the Stripe-hosted card field renders and the page still fits the screen.
  await expect(page.frameLocator('iframe[title*="card" i]').locator('input').first()).toBeAttached();
  await expectMobileSafeLayout(page);
});
