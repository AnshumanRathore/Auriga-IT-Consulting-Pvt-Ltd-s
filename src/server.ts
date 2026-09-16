import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import { findShow, pricingConfig, shows } from './config';
import { priceBooking, commitBooking } from './pricing';
import { QuoteRequestSchema } from './types';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // List shows with tier availability — what a counter UI needs to render options.
  app.get('/api/v1/shows', (_req: Request, res: Response) => {
    res.json({
      shows: shows.map((s) => ({
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

  app.get('/api/v1/shows/:showId', (req: Request, res: Response) => {
    const show = findShow(String(req.params.showId));
    if (!show) {
      return res.status(404).json({ error: { code: 'UNKNOWN_SHOW', message: 'No such show.' } });
    }
    res.json({ show });
  });

  // Price a booking WITHOUT reserving seats — used to show the customer a quote.
  app.post('/api/v1/shows/:showId/quote', (req: Request, res: Response) => {
    const show = findShow(String(req.params.showId));
    if (!show) {
      return res.status(404).json({ error: { code: 'UNKNOWN_SHOW', message: 'No such show.' } });
    }

    const parsed = QuoteRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: parsed.error.message } });
    }

    const result = priceBooking(show, parsed.data, pricingConfig);
    if (!result.ok) {
      return res.status(409).json({ errors: result.errors });
    }
    res.json({ breakup: result.breakup });
  });

  // Price AND reserve seats — used when the customer actually confirms the booking.
  app.post('/api/v1/shows/:showId/book', (req: Request, res: Response) => {
    const show = findShow(String(req.params.showId));
    if (!show) {
      return res.status(404).json({ error: { code: 'UNKNOWN_SHOW', message: 'No such show.' } });
    }

    const parsed = QuoteRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: parsed.error.message } });
    }

    const result = priceBooking(show, parsed.data, pricingConfig);
    if (!result.ok) {
      return res.status(409).json({ errors: result.errors });
    }
    commitBooking(show, parsed.data);
    res.status(201).json({ breakup: result.breakup, bookingId: `BKG-${Date.now()}` });
  });

  // Fallback error handler so a thrown error never leaks a stack trace to the counter.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
  });

  return app;
}
