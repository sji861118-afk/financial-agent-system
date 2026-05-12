// 효성중공업 사업보고서에서 "판매비와관리비" 명세표 정확한 위치 찾기
import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
config({ path: '.env.local' });
const JSZip = (await import('jszip')).default;

const apiKey = process.env.DART_API_KEY;
const RCEPT = '20260311004208';

const r = await fetch(`https://opendart.fss.or.kr/api/document.xml?crtfc_key=${apiKey}&rcept_no=${RCEPT}`);
const buf = Buffer.from(await r.arrayBuffer());
const zip = await JSZip.loadAsync(buf);
const main = await zip.files['20260311004208.xml'].async('string');

// "감가상각비"가 등장하는 모든 TABLE을 추출하고, 그 표의 헤더(첫 TR)와 라벨 컬럼 분석
const tables = main.match(/<TABLE[^>]*>[\s\S]*?<\/TABLE>/gi) || [];
console.log('전체 TABLE 수:', tables.length);

let count = 0;
for (let ti = 0; ti < tables.length; ti++) {
  const t = tables[ti];
  const cleaned = t.replace(/\s/g, '');
  if (!/감가상각비/.test(cleaned)) continue;
  count++;

  // 표 안의 모든 TR을 라벨만 추출
  const trs = t.match(/<TR[^>]*>[\s\S]*?<\/TR>/gi) || [];
  const labels = [];
  for (const tr of trs) {
    const tds = tr.match(/<(?:TD|TH|TE)[^>]*>[\s\S]*?(?=<(?:TD|TH|TE)|<\/TR)/gi) || [];
    if (!tds.length) continue;
    const cells = tds.map(c => c.replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' '));
    labels.push(cells);
  }

  // 첫 3행 (헤더)와 감가/무형 매칭 행
  console.log(`\n=== Table ${ti} (${trs.length}행) ===`);
  console.log('  헤더 후보:');
  for (let i = 0; i < Math.min(3, labels.length); i++) {
    console.log(`    [${i}] ${labels[i].slice(0, 8).join(' | ')}`);
  }
  console.log('  감가/무형 행:');
  for (let i = 0; i < labels.length; i++) {
    const lab = labels[i][0] || '';
    if (/감가상각비|무형자산상각비|사용권자산/.test(lab.replace(/\s/g, ''))) {
      console.log(`    [${i}] ${labels[i].slice(0, 8).join(' | ')}`);
    }
  }
  // "판매비와관리비"가 표 컨텍스트에 있는지 표 직전 200자 보기
  const tIdx = main.indexOf(t);
  const before = main.slice(Math.max(0, tIdx-300), tIdx).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  console.log(`  표 직전 컨텍스트: ...${before.slice(-200)}`);
  if (count >= 8) break;
}
