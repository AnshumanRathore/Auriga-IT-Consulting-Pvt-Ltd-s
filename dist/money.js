"use strict";
/**
 * Money is handled EXCLUSIVELY as integer paise (1 rupee = 100 paise).
 * No floating-point rupee value is ever allowed to flow through the
 * pricing pipeline. This is what "must total to the exact paisa" really
 * requires: rounding drift cannot be allowed to sneak in through
 * repeated float math (0.1 + 0.2 !== 0.3 in every mainstream language).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPaise = toPaise;
exports.formatPaise = formatPaise;
exports.roundPaise = roundPaise;
exports.percentOfPaise = percentOfPaise;
exports.distributeProportionally = distributeProportionally;
/** Convert a rupee amount (may have decimals) to integer paise. */
function toPaise(rupees) {
    return Math.round(rupees * 100);
}
/** Human readable ₹ string, e.g. 123456 -> "₹1,234.56" */
function formatPaise(paise) {
    const sign = paise < 0 ? '-' : '';
    const abs = Math.round(Math.abs(paise));
    const rupees = Math.floor(abs / 100);
    const p = abs % 100;
    const grouped = rupees.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${sign}\u20B9${grouped}.${p.toString().padStart(2, '0')}`;
}
/** Standard commercial rounding: round-half-up to the nearest paisa. */
function roundPaise(value) {
    return Math.floor(value + 0.5);
}
/** percent% of amountPaise, rounded to the nearest paisa. */
function percentOfPaise(amountPaise, percent) {
    return roundPaise((amountPaise * percent) / 100);
}
/**
 * Distributes an integer `total` (paise) across `weights` proportionally,
 * using the Largest Remainder Method (Hamilton apportionment).
 *
 * Why this exists: naively computing `total * weight / sumWeights` per
 * line and rounding each independently does NOT generally sum back to
 * `total` (it can be off by a paisa or two). This guarantees
 * `sum(result) === total` exactly, while staying as close as possible
 * to each line's true proportional share.
 */
function distributeProportionally(total, weights) {
    if (weights.length === 0)
        return [];
    const sumWeights = weights.reduce((a, b) => a + b, 0);
    if (sumWeights <= 0 || total === 0) {
        return weights.map(() => 0);
    }
    const raw = weights.map((w) => (total * w) / sumWeights);
    const floors = raw.map(Math.floor);
    const allocated = floors.reduce((a, b) => a + b, 0);
    const remainder = total - allocated;
    const order = raw
        .map((r, i) => ({ i, frac: r - floors[i] }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i);
    const result = [...floors];
    for (let k = 0; k < remainder && k < order.length; k++) {
        result[order[k].i] += 1;
    }
    return result;
}
