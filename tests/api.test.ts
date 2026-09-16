import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';

describe('API', () => {
  it('GET /health returns ok', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/v1/shows lists shows with tier availability', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/shows');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.shows)).toBe(true);
    expect(res.body.shows.length).toBeGreaterThan(0);
    expect(res.body.shows[0].tiers[0]).toHaveProperty('availableSeats');
  });

  it('POST /quote returns a full breakup for a valid booking', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/shows/SHOW-101/quote')
      .send({ lines: [{ tierName: 'Silver', quantity: 2 }], applyFestivalDiscount: false, isMember: false });
    expect(res.status).toBe(200);
    expect(res.body.breakup.summary.grandTotalPaise).toBeGreaterThan(0);
  });

  it('POST /quote 404s for an unknown show', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/shows/NOPE/quote').send({ lines: [{ tierName: 'Silver', quantity: 1 }] });
    expect(res.status).toBe(404);
  });

  it('POST /quote 409s for a sold-out tier', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/shows/SHOW-101/quote')
      .send({ lines: [{ tierName: 'Recliner', quantity: 1 }] });
    expect(res.status).toBe(409);
    expect(res.body.errors[0].code).toBe('SOLD_OUT');
  });

  it('POST /quote 400s on a malformed request body', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/shows/SHOW-101/quote').send({ lines: [{ tierName: '', quantity: -1 }] });
    expect(res.status).toBe(400);
  });

  it('POST /book reserves seats, reducing availability for subsequent quotes', async () => {
    const app = createApp();
    const before = await request(app).get('/api/v1/shows/SHOW-102');
    const goldBefore = before.body.show.tiers.find((t: any) => t.name === 'Gold').availableSeats;

    const bookRes = await request(app)
      .post('/api/v1/shows/SHOW-102/book')
      .send({ lines: [{ tierName: 'Gold', quantity: 2 }], applyFestivalDiscount: false, isMember: false });
    expect(bookRes.status).toBe(201);
    expect(bookRes.body.bookingId).toMatch(/^BKG-/);

    const after = await request(app).get('/api/v1/shows/SHOW-102');
    const goldAfter = after.body.show.tiers.find((t: any) => t.name === 'Gold').availableSeats;
    expect(goldAfter).toBe(goldBefore - 2);
  });
});
