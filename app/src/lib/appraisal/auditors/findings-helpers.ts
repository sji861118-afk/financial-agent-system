import type { ReviewFinding } from '@/types/appraisal';

export function err(perspective: ReviewFinding['perspective'], category: string, message: string, opts?: Partial<ReviewFinding>): ReviewFinding {
  return { severity: 'ERROR', perspective, category, message, ...opts };
}

export function warn(perspective: ReviewFinding['perspective'], category: string, message: string, opts?: Partial<ReviewFinding>): ReviewFinding {
  return { severity: 'WARNING', perspective, category, message, ...opts };
}

export function info(perspective: ReviewFinding['perspective'], category: string, message: string, opts?: Partial<ReviewFinding>): ReviewFinding {
  return { severity: 'INFO', perspective, category, message, ...opts };
}

export function countBySeverity(findings: ReviewFinding[]): { error: number; warning: number; info: number } {
  return {
    error: findings.filter(f => f.severity === 'ERROR').length,
    warning: findings.filter(f => f.severity === 'WARNING').length,
    info: findings.filter(f => f.severity === 'INFO').length,
  };
}
