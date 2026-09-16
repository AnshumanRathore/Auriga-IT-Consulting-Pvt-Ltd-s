import { describe, expect, it } from 'vitest';
import { importPriceList } from '../src/priceImporter';

describe('importPriceList', () => {
  it('normalizes prices, keeps the first valid row, and reports duplicates and rejects', () => {
    const report = importPriceList([
      { seatClass: 'Silver', price: '₹250' },
      { seatClass: 'GOLD', price: '300' },
      { seatClass: 'gold', price: 'Rs. 300.00' },
      { seatClass: 'RECLINER', price: '₹599.50' },
      { seatClass: 'silver', price: '250' },
      { seatClass: 'Gold', price: '' },
      { seatClass: 'Recliner', price: '-100' },
      { seatClass: 'VIP', price: 'abc' },
    ]);

    expect(report.imported).toEqual([
      { seatClass: 'Silver', pricePaise: 25000 },
      { seatClass: 'Gold', pricePaise: 30000 },
      { seatClass: 'Recliner', pricePaise: 59950 },
    ]);
    expect(report.duplicates).toEqual([
      { row: 3, seatClass: 'Gold', reason: 'Duplicate seat class' },
      { row: 5, seatClass: 'Silver', reason: 'Duplicate seat class' },
    ]);
    expect(report.rejected).toEqual([
      { row: 6, seatClass: 'Gold', reason: 'Invalid, blank, or negative price' },
      { row: 7, seatClass: 'Recliner', reason: 'Invalid, blank, or negative price' },
      { row: 8, seatClass: 'VIP', reason: 'Unknown or blank seat class' },
    ]);
    expect(report.summary).toEqual({
      totalRows: 8,
      imported: 3,
      deduplicated: 2,
      rejected: 3,
    });
  });

  it('accepts supported currency formats and rejects malformed values', () => {
    const report = importPriceList([
      { seatClass: 'Silver', price: 'INR 1,250.5' },
      { seatClass: 'Gold', price: ' Rs 99 ' },
      { seatClass: 'Recliner', price: null },
      { seatClass: 'Silver', price: '1.234' },
    ]);

    expect(report.imported).toEqual([
      { seatClass: 'Silver', pricePaise: 125050 },
      { seatClass: 'Gold', pricePaise: 9900 },
    ]);
    expect(report.rejected).toHaveLength(2);
    expect(report.summary).toEqual({
      totalRows: 4,
      imported: 2,
      deduplicated: 0,
      rejected: 2,
    });
  });
});
