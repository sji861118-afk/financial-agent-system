import { NextRequest, NextResponse } from 'next/server';
import { parseAppraisalPdf, extractRawText } from '@/lib/appraisal-parser';
import { detectApplicationFormType } from '@/lib/appraisal/property-detector';
import { generateAppraisalExcel } from '@/lib/appraisal/orchestrator';
import { adaptParserResult } from '@/lib/appraisal/parser-adapter';
import type { AppraisalParseResult } from '@/types/appraisal';
import type { ApplicationFormType, GenerateAppraisalResponse, ParsedReportMeta } from '@/types/appraisal';

export const maxDuration = 60;
export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse<GenerateAppraisalResponse | { error: string }>> {
  try {
    const formData = await req.formData();
    const appraisalFiles = formData.getAll('appraisalFiles') as File[];
    const feasibilityFiles = formData.getAll('feasibilityFiles') as File[];
    const requestedType = formData.get('propertyType') as string | null;

    if (appraisalFiles.length === 0) {
      return NextResponse.json({ error: '감정평가서 PDF를 업로드해주세요' }, { status: 400 });
    }

    // 물건유형 사전 결정 (parseAppraisalPdf의 2번째 인자로 필요)
    let preliminaryType: ApplicationFormType = 'apartment-pf'; // 기본값
    let detectionConfidence = 0;

    // 1차: 감지용 raw text 추출
    let combinedText = '';
    for (const file of appraisalFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      try {
        combinedText += (await extractRawText(buffer)) + '\n';
      } catch {
        // 무시 - 파싱 단계에서 에러 처리
      }
    }

    if (requestedType && requestedType !== 'auto' &&
        ['apartment-pf', 'industrial-center', 'land-pf'].includes(requestedType)) {
      preliminaryType = requestedType as ApplicationFormType;
      detectionConfidence = 1;
    } else {
      const detected = detectApplicationFormType(combinedText);
      if (detected.confidence === 0) {
        return NextResponse.json({
          error: '물건유형 자동감지 실패 — 수동으로 선택 후 재요청해주세요'
        }, { status: 422 });
      }
      preliminaryType = detected.type;
      detectionConfidence = detected.confidence;
    }

    // 2차: 실제 PDF 파싱 (감정평가서)
    const appraisalMetas: ParsedReportMeta[] = [];
    let parsedAppraisal: AppraisalParseResult | null = null;
    for (const file of appraisalFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      try {
        const result = await parseAppraisalPdf(buffer, preliminaryType);
        if (!parsedAppraisal) parsedAppraisal = result;
        appraisalMetas.push({
          fileName: file.name,
          pages: 0,  // parseAppraisalPdf가 페이지 수를 반환하지 않음
          appraiser: (result.collateral as { appraiser?: string })?.appraiser,
          baseDate: (result.collateral as { baseDate?: string })?.baseDate,
          parseStatus: result.warnings.length > 0 ? 'partial' : 'ok',
        });
      } catch (e) {
        console.error(`PDF 파싱 실패 ${file.name}:`, e);
        appraisalMetas.push({ fileName: file.name, pages: 0, parseStatus: 'failed' });
      }
    }

    if (!parsedAppraisal) {
      return NextResponse.json({ error: 'PDF 파싱 실패 — 모든 감정평가서를 읽을 수 없습니다' }, { status: 400 });
    }

    // 3차: 사업성평가보고서 파싱 (있으면)
    const feasibilityMetas: ParsedReportMeta[] = [];
    let parsedFeasibility: AppraisalParseResult | null = null;
    for (const file of feasibilityFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      try {
        const result = await parseAppraisalPdf(buffer, preliminaryType);
        if (!parsedFeasibility) parsedFeasibility = result;
        feasibilityMetas.push({
          fileName: file.name,
          pages: 0,
          parseStatus: result.warnings.length > 0 ? 'partial' : 'ok',
        });
      } catch (e) {
        console.error(`feasibility PDF 파싱 실패 ${file.name}:`, e);
        feasibilityMetas.push({ fileName: file.name, pages: 0, parseStatus: 'failed' });
      }
    }

    // 4차: 어댑터로 정규화
    const data = adaptParserResult(
      parsedAppraisal,
      preliminaryType,
      detectionConfidence,
      appraisalMetas,
      feasibilityMetas,
      parsedFeasibility,
    );

    // 5차: Excel 생성
    const { buffer, findings, fileName } = await generateAppraisalExcel({ data });

    return NextResponse.json({
      success: true,
      excelBase64: buffer.toString('base64'),
      detectedType: preliminaryType,
      detectionConfidence,
      findings,
      warnings: data.missingFields.length > 0
        ? [`주요 필드 누락: ${data.missingFields.join(', ')}`]
        : [],
      fileName,
    });
  } catch (e) {
    console.error('/api/appraisal/generate failed:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error' }, { status: 500 });
  }
}
