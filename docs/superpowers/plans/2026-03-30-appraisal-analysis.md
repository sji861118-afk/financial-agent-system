# 감정평가서 분석 자동화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 감정평가서/사업성평가보고서 PDF를 업로드하면 담보분석 데이터를 자동 추출하고, 인포케어 낙찰통계 크롤링 + 외부 API 연동하여 신청서 양식 Excel을 생성하는 도구

**Architecture:** Next.js App Router API 라우트에서 PDF 파싱(pdfjs-dist 좌표 기반) + 인포케어 Puppeteer 크롤링 + 공공데이터 API 호출. 클라이언트에서 Step 위저드 UI로 업로드 → 추출 → 편집(4탭) → Excel 다운로드. 상태는 React useState로 관리.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / pdfjs-dist 5.5 / ExcelJS 4.4 / puppeteer-core + @sparticuz/chromium / shadcn/ui / Tailwind 4

**Design Spec:** `docs/superpowers/specs/2026-03-30-appraisal-analysis-design.md`

---

## File Structure

### New Files
```
app/src/types/appraisal.ts                    — 전체 타입 정의
app/src/lib/appraisal-parser.ts               — 감정평가서 PDF 파서 (pdfjs-dist)
app/src/lib/infocare-crawler.ts               — 인포케어 낙찰통계 크롤링
app/src/lib/market-api.ts                     — 공공데이터 API (실거래가/공시지가)
app/src/lib/appraisal-excel.ts                — 담보분석 Excel 생성기
app/src/app/api/appraisal/parse/route.ts      — PDF 파싱 API
app/src/app/api/appraisal/infocare/route.ts   — 인포케어 크롤링 API
app/src/app/api/appraisal/market-data/route.ts — 외부 데이터 API
app/src/app/api/appraisal/excel/route.ts      — Excel 생성 API
app/src/components/appraisal/upload-step.tsx   — Step 1: 업로드 + 기본정보
app/src/components/appraisal/extraction-progress.tsx — Step 2: 추출 진행
app/src/components/appraisal/collateral-tab.tsx — 담보분석 편집 탭
app/src/components/appraisal/supply-tab.tsx    — 공급개요 편집 탭
app/src/components/appraisal/comparative-tab.tsx — 비준사례 편집 탭
app/src/components/appraisal/market-tab.tsx    — 시장환경 편집 탭
```

### Modified Files
```
app/src/app/appraisal/page.tsx                — 전면 개편 (Step 위저드 + 탭)
app/src/types/index.ts                        — AppraisalResult 타입 확장
```

---

## Phase 1: 공통 기반 + 담보분석 + 공급개요

### Task 1: 타입 정의

**Files:**
- Create: `app/src/types/appraisal.ts`

- [ ] **Step 1: 전체 타입 파일 작성**

```typescript
// app/src/types/appraisal.ts

// ── 물건 유형 ──
export type PropertyType = '아파트' | '지식산업센터' | '오피스텔' | '오피스' | '토지' | '근린생활시설' | '상가' | '기타';

// ── 주소 ──
export interface Address {
  sido: string;
  gugun: string;
  dong: string;
  detail: string;
  full: string;
}

// ── 업로드 파일 ──
export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: 'appraisal' | 'feasibility' | 'reference';
  file: File;
}

// ── 담보물 항목 ──
export interface CollateralItem {
  type: string;
  quantity: number;
  areaSqm: number;
  areaPyeong: number;
  appraisalValue: number;
  collateralRatio: number;
  priorClaims: number;
  availableValue: number;
  ltv: number;
}

// ── 권리현황 ──
export interface RightEntry {
  order: number;
  type: string;
  holder: string;
  principal: number;
  settingRatio: number;
  maxClaim: number;
  ltv: number;
}

// ── 담보분석 ──
export interface CollateralAnalysis {
  owner: string;
  trustee: string;
  appraiser: string;
  debtor: string;
  purpose: string;
  submittedTo: string;
  baseDate: string;
  serialNo: string;
  method: {
    comparison: number;
    cost: number;
    income: number;
  };
  appraisalValue: number;
  formRequirements: {
    officialAppraisal: boolean;
    signatureComplete: boolean;
    forFinancialUse: boolean;
    reused: boolean;
    reusedNote: string;
    conditional: boolean;
  };
  items: CollateralItem[];
  totalArea: number;
  totalAreaPyeong: number;
  collateralRatio: number;
  priorClaims: number;
  availableValue: number;
  ltv: number;
  rights: RightEntry[];
  remarks: string;
  opinion: string;
}

// ── 낙찰통계 ──
export interface AuctionStatRow {
  period: '12개월' | '6개월' | '3개월';
  regional: { rate: number; count: number };
  district: { rate: number; count: number };
  dong: { rate: number; count: number };
}

export interface AuctionStats {
  region: string;
  district: string;
  dong: string;
  propertyType: string;
  baseMonth: string;
  stats: AuctionStatRow[];
  source: string;
  retrievedAt: string;
}

// ── 회수예상가 ──
export interface RecoveryEstimate {
  appraisalValue: number;
  appliedRate: number;
  appliedPeriod: string;
  appliedLevel: string;
  priorClaims: number;
  pariPassuShare: number;
  distributionAmount: number;
  recoveryAmount: number;
  lossAmount: number;
  opinion: string;
}

// ── 공급 테이블 행 ──
export interface SupplyRow {
  category: string;
  type: string;
  units: number;
  areaSqm: number;
  areaPyeong: number;
  pricePerPyeong: number;
  pricePerUnit: number;
  totalPrice: number;
  ratio: number;
}

// ── 분양현황 행 ──
export interface SalesStatusRow {
  type: string;
  totalUnits: number;
  totalAmount: number;
  soldUnits: number;
  soldAmount: number;
  unsoldUnits: number;
  unsoldAmount: number;
  salesRateUnits: number;
  salesRateAmount: number;
}

// ── 공급개요 ──
export interface SupplyOverview {
  project: {
    name: string;
    purpose: string;
    developer: string;
    constructor: string;
    address: string;
    zoning: string;
    landArea: { sqm: number; pyeong: number };
    buildingArea: { sqm: number; pyeong: number };
    grossArea: { sqm: number; pyeong: number };
    coverageRatio: number;
    floorAreaRatio: number;
    parking: number;
    scale: string;
    constructionPeriod: string;
    completionDate: string;
    salesRate: number;
  };
  supplyTable: SupplyRow[];
  salesStatus: SalesStatusRow[];
}

// ── 상세담보현황 ──
export interface CollateralDetailItem {
  no: number;
  unit: string;
  floor: string;
  areaSqm: number;
  areaPyeong: number;
  appraisalValue: number;
  planPrice: number;
  releaseCondition: number;
  appraisalPricePerPyeong: number;
  planPricePerPyeong: number;
  status: '분양' | '미분양' | '계약' | '잔금납부';
  remarks: string;
}

// ── 비준사례 ──
export interface ComparativeCase {
  type: '거래' | '평가';
  label: string;
  address: string;
  buildingName: string;
  unit: string;
  areaSqm: number;
  areaPyeong: number;
  usage: string;
  price: number;
  pricePerPyeong: number;
  baseDate: string;
  purpose: string;
  source: string;
}

// ── 실거래가 ──
export interface RealTransactionRow {
  address: string;
  buildingName: string;
  areaSqm: number;
  price: number;
  pricePerPyeong: number;
  transactionDate: string;
  floor: string;
}

// ── 공시지가 ──
export interface LandPriceRow {
  address: string;
  pricePerSqm: number;
  year: number;
  changeRate: number;
}

// ── 주변 단지 ──
export interface NearbyComplex {
  name: string;
  distance: string;
  areaSqm: number;
  pricePerPyeong: number;
  completionYear: number;
  salesRate: number;
  source: string;
}

// ── 시장환경 ──
export interface MarketAnalysis {
  location: {
    description: string;
    transportation: string;
    education: string;
    amenities: string;
  };
  realTransactions: {
    data: RealTransactionRow[];
    source: string;
    retrievedAt: string;
  };
  officialLandPrice: {
    data: LandPriceRow[];
    source: string;
    retrievedAt: string;
  };
  priceComparison: {
    description: string;
    nearbyComplexes: NearbyComplex[];
  };
}

// ── 최상위 케이스 ──
export interface AppraisalCase {
  id: string;
  caseName: string;
  borrowerName: string;
  address: Address;
  propertyType: PropertyType;
  files: UploadedFile[];
  collateral: CollateralAnalysis;
  auctionStats: AuctionStats;
  recoveryEstimate: RecoveryEstimate;
  supply: SupplyOverview;
  collateralDetail: CollateralDetailItem[];
  comparatives: ComparativeCase[];
  marketAnalysis: MarketAnalysis;
  createdAt: string;
  updatedAt: string;
}

// ── 빈 초기값 생성 함수 ──
export function createEmptyCase(): AppraisalCase {
  return {
    id: crypto.randomUUID(),
    caseName: '',
    borrowerName: '',
    address: { sido: '', gugun: '', dong: '', detail: '', full: '' },
    propertyType: '아파트',
    files: [],
    collateral: {
      owner: '', trustee: '', appraiser: '', debtor: '',
      purpose: '담보', submittedTo: '', baseDate: '', serialNo: '',
      method: { comparison: 100, cost: 0, income: 0 },
      appraisalValue: 0,
      formRequirements: {
        officialAppraisal: false, signatureComplete: false,
        forFinancialUse: false, reused: false, reusedNote: '', conditional: false,
      },
      items: [], totalArea: 0, totalAreaPyeong: 0,
      collateralRatio: 0, priorClaims: 0, availableValue: 0, ltv: 0,
      rights: [], remarks: '', opinion: '',
    },
    auctionStats: {
      region: '', district: '', dong: '', propertyType: '',
      baseMonth: '', stats: [], source: '인포케어', retrievedAt: '',
    },
    recoveryEstimate: {
      appraisalValue: 0, appliedRate: 0, appliedPeriod: '3개월',
      appliedLevel: '', priorClaims: 0, pariPassuShare: 0,
      distributionAmount: 0, recoveryAmount: 0, lossAmount: 0, opinion: '',
    },
    supply: {
      project: {
        name: '', purpose: '', developer: '', constructor: '',
        address: '', zoning: '',
        landArea: { sqm: 0, pyeong: 0 },
        buildingArea: { sqm: 0, pyeong: 0 },
        grossArea: { sqm: 0, pyeong: 0 },
        coverageRatio: 0, floorAreaRatio: 0, parking: 0,
        scale: '', constructionPeriod: '', completionDate: '', salesRate: 0,
      },
      supplyTable: [],
      salesStatus: [],
    },
    collateralDetail: [],
    comparatives: [],
    marketAnalysis: {
      location: { description: '', transportation: '', education: '', amenities: '' },
      realTransactions: { data: [], source: '', retrievedAt: '' },
      officialLandPrice: { data: [], source: '', retrievedAt: '' },
      priceComparison: { description: '', nearbyComplexes: [] },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── PDF 파싱 결과 ──
export interface AppraisalParseResult {
  collateral: Partial<CollateralAnalysis>;
  comparatives: ComparativeCase[];
  supply: Partial<SupplyOverview>;
  collateralDetail: CollateralDetailItem[];
  confidence: Record<string, number>;
  warnings: string[];
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/src/types/appraisal.ts
git commit -m "feat(appraisal): add type definitions for appraisal analysis"
```

---

### Task 2: 페이지 스켈레톤 (Step 위저드 + 탭)

**Files:**
- Modify: `app/src/app/appraisal/page.tsx` — 전면 개편
- Create: `app/src/components/appraisal/upload-step.tsx`

- [ ] **Step 1: upload-step.tsx 작성**

업로드 UI 컴포넌트. 건명, 차주명, 소재지, 물건유형, 파일 업로드(감정평가서/사업성/참고자료 3영역).

```typescript
// app/src/components/appraisal/upload-step.tsx
"use client";

import { useCallback, useRef } from "react";
import { FileUp, FileText, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppraisalCase, PropertyType, UploadedFile } from "@/types/appraisal";

interface UploadStepProps {
  data: AppraisalCase;
  onUpdate: (patch: Partial<AppraisalCase>) => void;
  onAddFile: (file: UploadedFile) => void;
  onRemoveFile: (fileId: string) => void;
  onStartAnalysis: () => void;
}

const propertyTypes: PropertyType[] = [
  '아파트', '지식산업센터', '오피스텔', '오피스', '토지', '근린생활시설', '상가', '기타'
];

const fileCategories = [
  { type: 'appraisal' as const, label: '감정평가서', desc: 'PDF 1~2개', accept: '.pdf' },
  { type: 'feasibility' as const, label: '사업성평가보고서', desc: 'PDF 0~2개 (선택)', accept: '.pdf' },
  { type: 'reference' as const, label: 'IM / 참고자료', desc: 'PDF, Excel (선택)', accept: '.pdf,.xlsx,.xls' },
];

export default function UploadStep({ data, onUpdate, onAddFile, onRemoveFile, onStartAnalysis }: UploadStepProps) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleFileDrop = useCallback((e: React.DragEvent, type: UploadedFile['type']) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
      onAddFile({ id: crypto.randomUUID(), name: file.name, size: file.size, type, file });
    });
  }, [onAddFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: UploadedFile['type']) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      onAddFile({ id: crypto.randomUUID(), name: file.name, size: file.size, type, file });
    });
    e.target.value = '';
  }, [onAddFile]);

  const filesOfType = (type: UploadedFile['type']) => data.files.filter(f => f.type === type);

  const hasAppraisalFile = filesOfType('appraisal').length > 0;
  const hasCaseName = data.caseName.trim().length > 0;
  const canStart = hasAppraisalFile && hasCaseName;

  return (
    <div className="space-y-6">
      {/* 기본정보 */}
      <Card>
        <CardHeader>
          <CardTitle>기본정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="caseName">건명 *</Label>
              <Input id="caseName" placeholder="예: 광주 남구 월산동 아파트" value={data.caseName}
                onChange={e => onUpdate({ caseName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="borrowerName">차주명</Label>
              <Input id="borrowerName" placeholder="차주명 입력" value={data.borrowerName}
                onChange={e => onUpdate({ borrowerName: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>물건유형</Label>
              <Select value={data.propertyType}
                onValueChange={v => onUpdate({ propertyType: v as PropertyType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {propertyTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">소재지</Label>
              <Input id="address" placeholder="시/구/동 입력 (예: 광주광역시 남구 월산동)"
                value={data.address.full}
                onChange={e => {
                  const full = e.target.value;
                  const parts = full.split(/\s+/);
                  onUpdate({ address: {
                    sido: parts[0] || '', gugun: parts[1] || '',
                    dong: parts[2] || '', detail: parts.slice(3).join(' '), full,
                  }});
                }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 파일 업로드 (3영역) */}
      {fileCategories.map(cat => (
        <Card key={cat.type}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileUp className="size-4 text-indigo-500" />
              {cat.label}
              <span className="text-sm font-normal text-muted-foreground">{cat.desc}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="flex min-h-[100px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-4 transition-colors hover:border-indigo-400"
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleFileDrop(e, cat.type)}
            >
              {filesOfType(cat.type).length > 0 ? (
                <div className="w-full space-y-2">
                  {filesOfType(cat.type).map(f => (
                    <div key={f.id} className="flex items-center gap-2 rounded bg-gray-50 px-3 py-2">
                      <FileText className="size-4 text-emerald-500" />
                      <span className="flex-1 truncate text-sm">{f.name}</span>
                      <span className="text-xs text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                      <button onClick={() => onRemoveFile(f.id)} className="text-gray-400 hover:text-red-500">
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">파일을 드래그하거나 클릭하여 업로드</p>
              )}
              <label className="mt-2 cursor-pointer">
                <span className="inline-flex h-8 items-center rounded-lg border bg-transparent px-3 text-sm hover:bg-muted">
                  파일 추가
                </span>
                <input type="file" accept={cat.accept} multiple className="hidden"
                  ref={el => { fileInputRefs.current[cat.type] = el; }}
                  onChange={e => handleFileSelect(e, cat.type)} />
              </label>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button onClick={onStartAnalysis} disabled={!canStart} className="w-full" size="lg">
        분석 시작
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: page.tsx 전면 개편 — Step 위저드 구조**

```typescript
// app/src/app/appraisal/page.tsx
"use client";

import { useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { AppraisalCase, UploadedFile } from "@/types/appraisal";
import { createEmptyCase } from "@/types/appraisal";
import UploadStep from "@/components/appraisal/upload-step";

type Step = 'upload' | 'edit';

export default function AppraisalPage() {
  const [step, setStep] = useState<Step>('upload');
  const [data, setData] = useState<AppraisalCase>(createEmptyCase);
  const [loading, setLoading] = useState(false);

  const updateData = useCallback((patch: Partial<AppraisalCase>) => {
    setData(prev => ({ ...prev, ...patch, updatedAt: new Date().toISOString() }));
  }, []);

  const addFile = useCallback((file: UploadedFile) => {
    setData(prev => ({ ...prev, files: [...prev.files, file] }));
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setData(prev => ({ ...prev, files: prev.files.filter(f => f.id !== fileId) }));
  }, []);

  const handleStartAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      // Phase 1: PDF 파싱 + 인포케어 크롤링 병렬 실행
      const appraisalFiles = data.files.filter(f => f.type === 'appraisal' || f.type === 'feasibility');

      if (appraisalFiles.length > 0) {
        const formData = new FormData();
        appraisalFiles.forEach(f => formData.append('files', f.file));
        formData.append('propertyType', data.propertyType);
        formData.append('address', data.address.full);

        const parseRes = await fetch('/api/appraisal/parse', { method: 'POST', body: formData });
        if (parseRes.ok) {
          const { extracted } = await parseRes.json();
          setData(prev => ({
            ...prev,
            collateral: { ...prev.collateral, ...extracted.collateral },
            comparatives: extracted.comparatives?.length ? extracted.comparatives : prev.comparatives,
            supply: { ...prev.supply, ...extracted.supply },
            collateralDetail: extracted.collateralDetail?.length ? extracted.collateralDetail : prev.collateralDetail,
          }));
        }
      }

      // 인포케어 낙찰통계 (주소가 있을 때만)
      if (data.address.sido && data.address.gugun) {
        const infoRes = await fetch('/api/appraisal/infocare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sido: data.address.sido, gugun: data.address.gugun,
            dong: data.address.dong, propertyType: data.propertyType,
          }),
        });
        if (infoRes.ok) {
          const { auctionStats } = await infoRes.json();
          if (auctionStats) {
            setData(prev => ({ ...prev, auctionStats }));
          }
        }
      }

      setStep('edit');
    } catch (err) {
      console.error('Analysis failed:', err);
      setStep('edit'); // 실패해도 편집 화면으로 이동 (수동 입력)
    } finally {
      setLoading(false);
    }
  }, [data]);

  const handleDownloadExcel = useCallback(async () => {
    const res = await fetch('/api/appraisal/excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `담보분석_${data.caseName || '미정'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">감정평가서 분석</h1>
          <p className="text-sm text-muted-foreground">
            {step === 'upload' ? '감정평가서를 업로드하고 기본정보를 입력하세요.' : '추출된 데이터를 확인하고 수정하세요.'}
          </p>
        </div>
        {step === 'edit' && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('upload')}>
              처음으로
            </Button>
            <Button onClick={handleDownloadExcel}>
              <Download className="mr-2 size-4" />
              Excel 다운로드
            </Button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center rounded-lg border bg-white p-12">
          <div className="text-center">
            <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <p className="text-sm text-muted-foreground">PDF 분석 및 외부 데이터 수집 중...</p>
          </div>
        </div>
      )}

      {!loading && step === 'upload' && (
        <UploadStep
          data={data}
          onUpdate={updateData}
          onAddFile={addFile}
          onRemoveFile={removeFile}
          onStartAnalysis={handleStartAnalysis}
        />
      )}

      {!loading && step === 'edit' && (
        <Tabs defaultValue="collateral">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="collateral">담보분석</TabsTrigger>
            <TabsTrigger value="supply">공급개요</TabsTrigger>
            <TabsTrigger value="comparative">비준사례</TabsTrigger>
            <TabsTrigger value="market">시장환경</TabsTrigger>
          </TabsList>
          <TabsContent value="collateral">
            <div className="rounded-lg border bg-white p-6">
              <p className="text-sm text-muted-foreground">담보분석 탭 — Task 4에서 구현</p>
            </div>
          </TabsContent>
          <TabsContent value="supply">
            <div className="rounded-lg border bg-white p-6">
              <p className="text-sm text-muted-foreground">공급개요 탭 — Task 5에서 구현</p>
            </div>
          </TabsContent>
          <TabsContent value="comparative">
            <div className="rounded-lg border bg-white p-6">
              <p className="text-sm text-muted-foreground">비준사례 탭 — Phase 2</p>
            </div>
          </TabsContent>
          <TabsContent value="market">
            <div className="rounded-lg border bg-white p-6">
              <p className="text-sm text-muted-foreground">시장환경 탭 — Phase 2</p>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 빌드 확인**

Run: `cd app && npx next build`
Expected: 빌드 성공 (경고 가능, 에러 없음)

- [ ] **Step 4: 커밋**

```bash
git add app/src/app/appraisal/page.tsx app/src/components/appraisal/upload-step.tsx
git commit -m "feat(appraisal): Step wizard UI with upload and tab structure"
```

---

### Task 3: PDF 파싱 API

**Files:**
- Create: `app/src/lib/appraisal-parser.ts`
- Create: `app/src/app/api/appraisal/parse/route.ts`

- [ ] **Step 1: appraisal-parser.ts 작성**

감정평가서 PDF에서 키워드+테이블을 추출하는 모듈. 기존 `upload/route.ts`의 pdfjs-dist 좌표 기반 파싱 패턴을 재사용.

핵심 로직:
1. pdfjs-dist로 각 페이지의 텍스트 아이템(text + x,y 좌표) 추출
2. Y좌표로 행 그룹핑 → X좌표로 열 분리 → 텍스트 행 배열 생성
3. 키워드 패턴("감정평가액", "소재지", "소유자" 등) 매칭으로 필드 추출
4. 테이블 헤더 패턴("구분", "면적", "금액", "평단가" 등) 매칭으로 테이블 식별

구현 시 `app/src/app/api/upload/route.ts`의 `parsePdf()` 함수를 참고하여:
- `getDocument()` → `page.getTextContent()` → items 배열
- Y좌표 내림차순 정렬 → Y gap 기준으로 행 분리
- X좌표 기준으로 컬럼 경계 감지

파서는 다음 섹션을 식별:
- "담보물 조사" / "담보분석" → CollateralAnalysis 추출
- "비준사례" → ComparativeCase[] 추출
- "공급개요" / "최초 공급" → SupplyOverview 추출
- "담보 상세" / "담보세대" → CollateralDetailItem[] 추출

각 필드 추출에 실패하면 빈 값으로 두고 warnings에 기록.

- [ ] **Step 2: parse/route.ts API 라우트 작성**

```typescript
// app/src/app/api/appraisal/parse/route.ts
import { type NextRequest } from "next/server";
import { parseAppraisalPdf } from "@/lib/appraisal-parser";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const propertyType = formData.get("propertyType") as string || "아파트";

    if (files.length === 0) {
      return Response.json({ success: false, error: "파일이 없습니다." }, { status: 400 });
    }

    // 각 PDF를 파싱하고 결과를 병합
    const allResults = await Promise.allSettled(
      files.map(async file => {
        const buffer = Buffer.from(await file.arrayBuffer());
        return parseAppraisalPdf(buffer, propertyType);
      })
    );

    // 성공한 결과들을 병합
    const merged = { collateral: {}, comparatives: [], supply: {}, collateralDetail: [] } as any;
    const warnings: string[] = [];

    allResults.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const r = result.value;
        // 담보분석: 첫 번째 성공 결과 사용
        if (Object.keys(r.collateral).length > 0 && Object.keys(merged.collateral).length === 0) {
          merged.collateral = r.collateral;
        }
        // 비준사례: 합산
        if (r.comparatives.length > 0) {
          merged.comparatives.push(...r.comparatives);
        }
        // 공급개요: 첫 번째 성공 결과 사용
        if (r.supply && Object.keys(r.supply).length > 0 && Object.keys(merged.supply).length === 0) {
          merged.supply = r.supply;
        }
        // 상세담보: 합산
        if (r.collateralDetail.length > 0) {
          merged.collateralDetail.push(...r.collateralDetail);
        }
        warnings.push(...r.warnings);
      } else {
        warnings.push(`파일 ${i + 1} 파싱 실패: ${result.reason}`);
      }
    });

    return Response.json({
      success: true,
      extracted: merged,
      warnings,
    });
  } catch (err) {
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 3: 실제 감정평가서 PDF로 테스트**

`_reference/` 폴더의 샘플 PDF로 파싱 결과 확인. `app/test-appraisal-parse.mjs` 스크립트를 작성하여 API를 직접 호출하거나 파서 함수를 직접 테스트.

- [ ] **Step 4: 커밋**

```bash
git add app/src/lib/appraisal-parser.ts app/src/app/api/appraisal/parse/route.ts
git commit -m "feat(appraisal): PDF parser for appraisal reports with coordinate-based extraction"
```

---

### Task 4: 담보분석 편집 탭 + 낙찰통계 + 회수예상가

**Files:**
- Create: `app/src/components/appraisal/collateral-tab.tsx`
- Modify: `app/src/app/appraisal/page.tsx` — placeholder를 실제 컴포넌트로 교체

- [ ] **Step 1: collateral-tab.tsx 작성**

3개 섹션으로 구성:
1. **담보물 조사** — 감정평가 기본정보 (소유자, 평가기관, 감정가 등) + 담보물 목록 + 권리현황
2. **낙찰통계** — 인포케어 데이터 표시 (자동) + 수동 입력 가능
3. **회수예상가 산출** — 감정가 × 낙찰가율 자동 계산 + 적용 기간/수준 선택

각 필드는 Input/Select 컴포넌트로 편집 가능.
권리현황, 담보물 목록은 행 추가/삭제 가능한 테이블.
낙찰통계는 자동 조회 결과 프리필 + "인포케어 (조회일: YYYY.MM.DD)" 배지 표시.
회수예상가는 적용 낙찰가율 변경 시 자동 재계산.

props: `data: AppraisalCase`, `onUpdate: (patch) => void`

- [ ] **Step 2: page.tsx에서 placeholder 교체**

```typescript
// TabsContent value="collateral" 내부를 교체:
import CollateralTab from "@/components/appraisal/collateral-tab";
// ...
<TabsContent value="collateral">
  <CollateralTab data={data} onUpdate={updateData} />
</TabsContent>
```

- [ ] **Step 3: 빌드 확인**

Run: `cd app && npx next build`

- [ ] **Step 4: 커밋**

```bash
git add app/src/components/appraisal/collateral-tab.tsx app/src/app/appraisal/page.tsx
git commit -m "feat(appraisal): collateral analysis tab with auction stats and recovery estimate"
```

---

### Task 5: 인포케어 크롤링 API

**Files:**
- Create: `app/src/lib/infocare-crawler.ts`
- Create: `app/src/app/api/appraisal/infocare/route.ts`

- [ ] **Step 1: 패키지 설치**

```bash
cd app && npm install --save puppeteer-core @sparticuz/chromium
```

- [ ] **Step 2: infocare-crawler.ts 작성**

인포케어 사이트 크롤링 모듈:
1. `@sparticuz/chromium` 바이너리로 Puppeteer 브라우저 실행
2. https://infocare.co.kr 접속 → 로그인
3. 낙찰통계 메뉴 진입 → 소재지/용도 입력 → 검색
4. 결과 테이블 HTML에서 12개월/6개월/3개월 × 광역/구/동 낙찰가율 파싱
5. AuctionStats 객체 반환

환경변수: `process.env.INFOCARE_ID`, `process.env.INFOCARE_PW`
Timeout: 30초
Fallback: 크롤링 실패 시 `{ success: false, fallback: 'manual' }` 반환

**구현 시 주의:**
- 인포케어 사이트 구조를 실제로 확인해야 함 (로그인 후 메뉴 구조, 검색 폼 셀렉터 등)
- 첫 구현에서는 로그인 → 낙찰통계 페이지 진입 → 검색 → 결과 파싱의 기본 흐름을 잡고
- 셀렉터가 맞지 않으면 에러 로그 + fallback

- [ ] **Step 3: infocare/route.ts API 라우트 작성**

```typescript
// app/src/app/api/appraisal/infocare/route.ts
import { type NextRequest } from "next/server";
import { crawlInfocareAuctionStats } from "@/lib/infocare-crawler";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sido, gugun, dong, propertyType } = body;

    if (!sido || !gugun) {
      return Response.json({ success: false, error: "소재지(시/구) 필수" }, { status: 400 });
    }

    const result = await crawlInfocareAuctionStats({ sido, gugun, dong, propertyType });

    if (!result.success) {
      return Response.json({
        success: false,
        fallback: 'manual',
        message: '인포케어 조회 실패. 수동으로 입력해주세요.',
      });
    }

    return Response.json({ success: true, auctionStats: result.data });
  } catch (err) {
    return Response.json({
      success: false,
      fallback: 'manual',
      message: String(err),
    });
  }
}
```

- [ ] **Step 4: 실제 인포케어 사이트로 크롤링 테스트**

로컬에서 API 호출하여 실제 낙찰통계 데이터가 반환되는지 확인.
실패 시 셀렉터 조정 또는 fallback 확인.

- [ ] **Step 5: 커밋**

```bash
git add app/src/lib/infocare-crawler.ts app/src/app/api/appraisal/infocare/route.ts app/package.json app/package-lock.json
git commit -m "feat(appraisal): Infocare auction stats crawler with Puppeteer"
```

---

### Task 6: 공급개요 편집 탭

**Files:**
- Create: `app/src/components/appraisal/supply-tab.tsx`
- Modify: `app/src/app/appraisal/page.tsx` — placeholder 교체

- [ ] **Step 1: supply-tab.tsx 작성**

3개 섹션:
1. **사업개요** — 사업명, 시행사, 시공사, 면적, 건폐율, 용적률 등 기본정보 폼
2. **공급 테이블** — 타입별 (59A, 84B 등) 세대수, 면적, 분양가, 비중. 행 추가/삭제 가능.
3. **상세담보현황** — 호별 감정가, 분양가, 해지조건, 분양상태. 행 추가/삭제 가능. 대량 데이터이므로 가상 스크롤 또는 페이지네이션 고려.

props: `data: AppraisalCase`, `onUpdate: (patch) => void`

- [ ] **Step 2: page.tsx 연결**

```typescript
import SupplyTab from "@/components/appraisal/supply-tab";
// TabsContent value="supply" 교체
```

- [ ] **Step 3: 빌드 확인 + 커밋**

```bash
git add app/src/components/appraisal/supply-tab.tsx app/src/app/appraisal/page.tsx
git commit -m "feat(appraisal): supply overview tab with project info and detail table"
```

---

### Task 7: Excel 생성 API (담보분석 + 공급개요 시트)

**Files:**
- Create: `app/src/lib/appraisal-excel.ts`
- Create: `app/src/app/api/appraisal/excel/route.ts`

- [ ] **Step 1: appraisal-excel.ts 작성**

기존 `excel-generator.ts` 패턴(ExcelJS, 맑은 고딕, ARGB 색상 상수) 재사용.

시트 구성 (Phase 1):
1. **담보분석** — 양식시트. 샘플 신청서 p4 레이아웃:
   - 상단: 담보물 조사 테이블 (소유자, 평가기관, 감정가 등)
   - 중단: 담보물 목록 (종류, 수량, 면적, 감정가, 인정비율, 가용가, LTV)
   - 권리현황 테이블
   - 낙찰통계 테이블 (12/6/3개월 × 광역/구/동)
   - 회수예상가 산출 테이블
   - 심사의견
2. **공급개요** — 양식시트. 샘플 신청서 p11 레이아웃:
   - 사업개요 테이블
   - 공급 테이블 (타입별)
   - 분양현황 테이블
3. **상세담보현황** — 양식시트. 호별 상세 테이블.
4. **DATA_담보** — 데이터시트. 원본 데이터 flat.
5. **DATA_공급** — 데이터시트. 원본 데이터 flat.

양식시트의 값은 데이터시트를 참조하는 Excel 수식 (예: `=DATA_담보!B2`).

스타일 상수: 기존 excel-generator.ts에서 가져옴
- 헤더: `{ font: { name: '맑은 고딕', bold: true, size: 10, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } } }`
- 데이터: `{ font: { name: '맑은 고딕', size: 10 }, alignment: { vertical: 'middle' } }`
- 숫자: `{ numFmt: '#,##0' }`
- 퍼센트: `{ numFmt: '0.00%' }`

- [ ] **Step 2: excel/route.ts API 라우트 작성**

```typescript
// app/src/app/api/appraisal/excel/route.ts
import { type NextRequest } from "next/server";
import { generateAppraisalExcel } from "@/lib/appraisal-excel";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const buffer = await generateAppraisalExcel(data);

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="appraisal_${Date.now()}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 3: Excel 다운로드 테스트**

브라우저에서 /appraisal 접속 → 데이터 입력 → Excel 다운로드 → 파일 열어서 양식 확인.

- [ ] **Step 4: 커밋**

```bash
git add app/src/lib/appraisal-excel.ts app/src/app/api/appraisal/excel/route.ts
git commit -m "feat(appraisal): Excel generator with collateral and supply sheets"
```

---

## Phase 2: 비준사례 + 시장환경

### Task 8: 비준사례 편집 탭

**Files:**
- Create: `app/src/components/appraisal/comparative-tab.tsx`
- Modify: `app/src/app/appraisal/page.tsx` — placeholder 교체

- [ ] **Step 1: comparative-tab.tsx 작성**

2개 섹션:
1. **거래사례** — 거래A~I 등. 소재지, 건물명, 호수, 면적, 금액, 평단가, 거래일. 행 추가/삭제.
2. **평가사례** — 평가1~5 등. 같은 필드 + 평가목적. 행 추가/삭제.

PDF에서 추출된 데이터가 프리필. 자동 추출 데이터는 노란 배경으로 표시.

props: `data: AppraisalCase`, `onUpdate: (patch) => void`

- [ ] **Step 2: page.tsx 연결 + 빌드 확인 + 커밋**

```bash
git add app/src/components/appraisal/comparative-tab.tsx app/src/app/appraisal/page.tsx
git commit -m "feat(appraisal): comparative cases tab with transaction and appraisal tables"
```

---

### Task 9: 시장환경 편집 탭 + 외부 API

**Files:**
- Create: `app/src/lib/market-api.ts`
- Create: `app/src/app/api/appraisal/market-data/route.ts`
- Create: `app/src/components/appraisal/market-tab.tsx`
- Modify: `app/src/app/appraisal/page.tsx` — placeholder 교체

- [ ] **Step 1: market-api.ts 작성**

공공데이터 API 호출 모듈:
- `fetchRealTransactions(regionCode, yearMonth)` — 국토부 실거래가
- `fetchLandPrice(pnu)` — 개별공시지가
- 각 함수는 `{ data, source, retrievedAt }` 형태로 반환
- API 키 없으면 `{ data: [], source: '미설정', retrievedAt: '' }` 반환 (graceful fallback)
- 환경변수: `process.env.DATA_GO_KR_API_KEY`

- [ ] **Step 2: market-data/route.ts API 라우트 작성**

주소 기반으로 법정동코드 변환 → 실거래가/공시지가 API 병렬 호출 → 통합 결과 반환.
API 키 미설정 시 빈 결과 + "API 키 미설정" 경고 반환.

- [ ] **Step 3: market-tab.tsx 작성**

4개 섹션:
1. **입지환경** — 교통, 교육, 생활편의 textarea (사용자 직접 작성)
2. **실거래가** — API 자동 + 수동 추가. 출처 배지 표시.
3. **공시지가** — API 자동 + 수동. 출처 배지 표시.
4. **주변 시세** — 인근 단지 비교표. 수동 입력.

모든 자동 데이터 옆에 출처+조회일 배지: `"국토교통부 실거래가 (2026.03.30)"`

- [ ] **Step 4: page.tsx 연결 + 빌드 확인 + 커밋**

```bash
git add app/src/lib/market-api.ts app/src/app/api/appraisal/market-data/route.ts app/src/components/appraisal/market-tab.tsx app/src/app/appraisal/page.tsx
git commit -m "feat(appraisal): market analysis tab with public API integration"
```

---

### Task 10: Excel 시트 확장 (비준사례 + 시장환경)

**Files:**
- Modify: `app/src/lib/appraisal-excel.ts` — 시트 추가

- [ ] **Step 1: appraisal-excel.ts에 비준사례 시트 추가**

양식시트 "비준사례": 샘플 신청서 p8 레이아웃
- 거래사례 테이블 (구분, 소재지, 건물명, 면적, 금액, 평단가, 기준시점)
- 평가사례 테이블 (같은 구조 + 평가목적)

데이터시트 "DATA_비준": 원본 데이터

- [ ] **Step 2: appraisal-excel.ts에 시장환경 시트 추가**

양식시트 "시장환경": 샘플 신청서 p13/p18 레이아웃
- 입지환경 서술
- 실거래가 테이블 + 출처
- 공시지가 테이블 + 출처
- 주변 시세 비교표

데이터시트 "DATA_시장": 원본 데이터

- [ ] **Step 3: 전체 Excel 다운로드 테스트**

모든 시트(담보분석, 공급개요, 상세담보, 비준사례, 시장환경 + 데이터시트들)가 정상 생성되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add app/src/lib/appraisal-excel.ts
git commit -m "feat(appraisal): add comparative and market sheets to Excel generator"
```

---

### Task 11: 통합 테스트 + 마무리

**Files:**
- Modify: `app/src/app/appraisal/page.tsx` — 시장환경 API 호출 연동

- [ ] **Step 1: page.tsx에서 시장환경 API 호출 추가**

`handleStartAnalysis()`에 market-data API 호출 추가 (PDF 파싱, 인포케어와 병렬).

```typescript
// handleStartAnalysis 내 추가:
const marketPromise = fetch('/api/appraisal/market-data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    address: data.address,
    propertyType: data.propertyType,
  }),
}).then(r => r.ok ? r.json() : null);

// Promise.allSettled로 모든 API 병렬 처리
```

- [ ] **Step 2: 전체 흐름 E2E 테스트**

1. /appraisal 접속
2. 건명, 소재지 입력
3. 샘플 감정평가서 PDF 업로드
4. [분석 시작] → PDF 파싱 + 인포케어 + 외부 API 실행
5. 4개 탭 데이터 확인/편집
6. Excel 다운로드 → 파일 검증

- [ ] **Step 3: 빌드 확인**

Run: `cd app && npx next build`
Expected: 에러 없음

- [ ] **Step 4: 최종 커밋**

```bash
git add -A
git commit -m "feat(appraisal): integrate all APIs and complete E2E flow"
```
