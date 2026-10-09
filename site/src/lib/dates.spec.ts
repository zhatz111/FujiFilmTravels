import { describe, expect, it } from 'vitest';
import { longMonthYear, monthDay, monthYear, range, visitsShort, years } from './dates';

describe('date ranges', () => {
	it('formats single day, same month, across months, across years', () => {
		expect(range('2025-03-14', '2025-03-14')).toBe('Mar 14, 2025');
		expect(range('2025-03-09', '2025-03-21')).toBe('Mar 9 – 21, 2025');
		expect(range('2025-02-27', '2025-03-04')).toBe('Feb 27 – Mar 4, 2025');
		expect(range('2024-12-28', '2025-01-03')).toBe('Dec 28, 2024 – Jan 3, 2025');
	});

	it('drops the year on request (spot rows)', () => {
		expect(range('2025-03-09', '2025-03-11', false)).toBe('Mar 9 – 11');
		expect(range('2025-03-14', '2025-03-14', false)).toBe('Mar 14');
		expect(range('2024-12-28', '2025-01-03', false)).toBe('Dec 28, 2024 – Jan 3, 2025');
	});

	it('does not shift dates across time zones', () => {
		expect(range('2025-01-01', '2025-01-01')).toBe('Jan 1, 2025');
		expect(monthYear('2025-12-31')).toBe('Dec 2025');
	});
});

describe('short forms', () => {
	it('month-year', () => {
		expect(monthYear('2025-03-09')).toBe('Mar 2025');
		expect(longMonthYear('2025-03-09')).toBe('March 2025');
		expect(monthDay('2026-10-16')).toBe('Oct 16');
	});

	it('lists at most two visits', () => {
		expect(visitsShort(['2025-03-08'])).toBe('Mar 2025');
		expect(visitsShort(['2025-03-08', '2023-01-02'])).toBe('Mar 2025 · Jan 2023');
		expect(visitsShort(['2025-03-08', '2023-01-02', '2021-07-01'])).toBe(
			'Mar 2025 · Jan 2023 +1 more'
		);
	});

	it('pin years', () => {
		expect(years(['2025-03-08', '2025-01-02', '2023-06-01'])).toBe('2025 · 2023');
	});
});
