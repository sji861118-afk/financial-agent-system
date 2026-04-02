"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  FileText,
  X,
  Loader2,
  Download,
  CheckCircle,
  AlertCircle,
  BarChart3,
  Plus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface UploadedFile {
  file: File;
  category: string;
}

interface FieldStatus {
  fieldId: string;
  label: string;
  status: "filled" | "partial" | "missing";
  source?: string;
  value?: string;
}

interface SectionStatus {
  sectionId: string;
  title: string;
  required: boolean;
  completeness: number;
  fields: FieldStatus[];
}

interface MissingSuggestion {
  dataType: string;
  description: string;
  affectedSections: string[];
  priority: "high" | "medium" | "low";
}

interface CompletenessReport {
  overall: number;
  requiredCompleteness: number;
  sections: SectionStatus[];
  missingDataSuggestions: MissingSuggestion[];
}

type Step = "upload" | "checking" | "report" | "generating" | "confirm";

export default function NewDealPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [memo, setMemo] = useState("");
  const [borrowerName, setBorrowerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CompletenessReport | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // ─── 파일 핸들링 ───

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const newFiles = Array.from(e.dataTransfer.files).map((file) => ({
      file,
      category: guessCategory(file.name),
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).map((file) => ({
      file,
      category: guessCategory(file.name),
    }));
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── 완성도 체크 ───

  const handleCheck = async () => {
    if (files.length === 0) {
      setError("파일을 1개 이상 업로드해주세요");
      return;
    }
    setLoading(true);
    setError(null);
    setStep("checking");

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f.file));
      formData.append("borrowerName", borrowerName);
      formData.append("memo", memo);
      formData.append("mode", "check");

      const res = await fetch("/api/review/upload-and-generate", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "분석 실패");
      }

      const data = await res.json();
      setReport(data.report);
      setStep("report");
    } catch (err: any) {
      setError(err.message || "완성도 체크 중 오류");
      setStep("upload");
    } finally {
      setLoading(false);
    }
  };

  // ─── DOCX 생성 ───

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setStep("generating");

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f.file));
      formData.append("borrowerName", borrowerName);
      formData.append("memo", memo);
      formData.append("mode", "generate");

      const res = await fetch("/api/review/upload-and-generate", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "생성 실패");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      a.download = match ? decodeURIComponent(match[1]) : `${borrowerName || "여신"}_초안.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setStep("confirm");
    } catch (err: any) {
      setError(err.message || "초안 생성 중 오류");
      setStep("report");
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ─── 완료 화면 ───

  if (step === "confirm") {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <CheckCircle className="mx-auto mb-4 size-16 text-emerald-400" />
        <h1 className="text-2xl font-bold text-white">초안이 생성되었습니다</h1>
        <p className="mt-2 text-slate-400">DOCX 파일이 다운로드되었습니다.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Button variant="outline" onClick={() => { setStep("upload"); setFiles([]); setReport(null); }}>
            새 건 작성
          </Button>
          <Button onClick={() => router.push("/review")}>목록으로</Button>
        </div>
      </div>
    );
  }

  // ─── 메인 렌더 ───

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">여신승인신청서 초안 생성</h1>
        <p className="mt-1 text-sm text-slate-400">
          자료를 업로드하면 완성도를 분석하고 신청서 초안을 생성합니다
        </p>
      </div>

      {/* 차주명 */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardContent className="pt-6">
          <label className="mb-2 block text-sm font-medium text-slate-300">차주명</label>
          <Input
            placeholder="예: 에이엠플러스자산개발"
            value={borrowerName}
            onChange={(e) => setBorrowerName(e.target.value)}
            className="bg-slate-800 text-sm"
          />
        </CardContent>
      </Card>

      {/* 파일 업로드 */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardContent className="pt-6">
          <label className="mb-3 block text-sm font-medium text-slate-300">자료 업로드</label>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("file-input")?.click()}
            className="relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-600 bg-slate-800/50 px-6 py-8 transition-colors hover:border-indigo-500/50 hover:bg-slate-800"
          >
            <Upload className="mb-3 size-8 text-slate-500" />
            <p className="text-sm font-medium text-slate-300">파일을 드래그하거나 클릭하여 업로드</p>
            <p className="mt-1 text-xs text-slate-500">검토의견서, IM, 재무제표, 감정평가서, 호실목록 Excel 등</p>
            <input id="file-input" type="file" multiple accept=".pdf,.xlsx,.xls,.docx,.doc,.hwp,.pptx,.jpg,.png" onChange={handleFileSelect} className="hidden" />
          </div>

          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-white/5 bg-slate-800 px-4 py-2.5">
                  <FileText className="size-4 shrink-0 text-indigo-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">{f.file.name}</p>
                    <p className="text-xs text-slate-500">{(f.file.size / 1024 / 1024).toFixed(1)} MB · {f.category}</p>
                  </div>
                  <button onClick={() => removeFile(i)} className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-white">
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 메모 */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardContent className="pt-6">
          <label className="mb-2 block text-sm font-medium text-slate-300">참고사항 <span className="text-slate-500">(선택)</span></label>
          <Textarea placeholder="예: 미분양담보대출, 금리 협의중 등" value={memo} onChange={(e) => setMemo(e.target.value)} className="bg-slate-800 text-sm" rows={2} />
        </CardContent>
      </Card>

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
          <AlertCircle className="size-5 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* ─── 완성도 리포트 ─── */}
      {report && step === "report" && (
        <Card className="border-white/10 bg-slate-900/50">
          <CardContent className="pt-6">
            {/* 전체 완성도 */}
            <div className="mb-6 flex items-center gap-4">
              <BarChart3 className="size-6 text-indigo-400" />
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">{report.overall}%</span>
                  <span className="text-sm text-slate-400">전체 완성도</span>
                  <span className="ml-2 text-sm text-slate-500">
                    (필수 {report.requiredCompleteness}%)
                  </span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${report.overall}%`,
                      background: report.overall >= 70
                        ? "linear-gradient(90deg, #22c55e, #10b981)"
                        : report.overall >= 40
                          ? "linear-gradient(90deg, #f59e0b, #eab308)"
                          : "linear-gradient(90deg, #ef4444, #f97316)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* 섹션별 현황 */}
            <div className="space-y-1">
              {report.sections.map((s) => {
                const isExpanded = expandedSections.has(s.sectionId);
                const missingFields = s.fields.filter((f) => f.status === "missing");
                const hasIssues = missingFields.length > 0;

                return (
                  <div key={s.sectionId} className="rounded-lg border border-white/5">
                    <button
                      onClick={() => hasIssues && toggleSection(s.sectionId)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-800/50"
                    >
                      {hasIssues ? (
                        isExpanded ? <ChevronDown className="size-4 text-slate-500" /> : <ChevronRight className="size-4 text-slate-500" />
                      ) : (
                        <CheckCircle className="size-4 text-emerald-400" />
                      )}
                      <span className={`flex-1 text-sm ${s.required ? "font-medium text-slate-200" : "text-slate-400"}`}>
                        {s.title}
                        {s.required && <span className="ml-1 text-xs text-amber-500">필수</span>}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-700">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${s.completeness}%`,
                              backgroundColor: s.completeness === 100 ? "#22c55e" : s.completeness >= 50 ? "#f59e0b" : "#ef4444",
                            }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs text-slate-500">{s.completeness}%</span>
                      </div>
                    </button>

                    {isExpanded && hasIssues && (
                      <div className="border-t border-white/5 px-4 py-2">
                        {s.fields.map((f) => (
                          <div key={f.fieldId} className="flex items-center gap-2 py-1 text-xs">
                            {f.status === "filled" ? (
                              <span className="text-emerald-400">&#10003;</span>
                            ) : f.status === "partial" ? (
                              <span className="text-amber-400">&#9651;</span>
                            ) : (
                              <span className="text-red-400">&#10007;</span>
                            )}
                            <span className={f.status === "missing" ? "text-slate-400" : "text-slate-300"}>
                              {f.label}
                            </span>
                            {f.source && (
                              <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                                {f.source}
                              </span>
                            )}
                            {f.value && <span className="text-slate-500">— {f.value}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 부족 데이터 제안 */}
            {report.missingDataSuggestions.length > 0 && (
              <div className="mt-6 space-y-2">
                <h3 className="text-sm font-medium text-slate-300">추가 자료가 있으면 완성도가 올라갑니다</h3>
                {report.missingDataSuggestions
                  .filter((s) => s.priority !== "low")
                  .map((s, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-white/5 bg-slate-800/50 px-4 py-3">
                      <Plus className="mt-0.5 size-4 shrink-0 text-indigo-400" />
                      <div>
                        <p className="text-sm font-medium text-slate-200">
                          {s.dataType}
                          <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${s.priority === "high" ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}>
                            {s.priority === "high" ? "중요" : "권장"}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{s.description}</p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 버튼 영역 */}
      <div className="flex gap-3">
        {step === "report" ? (
          <>
            <Button
              variant="outline"
              onClick={() => { setStep("upload"); setReport(null); }}
              className="flex-1"
            >
              <Plus className="mr-2 size-4" />
              추가 자료 업로드
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={loading}
              className="flex-1"
            >
              {loading ? (
                <><Loader2 className="mr-2 size-4 animate-spin" />생성 중...</>
              ) : (
                <><Download className="mr-2 size-4" />초안 생성 ({report?.overall}% 완성도)</>
              )}
            </Button>
          </>
        ) : (
          <Button
            onClick={handleCheck}
            disabled={loading || files.length === 0}
            size="lg"
            className="w-full"
          >
            {loading ? (
              <><Loader2 className="mr-2 size-5 animate-spin" />자료 분석 중...</>
            ) : (
              <><BarChart3 className="mr-2 size-5" />완성도 분석 ({files.length}개 파일)</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function guessCategory(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes("감정") || lower.includes("appraisal")) return "감정평가서";
  if (lower.includes("재무") || lower.includes("감사") || lower.match(/\.(xlsx|xls)$/)) return "재무/Excel";
  if (lower.includes("im") || lower.includes("소개") || lower.includes("검토의견")) return "검토의견/IM";
  if (lower.includes("계약") || lower.includes("신탁")) return "계약서";
  return "기타자료";
}
