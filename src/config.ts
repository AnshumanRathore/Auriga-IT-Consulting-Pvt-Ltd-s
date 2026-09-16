import { PricingConfig, Show } from './types';
import { toPaise } from './money';

/**
 * ---------------------------------------------------------------------
 * EXAMPLE CONFIGURATION
 * ---------------------------------------------------------------------
 * The problem statement gives no concrete numbers (prices, discount %,
 * fee, GST %) — only the *rules*. Everything below is illustrative data
 * so the engine is runnable out of the box; none of it is hard-coded
 * into the pricing logic itself (see src/pricing.ts). A real deployment
 * swaps this file (or loads the same shapes from a database) without
 * touching engine code — that's what "build it for any cinema counter,
 * not one show" means in practice.
 * ---------------------------------------------------------------------
 */

/** Default GST slabs mirroring India's real cinema-ticket rule:
 *  ticket face value <= ₹100 -> 12% GST, above ₹100 -> 18% GST.
 *  A venue in another jurisdiction supplies its own slabs. */
export const DEFAULT_TAX_SLABS = [
  { maxPricePaiseInclusive: toPaise(100), gstPercent: 12 },
  { maxPricePaiseInclusive: null, gstPercent: 18 },
];

export const pricingConfig: PricingConfig = {
  taxSlabs: DEFAULT_TAX_SLABS,
  taxSlabBasis: 'original',
  fee: {
    perTicketFeePaise: toPaise(20),
    taxation: 'combined',
    separateGstPercent: 18,
  },
  offers: {
    festivalDiscount: { enabled: true, amountPaise: toPaise(100) },
    memberDiscount: { percent: 10, capPaise: toPaise(150) },
  },
};

/** In-memory "database" of shows. Replace with a real store for production use. */
export const shows: Show[] = [
  {
    id: 'SHOW-101',
    title: 'Kaala Naag Returns',
    screen: 'Screen 3',
    startTime: '2026-09-18T22:00:00+05:30',
    tiers: [
      { name: 'Silver', pricePaise: toPaise(150), totalSeats: 80, availableSeats: 40 },
      { name: 'Gold', pricePaise: toPaise(280), totalSeats: 60, availableSeats: 12 },
      { name: 'Recliner', pricePaise: toPaise(550), totalSeats: 20, availableSeats: 0 },
    ],
  },
  {
    id: 'SHOW-102',
    title: 'Midnight Mirage',
    screen: 'Screen 1',
    startTime: '2026-09-19T23:30:00+05:30',
    tiers: [
      { name: 'Silver', pricePaise: toPaise(120), totalSeats: 100, availableSeats: 88 },
      { name: 'Gold', pricePaise: toPaise(220), totalSeats: 70, availableSeats: 70 },
    ],
  },
];

export function findShow(showId: string): Show | undefined {
  return shows.find((s) => s.id === showId);
}
