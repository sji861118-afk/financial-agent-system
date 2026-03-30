// app/src/lib/loan-engine/sections/common/opinion.ts
import type { LoanApplication, SectionContent } from '../../types.js';
import { subTitle, bulletText, bodyText, tbdText, emptyLine } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildOpinion(data: LoanApplication): SectionContent {
  const branch = data.meta.branch;
  const content: SectionContent = [
    subTitle(`3. 신청점 종합의견 (${branch})`),
    emptyLine(),
  ];

  if (data.aiContent.opinion) {
    // AI-generated opinion: split by paragraphs
    const paragraphs = data.aiContent.opinion.split('\n').filter(p => p.trim());
    paragraphs.forEach(p => {
      const trimmed = p.trim();
      if (trimmed.startsWith('□') || trimmed.startsWith('-')) {
        content.push(bulletText(trimmed.replace(/^[□\-]\s*/, '')));
      } else {
        content.push(bodyText(trimmed));
      }
    });
  } else {
    content.push(tbdText('[AI 종합의견 미생성 — 수동 작성 필요]'));
  }

  content.push(emptyLine());
  return content;
}

registerSection('opinion', buildOpinion);
export { buildOpinion };
