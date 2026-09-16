"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shows = exports.pricingConfig = exports.DEFAULT_TAX_SLABS = void 0;
exports.findShow = findShow;
const money_1 = require("./money");
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
exports.DEFAULT_TAX_SLABS = [
    { maxPricePaiseInclusive: (0, money_1.toPaise)(100), gstPercent: 12 },
    { maxPricePaiseInclusive: null, gstPercent: 18 },
];
exports.pricingConfig = {
    taxSlabs: exports.DEFAULT_TAX_SLABS,
    taxSlabBasis: 'original',
    fee: {
        perTicketFeePaise: (0, money_1.toPaise)(20),
        taxation: 'combined',
        separateGstPercent: 18,
    },
    offers: {
        festivalDiscount: { enabled: true, amountPaise: (0, money_1.toPaise)(100) },
        memberDiscount: { percent: 10, capPaise: (0, money_1.toPaise)(150) },
    },
};
/** In-memory "database" of shows. Replace with a real store for production use. */
exports.shows = [
    {
        id: 'SHOW-101',
        title: 'Kaala Naag Returns',
        screen: 'Screen 3',
        startTime: '2026-09-18T22:00:00+05:30',
        tiers: [
            { name: 'Silver', pricePaise: (0, money_1.toPaise)(150), totalSeats: 80, availableSeats: 40 },
            { name: 'Gold', pricePaise: (0, money_1.toPaise)(280), totalSeats: 60, availableSeats: 12 },
            { name: 'Recliner', pricePaise: (0, money_1.toPaise)(550), totalSeats: 20, availableSeats: 0 },
        ],
    },
    {
        id: 'SHOW-102',
        title: 'Midnight Mirage',
        screen: 'Screen 1',
        startTime: '2026-09-19T23:30:00+05:30',
        tiers: [
            { name: 'Silver', pricePaise: (0, money_1.toPaise)(120), totalSeats: 100, availableSeats: 88 },
            { name: 'Gold', pricePaise: (0, money_1.toPaise)(220), totalSeats: 70, availableSeats: 70 },
        ],
    },
];
function findShow(showId) {
    return exports.shows.find((s) => s.id === showId);
}
