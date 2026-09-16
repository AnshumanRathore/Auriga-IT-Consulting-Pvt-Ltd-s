"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuoteRequestSchema = exports.BookingLineSchema = void 0;
const zod_1 = require("zod");
/* ---------------------------------------------------------------------- */
/* API request/response validation (Zod)                                   */
/* ---------------------------------------------------------------------- */
exports.BookingLineSchema = zod_1.z.object({
    tierName: zod_1.z.string().min(1, 'tierName is required'),
    quantity: zod_1.z.number().int('quantity must be a whole number').positive('quantity must be positive'),
});
exports.QuoteRequestSchema = zod_1.z.object({
    lines: zod_1.z.array(exports.BookingLineSchema).min(1, 'at least one line is required'),
    applyFestivalDiscount: zod_1.z.boolean().optional().default(false),
    isMember: zod_1.z.boolean().optional().default(false),
});
