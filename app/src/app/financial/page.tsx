"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search, Upload, Building2, TrendingUp, Loader2, X,
  Download, FileSpreadsheet, AlertTriangle, CheckCircle2, TrendingDown, Minus,
  FileUp, Merge, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

interface SearchResult {
  corpCode: string;
  corpName: string;
  stockCode: string;
  ceo: string;
  bizrNo: string;
}

interface FinancialRow {
  account: string;
  [year: string]: string;
}

interface RatioDetail {
  name: string;
  category: string;
  valuesStr: Record<string, string>;
  benchmark: number;
  benchmarkLabel?: string;
  trend: string;
  trendIcon: string;
  vsBenchmark: string;
  diagnosis: string;
  riskLevel: string;
}

interface AIAnalysisData {
  executiveSummary: string;
  deepDiagnosis: string;
  riskAssessment: string;
  loanOpinion: string;
  creditOutlook: string;
  keyMetricsNarrative: string;
  aiModel: string;
}

interface FinancialResult {
  companyInfo: {
    corpCode: string;
    corpName: string;
    ceoNm: string;
    bizrNo: string;
    adres: string;
    estDt: string;
    indutyCode: string;
    stockCode: string;
  };
  bsItems: FinancialRow[];
  isItems: FinancialRow[];
  ratios: Record<string, Record<string, string>>;
  years: string[];
  source: string;
  hasData: boolean;
  noDataReason?: string;
  analysis?: {
    overallGrade: string;
    overallSummary: string;
    fsType: string;
    industryLabel: string;
    stability: RatioDetail[];
    profitability: RatioDetail[];
    growth: RatioDetail[];
    activity?: RatioDetail[];
    riskFactors: string[];
    opportunityFactors: string[];
    analystOpinion: string;
  };
  aiAnalysis?: AIAnalysisData | null;
  geminiAnalysis?: AIAnalysisData | null;
  niceRating?: { grade: string; gradeDate: string; gradeAgency: string; available: boolean } | null;
  hasOfs?: boolean;
  bsItemsCfs?: FinancialRow[];
  isItemsCfs?: FinancialRow[];
  ratiosCfs?: Record<string, Record<string, string>>;
  hasCfs?: boolean;
  borrowingNotes?: {
    title: string;
    details: Array<{
      category: string;
      lender: string;
      interestRate: string;
      maturityDate: string;
      currentAmount: string;
      previousAmount: string;
      currency: string;
    }>;
    totalCurrent: string;
    totalPrevious: string;
    fiscalYear: string;
  } | null;
  filename?: string;
  fileSize?: number;
  qaReport?: {
    status: "PASS" | "AUTO_FIX" | "ESCALATE";
    timestamp: string;
    checks: Array<{
      type: string;
      result: "PASS" | "WARN" | "FAIL";
      details: string;
      missingItems?: string[];
      suspiciousMatches?: Array<{ original: string; normalized: string; similarity: number }>;
      mismatches?: Array<{ account: string; year: string; original: number; actual: number; diff: number; diffPercent: number }>;
    }>;
    autoFixable: Array<{ type: string; description: string; suggestedFix: string }>;
    needsHumanReview: Array<{ type: string; description: string; options: string[] }>;
    retryCount: number;
  } | null;
  qaEscalations?: Array<{
    id: string;
    type: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
    description: string;
    originalValue?: string | number;
    currentValue?: string | number;
  }> | null;
}

// DART 재무제표는 보통 전년도까지만 공시됨 (2026년 기준 → 2024년까지)
const latestAvailableYear = new Date().getFullYear() - 1; // 2025
const yearOptions = Array.from({ length: 8 }, (_, i) => String(latestAvailableYear - i)); // 2025~2018

const LOADING_STEPS = [
  "기업 정보 확인 중...",
  "DART API 연결 중...",
  "재무데이터 추출 중...",
  "AI 재무분석 진행 중...",
  "Excel 파일 생성 중...",
];

function GradeBadge({ grade }: { grade: string }) {
  const colorMap: Record<string, string> = {
    AAA: "bg-emerald-100 text-emerald-700 border-emerald-300",
    AA: "bg-emerald-100 text-emerald-700 border-emerald-300",
    A: "bg-emerald-50 text-emerald-600 border-emerald-200",
    BBB: "bg-blue-100 text-blue-700 border-blue-300",
    BB: "bg-blue-50 text-blue-600 border-blue-200",
    B: "bg-amber-100 text-amber-700 border-amber-300",
    CCC: "bg-amber-100 text-amber-700 border-amber-300",
    CC: "bg-orange-100 text-orange-700 border-orange-300",
    C: "bg-red-100 text-red-700 border-red-300",
    D: "bg-red-200 text-red-800 border-red-400",
  };
  const fontSize = grade.length >= 3 ? "text-sm" : grade.length >= 2 ? "text-base" : "text-xl";
  return (
    <span className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${fontSize} font-bold border-2 ${colorMap[grade] || "bg-gray-100 text-gray-700 border-gray-300"}`}>
      {grade}
    </span>
  );
}

function RiskBadge({ level }: { level: string }) {
  if (level === "양호") {
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-100">{level}</Badge>;
  }
  if (level === "보통") {
    return <Badge className="bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100">{level}</Badge>;
  }
  if (level === "주의") {
    return <Badge className="bg-red-100 text-red-700 border-red-300 hover:bg-red-100">{level}</Badge>;
  }
  return <Badge variant="secondary">{level}</Badge>;
}

function TrendIcon({ icon }: { icon: string }) {
  if (icon === "up" || icon === "↑") return <TrendingUp className="h-4 w-4 text-emerald-600" />;
  if (icon === "down" || icon === "↓") return <TrendingDown className="h-4 w-4 text-red-600" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FinancialContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [companyName, setCompanyName] = useState(initialQuery);
  const [selectedCorpCode, setSelectedCorpCode] = useState<string | null>(null);
  const [startYear, setStartYear] = useState(String(latestAvailableYear - 2)); // 2023
  const [endYear, setEndYear] = useState(String(latestAvailableYear));         // 2025
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<FinancialResult | null>(null);

  // 파일 업로드 관련 state (여러 파일 지원)
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadUnit, setUploadUnit] = useState<string>("원");
  const [uploadCorpName, setUploadCorpName] = useState("");
  const [uploadCorpCode, setUploadCorpCode] = useState<string | null>(null);
  const [uploadParsed, setUploadParsed] = useState<{
    years: string[];
    bsItems: FinancialRow[];
    isItems: FinancialRow[];
    bsCount: number;
    isCount: number;
    fileName: string;
  } | null>(null);
  const [uploadParsing, setUploadParsing] = useState(false);
  const [uploadDartYears, setUploadDartYears] = useState<string[]>([]);
  const [uploadMerging, setUploadMerging] = useState(false);
  const [uploadMergeStep, setUploadMergeStep] = useState(0);
  const [uploadSearchOpen, setUploadSearchOpen] = useState(false);
  const [uploadSearchQuery, setUploadSearchQuery] = useState("");
  const [uploadSearchResults, setUploadSearchResults] = useState<SearchResult[]>([]);
  const [uploadSearching, setUploadSearching] = useState(false);

  // Progress steps animation during loading
  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      return;
    }
    let step = 0;
    setLoadingStep(0);
    const interval = setInterval(() => {
      step++;
      if (step < LOADING_STEPS.length) {
        setLoadingStep(step);
      } else {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [loading]);

  const doSearch = useCallback(async (query: string) => {
    if (query.length < 2) return;
    setSearching(true);
    try {
      const res = await fetch("/api/dart/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: query }),
      });
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      toast.error("검색 실패");
    } finally {
      setSearching(false);
    }
  }, []);

  // Enter → 팝업 열기 + 즉시 검색
  const handleCompanyKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = e.currentTarget.value.trim();
      if (val.length < 2) {
        toast.error("2글자 이상 입력하세요.");
        return;
      }
      setSearchQuery(val);
      setSearchOpen(true);
      doSearch(val);
    }
  }, [doSearch]);

  const selectCompany = (corp: SearchResult) => {
    setCompanyName(corp.corpName);
    setSelectedCorpCode(corp.corpCode);
    setSearchOpen(false);
    toast.success(`"${corp.corpName}" 선택됨 (${corp.ceo || corp.corpCode})`);
  };

  // 재무현황 조회
  const handleSearch = async () => {
    if (!companyName.trim()) {
      toast.error("차주명을 입력하세요.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const years: string[] = [];
      for (let y = parseInt(startYear); y <= parseInt(endYear); y++) {
        years.push(String(y));
      }
      const res = await fetch("/api/dart/financial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpName: companyName, corpCode: selectedCorpCode, years }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.result);
        toast.success(`${data.result.companyInfo.corpName || companyName} 조회 완료!`);
        // 분기/반기 보고서 사용 경고
        if (data.result.quarterlyWarnings?.length > 0) {
          for (const w of data.result.quarterlyWarnings) {
            toast.warning(`⚠️ ${w}`, { duration: 8000 });
          }
        }
      } else {
        toast.error(data.error || "조회 실패");
      }
    } catch {
      toast.error("서버 연결 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result?.filename) return;
    if (result.excelBase64) {
      const byteChars = atob(result.excelBase64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      const link = document.createElement("a");
      link.href = `/api/download/${result.filename}`;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    toast.success("Excel 파일 다운로드를 시작합니다.");
  };

  const calcGrade = (ratios: Record<string, Record<string, string>>): string => {
    const allYears = Object.keys(ratios);
    if (!allYears.length) return "-";
    const latest = ratios[allYears.sort().reverse()[0]] || {};
    let score = 0, count = 0;
    for (const val of Object.values(latest)) {
      const num = parseFloat(val);
      if (isNaN(num)) continue;
      count++;
      if (num > 0) score++;
    }
    if (count === 0) return "-";
    const pct = score / count;
    if (pct >= 0.95) return "AAA";
    if (pct >= 0.85) return "AA";
    if (pct >= 0.75) return "A";
    if (pct >= 0.65) return "BBB";
    if (pct >= 0.55) return "BB";
    if (pct >= 0.45) return "B";
    if (pct >= 0.35) return "CCC";
    if (pct >= 0.25) return "CC";
    if (pct >= 0.15) return "C";
    return "D";
  };

  const displayGrade = result?.analysis?.overallGrade || (result ? calcGrade(result.ratios) : "-");

  // ===== 파일 업로드 핸들러 (여러 파일 지원) =====
  const handleFilesSelect = async (newFiles: File[]) => {
    const allFiles = [...uploadFiles, ...newFiles];
    setUploadFiles(allFiles);
    setUploadParsing(true);
    try {
      // 기존 파싱 결과에 새 파일 결과를 병합
      const allBs: FinancialRow[] = [...(uploadParsed?.bsItems || [])];
      const allIs: FinancialRow[] = [...(uploadParsed?.isItems || [])];
      const allYears = new Set<string>(uploadParsed?.years || []);

      for (const file of newFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("unit", uploadUnit);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (data.success) {
          const r = data.result;
          for (const y of r.years) allYears.add(y);
          // BS 항목 병합 (같은 계정이면 연도 데이터 머지)
          for (const row of r.bsItems) {
            const existing = allBs.find((b: FinancialRow) => b.account === row.account);
            if (existing) { Object.assign(existing, row); }
            else { allBs.push(row); }
          }
          // IS 항목 병합
          for (const row of r.isItems) {
            const existing = allIs.find((b: FinancialRow) => b.account === row.account);
            if (existing) { Object.assign(existing, row); }
            else { allIs.push(row); }
          }
          toast.success(`${file.name}: BS ${r.bsCount}행, IS ${r.isCount}행 파싱 완료`);
        } else {
          toast.error(`${file.name}: ${data.error || "파싱 실패"}`);
        }
      }

      // 파싱 결과가 있을 때만 상태 설정
      if (allBs.length > 0 || allIs.length > 0) {
        const mergedYears = [...allYears].sort();
        setUploadParsed({
          years: mergedYears,
          bsItems: allBs,
          isItems: allIs,
          bsCount: allBs.length,
          isCount: allIs.length,
          fileName: allFiles.map(f => f.name).join(", "),
        });
        const recentYears = yearOptions.slice(0, 4).filter((y) => !mergedYears.includes(y));
        setUploadDartYears(recentYears);
      } else {
        // 파싱 실패 — 상태 초기화
        setUploadFiles([]);
        setUploadParsed(null);
        setUploadDartYears([]);
      }
    } catch {
      toast.error("파일 파싱 서버 연결 실패");
    } finally {
      setUploadParsing(false);
    }
  };

  // 개별 파일 제거
  const handleRemoveFile = (index: number) => {
    const remaining = uploadFiles.filter((_, i) => i !== index);
    setUploadFiles(remaining);
    if (remaining.length === 0) {
      setUploadParsed(null);
      setUploadDartYears([]);
    }
    // 남은 파일이 있으면 파싱 결과 유지 (재파싱하지 않음)
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length) handleFilesSelect(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) handleFilesSelect(files);
  };

  // 업로드 차주 검색
  const doUploadSearch = useCallback(async (query: string) => {
    if (query.length < 2) return;
    setUploadSearching(true);
    try {
      const res = await fetch("/api/dart/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: query }),
      });
      const data = await res.json();
      setUploadSearchResults(data.results || []);
    } catch {
      toast.error("검색 실패");
    } finally {
      setUploadSearching(false);
    }
  }, []);

  const handleUploadCorpKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = e.currentTarget.value.trim();
      if (val.length < 2) { toast.error("2글자 이상 입력하세요."); return; }
      setUploadSearchQuery(val);
      setUploadSearchOpen(true);
      doUploadSearch(val);
    }
  }, [doUploadSearch]);

  const selectUploadCompany = (corp: SearchResult) => {
    setUploadCorpName(corp.corpName);
    setUploadCorpCode(corp.corpCode);
    setUploadSearchOpen(false);
    toast.success(`"${corp.corpName}" 선택됨`);
  };

  // DART 연도 토글
  const toggleDartYear = (year: string) => {
    setUploadDartYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year].sort()
    );
  };

  // 병합/업로드 전용 실행
  const handleMerge = async () => {
    if (!uploadParsed) {
      toast.error("먼저 파일을 업로드하세요.");
      return;
    }

    // 차주명이 없으면 파일명에서 추출
    const effectiveCorpName = uploadCorpName.trim() || uploadParsed.fileName.replace(/\.(xlsx|xls|pdf)$/i, "").split(",")[0].trim() || "업로드기업";

    setUploadMerging(true);
    setUploadMergeStep(0);
    setResult(null);

    const mergeStepInterval = setInterval(() => {
      setUploadMergeStep((prev) => Math.min(prev + 1, LOADING_STEPS.length - 1));
    }, 2000);

    try {
      const res = await fetch("/api/dart/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          corpName: effectiveCorpName,
          corpCode: uploadCorpCode,
          dartYears: uploadDartYears,
          uploadData: {
            years: uploadParsed.years,
            bsItems: uploadParsed.bsItems,
            isItems: uploadParsed.isItems,
          },
          preferUpload: false,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.result);
        toast.success(`${effectiveCorpName} ${uploadDartYears.length > 0 ? "병합 조회" : "Excel 생성"} 완료!`);
      } else {
        toast.error(data.error || "병합 실패");
      }
    } catch {
      toast.error("서버 연결 실패");
    } finally {
      clearInterval(mergeStepInterval);
      setUploadMerging(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">기업 재무현황 조회</h1>
        <p className="text-muted-foreground">DART 자동 조회로 재무데이터를 추출합니다</p>
      </div>

      <Tabs defaultValue="dart">
        <TabsList>
          <TabsTrigger value="dart" className="gap-2">
            <Search className="h-4 w-4" /> DART 자동 조회
          </TabsTrigger>
          <TabsTrigger value="upload" className="gap-2">
            <Upload className="h-4 w-4" /> 파일 업로드
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dart">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-500" />
                DART 재무현황 조회
              </CardTitle>
              <CardDescription>차주명 입력 후 Enter → 기업 선택 → 조회 버튼 클릭</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Label>차주명 (법인명)</Label>
                  <Input
                    placeholder="예: 한국토지신탁 (입력 후 Enter)"
                    value={companyName}
                    onChange={(e) => { setCompanyName(e.target.value); setSelectedCorpCode(null); }}
                    onKeyDown={handleCompanyKeyDown}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    차주명 입력 후 Enter를 누르면 검색 팝업이 열립니다
                  </p>
                </div>
                <div>
                  <Label>조회 연도</Label>
                  <div className="flex items-center gap-2">
                    <select
                      value={startYear}
                      onChange={(e) => setStartYear(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>{y}년</option>
                      ))}
                    </select>
                    <span className="text-muted-foreground text-sm">~</span>
                    <select
                      value={endYear}
                      onChange={(e) => setEndYear(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>{y}년</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <Button onClick={handleSearch} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> 조회 중...</>
                ) : (
                  <><Search className="h-4 w-4 mr-2" /> 재무현황 조회 및 Excel 생성</>
                )}
              </Button>

              {/* Loading progress steps */}
              {loading && (
                <div className="mt-4 space-y-2 rounded-lg border bg-muted/30 p-4">
                  {LOADING_STEPS.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-sm">
                      {idx < loadingStep ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : idx === loadingStep ? (
                        <Loader2 className="h-4 w-4 animate-spin text-indigo-500 shrink-0" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-gray-300 shrink-0" />
                      )}
                      <span className={idx <= loadingStep ? "text-foreground" : "text-muted-foreground"}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileUp className="h-5 w-5 text-indigo-500" />
                재무제표 파일 업로드
              </CardTitle>
              <CardDescription>
                감사보고서 PDF/Excel을 업로드하여 Excel을 추출합니다. DART 데이터와 병합도 가능합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 1. 차주명 입력 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>차주명 (법인명)</Label>
                  <Input
                    placeholder="예: 우리자산신탁 (미입력 시 파일명 사용)"
                    value={uploadCorpName}
                    onChange={(e) => { setUploadCorpName(e.target.value); setUploadCorpCode(null); }}
                    onKeyDown={handleUploadCorpKeyDown}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter로 DART 검색 / 비워두면 파일명을 차주명으로 사용합니다
                  </p>
                </div>
                <div>
                  <Label>업로드 파일 단위</Label>
                  <select
                    value={uploadUnit}
                    onChange={(e) => setUploadUnit(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="원">원</option>
                    <option value="천원">천원</option>
                    <option value="백만원">백만원</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">업로드 파일의 금액 단위를 선택하세요</p>
                </div>
              </div>

              {/* 2. 파일 업로드 영역 */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  uploadFiles.length > 0 ? "border-emerald-400 bg-emerald-50/50" : "hover:border-indigo-400"
                }`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => document.getElementById("upload-file-input")?.click()}
              >
                <input
                  id="upload-file-input"
                  type="file"
                  accept=".xlsx,.xls,.pdf"
                  multiple
                  className="hidden"
                  onChange={handleFileInput}
                />
                {uploadParsing ? (
                  <div className="space-y-2">
                    <Loader2 className="h-10 w-10 mx-auto animate-spin text-indigo-500" />
                    <p className="text-sm font-medium">파일 파싱 중...</p>
                  </div>
                ) : uploadFiles.length > 0 && uploadParsed ? (
                  <div className="space-y-3">
                    <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
                    <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                      <span>연도: {uploadParsed.years.join(", ")}</span>
                      <span>BS {uploadParsed.bsCount}행</span>
                      <span>IS {uploadParsed.isCount}행</span>
                    </div>
                    {/* 개별 파일 목록 */}
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                      {uploadFiles.map((f, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 text-xs">
                          {f.name}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemoveFile(idx); }}
                            className="ml-1 hover:text-red-500"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadFiles([]);
                        setUploadParsed(null);
                        setUploadDartYears([]);
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> 전체 제거
                    </Button>
                    <p className="text-xs text-muted-foreground">추가 파일을 드래그하거나 클릭하여 더 추가할 수 있습니다</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                    <p className="text-sm font-medium">클릭하여 파일 선택 또는 드래그 앤 드롭</p>
                    <p className="text-xs text-muted-foreground">Excel (.xlsx, .xls) 또는 PDF 파일 (여러 파일 동시 선택 가능)</p>
                  </div>
                )}
              </div>

              {/* 3. DART 조회 연도 선택 (선택사항) */}
              {uploadParsed && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div>
                    <Label className="text-sm font-semibold">DART 추가 조회 연도 선택 (선택사항)</Label>
                    <p className="text-xs text-muted-foreground">
                      업로드 파일: {uploadParsed.years.join(", ")}년 / DART에서 추가로 가져올 연도를 선택하세요 (없으면 업로드 데이터만으로 생성)
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {yearOptions.map((y) => {
                      const inUpload = uploadParsed.years.includes(y);
                      const inDart = uploadDartYears.includes(y);
                      return (
                        <button
                          key={y}
                          onClick={() => !inUpload && toggleDartYear(y)}
                          disabled={inUpload}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                            inUpload
                              ? "bg-emerald-100 text-emerald-700 border-emerald-300 cursor-not-allowed"
                              : inDart
                                ? "bg-indigo-100 text-indigo-700 border-indigo-300"
                                : "bg-white text-gray-500 border-gray-200 hover:border-indigo-300"
                          }`}
                        >
                          {y}년
                          {inUpload && <span className="ml-1 text-xs">(업로드)</span>}
                          {inDart && <span className="ml-1 text-xs">(DART)</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. 병합 조회 버튼 */}
              {uploadParsed && (
                <Button
                  onClick={handleMerge}
                  disabled={uploadMerging}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 gap-2"
                  size="lg"
                >
                  {uploadMerging ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {uploadDartYears.length > 0 ? "병합 조회 중..." : "Excel 생성 중..."}</>
                  ) : uploadDartYears.length > 0 ? (
                    <><Merge className="h-4 w-4" /> DART + 업로드 파일 병합 조회 및 Excel 생성</>
                  ) : (
                    <><Upload className="h-4 w-4" /> 업로드 파일로 Excel 생성</>
                  )}
                </Button>
              )}

              {/* 병합 진행 상태 */}
              {uploadMerging && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                  {LOADING_STEPS.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-sm">
                      {idx < uploadMergeStep ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : idx === uploadMergeStep ? (
                        <Loader2 className="h-4 w-4 animate-spin text-indigo-500 shrink-0" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-gray-300 shrink-0" />
                      )}
                      <span className={idx <= uploadMergeStep ? "text-foreground" : "text-muted-foreground"}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 업로드 차주 검색 팝업 */}
        <Dialog open={uploadSearchOpen} onOpenChange={setUploadSearchOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-indigo-500" />
                차주 검색 (업로드 병합용)
              </DialogTitle>
              <DialogDescription>검색 결과에서 기업을 선택하면 자동으로 입력됩니다</DialogDescription>
            </DialogHeader>

            <div className="flex gap-2">
              <Input
                placeholder="차주명 검색..."
                value={uploadSearchQuery}
                onChange={(e) => setUploadSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    doUploadSearch(uploadSearchQuery);
                  }
                }}
                autoFocus
              />
              <Button onClick={() => doUploadSearch(uploadSearchQuery)} disabled={uploadSearching} size="sm" className="bg-indigo-600 hover:bg-indigo-700 whitespace-nowrap">
                {uploadSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-1">검색</span>
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto border rounded-lg mt-2">
              {uploadSearching ? (
                <div className="py-10 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  <p className="text-sm">검색 중...</p>
                </div>
              ) : uploadSearchResults.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">검색 결과가 없습니다</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground px-3 py-2 border-b bg-muted/50">
                    검색 결과: {uploadSearchResults.length}건
                  </p>
                  <div className="divide-y">
                    {uploadSearchResults.map((corp) => (
                      <button
                        key={corp.corpCode}
                        onClick={() => selectUploadCompany(corp)}
                        className="grid grid-cols-[2fr_1fr_1.2fr_1fr] gap-2 px-3 py-3 w-full text-left hover:bg-indigo-50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 text-xs font-bold shrink-0">
                            {corp.corpName.charAt(0)}
                          </span>
                          <span className="font-medium text-sm truncate">{corp.corpName}</span>
                        </div>
                        <div>
                          <Badge variant={corp.stockCode ? "default" : "secondary"} className="text-xs">
                            {corp.stockCode ? "상장" : "비상장"}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground truncate">{corp.ceo || "-"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{corp.bizrNo || "-"}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </Tabs>

      {/* ===== 차주 검색 팝업 (Dialog 방식) ===== */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-indigo-500" />
              차주 검색
            </DialogTitle>
            <DialogDescription>검색 결과에서 기업을 선택하면 자동으로 입력됩니다</DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              placeholder="차주명을 수정하거나 다시 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  doSearch(searchQuery);
                }
              }}
              autoFocus
            />
            <Button onClick={() => doSearch(searchQuery)} disabled={searching} size="sm" className="bg-indigo-600 hover:bg-indigo-700 whitespace-nowrap">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-1">재검색</span>
            </Button>
          </div>

          {/* 검색 결과 */}
          <div className="flex-1 overflow-y-auto border rounded-lg mt-2">
            {searching ? (
              <div className="py-10 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                <p className="text-sm">검색 중...</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">검색 결과가 없습니다</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground px-3 py-2 border-b bg-muted/50">
                  검색 결과: {searchResults.length}건
                </p>
                <div className="divide-y">
                  {/* 테이블 헤더 */}
                  <div className="grid grid-cols-[2fr_1fr_1.2fr_1fr] gap-2 px-3 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <div>기업명</div>
                    <div>구분</div>
                    <div>대표자</div>
                    <div>사업자번호</div>
                  </div>
                  {searchResults.map((corp) => (
                    <button
                      key={corp.corpCode}
                      onClick={() => selectCompany(corp)}
                      className="grid grid-cols-[2fr_1fr_1.2fr_1fr] gap-2 px-3 py-3 w-full text-left hover:bg-indigo-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 text-xs font-bold shrink-0">
                          {corp.corpName.charAt(0)}
                        </span>
                        <span className="font-medium text-sm truncate">{corp.corpName}</span>
                      </div>
                      <div>
                        <Badge variant={corp.stockCode ? "default" : "secondary"} className="text-xs">
                          {corp.stockCode ? `상장` : "비상장"}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground truncate">{corp.ceo || "-"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{corp.bizrNo || "-"}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 조회 결과 ===== */}
      {result && result.hasData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {result.companyInfo.corpName}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-sm">
                  <div><span className="text-muted-foreground">대표이사:</span> {result.companyInfo.ceoNm || "-"}</div>
                  <div><span className="text-muted-foreground">사업자번호:</span> {result.companyInfo.bizrNo || "-"}</div>
                  <div className="col-span-2"><span className="text-muted-foreground">소재지:</span> {result.companyInfo.adres || "-"}</div>
                  <div><span className="text-muted-foreground">설립일:</span> {result.companyInfo.estDt || "-"}</div>
                  <div><span className="text-muted-foreground">상장여부:</span> {result.companyInfo.stockCode ? `상장 (${result.companyInfo.stockCode})` : "비상장"}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-full py-6">
                {result.niceRating?.available ? (
                  <>
                    <p className="text-xs text-muted-foreground mb-1">NICE 공식 신용등급</p>
                    <GradeBadge grade={result.niceRating.grade} />
                    <p className="text-xs text-muted-foreground mt-2">{result.niceRating.gradeAgency} ({result.niceRating.gradeDate})</p>
                    <div className="mt-3 pt-3 border-t w-full text-center">
                      <p className="text-xs text-muted-foreground">재무비율 추정등급</p>
                      <p className="text-sm font-semibold mt-1">{displayGrade}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mb-1">재무비율 추정등급</p>
                    <GradeBadge grade={displayGrade} />
                    <p className="text-xs text-muted-foreground mt-2">{result.years.join(", ")}년 기준</p>
                    <p className="text-[10px] text-muted-foreground mt-1">NICE BizAPI 연동 시 공식 등급 표시</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ===== Excel 다운로드 버튼 ===== */}
          {result.filename && (
            <Card className="border-indigo-200 bg-indigo-50/50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
                    <div>
                      <p className="font-medium text-sm">{result.filename}</p>
                      {result.fileSize != null && (
                        <p className="text-xs text-muted-foreground">파일 크기: {formatFileSize(result.fileSize)}</p>
                      )}
                    </div>
                  </div>
                  <Button onClick={handleDownload} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                    <Download className="h-4 w-4" />
                    Excel 다운로드
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {Object.keys(result.ratios).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-indigo-500" />
                  주요 재무비율
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>지표</TableHead>
                      {result.years.sort().map((y) => (
                        <TableHead key={y} className="text-right">{y}년</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {["총차입금", "순차입금", "부채비율", "유동비율", "자기자본비율", "차입금의존도", "영업이익률", "총자산이익률(ROA)", "자기자본이익률(ROE)", "매출증가율"].map((name) => (
                      <TableRow key={name}>
                        <TableCell className="font-medium">{name}</TableCell>
                        {result.years.sort().map((y) => (
                          <TableCell key={y} className="text-right">
                            {result.ratios[y]?.[name] || "-"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* ===== 재무 분석 보고서 ===== */}
          {result.analysis && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-indigo-500" />
                  재무 분석 보고서
                </CardTitle>
                {result.analysis.fsType && result.analysis.industryLabel && (
                  <CardDescription>
                    {result.analysis.fsType} | {result.analysis.industryLabel}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Overall grade + summary */}
                <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/40">
                  <GradeBadge grade={result.analysis.overallGrade} />
                  <div className="flex-1">
                    <p className="font-semibold text-sm mb-1">종합 등급: {result.analysis.overallGrade}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{result.analysis.overallSummary}</p>
                  </div>
                </div>

                {/* 안정성 지표 */}
                {result.analysis.stability.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <Badge variant="secondary">안정성 지표</Badge>
                    </h3>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>지표명</TableHead>
                            {result.years.sort().map((y) => (
                              <TableHead key={y} className="text-right">{y}년</TableHead>
                            ))}
                            <TableHead className="text-right">기준값</TableHead>
                            <TableHead className="text-center">추세</TableHead>
                            <TableHead className="text-center">판정</TableHead>
                            <TableHead>진단</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.analysis.stability.map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{r.name}</TableCell>
                              {result.years.sort().map((y) => (
                                <TableCell key={y} className="text-right">{r.valuesStr[y] || "-"}</TableCell>
                              ))}
                              <TableCell className="text-right">{r.benchmarkLabel || String(r.benchmark)}</TableCell>
                              <TableCell className="text-center"><TrendIcon icon={r.trendIcon} /></TableCell>
                              <TableCell className="text-center"><RiskBadge level={r.riskLevel} /></TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[200px]">{r.diagnosis}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* 수익성 지표 */}
                {result.analysis.profitability.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <Badge variant="secondary">수익성 지표</Badge>
                    </h3>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>지표명</TableHead>
                            {result.years.sort().map((y) => (
                              <TableHead key={y} className="text-right">{y}년</TableHead>
                            ))}
                            <TableHead className="text-right">기준값</TableHead>
                            <TableHead className="text-center">추세</TableHead>
                            <TableHead className="text-center">판정</TableHead>
                            <TableHead>진단</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.analysis.profitability.map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{r.name}</TableCell>
                              {result.years.sort().map((y) => (
                                <TableCell key={y} className="text-right">{r.valuesStr[y] || "-"}</TableCell>
                              ))}
                              <TableCell className="text-right">{r.benchmarkLabel || String(r.benchmark)}</TableCell>
                              <TableCell className="text-center"><TrendIcon icon={r.trendIcon} /></TableCell>
                              <TableCell className="text-center"><RiskBadge level={r.riskLevel} /></TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[200px]">{r.diagnosis}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* 성장성 지표 */}
                {result.analysis.growth.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <Badge variant="secondary">성장성 지표</Badge>
                    </h3>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>지표명</TableHead>
                            {result.years.sort().map((y) => (
                              <TableHead key={y} className="text-right">{y}년</TableHead>
                            ))}
                            <TableHead className="text-right">기준값</TableHead>
                            <TableHead className="text-center">추세</TableHead>
                            <TableHead className="text-center">판정</TableHead>
                            <TableHead>진단</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.analysis.growth.map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{r.name}</TableCell>
                              {result.years.sort().map((y) => (
                                <TableCell key={y} className="text-right">{r.valuesStr[y] || "-"}</TableCell>
                              ))}
                              <TableCell className="text-right">{r.benchmarkLabel || String(r.benchmark)}</TableCell>
                              <TableCell className="text-center"><TrendIcon icon={r.trendIcon} /></TableCell>
                              <TableCell className="text-center"><RiskBadge level={r.riskLevel} /></TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[200px]">{r.diagnosis}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* 활동성 지표 */}
                {result.analysis.activity && result.analysis.activity.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <Badge variant="secondary">활동성 지표</Badge>
                    </h3>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>지표명</TableHead>
                            {result.years.sort().map((y) => (
                              <TableHead key={y} className="text-right">{y}년</TableHead>
                            ))}
                            <TableHead className="text-right">기준값</TableHead>
                            <TableHead className="text-center">추세</TableHead>
                            <TableHead className="text-center">판정</TableHead>
                            <TableHead>진단</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.analysis.activity.map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{r.name}</TableCell>
                              {result.years.sort().map((y) => (
                                <TableCell key={y} className="text-right">{r.valuesStr[y] || "-"}</TableCell>
                              ))}
                              <TableCell className="text-right">{r.benchmarkLabel || String(r.benchmark)}</TableCell>
                              <TableCell className="text-center"><TrendIcon icon={r.trendIcon} /></TableCell>
                              <TableCell className="text-center"><RiskBadge level={r.riskLevel} /></TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[200px]">{r.diagnosis}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Risk / Opportunity factors */}
                {(result.analysis.riskFactors.length > 0 || result.analysis.opportunityFactors.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {result.analysis.riskFactors.length > 0 && (
                      <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
                        <h4 className="font-semibold text-sm flex items-center gap-2 mb-2 text-red-700">
                          <AlertTriangle className="h-4 w-4" />
                          위험 요인
                        </h4>
                        <ul className="space-y-1">
                          {result.analysis.riskFactors.map((f, i) => (
                            <li key={i} className="text-sm text-red-800 flex items-start gap-2">
                              <span className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-red-400" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {result.analysis.opportunityFactors.length > 0 && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                        <h4 className="font-semibold text-sm flex items-center gap-2 mb-2 text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" />
                          긍정 요인
                        </h4>
                        <ul className="space-y-1">
                          {result.analysis.opportunityFactors.map((f, i) => (
                            <li key={i} className="text-sm text-emerald-800 flex items-start gap-2">
                              <span className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Analyst opinion */}
                {result.analysis.analystOpinion && (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <h4 className="font-semibold text-sm mb-2">애널리스트 의견</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {result.analysis.analystOpinion}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ===== AI 전문가 분석 보고서 (GPT-4o vs Gemini 비교) ===== */}
          {(result.aiAnalysis || result.geminiAnalysis) && (
            <Card className="border-violet-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md bg-violet-100 text-violet-600 text-xs font-bold">AI</span>
                  AI 재무분석 전문가 소견
                  {result.aiAnalysis && result.geminiAnalysis && (
                    <Badge variant="outline" className="ml-2 text-xs">비교 모드</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {result.aiAnalysis && result.geminiAnalysis
                    ? `${result.aiAnalysis.aiModel} vs ${result.geminiAnalysis.aiModel} 병행 분석`
                    : result.aiAnalysis
                      ? `${result.aiAnalysis.aiModel} 기반 여신심사 전문가 분석`
                      : `${result.geminiAnalysis!.aiModel} 기반 여신심사 전문가 분석`
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result.aiAnalysis && result.geminiAnalysis ? (
                  /* 두 AI 결과 모두 있으면 탭으로 비교 */
                  <Tabs defaultValue="gemini" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                      <TabsTrigger value="gpt" className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-emerald-500" />
                        {result.aiAnalysis.aiModel}
                      </TabsTrigger>
                      <TabsTrigger value="gemini" className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-blue-500" />
                        {result.geminiAnalysis.aiModel}
                      </TabsTrigger>
                    </TabsList>

                    {[
                      { key: "gpt" as const, data: result.aiAnalysis, bgClass: "bg-emerald-50/50", borderClass: "border-emerald-100", titleClass: "text-emerald-800" },
                      { key: "gemini" as const, data: result.geminiAnalysis, bgClass: "bg-blue-50/50", borderClass: "border-blue-100", titleClass: "text-blue-800" },
                    ].map(({ key, data, bgClass, borderClass, titleClass }) => (
                      <TabsContent key={key} value={key} className="space-y-4 mt-0">
                        {data.executiveSummary && (
                          <div className={`rounded-lg ${bgClass} border ${borderClass} p-4`}>
                            <h4 className={`font-semibold text-sm ${titleClass} mb-2`}>경영진 요약</h4>
                            <p className="text-sm leading-relaxed whitespace-pre-line">{data.executiveSummary}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {data.deepDiagnosis && (
                            <div className="rounded-lg border p-4">
                              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                <Search className="h-4 w-4 text-indigo-500" />
                                심층 진단
                              </h4>
                              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{data.deepDiagnosis}</p>
                            </div>
                          )}
                          {data.riskAssessment && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-4">
                              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                                리스크 평가
                              </h4>
                              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{data.riskAssessment}</p>
                            </div>
                          )}
                        </div>

                        {data.loanOpinion && (
                          <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/30 p-4">
                            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-indigo-600" />
                              여신 심사 의견
                            </h4>
                            <p className="text-sm leading-relaxed whitespace-pre-line font-medium">{data.loanOpinion}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {data.creditOutlook && (
                            <div className="rounded-lg border p-4">
                              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-emerald-500" />
                                신용 전망
                              </h4>
                              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{data.creditOutlook}</p>
                            </div>
                          )}
                          {data.keyMetricsNarrative && (
                            <div className="rounded-lg border p-4">
                              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-blue-500" />
                                핵심 지표 내러티브
                              </h4>
                              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{data.keyMetricsNarrative}</p>
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                ) : (
                  /* AI 결과 하나만 있으면 기존처럼 표시 */
                  (() => {
                    const data = result.aiAnalysis || result.geminiAnalysis!;
                    return (
                      <div className="space-y-4">
                        {data.executiveSummary && (
                          <div className="rounded-lg bg-violet-50/50 border border-violet-100 p-4">
                            <h4 className="font-semibold text-sm text-violet-800 mb-2">경영진 요약</h4>
                            <p className="text-sm leading-relaxed whitespace-pre-line">{data.executiveSummary}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {data.deepDiagnosis && (
                            <div className="rounded-lg border p-4">
                              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                <Search className="h-4 w-4 text-indigo-500" />
                                심층 진단
                              </h4>
                              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{data.deepDiagnosis}</p>
                            </div>
                          )}
                          {data.riskAssessment && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-4">
                              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                                리스크 평가
                              </h4>
                              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{data.riskAssessment}</p>
                            </div>
                          )}
                        </div>

                        {data.loanOpinion && (
                          <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/30 p-4">
                            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-indigo-600" />
                              여신 심사 의견
                            </h4>
                            <p className="text-sm leading-relaxed whitespace-pre-line font-medium">{data.loanOpinion}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {data.creditOutlook && (
                            <div className="rounded-lg border p-4">
                              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-emerald-500" />
                                신용 전망
                              </h4>
                              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{data.creditOutlook}</p>
                            </div>
                          )}
                          {data.keyMetricsNarrative && (
                            <div className="rounded-lg border p-4">
                              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-blue-500" />
                                핵심 지표 내러티브
                              </h4>
                              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{data.keyMetricsNarrative}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()
                )}
              </CardContent>
            </Card>
          )}

          {/* QA 검수 리포트 */}
          {result.qaReport && (
            <Card className={result.qaReport.status === "PASS" ? "border-green-200" : result.qaReport.status === "ESCALATE" ? "border-red-200" : "border-yellow-200"}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {result.qaReport.status === "PASS" ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                  데이터 검수 결과
                  <Badge variant={result.qaReport.status === "PASS" ? "default" : result.qaReport.status === "ESCALATE" ? "destructive" : "secondary"} className="ml-2">
                    {result.qaReport.status === "PASS" ? "검증 통과" : result.qaReport.status === "ESCALATE" ? "확인 필요" : "자동 수정됨"}
                  </Badge>
                </CardTitle>
                <CardDescription>원본 데이터 대비 산출물 정확성 자동 검증</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* 4가지 검증 결과 요약 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {result.qaReport.checks.map((check, i) => (
                      <div key={i} className={`p-3 rounded-lg border ${check.result === "PASS" ? "bg-green-50 border-green-200" : check.result === "WARN" ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}`}>
                        <div className="text-xs font-medium text-gray-500">{check.type}</div>
                        <div className={`text-sm font-bold ${check.result === "PASS" ? "text-green-700" : check.result === "WARN" ? "text-yellow-700" : "text-red-700"}`}>
                          {check.result === "PASS" ? "PASS" : check.result === "WARN" ? "WARN" : "FAIL"}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 truncate" title={check.details}>{check.details}</div>
                      </div>
                    ))}
                  </div>

                  {/* 에스컬레이션 항목 */}
                  {result.qaEscalations && result.qaEscalations.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-sm font-semibold text-red-700">확인 필요 항목 ({result.qaEscalations.length}건)</div>
                      {result.qaEscalations.map((esc, i) => (
                        <div key={i} className={`p-3 rounded border text-sm ${esc.severity === "HIGH" ? "bg-red-50 border-red-200" : esc.severity === "MEDIUM" ? "bg-yellow-50 border-yellow-200" : "bg-gray-50 border-gray-200"}`}>
                          <div className="flex items-center gap-2">
                            <Badge variant={esc.severity === "HIGH" ? "destructive" : "secondary"} className="text-xs">{esc.severity}</Badge>
                            <span className="text-xs text-gray-500">{esc.type}</span>
                          </div>
                          <div className="mt-1">{esc.description}</div>
                          {esc.originalValue !== undefined && esc.currentValue !== undefined && (
                            <div className="mt-1 text-xs text-gray-500">
                              원본: {String(esc.originalValue)} / 현재: {String(esc.currentValue)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 자동 수정 항목 */}
                  {result.qaReport.autoFixable.length > 0 && (
                    <div className="mt-3">
                      <div className="text-sm font-medium text-gray-600 mb-1">자동 수정 ({result.qaReport.autoFixable.length}건)</div>
                      {result.qaReport.autoFixable.map((fix, i) => (
                        <div key={i} className="text-xs text-gray-500 py-1">{fix.description} — {fix.suggestedFix}</div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {result.bsItems.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2">재무상태표 (단위: 백만원){result.hasCfs && <Badge variant="secondary">개별(OFS)</Badge>}</CardTitle></CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>계정과목</TableHead>
                        {result.years.sort().map((y) => (
                          <TableHead key={y} className="text-right">{y}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.bsItems.map((item, i) => {
                        const bold = ["자산총계", "부채총계", "자본총계", "자본과부채총계"].some(
                          (k) => item.account.replace(/\s/g, "").includes(k)
                        );
                        return (
                          <TableRow key={i}>
                            <TableCell className={bold ? "font-bold" : ""}>{item.account}</TableCell>
                            {result.years.sort().map((y) => (
                              <TableCell key={y} className={`text-right ${bold ? "font-bold" : ""}`}>
                                {item[y] || "-"}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {result.isItems.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2">손익계산서 (단위: 백만원){result.hasCfs && <Badge variant="secondary">개별(OFS)</Badge>}</CardTitle></CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>계정과목</TableHead>
                        {result.years.sort().map((y) => (
                          <TableHead key={y} className="text-right">{y}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.isItems.map((item, i) => {
                        const bold = ["매출액", "영업이익", "당기순이익", "영업수익", "영업손실", "당기순손실"].some(
                          (k) => item.account.replace(/\s/g, "").includes(k)
                        );
                        return (
                          <TableRow key={i}>
                            <TableCell className={bold ? "font-bold" : ""}>{item.account}</TableCell>
                            {result.years.sort().map((y) => (
                              <TableCell key={y} className={`text-right ${bold ? "font-bold" : ""}`}>
                                {item[y] || "-"}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
          {/* ===== 연결 재무상태표 (CFS) ===== */}
          {result.hasCfs && result.bsItemsCfs && result.bsItemsCfs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  연결 재무상태표 (단위: 백만원)
                  <Badge variant="secondary">CFS</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>계정과목</TableHead>
                        {result.years.sort().map((y) => (
                          <TableHead key={y} className="text-right">{y}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.bsItemsCfs.map((item, i) => {
                        const bold = ["자산총계", "부채총계", "자본총계"].some(
                          (k) => item.account.replace(/\s/g, "").includes(k)
                        );
                        return (
                          <TableRow key={i}>
                            <TableCell className={bold ? "font-bold" : ""}>{item.account}</TableCell>
                            {result.years.sort().map((y) => (
                              <TableCell key={y} className={`text-right ${bold ? "font-bold" : ""}`}>
                                {item[y] || "-"}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {result.hasCfs && result.isItemsCfs && result.isItemsCfs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  연결 손익계산서 (단위: 백만원)
                  <Badge variant="secondary">CFS</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>계정과목</TableHead>
                        {result.years.sort().map((y) => (
                          <TableHead key={y} className="text-right">{y}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.isItemsCfs.map((item, i) => {
                        const bold = ["매출액", "영업이익", "당기순이익", "영업수익"].some(
                          (k) => item.account.replace(/\s/g, "").includes(k)
                        );
                        return (
                          <TableRow key={i}>
                            <TableCell className={bold ? "font-bold" : ""}>{item.account}</TableCell>
                            {result.years.sort().map((y) => (
                              <TableCell key={y} className={`text-right ${bold ? "font-bold" : ""}`}>
                                {item[y] || "-"}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 연결 비율 */}
          {result.hasCfs && result.ratiosCfs && Object.keys(result.ratiosCfs).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-indigo-500" />
                  연결 주요 재무비율
                  <Badge variant="secondary">CFS</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>지표</TableHead>
                      {result.years.sort().map((y) => (
                        <TableHead key={y} className="text-right">{y}년</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {["총차입금", "순차입금", "부채비율", "유동비율", "자기자본비율", "차입금의존도", "영업이익률", "총자산이익률(ROA)", "자기자본이익률(ROE)", "매출증가율"].map((name) => (
                      <TableRow key={name}>
                        <TableCell className="font-medium">{name}</TableCell>
                        {result.years.sort().map((y) => (
                          <TableCell key={y} className="text-right">
                            {result.ratiosCfs?.[y]?.[name] || "-"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* ===== 차입금 내역 (주석) ===== */}
          {result.borrowingNotes && result.borrowingNotes.details.length > 0 && (
            <Card className="border-orange-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-orange-500" />
                  {result.borrowingNotes.title}
                  <Badge variant="outline" className="text-xs">{result.borrowingNotes.fiscalYear}년 기준</Badge>
                </CardTitle>
                <CardDescription>DART 감사보고서 주석에서 자동 추출</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>구분</TableHead>
                        <TableHead>차입처</TableHead>
                        <TableHead className="text-center">이자율</TableHead>
                        <TableHead className="text-center">만기일</TableHead>
                        <TableHead className="text-right">당기말</TableHead>
                        <TableHead className="text-right">전기말</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.borrowingNotes.details.map((d, i) => {
                        const isTotal = /합계|소계|계$/.test(d.category.replace(/\s/g, ""));
                        return (
                          <TableRow key={i} className={isTotal ? "bg-muted/50 font-bold" : ""}>
                            <TableCell className={isTotal ? "font-bold" : ""}>{d.category}</TableCell>
                            <TableCell>{d.lender}</TableCell>
                            <TableCell className="text-center">{d.interestRate}</TableCell>
                            <TableCell className="text-center">{d.maturityDate}</TableCell>
                            <TableCell className="text-right">{d.currentAmount}</TableCell>
                            <TableCell className="text-right">{d.previousAmount}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {result && !result.hasData && result.noDataReason && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-6">
            <p className="text-amber-800">{result.noDataReason}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function FinancialPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">로딩 중...</div>}>
      <FinancialContent />
    </Suspense>
  );
}
