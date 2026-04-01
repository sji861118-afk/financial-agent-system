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
  ArrowRight,
  Download,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface UploadedFile {
  file: File;
  category: string;
  status: "pending" | "parsing" | "done" | "error";
  preview?: string;
}

const FILE_CATEGORIES = [
  { label: "소개처자료 / IM", desc: "투자제안서, Information Memorandum 등", accept: ".pdf,.docx,.doc,.hwp,.pptx" },
  { label: "재무제표", desc: "감사보고서, BS/IS, Excel 등", accept: ".pdf,.xlsx,.xls" },
  { label: "기타 자료", desc: "사업자등록증, 주주명부, 감정평가서 등", accept: ".pdf,.xlsx,.xls,.docx,.doc,.hwp,.jpg,.png" },
];

export default function NewDealPage() {
  const router = useRouter();
  const [step, setStep] = useState<"upload" | "confirm" | "generating">("upload");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [memo, setMemo] = useState("");
  const [borrowerName, setBorrowerName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const newFiles = Array.from(e.dataTransfer.files).map((file) => ({
        file,
        category: guessCategory(file.name),
        status: "pending" as const,
      }));
      setFiles((prev) => [...prev, ...newFiles]);
    },
    []
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).map((file) => ({
      file,
      category: guessCategory(file.name),
      status: "pending" as const,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (files.length === 0) {
      setError("파일을 1개 이상 업로드해주세요");
      return;
    }

    setGenerating(true);
    setError(null);
    setStep("generating");

    try {
      // 1. 파일 업로드
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f.file));
      formData.append("borrowerName", borrowerName);
      formData.append("memo", memo);

      const uploadRes = await fetch("/api/review/upload-and-generate", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "업로드 실패");
      }

      // 2. DOCX 다운로드
      const blob = await uploadRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = uploadRes.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      a.download = match
        ? decodeURIComponent(match[1])
        : `${borrowerName || "여신"}_초안.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setStep("confirm");
    } catch (err: any) {
      setError(err.message || "초안 생성 중 오류 발생");
      setStep("upload");
    } finally {
      setGenerating(false);
    }
  };

  // ─── Render ───

  if (step === "confirm") {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <CheckCircle className="mx-auto mb-4 size-16 text-emerald-400" />
        <h1 className="text-2xl font-bold text-white">초안이 생성되었습니다</h1>
        <p className="mt-2 text-slate-400">
          DOCX 파일이 다운로드되었습니다. Word에서 열어 내용을 확인하세요.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button variant="outline" onClick={() => { setStep("upload"); setFiles([]); }}>
            새 건 작성
          </Button>
          <Button onClick={() => router.push("/review")}>
            목록으로
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold text-white">여신승인신청서 초안 생성</h1>
        <p className="mt-1 text-sm text-slate-400">
          관련 자료를 업로드하면 자동으로 내용을 파악하여 신청서 초안을 생성합니다
        </p>
      </div>

      {/* 차주명 (최소 입력) */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardContent className="pt-6">
          <label className="mb-2 block text-sm font-medium text-slate-300">
            차주명 <span className="text-slate-500">(선택)</span>
          </label>
          <Input
            placeholder="예: 테크메이트코리아대부(주)"
            value={borrowerName}
            onChange={(e) => setBorrowerName(e.target.value)}
            className="bg-slate-800 text-sm"
          />
        </CardContent>
      </Card>

      {/* 파일 업로드 영역 */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardContent className="pt-6">
          <label className="mb-3 block text-sm font-medium text-slate-300">
            자료 업로드
          </label>

          {/* 드롭 영역 */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("file-input")?.click()}
            className="relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-600 bg-slate-800/50 px-6 py-10 transition-colors hover:border-indigo-500/50 hover:bg-slate-800"
          >
            <Upload className="mb-3 size-10 text-slate-500" />
            <p className="text-sm font-medium text-slate-300">
              파일을 드래그하거나 클릭하여 업로드
            </p>
            <p className="mt-1 text-xs text-slate-500">
              소개처자료, 재무제표, IM, 감정평가서 등 — PDF, Excel, Word, HWP
            </p>
            <input
              id="file-input"
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.docx,.doc,.hwp,.pptx,.jpg,.png"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* 업로드된 파일 목록 */}
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-white/5 bg-slate-800 px-4 py-3"
                >
                  <FileText className="size-5 shrink-0 text-indigo-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">
                      {f.file.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {(f.file.size / 1024 / 1024).toFixed(1)} MB · {f.category}
                    </p>
                  </div>
                  <button
                    onClick={() => removeFile(i)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-white"
                  >
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
          <label className="mb-2 block text-sm font-medium text-slate-300">
            참고사항 <span className="text-slate-500">(선택)</span>
          </label>
          <Textarea
            placeholder="예: 지분담보 대출, 금리 협의중, SPC 활용 예정 등"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="bg-slate-800 text-sm"
            rows={3}
          />
        </CardContent>
      </Card>

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
          <AlertCircle className="size-5 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* 생성 버튼 */}
      <Button
        onClick={handleGenerate}
        disabled={generating || files.length === 0}
        size="lg"
        className="w-full"
      >
        {generating ? (
          <>
            <Loader2 className="mr-2 size-5 animate-spin" />
            자료 분석 및 초안 생성 중...
          </>
        ) : (
          <>
            <Download className="mr-2 size-5" />
            초안 생성 ({files.length}개 파일)
          </>
        )}
      </Button>
    </div>
  );
}

// ─── Helpers ───

function guessCategory(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes("재무") || lower.includes("감사") || lower.includes("bs") || lower.includes("is") || lower.match(/\.(xlsx|xls)$/))
    return "재무제표";
  if (lower.includes("im") || lower.includes("소개") || lower.includes("제안") || lower.includes("투자"))
    return "소개처자료";
  return "기타자료";
}
