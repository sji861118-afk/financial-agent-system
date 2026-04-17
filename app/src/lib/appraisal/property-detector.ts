import type { ApplicationFormType } from '@/types/appraisal';

const TYPE_KEYWORDS: Record<ApplicationFormType, { strong: string[]; weak: string[] }> = {
  'apartment-pf': {
    strong: ['아파트', '공동주택', '주택재건축', '주택재개발', '지역주택조합', 'PF대출'],
    weak: ['세대수', '평형', '단지'],
  },
  'industrial-center': {
    strong: ['지식산업센터', '지산센터', '집합건물(공장)', '아파트형공장'],
    weak: ['호실', '제조시설', '연구소'],
  },
  'land-pf': {
    strong: ['나대지', '브릿지대출', '필지', '용도지역', '개별공시지가'],
    weak: ['지번', '도로조건'],
  },
};

export interface PropertyDetectionResult {
  type: ApplicationFormType;
  confidence: number;
  scores: Record<ApplicationFormType, number>;
}

export function detectApplicationFormType(text: string): PropertyDetectionResult {
  const scores: Record<ApplicationFormType, number> = {
    'apartment-pf': 0,
    'industrial-center': 0,
    'land-pf': 0,
  };

  for (const [type, kws] of Object.entries(TYPE_KEYWORDS) as [ApplicationFormType, typeof TYPE_KEYWORDS['apartment-pf']][]) {
    for (const kw of kws.strong) {
      const matches = text.match(new RegExp(escapeRegex(kw), 'g'));
      scores[type] += (matches?.length ?? 0) * 3;
    }
    for (const kw of kws.weak) {
      const matches = text.match(new RegExp(escapeRegex(kw), 'g'));
      scores[type] += (matches?.length ?? 0) * 1;
    }
  }

  const sorted = (Object.entries(scores) as [ApplicationFormType, number][])
    .sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = sorted[0];
  const [, secondScore] = sorted[1];

  const confidence = topScore === 0
    ? 0
    : Math.min(1, (topScore - secondScore) / topScore);

  return { type: topType, confidence, scores };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
