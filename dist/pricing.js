"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.priceBooking = priceBooking;
exports.commitBooking = commitBooking;
const money_1 = require("./money");
function findSlabRate(referencePricePaise, slabs) {
    for (const slab of slabs) {
        if (slab.maxPricePaiseInclusive === null || referencePricePaise <= slab.maxPricePaiseInclusive) {
            return slab.gstPercent;
        }
    }
    return slabs.length > 0 ? slabs[slabs.length - 1].gstPercent : 0;
}
function validate(request, tiersByName) {
    const errors = [];
    if (!request.lines || request.lines.length === 0) {
        errors.push({ code: 'EMPTY_BOOKING', message: 'Booking must contain at least one seat.' });
        return errors;
    }
    for (const line of request.lines) {
        const tier = tiersByName.get(line.tierName);
        if (!tier) {
            errors.push({
                code: 'UNKNOWN_TIER',
                message: `Seat tier "${line.tierName}" does not exist for this show.`,
                tierName: line.tierName,
            });
            continue;
        }
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
            errors.push({
                code: 'INVALID_QUANTITY',
                message: `Quantity for tier "${line.tierName}" must be a positive whole number.`,
                tierName: line.tierName,
            });
            continue;
        }
        if (line.quantity > tier.availableSeats) {
            errors.push({
                code: 'SOLD_OUT',
                message: tier.availableSeats === 0
                    ? `Tier "${line.tierName}" is sold out.`
                    : `Only ${tier.availableSeats} seat(s) left in "${line.tierName}", requested ${line.quantity}.`,
                tierName: line.tierName,
            });
        }
    }
    return errors;
}
/**
 * Compute a full, line-by-line bill breakup for a booking against a show.
 *
 * Pipeline:
 *   1. Validate tier existence, quantity, and live seat availability
 *      (sold-out tiers are rejected up front, before any money math runs).
 *   2. Compute the gross subtotal per line (price x quantity).
 *   3. Apply the flat festival discount first (capped at the gross total),
 *      then the member percentage discount (capped) on what remains.
 *      The combined discount is distributed back across lines
 *      proportionally to their gross amount via the largest-remainder
 *      method, so the per-line pieces always sum to the exact discount.
 *   4. Determine each line's GST slab (default: based on the seat's
 *      ORIGINAL price, matching real cinema-GST practice) and tax the
 *      discounted (taxable) amount — plus the convenience fee, if the fee
 *      is configured to be taxed together with the ticket — at that rate.
 *   5. Grand total = sum of line totals — guaranteed exact to the paisa.
 */
function priceBooking(show, request, config) {
    const tiersByName = new Map(show.tiers.map((t) => [t.name, t]));
    const errors = validate(request, tiersByName);
    if (errors.length > 0) {
        return { ok: false, errors };
    }
    const lines = request.lines.map((l) => {
        const tier = tiersByName.get(l.tierName);
        return {
            tierName: tier.name,
            quantity: l.quantity,
            unitPricePaise: tier.pricePaise,
            grossAmountPaise: tier.pricePaise * l.quantity,
        };
    });
    const grossTotal = lines.reduce((sum, l) => sum + l.grossAmountPaise, 0);
    // --- Offers -------------------------------------------------------
    // 1) Flat festival discount, capped so it can never exceed the bill.
    const festivalRequested = request.applyFestivalDiscount && config.offers.festivalDiscount.enabled
        ? config.offers.festivalDiscount.amountPaise
        : 0;
    const festivalDiscount = Math.max(0, Math.min(festivalRequested, grossTotal));
    // 2) Member percentage discount, applied on what remains AFTER the flat
    //    discount, and capped at its own configured max value.
    const remainingAfterFestival = grossTotal - festivalDiscount;
    let memberDiscount = 0;
    if (request.isMember) {
        const { percent, capPaise } = config.offers.memberDiscount;
        const rawPercentOff = (0, money_1.percentOfPaise)(remainingAfterFestival, percent);
        memberDiscount = Math.min(rawPercentOff, capPaise, remainingAfterFestival);
    }
    const totalDiscount = festivalDiscount + memberDiscount;
    const perLineDiscount = (0, money_1.distributeProportionally)(totalDiscount, lines.map((l) => l.grossAmountPaise));
    // --- Tax + fee per line --------------------------------------------
    const lineBreakups = lines.map((l, idx) => {
        const discountApplied = perLineDiscount[idx];
        const taxableAmount = l.grossAmountPaise - discountApplied;
        const referencePrice = config.taxSlabBasis === 'discounted' ? Math.round(taxableAmount / l.quantity) : l.unitPricePaise;
        const gstPercent = findSlabRate(referencePrice, config.taxSlabs);
        const convenienceFee = config.fee.perTicketFeePaise * l.quantity;
        const taxBase = config.fee.taxation === 'combined' ? taxableAmount + convenienceFee : taxableAmount;
        const ticketGst = (0, money_1.percentOfPaise)(taxBase, gstPercent);
        const feeGst = config.fee.taxation === 'separate' ? (0, money_1.percentOfPaise)(convenienceFee, config.fee.separateGstPercent ?? 0) : 0;
        const totalGst = ticketGst + feeGst;
        const lineTotal = taxableAmount + convenienceFee + totalGst;
        return {
            tierName: l.tierName,
            quantity: l.quantity,
            unitPricePaise: l.unitPricePaise,
            grossAmountPaise: l.grossAmountPaise,
            discountAppliedPaise: discountApplied,
            taxableAmountPaise: taxableAmount,
            gstPercent,
            gstPaise: totalGst,
            convenienceFeePaise: convenienceFee,
            lineTotalPaise: lineTotal,
        };
    });
    const summary = lineBreakups.reduce((acc, l) => {
        acc.taxableAmountPaise += l.taxableAmountPaise;
        acc.totalGstPaise += l.gstPaise;
        acc.totalConvenienceFeePaise += l.convenienceFeePaise;
        acc.grandTotalPaise += l.lineTotalPaise;
        return acc;
    }, {
        grossAmountPaise: grossTotal,
        festivalDiscountAppliedPaise: festivalDiscount,
        memberDiscountAppliedPaise: memberDiscount,
        totalDiscountPaise: totalDiscount,
        taxableAmountPaise: 0,
        totalGstPaise: 0,
        totalConvenienceFeePaise: 0,
        grandTotalPaise: 0,
    });
    const breakup = {
        showId: show.id,
        lines: lineBreakups,
        summary,
    };
    return { ok: true, breakup };
}
/** Marks seats as sold once a booking is confirmed. Call only after priceBooking() returned ok:true. */
function commitBooking(show, request) {
    for (const line of request.lines) {
        const tier = show.tiers.find((t) => t.name === line.tierName);
        if (!tier)
            throw new Error(`Unknown tier ${line.tierName}`);
        if (line.quantity > tier.availableSeats)
            throw new Error(`Tier ${line.tierName} sold out`);
        tier.availableSeats -= line.quantity;
    }
}
