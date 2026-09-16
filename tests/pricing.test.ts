import { describe, expect, it } from 'vitest';
import { priceBooking } from '../src/pricing';
import { toPaise } from '../src/money';
import { PricingConfig, Show } from '../src/types';

function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    id: 'SHOW-1',
    title: 'Test Movie',
    screen: 'Screen 1',
    startTime: '2026-09-18T20:00:00+05:30',
    tiers: [
      { name: 'Silver', pricePaise: toPaise(150), totalSeats: 50, availableSeats: 50 },
      { name: 'Gold', pricePaise: toPaise(280), totalSeats: 50, availableSeats: 5 },
      { name: 'Recliner', pricePaise: toPaise(550), totalSeats: 10, availableSeats: 0 },
    ],
    ...overrides,
  };
}

function makeConfig(overrides: Partial<PricingConfig> = {}): PricingConfig {
  return {
    taxSlabs: [
      { maxPricePaiseInclusive: toPaise(100), gstPercent: 12 },
      { maxPricePaiseInclusive: null, gstPercent: 18 },
    ],
    taxSlabBasis: 'original',
    fee: { perTicketFeePaise: toPaise(20), taxation: 'combined' },
    offers: {
      festivalDiscount: { enabled: true, amountPaise: toPaise(100) },
      memberDiscount: { percent: 10, capPaise: toPaise(150) },
    },
    ...overrides,
  };
}

describe('priceBooking — plain bookings (no offers)', () => {
  it('prices a single-tier booking with no offers correctly', () => {
    const show = makeShow();
    const config = makeConfig();
    const result = priceBooking(
      show,
      { lines: [{ tierName: 'Silver', quantity: 2 }], applyFestivalDiscount: false, isMember: false },
      config
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const line = result.breakup.lines[0];
    expect(line.grossAmountPaise).toBe(toPaise(300)); // 2 x 150
    expect(line.discountAppliedPaise).toBe(0);
    expect(line.taxableAmountPaise).toBe(toPaise(300));
    expect(line.gstPercent).toBe(18); // 150 > 100 slab boundary
    expect(line.convenienceFeePaise).toBe(4000); // 2 x ₹20
    // combined taxation: GST computed on (taxable + fee) = 300 + 40 = 340 rupees -> 30400 paise * 18%
    expect(line.gstPaise).toBe(Math.round((toPaise(300) + 4000) * 0.18));
    expect(line.lineTotalPaise).toBe(line.taxableAmountPaise + line.convenienceFeePaise + line.gstPaise);
    expect(result.breakup.summary.grandTotalPaise).toBe(line.lineTotalPaise);
  });

  it('uses the lower GST slab for tickets priced at or below the slab boundary', () => {
    const show = makeShow({
      tiers: [{ name: 'Silver', pricePaise: toPaise(100), totalSeats: 10, availableSeats: 10 }],
    });
    const result = priceBooking(
      show,
      { lines: [{ tierName: 'Silver', quantity: 1 }], applyFestivalDiscount: false, isMember: false },
      makeConfig()
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakup.lines[0].gstPercent).toBe(12);
  });

  it('grand total always exactly equals the sum of line totals (no paisa leakage)', () => {
    const show = makeShow();
    const result = priceBooking(
      show,
      {
        lines: [
          { tierName: 'Silver', quantity: 3 },
          { tierName: 'Gold', quantity: 3 },
        ],
        applyFestivalDiscount: true,
        isMember: true,
      },
      makeConfig({
        offers: {
          festivalDiscount: { enabled: true, amountPaise: toPaise(37) }, // deliberately awkward
          memberDiscount: { percent: 7, capPaise: toPaise(1000) },
        },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sumOfLines = result.breakup.lines.reduce((a, l) => a + l.lineTotalPaise, 0);
    expect(sumOfLines).toBe(result.breakup.summary.grandTotalPaise);
    for (const l of result.breakup.lines) {
      for (const v of [
        l.grossAmountPaise,
        l.discountAppliedPaise,
        l.taxableAmountPaise,
        l.gstPaise,
        l.convenienceFeePaise,
        l.lineTotalPaise,
      ]) {
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });
});

describe('priceBooking — offers', () => {
  it('applies the flat festival discount, capped at the gross total', () => {
    const show = makeShow({
      tiers: [{ name: 'Silver', pricePaise: toPaise(150), totalSeats: 10, availableSeats: 10 }],
    });
    const result = priceBooking(
      show,
      { lines: [{ tierName: 'Silver', quantity: 1 }], applyFestivalDiscount: true, isMember: false },
      makeConfig({ offers: { festivalDiscount: { enabled: true, amountPaise: toPaise(1000) }, memberDiscount: { percent: 10, capPaise: toPaise(150) } } })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakup.summary.festivalDiscountAppliedPaise).toBe(toPaise(150));
    expect(result.breakup.summary.taxableAmountPaise).toBe(0);
  });

  it('does not apply the festival discount when the flag is off, even if enabled in config', () => {
    const show = makeShow({
      tiers: [{ name: 'Silver', pricePaise: toPaise(150), totalSeats: 10, availableSeats: 10 }],
    });
    const result = priceBooking(
      show,
      { lines: [{ tierName: 'Silver', quantity: 1 }], applyFestivalDiscount: false, isMember: false },
      makeConfig()
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakup.summary.festivalDiscountAppliedPaise).toBe(0);
  });

  it('caps the member percentage discount at its configured cap', () => {
    const show = makeShow({
      tiers: [{ name: 'Gold', pricePaise: toPaise(280), totalSeats: 10, availableSeats: 10 }],
    });
    const result = priceBooking(
      show,
      { lines: [{ tierName: 'Gold', quantity: 10 }], applyFestivalDiscount: false, isMember: true },
      makeConfig({
        offers: {
          festivalDiscount: { enabled: false, amountPaise: 0 },
          memberDiscount: { percent: 20, capPaise: toPaise(100) }, // 20% of 2800 = 560, capped to 100
        },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakup.summary.memberDiscountAppliedPaise).toBe(toPaise(100));
  });

  it('applies member % discount on the amount remaining after the flat discount', () => {
    const show = makeShow({
      tiers: [{ name: 'Gold', pricePaise: toPaise(280), totalSeats: 10, availableSeats: 10 }],
    });
    const result = priceBooking(
      show,
      { lines: [{ tierName: 'Gold', quantity: 1 }], applyFestivalDiscount: true, isMember: true },
      makeConfig({
        offers: {
          festivalDiscount: { enabled: true, amountPaise: toPaise(30) }, // remaining = 250
          memberDiscount: { percent: 10, capPaise: toPaise(1000) }, // 10% of 250 = 25
        },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakup.summary.festivalDiscountAppliedPaise).toBe(toPaise(30));
    expect(result.breakup.summary.memberDiscountAppliedPaise).toBe(toPaise(25));
  });

  it('distributes discount proportionally across mixed-tier lines and keeps exact paisa', () => {
    const show = makeShow();
    const result = priceBooking(
      show,
      {
        lines: [
          { tierName: 'Silver', quantity: 1 },
          { tierName: 'Gold', quantity: 1 },
        ],
        applyFestivalDiscount: true,
        isMember: false,
      },
      makeConfig({ offers: { festivalDiscount: { enabled: true, amountPaise: toPaise(43) }, memberDiscount: { percent: 0, capPaise: 0 } } })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const totalLineDiscount = result.breakup.lines.reduce((a, l) => a + l.discountAppliedPaise, 0);
    expect(totalLineDiscount).toBe(toPaise(43));
  });
});

describe('priceBooking — separate fee taxation mode', () => {
  it('taxes the fee independently when configured as separate', () => {
    const show = makeShow({
      tiers: [{ name: 'Silver', pricePaise: toPaise(150), totalSeats: 10, availableSeats: 10 }],
    });
    const result = priceBooking(
      show,
      { lines: [{ tierName: 'Silver', quantity: 1 }], applyFestivalDiscount: false, isMember: false },
      makeConfig({ fee: { perTicketFeePaise: toPaise(20), taxation: 'separate', separateGstPercent: 18 } })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const line = result.breakup.lines[0];
    const expectedTicketGst = Math.round(toPaise(150) * 0.18);
    const expectedFeeGst = Math.round(toPaise(20) * 0.18);
    expect(line.gstPaise).toBe(expectedTicketGst + expectedFeeGst);
  });
});

describe('priceBooking — availability & validation', () => {
  it('rejects a booking on a sold-out tier', () => {
    const show = makeShow();
    const result = priceBooking(
      show,
      { lines: [{ tierName: 'Recliner', quantity: 1 }], applyFestivalDiscount: false, isMember: false },
      makeConfig()
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe('SOLD_OUT');
  });

  it('rejects a booking that exceeds remaining seats', () => {
    const show = makeShow(); // Gold has 5 available
    const result = priceBooking(
      show,
      { lines: [{ tierName: 'Gold', quantity: 6 }], applyFestivalDiscount: false, isMember: false },
      makeConfig()
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe('SOLD_OUT');
  });

  it('rejects an unknown tier', () => {
    const show = makeShow();
    const result = priceBooking(
      show,
      { lines: [{ tierName: 'Platinum', quantity: 1 }], applyFestivalDiscount: false, isMember: false },
      makeConfig()
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe('UNKNOWN_TIER');
  });

  it('rejects an empty booking', () => {
    const show = makeShow();
    const result = priceBooking(show, { lines: [], applyFestivalDiscount: false, isMember: false }, makeConfig());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe('EMPTY_BOOKING');
  });
});
