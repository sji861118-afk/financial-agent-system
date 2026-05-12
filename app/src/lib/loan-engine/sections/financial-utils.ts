// app/src/lib/loan-engine/sections/financial-utils.ts
// Shared financial analysis utilities — extracted from obligor.ts for reuse in risk-analysis.ts
import type { StatementLineItem, FinancialStatements } from '../types';

/**
 * Resolve the value for a given year key from a line item.
 * BS uses keys like "'22.12", IS often uses "'22" or "'25*".
 * Try exact match first, then strip month suffix (.MM) and retry.
 */
export function resolveValue(item: StatementLineItem, yearKey: string): number | string | null {
  const v = item.values[yearKey];
  if (v !== undefined) return v;
  const stripped = yearKey.replace(/\.\d{2}/, '');
  if (stripped !== yearKey) {
    const v2 = item.values[stripped];
    if (v2 !== undefined) return v2;
  }
  return null;
}

/** Find numeric value by account name in statement items */
export function findVal(items: StatementLineItem[], account: string, yearKey: string): number | null {
  for (const item of items) {
    const clean = item.account.replace(/[\s()]/g, '');
    if (clean.includes(account.replace(/[\s()]/g, ''))) {
      const v = resolveValue(item, yearKey);
      if (typeof v === 'number') return v;
    }
  }
  return null;
}

/** Find value trying multiple account name variants */
export function findAny(items: StatementLineItem[], accounts: string[], yearKey: string): number | null {
  for (const acct of accounts) {
    const v = findVal(items, acct, yearKey);
    if (v !== null) return v;
  }
  return null;
}

/** Calculate YoY percentage change string */
export function yoyPct(cur: number | null, prev: number | null): string {
  if (cur === null || prev === null || prev === 0) return '';
  const pct = ((cur - prev) / Math.abs(prev) * 100).toFixed(1);
  return Number(pct) >= 0 ? `+${pct}%` : `${pct}%`;
}

/** Calculate YoY absolute delta */
export function yoyDelta(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null) return null;
  return cur - prev;
}

/** Parse ratio string like "597.4%" → 597.4 */
export function parseRatioPct(val: number | string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  const m = val.replace(/,/g, '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

/** Collect numeric values across all years for trend analysis */
export function collectSeries(items: StatementLineItem[], account: string, years: string[]): (number | null)[] {
  return years.map(y => findVal(items, account, y));
}

/** Determine trend direction from a series of values */
export function trendDirection(series: (number | null)[]): '증가' | '감소' | '횡보' | '변동' | null {
  const valid = series.filter((v): v is number => v !== null);
  if (valid.length < 2) return null;
  let ups = 0, downs = 0;
  for (let i = 1; i < valid.length; i++) {
    if (valid[i] > valid[i - 1]) ups++;
    else if (valid[i] < valid[i - 1]) downs++;
  }
  if (ups > 0 && downs === 0) return '증가';
  if (downs > 0 && ups === 0) return '감소';
  if (ups === 0 && downs === 0) return '횡보';
  return '변동';
}

/** Sum borrowing items from balance sheet (단기차입금 + 유동성장기차입금 + 장기차입금 + 사채) */
export function sumBorrowings(
  items: StatementLineItem[],
  yearKey: string,
): { total: number; parts: { name: string; val: number }[] } {
  const parts: { name: string; val: number }[] = [];
  const found = new Set<number>();
  const targets = ['단기차입금', '유동성장기차입금', '유동성사채', '장기차입금', '사채'];
  for (const acct of targets) {
    for (let i = 0; i < items.length; i++) {
      if (found.has(i)) continue;
      const clean = items[i].account.replace(/[\s()]/g, '');
      const exactMatch = acct === '장기차입금'
        ? clean === '장기차입금'
        : acct === '사채'
          ? clean === '사채'
          : clean.includes(acct.replace(/[\s()]/g, ''));
      if (exactMatch) {
        const v = resolveValue(items[i], yearKey);
        if (typeof v === 'number' && v > 0) {
          parts.push({ name: acct, val: v });
          found.add(i);
        }
        break;
      }
    }
  }
  return { total: parts.reduce((s, p) => s + p.val, 0), parts };
}
