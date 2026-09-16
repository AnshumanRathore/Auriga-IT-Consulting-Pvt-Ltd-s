"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const pricing_1 = require("./pricing");
const types_1 = require("./types");
function createApp() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use(express_1.default.static(path_1.default.join(__dirname, '..', 'public')));
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', time: new Date().toISOString() });
    });
    // List shows with tier availability — what a counter UI needs to render options.
    app.get('/api/v1/shows', (_req, res) => {
        res.json({
            shows: config_1.shows.map((s) => ({
                id: s.id,
                title: s.title,
                screen: s.screen,
                startTime: s.startTime,
                tiers: s.tiers.map((t) => ({
                    name: t.name,
                    pricePaise: t.pricePaise,
                    availableSeats: t.availableSeats,
                    soldOut: t.availableSeats === 0,
                })),
            })),
        });
    });
    app.get('/api/v1/shows/:showId', (req, res) => {
        const show = (0, config_1.findShow)(String(req.params.showId));
        if (!show) {
            return res.status(404).json({ error: { code: 'UNKNOWN_SHOW', message: 'No such show.' } });
        }
        res.json({ show });
    });
    // Price a booking WITHOUT reserving seats — used to show the customer a quote.
    app.post('/api/v1/shows/:showId/quote', (req, res) => {
        const show = (0, config_1.findShow)(String(req.params.showId));
        if (!show) {
            return res.status(404).json({ error: { code: 'UNKNOWN_SHOW', message: 'No such show.' } });
        }
        const parsed = types_1.QuoteRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: parsed.error.message } });
        }
        const result = (0, pricing_1.priceBooking)(show, parsed.data, config_1.pricingConfig);
        if (!result.ok) {
            return res.status(409).json({ errors: result.errors });
        }
        res.json({ breakup: result.breakup });
    });
    // Price AND reserve seats — used when the customer actually confirms the booking.
    app.post('/api/v1/shows/:showId/book', (req, res) => {
        const show = (0, config_1.findShow)(String(req.params.showId));
        if (!show) {
            return res.status(404).json({ error: { code: 'UNKNOWN_SHOW', message: 'No such show.' } });
        }
        const parsed = types_1.QuoteRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: parsed.error.message } });
        }
        const result = (0, pricing_1.priceBooking)(show, parsed.data, config_1.pricingConfig);
        if (!result.ok) {
            return res.status(409).json({ errors: result.errors });
        }
        (0, pricing_1.commitBooking)(show, parsed.data);
        res.status(201).json({ breakup: result.breakup, bookingId: `BKG-${Date.now()}` });
    });
    // Fallback error handler so a thrown error never leaks a stack trace to the counter.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err, _req, res, _next) => {
        console.error(err);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
    });
    return app;
}
