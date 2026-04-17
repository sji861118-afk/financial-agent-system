// 감수 에이전트용 통계/분석 헬퍼

export interface DistributionStats {
  count: number;
  sum: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  stddev: number;
  cv: number; // 변동계수 (stddev / mean)
}

export function computeStats(values: number[]): DistributionStats | null {
  const xs = values.filter((v) => Number.isFinite(v) && v > 0);
  if (xs.length === 0) return null;
  const n = xs.length;
  const sum = xs.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const sorted = [...xs].sort((a, b) => a - b);
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2];
  const min = sorted[0];
  const max = sorted[n - 1];
  const variance = xs.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const cv = mean > 0 ? stddev / mean : 0;
  return { count: n, sum, mean, median, min, max, stddev, cv };
}

/** 이상치(outlier) 검출 — IQR 기반. 1.5*IQR 밖의 값 반환. */
export function detectOutliers<T>(items: T[], getValue: (it: T) => number): T[] {
  const xs = items.map(getValue).filter((v) => Number.isFinite(v));
  if (xs.length < 4) return [];
  const sorted = [...xs].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return items.filter((it) => {
    const v = getValue(it);
    return Number.isFinite(v) && (v < lo || v > hi);
  });
}

/** 백만원 단위 사람 친화 표기 ("780억원", "1.2조원" 등). 입력은 원 단위. */
export function formatKRW(won: number): string {
  if (!Number.isFinite(won) || won === 0) return '0원';
  const eok = won / 100_000_000; // 억
  if (Math.abs(eok) >= 10_000) {
    return `${(eok / 10_000).toFixed(2)}조원`;
  }
  if (Math.abs(eok) >= 1) {
    return `${eok.toFixed(0)}억원`;
  }
  return `${(won / 1_000_000).toFixed(0)}백만원`;
}

/** 감정가 규모별 위험 카테고리 (원 단위 입력) */
export function classifyScale(won: number): {
  category: '소형' | '중형' | '대형' | '초대형';
  description: string;
} {
  const eok = won / 100_000_000;
  if (eok < 50) return { category: '소형', description: '50억원 미만 (개별 담보 수준)' };
  if (eok < 300) return { category: '중형', description: '50~300억원 (중규모 담보 또는 PF)' };
  if (eok < 1000) return { category: '대형', description: '300~1,000억원 (대형 PF — 단일 담보 집중도 검토 필요)' };
  return { category: '초대형', description: '1,000억원 이상 (초대형 PF — 공동담보·신탁구조·분할 회수 권장)' };
}
