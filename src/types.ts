import { z } from 'zod';

/* ---------------------------------------------------------------------- */
/* Domain model                                                            */
/* ---------------------------------------------------------------------- */

/** A bookable seat category for a show (Silver / Gold / Recliner / anything a counter defines). */
export interface SeatTier {
  name: string;
  /** Base price for ONE seat in this tier, in paise. */
  pricePaise: number;
  totalSeats: number;
  /** Seats still unsold. A tier with 0 is sold out and cannot be booked. */
  availableSeats: number;
}

export interface Show {
  id: string;
  title: string;
  screen: string;
  startTime: string; // ISO timestamp
  tiers: SeatTier[];
}

/** One slab of a slab-based tax table (e.g. India's GST-on-cinema-tickets rule). */
export interface TaxSlab {
  /** This slab applies when the reference price <= this value. `null` = no upper bound (catch-all). */
  maxPricePaiseInclusive: number | null;
  gstPercent: number;
}

export interface FeeConfig {
  /** Flat convenience fee charged per ticket, in paise. */
  perTicketFeePaise: number;
  /**
   * 'combined': the fee is folded into the same taxable base as the ticket
   *   and taxed at the ticket's own GST slab rate (matches "adds a small
   *   per-ticket convenience fee and GST on top" read as one combined step).
   * 'separate': the fee is taxed independently at `separateGstPercent`
   *   (matches jurisdictions/venues that treat a booking fee as a distinct
   *   taxable service).
   */
  taxation: 'combined' | 'separate';
  separateGstPercent?: number;
}

export interface ActiveOffers {
  /** Whether a festival promo is currently live, and how much it takes off (paise), flat. */
  festivalDiscount: { enabled: boolean; amountPaise: number };
  /** Member benefit: percent off, capped, applied only when the booking is flagged as a member booking. */
  memberDiscount: { percent: number; capPaise: number };
}

export interface PricingConfig {
  /** Ordered ascending by maxPricePaiseInclusive; last entry must be null (catch-all). */
  taxSlabs: TaxSlab[];
  /** Whether the GST slab is chosen by the seat's ORIGINAL price or its price AFTER discount. */
  taxSlabBasis: 'original' | 'discounted';
  fee: FeeConfig;
  offers: ActiveOffers;
}

export interface LineBreakup {
  tierName: string;
  quantity: number;
  unitPricePaise: number;
  grossAmountPaise: number;
  discountAppliedPaise: number;
  taxableAmountPaise: number;
  gstPercent: number;
  gstPaise: number;
  convenienceFeePaise: number;
  lineTotalPaise: number;
}

export interface BookingBreakup {
  showId: string;
  lines: LineBreakup[];
  summary: {
    grossAmountPaise: number;
    festivalDiscountAppliedPaise: number;
    memberDiscountAppliedPaise: number;
    totalDiscountPaise: number;
    taxableAmountPaise: number;
    totalGstPaise: number;
    totalConvenienceFeePaise: number;
    grandTotalPaise: number;
  };
}

export type PricingErrorCode =
  | 'UNKNOWN_SHOW'
  | 'UNKNOWN_TIER'
  | 'SOLD_OUT'
  | 'INVALID_QUANTITY'
  | 'EMPTY_BOOKING';

export interface PricingError {
  code: PricingErrorCode;
  message: string;
  tierName?: string;
}

export type PricingResult =
  | { ok: true; breakup: BookingBreakup }
  | { ok: false; errors: PricingError[] };

/* ---------------------------------------------------------------------- */
/* API request/response validation (Zod)                                   */
/* ---------------------------------------------------------------------- */

export const BookingLineSchema = z.object({
  tierName: z.string().min(1, 'tierName is required'),
  quantity: z.number().int('quantity must be a whole number').positive('quantity must be positive'),
});

export const QuoteRequestSchema = z.object({
  lines: z.array(BookingLineSchema).min(1, 'at least one line is required'),
  applyFestivalDiscount: z.boolean().optional().default(false),
  isMember: z.boolean().optional().default(false),
});

export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export interface BookingRequest {
  lines: { tierName: string; quantity: number }[];
  applyFestivalDiscount: boolean;
  isMember: boolean;
}
