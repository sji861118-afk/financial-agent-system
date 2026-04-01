// app/src/lib/loan-engine/sections/common/obligor.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent, FinancialStatements, RelatedEntityFinancials, StatementLineItem, OperatingStatusItem } from '../../types';
import {
  sectionTitle, subTitle, unitLabel, bodyText, headerCell, dataCell, emptyLine, row, fmt, pageBreak,
} from '../helpers';
import { registerSection } from '../registry';

function renderEntityInfo(prefix: string, entity: {
  name: string; representative?: string; businessNumber?: string;
  corporateNumber?: string; establishedDate?: string; industry?: string;
  address?: string; companyType?: string; employeeCount?: number;
  capital?: number; fiscalMonth?: number;
}): SectionContent {
  const rows = [
    row([headerCell('항목', { width: 20 }), headerCell('내용', { width: 30 }),
         headerCell('항목', { width: 20 }), headerCell('내용', { width: 30 })]),
    row([dataCell('기업명'), dataCell(entity.name),
         dataCell('대표자'), dataCell(entity.representative || '-')]),
  ];
  if (entity.businessNumber) {
    rows.push(row([dataCell('사업자번호'), dataCell(entity.businessNumber),
                    dataCell('법인등록번호'), dataCell(entity.corporateNumber || '-')]));
  }
  if (entity.establishedDate) {
    rows.push(row([dataCell('설립일'), dataCell(entity.establishedDate),
                    dataCell('업종'), dataCell(entity.industry || '-')]));
  }
  if (entity.address) {
    rows.push(row([dataCell('소재지'), dataCell(entity.address, { colspan: 3 })]));
  }
  if (entity.companyType || entity.employeeCount) {
    rows.push(row([dataCell('기업형태'), dataCell(entity.companyType || '-'),
                    dataCell('임직원수'), dataCell(entity.employeeCount ? `${entity.employeeCount}명` : '-')]));
  }
  if (entity.capital) {
    rows.push(row([dataCell('자본금'), dataCell(`${fmt(entity.capital)}백만원`),
                    dataCell('결산월'), dataCell(entity.fiscalMonth ? `${entity.fiscalMonth}월` : '-')]));
  }

  return [
    subTitle(`${prefix}. 기본정보`),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
    emptyLine(),
  ];
}

/**
 * Resolve the value for a given year key from a line item.
 * BS uses keys like "'22.12", IS often uses "'22" or "'25*".
 * Try exact match first, then strip month suffix (.MM) and retry.
 */
function resolveValue(item: StatementLineItem, yearKey: string): number | string | null {
  const v = item.values[yearKey];
  if (v !== undefined) return v;
  // Strip month part: "'22.12" → "'22", "'25.12*" → "'25*"
  const stripped = yearKey.replace(/\.\d{2}/, '');
  if (stripped !== yearKey) {
    const v2 = item.values[stripped];
    if (v2 !== undefined) return v2;
  }
  return undefined as unknown as null;
}

/** Derive IS column headers from years: "'22.12" → "'22", "'25.12*" → "'25*" */
function isYearHeader(yearKey: string): string {
  return yearKey.replace(/\.\d{2}/, '');
}

/** Render multi-line analysis text as separate paragraphs */
function analysisBlock(text: string): SectionContent {
  if (!text) return [];
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map(l => bodyText(l));
}

/** Format a cell value: numbers get comma formatting, strings/ratios pass through */
function fmtVal(val: number | string | null | undefined): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'number') return fmt(val);
  // String values that are already formatted (%, 배 etc.) pass through
  return val;
}

function renderStatements(prefix: string, fs: FinancialStatements, label?: string): SectionContent {
  const content: SectionContent = [];
  const titlePrefix = label ? `${prefix}. ${label}` : `${prefix}. 주요 재무현황`;

  // Balance Sheet
  if (fs.balanceSheet.length > 0) {
    content.push(subTitle(titlePrefix), subTitle('■ 재무상태표'), unitLabel('(단위:백만원)'));
    const bsRows = [
      row([headerCell('계정과목', { width: 22 }), ...fs.years.map(y => headerCell(y)), headerCell('전년비')]),
      ...fs.balanceSheet.map(item =>
        row([
          dataCell(item.indent ? `${'  '.repeat(item.indent)}${item.account}` : item.account, { bold: item.bold }),
          ...fs.years.map(y => dataCell(fmtVal(resolveValue(item, y)), { align: AlignmentType.RIGHT, bold: item.bold })),
          dataCell(item.yoyChange || '-', { align: AlignmentType.CENTER }),
        ])
      ),
    ];
    if (fs.ratios?.length) {
      fs.ratios.filter(r => ['부채비율', '자기자본비율', '차입금의존도'].includes(r.account))
        .forEach(r => {
          bsRows.push(row([
            headerCell(r.account),
            ...fs.years.map(y => dataCell(fmtVal(resolveValue(r, y)), { align: AlignmentType.CENTER })),
            dataCell(r.yoyChange || '-', { align: AlignmentType.CENTER }),
          ]));
        });
    }
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: bsRows }), emptyLine());

    // BS analysis comment
    content.push(...analysisBlock(generateBSAnalysis(fs)));
    content.push(emptyLine());
  }

  // Income Statement
  if (fs.incomeStatement.length > 0) {
    const isHeaders = fs.years.map(isYearHeader);
    content.push(subTitle('■ 손익계산서'), unitLabel('(단위:백만원)'));
    const isRows = [
      row([headerCell('계정과목', { width: 22 }), ...isHeaders.map(y => headerCell(y)), headerCell('전년비')]),
      ...fs.incomeStatement.map(item =>
        row([
          dataCell(item.indent ? `${'  '.repeat(item.indent)}${item.account}` : item.account, { bold: item.bold }),
          ...fs.years.map(y => dataCell(fmtVal(resolveValue(item, y)), { align: AlignmentType.RIGHT, bold: item.bold })),
          dataCell(item.yoyChange || '-', { align: AlignmentType.CENTER }),
        ])
      ),
    ];
    if (fs.ratios?.length) {
      fs.ratios.filter(r => ['영업이익률', '순이익률', 'EBITDA', '이자보상배율'].includes(r.account))
        .forEach(r => {
          isRows.push(row([
            headerCell(r.account),
            ...fs.years.map(y => dataCell(fmtVal(resolveValue(r, y)), { align: AlignmentType.CENTER })),
            dataCell(r.yoyChange || '-', { align: AlignmentType.CENTER }),
          ]));
        });
    }
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: isRows }), emptyLine());

    // IS analysis comment
    content.push(...analysisBlock(generateISAnalysis(fs)));
    content.push(emptyLine());
  }

  return content;
}

// ─── Auto Analysis Generators ───

// ─── Analysis Utility Functions ───

function findVal(items: StatementLineItem[], account: string, yearKey: string): number | null {
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
function findAny(items: StatementLineItem[], accounts: string[], yearKey: string): number | null {
  for (const acct of accounts) {
    const v = findVal(items, acct, yearKey);
    if (v !== null) return v;
  }
  return null;
}

function yoyPct(cur: number | null, prev: number | null): string {
  if (cur === null || prev === null || prev === 0) return '';
  const pct = ((cur - prev) / Math.abs(prev) * 100).toFixed(1);
  return Number(pct) >= 0 ? `+${pct}%` : `${pct}%`;
}

function yoyDelta(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null) return null;
  return cur - prev;
}

/** Parse ratio string like "597.4%" → 597.4 */
function parseRatioPct(val: number | string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  const m = val.replace(/,/g, '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

/** Collect numeric values across all years for trend analysis */
function collectSeries(items: StatementLineItem[], account: string, years: string[]): (number | null)[] {
  return years.map(y => findVal(items, account, y));
}

function trendDirection(series: (number | null)[]): '증가' | '감소' | '횡보' | '변동' | null {
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

// ─── BS Analysis ───

function generateBSAnalysis(fs: FinancialStatements): string {
  const years = fs.years;
  if (years.length < 2) return '';
  const cur = years[years.length - 1];
  const prev = years[years.length - 2];
  const bs = fs.balanceSheet;

  const totalAssetCur = findVal(bs, '자산총계', cur);
  const totalAssetPrev = findVal(bs, '자산총계', prev);
  const totalDebtCur = findVal(bs, '부채총계', cur);
  const totalDebtPrev = findVal(bs, '부채총계', prev);
  const totalEquityCur = findVal(bs, '자본총계', cur);
  const totalEquityPrev = findVal(bs, '자본총계', prev);
  const borrowCur = findAny(bs, ['차입금', '차입부채'], cur);
  const borrowPrev = findAny(bs, ['차입금', '차입부채'], prev);
  const bondCur = findVal(bs, '사채', cur);
  const bondPrev = findVal(bs, '사채', prev);
  const loanCur = findAny(bs, ['대출채권', '대출금'], cur);
  const loanPrev = findAny(bs, ['대출채권', '대출금'], prev);
  const provisionCur = findAny(bs, ['대손충당금'], cur);
  const cashCur = findAny(bs, ['현금및예치금', '현금', '현금및현금성자산'], cur);

  const lines: string[] = [];

  // 1) Asset scale & growth
  if (totalAssetCur !== null) {
    const yoy = yoyPct(totalAssetCur, totalAssetPrev);
    let assetLine = `총자산 ${fmt(totalAssetCur)}백만원`;
    if (yoy) assetLine += `(전년비 ${yoy})`;

    // Asset composition driver
    if (loanCur !== null && totalAssetCur > 0) {
      const loanPct = (loanCur / totalAssetCur * 100).toFixed(1);
      assetLine += `. 대출채권이 자산의 ${loanPct}%를 차지`;
      const loanYoy = yoyPct(loanCur, loanPrev);
      if (loanYoy) assetLine += `(${loanYoy})`;
    }
    lines.push(assetLine);
  }

  // 2) Debt structure
  if (totalDebtCur !== null) {
    let debtLine = `부채총계 ${fmt(totalDebtCur)}백만원`;
    const debtYoy = yoyPct(totalDebtCur, totalDebtPrev);
    if (debtYoy) debtLine += `(${debtYoy})`;

    // Borrowing breakdown
    const totalBorrow = (borrowCur ?? 0) + (bondCur ?? 0);
    if (totalBorrow > 0) {
      const parts: string[] = [];
      if (borrowCur) parts.push(`차입금 ${fmt(borrowCur)}`);
      if (bondCur) parts.push(`사채 ${fmt(bondCur)}`);
      debtLine += `. 차입구조: ${parts.join(' + ')} = 총 ${fmt(totalBorrow)}백만원`;

      // Borrowing growth direction
      const totalBorrowPrev = (borrowPrev ?? 0) + (bondPrev ?? 0);
      if (totalBorrowPrev > 0) {
        const bYoy = yoyPct(totalBorrow, totalBorrowPrev);
        if (bYoy) debtLine += `(${bYoy})`;
      }
    }
    lines.push(debtLine);
  }

  // 3) Equity adequacy
  if (totalEquityCur !== null && totalAssetCur !== null && totalAssetCur > 0) {
    const equityRatio = (totalEquityCur / totalAssetCur * 100).toFixed(1);
    let eqLine = `자본총계 ${fmt(totalEquityCur)}백만원(자기자본비율 ${equityRatio}%)`;
    const eqYoy = yoyPct(totalEquityCur, totalEquityPrev);
    if (eqYoy) eqLine += ` 전년비 ${eqYoy}`;

    // Equity adequacy signal
    const eqPct = parseFloat(equityRatio);
    if (eqPct < 10) eqLine += ' → 자본적정성 취약(10% 미만)';
    else if (eqPct < 20) eqLine += ' → 자본적정성 유의';
    lines.push(eqLine);
  }

  // 4) Ratio trends
  const ratioLines: string[] = [];
  const debtRatio = fs.ratios?.find(r => r.account.includes('부채비율'));
  if (debtRatio) {
    const drCur = resolveValue(debtRatio, cur);
    const drPrev = resolveValue(debtRatio, prev);
    if (drCur !== null && drCur !== undefined) {
      let rl = `부채비율 ${drCur}`;
      if (drPrev !== null && drPrev !== undefined) {
        const curNum = parseRatioPct(drCur);
        const prevNum = parseRatioPct(drPrev);
        if (curNum !== null && prevNum !== null) {
          const diff = curNum - prevNum;
          rl += diff > 0 ? ` (전년 ${drPrev} → ${(diff).toFixed(1)}%p 상승)` : ` (전년 ${drPrev} → ${(diff).toFixed(1)}%p)`;
          if (curNum > 800) rl += ' [고위험]';
          else if (curNum > 400) rl += ' [유의]';
        }
      }
      ratioLines.push(rl);
    }
  }
  const borrowDep = fs.ratios?.find(r => r.account.includes('차입금의존도'));
  if (borrowDep) {
    const bdCur = resolveValue(borrowDep, cur);
    if (bdCur !== null && bdCur !== undefined) {
      let rl = `차입금의존도 ${bdCur}`;
      const bdNum = parseRatioPct(bdCur);
      if (bdNum !== null && bdNum > 80) rl += ' [과도]';
      else if (bdNum !== null && bdNum > 60) rl += ' [높음]';
      ratioLines.push(rl);
    }
  }
  if (ratioLines.length > 0) lines.push(ratioLines.join(', '));

  // 5) Provision coverage (for financial companies)
  if (provisionCur !== null && loanCur !== null && loanCur > 0) {
    const coverageRate = (Math.abs(provisionCur) / loanCur * 100).toFixed(2);
    let pLine = `대손충당금 ${fmt(Math.abs(provisionCur))}백만원(대출채권 대비 설정률 ${coverageRate}%)`;
    const cRate = parseFloat(coverageRate);
    if (cRate < 2) pLine += ' → 설정률 낮음, 충당금 적립 확대 필요 여부 점검';
    else if (cRate > 5) pLine += ' → 보수적 적립 수준';
    lines.push(pLine);
  }

  // 6) Liquidity (cash position)
  if (cashCur !== null && totalAssetCur !== null && totalAssetCur > 0) {
    const cashPct = (cashCur / totalAssetCur * 100).toFixed(1);
    if (parseFloat(cashPct) < 3) {
      lines.push(`현금성자산 ${fmt(cashCur)}백만원(자산대비 ${cashPct}%) → 유동성 여력 제한적`);
    }
  }

  // 7) Multi-year asset trend
  if (years.length >= 3) {
    const assetTrend = trendDirection(collectSeries(bs, '자산총계', years));
    const equityTrend = trendDirection(collectSeries(bs, '자본총계', years));
    const trends: string[] = [];
    if (assetTrend) trends.push(`자산 ${assetTrend} 추세`);
    if (equityTrend) trends.push(`자본 ${equityTrend} 추세`);
    if (trends.length > 0) lines.push(`${years.length}개년 추이: ${trends.join(', ')}`);
  }

  if (lines.length === 0) return '';
  return `[재무상태 분석]\n${lines.map(l => `• ${l}`).join('\n')}`;
}

// ─── IS Analysis ───

function generateISAnalysis(fs: FinancialStatements): string {
  const years = fs.years;
  if (years.length < 2) return '';
  const cur = years[years.length - 1];
  const prev = years[years.length - 2];
  const is = fs.incomeStatement;

  const revenueCur = findAny(is, ['영업수익', '매출액'], cur);
  const revenuePrev = findAny(is, ['영업수익', '매출액'], prev);
  const opCostCur = findAny(is, ['영업비용', '매출원가'], cur);
  const opIncomeCur = findAny(is, ['영업이익', '영업이익(손실)'], cur);
  const opIncomePrev = findAny(is, ['영업이익', '영업이익(손실)'], prev);
  const netIncomeCur = findAny(is, ['당기순이익', '당기순이익(손실)'], cur);
  const netIncomePrev = findAny(is, ['당기순이익', '당기순이익(손실)'], prev);
  const interestCur = findAny(is, ['이자비용', '금융비용(이자비용)', '금융비용'], cur);
  const interestPrev = findAny(is, ['이자비용', '금융비용(이자비용)', '금융비용'], prev);
  const provisionCur = findVal(is, '대손상각비', cur);
  const provisionPrev = findVal(is, '대손상각비', prev);
  const sgaCur = findAny(is, ['판매비와관리비', '판관비'], cur);
  const contIncomeCur = findAny(is, ['계속사업이익', '계속사업당기순이익'], cur);
  const discIncomeCur = findVal(is, '중단사업순손익', cur);

  const lines: string[] = [];

  // 1) Revenue growth
  if (revenueCur !== null) {
    let rl = `영업수익 ${fmt(revenueCur)}백만원`;
    const yoy = yoyPct(revenueCur, revenuePrev);
    if (yoy) rl += `(${yoy})`;
    // Growth rate assessment
    if (revenuePrev !== null && revenuePrev > 0) {
      const growthRate = (revenueCur - revenuePrev) / Math.abs(revenuePrev) * 100;
      if (growthRate > 30) rl += ' → 고성장';
      else if (growthRate > 10) rl += ' → 양호한 성장';
      else if (growthRate < -10) rl += ' → 역성장 주의';
    }
    lines.push(rl);
  }

  // 2) Operating profit & margin
  if (opIncomeCur !== null) {
    const status = opIncomeCur >= 0
      ? (opIncomePrev !== null && opIncomePrev < 0 ? '흑자전환' : '')
      : (opIncomePrev !== null && opIncomePrev >= 0 ? '적자전환' : '적자지속');
    let ol = `영업이익 ${fmt(opIncomeCur)}백만원`;
    if (status) ol += `(${status})`;
    const yoy = yoyPct(opIncomeCur, opIncomePrev);
    if (yoy && !status) ol += `(${yoy})`;

    // Operating margin
    if (revenueCur !== null && revenueCur > 0) {
      const margin = (opIncomeCur / revenueCur * 100).toFixed(1);
      ol += `. 영업이익률 ${margin}%`;
      const prevMargin = (opIncomePrev !== null && revenuePrev !== null && revenuePrev > 0)
        ? (opIncomePrev / revenuePrev * 100).toFixed(1) : null;
      if (prevMargin !== null) {
        const diff = parseFloat(margin) - parseFloat(prevMargin);
        ol += diff >= 0 ? `(전년 ${prevMargin}% → ${diff.toFixed(1)}%p 개선)` : `(전년 ${prevMargin}% → ${diff.toFixed(1)}%p 하락)`;
      }
    }
    lines.push(ol);
  }

  // 3) Cost structure analysis (for financial companies)
  if (revenueCur !== null && revenueCur > 0) {
    const costParts: string[] = [];
    if (interestCur !== null) {
      const pct = (interestCur / revenueCur * 100).toFixed(1);
      let ip = `이자비용 ${fmt(interestCur)}(수익대비 ${pct}%)`;
      // Interest burden trend
      if (interestPrev !== null && revenuePrev !== null && revenuePrev > 0) {
        const prevPct = (interestPrev / revenuePrev * 100).toFixed(1);
        const diff = parseFloat(pct) - parseFloat(prevPct);
        if (Math.abs(diff) >= 1) ip += diff > 0 ? ` ↑${diff.toFixed(1)}%p` : ` ↓${Math.abs(diff).toFixed(1)}%p`;
      }
      costParts.push(ip);
    }
    if (provisionCur !== null) {
      const pct = (provisionCur / revenueCur * 100).toFixed(1);
      let pp = `대손상각비 ${fmt(provisionCur)}(${pct}%)`;
      if (provisionPrev !== null && revenuePrev !== null && revenuePrev > 0) {
        const prevPct = (provisionPrev / revenuePrev * 100).toFixed(1);
        const diff = parseFloat(pct) - parseFloat(prevPct);
        if (diff > 3) pp += ' → 대손비용 급증 주의';
        else if (diff > 1) pp += ' → 대손비용 증가';
      }
      costParts.push(pp);
    }
    if (sgaCur !== null) {
      const pct = (sgaCur / revenueCur * 100).toFixed(1);
      costParts.push(`판관비 ${fmt(sgaCur)}(${pct}%)`);
    }
    if (costParts.length > 0) lines.push(`비용구조: ${costParts.join(', ')}`);
  }

  // 4) Net income & special items
  if (netIncomeCur !== null) {
    let nl = `당기순이익 ${fmt(netIncomeCur)}백만원`;
    const yoy = yoyPct(netIncomeCur, netIncomePrev);
    if (yoy) nl += `(${yoy})`;

    // Continuing vs discontinued
    if (contIncomeCur !== null && discIncomeCur !== null && discIncomeCur !== 0) {
      nl += `. 계속사업이익 ${fmt(contIncomeCur)}, 중단사업손익 ${fmt(discIncomeCur)}`;
      if (discIncomeCur < 0 && Math.abs(discIncomeCur) > Math.abs(contIncomeCur) * 0.3) {
        nl += ' → 중단사업 손실이 실적에 큰 영향';
      }
    }

    // Net income vs operating income gap
    if (opIncomeCur !== null && netIncomeCur !== opIncomeCur) {
      const gap = netIncomeCur - opIncomeCur;
      if (Math.abs(gap) > Math.abs(opIncomeCur) * 0.5 && opIncomeCur !== 0) {
        nl += gap > 0 ? '. 영업외이익이 실적 보강' : '. 영업외손실이 실적 훼손';
      }
    }
    lines.push(nl);
  }

  // 5) Interest coverage
  if (interestCur !== null && interestCur > 0 && opIncomeCur !== null) {
    const icr = opIncomeCur / interestCur;
    let il = `이자보상배율 ${icr.toFixed(2)}배`;
    if (icr < 1) il += ' [주의: 영업이익으로 이자비용 감당 불가]';
    else if (icr < 1.5) il += ' [취약: 이자지급 여력 제한적]';
    else if (icr > 3) il += ' [양호]';
    lines.push(il);
  }

  // 6) EBITDA from ratios
  const ebitda = fs.ratios?.find(r => r.account === 'EBITDA');
  if (ebitda) {
    const ev = resolveValue(ebitda, cur);
    if (ev !== null && ev !== undefined) {
      let el = `EBITDA ${ev}백만원`;
      if (interestCur !== null && interestCur > 0) {
        const parsed = typeof ev === 'number' ? ev : parseFloat(String(ev).replace(/,/g, ''));
        if (!isNaN(parsed)) {
          const ebitdaIcr = parsed / interestCur;
          el += `(EBITDA/이자비용 = ${ebitdaIcr.toFixed(2)}배)`;
        }
      }
      lines.push(el);
    }
  }

  // 7) Multi-year revenue/profit trend
  if (years.length >= 3) {
    const revTrend = trendDirection(years.map(y => findAny(is, ['영업수익', '매출액'], y)));
    const opTrend = trendDirection(years.map(y => findAny(is, ['영업이익', '영업이익(손실)'], y)));
    const trends: string[] = [];
    if (revTrend) trends.push(`매출 ${revTrend}`);
    if (opTrend) trends.push(`영업이익 ${opTrend}`);
    if (trends.length > 0) lines.push(`${years.length}개년 추이: ${trends.join(', ')}`);
  }

  if (lines.length === 0) return '';
  return `[손익 분석]\n${lines.map(l => `• ${l}`).join('\n')}`;
}

// ─── Operating Status Analysis ───

function generateOperatingAnalysis(ops: OperatingStatusItem[]): string {
  const lines: string[] = [];
  const lookup = (keywords: string[]): OperatingStatusItem | undefined =>
    ops.find(o => keywords.some(k => o.label.trim().includes(k)));

  // Parse numeric value from string like "207,956백만원" → 207956
  const parseNum = (s: string): number | null => {
    const m = s.replace(/,/g, '').match(/([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  };
  const parsePct = (s: string): number | null => {
    const m = s.match(/([\d.]+)%/);
    return m ? parseFloat(m[1]) : null;
  };

  // Lending portfolio
  const loanItem = lookup(['대출채권', '대출잔액', '대출금']);
  if (loanItem) lines.push(`대출채권 잔액 ${loanItem.value}`);

  // NPL
  const nplItem = lookup(['NPL', 'npl', '부실']);
  if (nplItem) {
    const nplVal = parseNum(nplItem.value);
    const loanVal = loanItem ? parseNum(loanItem.value) : null;
    let nl = `NPL매입채권 ${nplItem.value}`;
    if (nplVal !== null && loanVal !== null && loanVal > 0) {
      nl += `(대출채권 대비 ${(nplVal / loanVal * 100).toFixed(1)}%)`;
    }
    lines.push(nl);
  }

  // Delinquency rates
  const delq1 = lookup(['연체율']);
  const delq30 = ops.find(o => o.label.includes('연체율') && (o.label.includes('30일') || o.label.includes('31일')));
  const delq1d = ops.find(o => o.label.includes('연체율') && o.label.includes('1일'));
  if (delq1d && delq30) {
    const d1 = parsePct(delq1d.value);
    const d30 = parsePct(delq30.value);
    let dl = `연체율: 1일이상 ${delq1d.value}, 30일초과 ${delq30.value}`;
    if (d1 !== null && d30 !== null) {
      const shortTermPct = ((d1 - d30) / d1 * 100).toFixed(0);
      dl += ` → 단기연체(1~30일) 비중 ${shortTermPct}%`;
      if (d30 > 5) dl += ', 장기연체 관리 주의';
      else if (d30 > 3) dl += ', 장기연체 유의';
    }
    lines.push(dl);
  } else if (delq1) {
    lines.push(`연체율 ${delq1.value}`);
  }

  // Provision coverage
  const provItem = lookup(['대손충당금']);
  if (provItem) {
    let pl = `대손충당금 ${provItem.value}`;
    if (provItem.note) pl += `(${provItem.note})`;
    const provRate = provItem.note ? parsePct(provItem.note) : null;
    if (provRate !== null) {
      if (provRate < 3) pl += ' → 충당금 설정률 낮음, 적립 확대 검토 필요';
      else if (provRate > 8) pl += ' → 보수적 충당금 적립';
      else pl += ' → 적정 수준';
    }
    lines.push(pl);
  }

  // Lending rate & spread
  const rateItem = lookup(['평균', '가중평균']);
  if (rateItem) {
    const lendRate = parsePct(rateItem.value);
    let rl = `가중평균 대출금리 ${rateItem.value}`;
    if (lendRate !== null) {
      if (lendRate > 20) rl += ' → 고금리 상품 위주(연체/신용리스크 내재)';
      else if (lendRate > 12) rl += ' → 중금리 대출 중심';
    }
    lines.push(rl);
  }

  // Customer base
  const custItem = lookup(['고객수', '고객']);
  const empItem = lookup(['직원수', '직원', '임직원']);
  if (custItem && empItem) {
    const cust = parseNum(custItem.value);
    const emp = parseNum(empItem.value);
    if (cust !== null && emp !== null && emp > 0) {
      lines.push(`고객수 ${custItem.value}, 직원수 ${empItem.value} (직원 1인당 고객 ${Math.round(cust / emp)}명)`);
    }
  }

  if (lines.length === 0) return '';
  return `[영업현황 분석]\n${lines.map(l => `• ${l}`).join('\n')}`;
}

function buildObligorBorrower(data: LoanApplication): SectionContent {
  const b = data.borrower;
  const fs = data.financials.borrower;
  const content: SectionContent = [
    pageBreak(),
    sectionTitle('채무관련인 현황'),
    emptyLine(),
    subTitle('1. 차주사 현황'),
    bodyText(`(조사기준일: ${fs.years[fs.years.length - 1] || '-'})`),
    ...renderEntityInfo('1-1', { ...b, fiscalMonth: b.fiscalMonth }),
  ];

  // Shareholders
  if (b.shareholders?.length) {
    content.push(subTitle('■ 주주구성'));
    const shRows = [
      row([headerCell('주주명'), headerCell('주식종류'), headerCell('주식수'), headerCell('지분율'), headerCell('비고')]),
      ...b.shareholders.map(s => row([
        dataCell(s.name), dataCell(s.stockType),
        dataCell(fmt(s.shares), { align: AlignmentType.RIGHT }),
        dataCell(s.ownershipPct != null ? `${s.ownershipPct.toFixed(2)}%` : '-', { align: AlignmentType.CENTER }),
        dataCell(s.note || ''),
      ])),
    ];
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: shRows }), emptyLine());
  }

  // Individual financial statements
  const hasConsolidated = data.financials.consolidatedStatements &&
    (data.financials.consolidatedStatements.balanceSheet.length > 0 ||
     data.financials.consolidatedStatements.incomeStatement.length > 0);
  content.push(...renderStatements('1-2', fs, hasConsolidated ? '개별 재무현황' : '주요 재무현황'));

  // Consolidated financial statements (if available)
  if (hasConsolidated) {
    const cfs = data.financials.consolidatedStatements!;
    content.push(...renderStatements('1-3', cfs, '연결 재무현황'));
  }

  // Operating status
  const opPrefix = hasConsolidated ? '1-4' : '1-3';
  if (b.operatingStatus?.length) {
    content.push(subTitle(`${opPrefix}. 영업현황`));
    const opRows = [
      row([headerCell('항목'), headerCell('수치'), headerCell('비고')]),
      ...b.operatingStatus.map(o => row([dataCell(o.label), dataCell(o.value), dataCell(o.note || '')])),
    ];
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: opRows }), emptyLine());

    // Operating status analysis
    content.push(...analysisBlock(generateOperatingAnalysis(b.operatingStatus)));
    content.push(emptyLine());
  }

  return content;
}

function buildObligorRelated(data: LoanApplication): SectionContent | null {
  const subs = data.financials.subsidiaries || [];
  const related = data.financials.relatedCompanies || [];
  const all = [...subs, ...related];
  if (all.length === 0) return null;

  const content: SectionContent = [];
  let idx = 2; // starts at 2 (1 = borrower)

  for (const rel of all) {
    content.push(pageBreak());
    content.push(subTitle(`${idx}. ${rel.entity.relationship} 현황 - ${rel.entity.name}`));
    if (rel.entity.establishedDate) {
      content.push(bodyText(`(조사기준일: ${rel.statements?.years[rel.statements.years.length - 1] || '-'})`));
    }
    content.push(emptyLine());

    if (rel.detailLevel === 'full' && rel.statements) {
      content.push(...renderEntityInfo(`${idx}-1`, rel.entity));
      content.push(...renderStatements(`${idx}-2`, rel.statements));
      if (rel.operatingStatus?.length) {
        content.push(subTitle(`${idx}-3. 영업현황`));
        const opRows = [
          row([headerCell('항목'), headerCell('수치'), headerCell('비고')]),
          ...rel.operatingStatus.map(o => row([dataCell(o.label), dataCell(o.value), dataCell(o.note || '')])),
        ];
        content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: opRows }), emptyLine());
        content.push(...analysisBlock(generateOperatingAnalysis(rel.operatingStatus)));
        content.push(emptyLine());
      }
    } else if (rel.detailLevel === 'summary' && rel.summaryRow) {
      content.push(...renderEntityInfo(`${idx}-1`, rel.entity));
      const s = rel.summaryRow;
      content.push(subTitle(`${idx}-2. 간략 재무현황`), unitLabel('(단위:백만원)'));
      content.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          row([headerCell('자산총계'), headerCell('부채총계'), headerCell('자본총계'),
               headerCell('매출액'), headerCell('영업이익'), headerCell('당기순이익')]),
          row([
            dataCell(s.totalAssets != null ? fmt(s.totalAssets) : '-', { align: AlignmentType.RIGHT }),
            dataCell(s.totalLiabilities != null ? fmt(s.totalLiabilities) : '-', { align: AlignmentType.RIGHT }),
            dataCell(s.totalEquity != null ? fmt(s.totalEquity) : '-', { align: AlignmentType.RIGHT }),
            dataCell(s.revenue != null ? fmt(s.revenue) : '-', { align: AlignmentType.RIGHT }),
            dataCell(s.operatingIncome != null ? fmt(s.operatingIncome) : '-', { align: AlignmentType.RIGHT }),
            dataCell(s.netIncome != null ? fmt(s.netIncome) : '-', { align: AlignmentType.RIGHT }),
          ]),
        ],
      }), emptyLine());
    } else {
      // minimal — just entity info
      content.push(...renderEntityInfo(`${idx}-1`, rel.entity));
      if (rel.entity.note) {
        content.push(bodyText(rel.entity.note), emptyLine());
      }
    }

    idx++;
  }

  return content;
}

registerSection('obligor-borrower', buildObligorBorrower);
registerSection('obligor-related', buildObligorRelated);
export { buildObligorBorrower, buildObligorRelated, renderStatements, renderEntityInfo };
