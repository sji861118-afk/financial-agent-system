"use client";

import { useState, useCallback } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { UploadStep } from "@/components/appraisal/upload-step";
import CollateralTab from "@/components/appraisal/collateral-tab";
import SupplyTab from "@/components/appraisal/supply-tab";
import {
  createEmptyCase,
  type AppraisalCase,
  type UploadedFile,
} from "@/types/appraisal";

type Step = "upload" | "edit";

export default function AppraisalPage() {
  const [step, setStep] = useState<Step>("upload");
  const [data, setData] = useState<AppraisalCase>(createEmptyCase);
  const [loading, setLoading] = useState(false);

  const updateData = useCallback((patch: Partial<AppraisalCase>) => {
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const addFile = useCallback((file: UploadedFile) => {
    setData((prev) => ({ ...prev, files: [...prev.files, file] }));
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setData((prev) => ({
      ...prev,
      files: prev.files.filter((f) => f.id !== fileId),
    }));
  }, []);

  const handleStartAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const appraisalFiles = data.files.filter((f) => f.type === "appraisal");
      const feasibilityFiles = data.files.filter(
        (f) => f.type === "feasibility"
      );

      // Call parse API
      const formData = new FormData();
      appraisalFiles.forEach((f) => formData.append("appraisal", f.file));
      feasibilityFiles.forEach((f) => formData.append("feasibility", f.file));

      let parseResult: Partial<AppraisalCase> = {};
      try {
        const parseRes = await fetch("/api/appraisal/parse", {
          method: "POST",
          body: formData,
        });
        if (parseRes.ok) {
          parseResult = await parseRes.json();
        }
      } catch {
        // parse failed — continue to manual input
      }

      // Call infocare API if address is set
      let infocareResult: Partial<AppraisalCase> = {};
      if (data.address.full.trim()) {
        try {
          const infocareRes = await fetch("/api/appraisal/infocare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: data.address }),
          });
          if (infocareRes.ok) {
            infocareResult = await infocareRes.json();
          }
        } catch {
          // infocare failed — continue
        }
      }

      setData((prev) => ({
        ...prev,
        ...parseResult,
        ...infocareResult,
        // preserve user-entered fields
        caseName: prev.caseName,
        borrowerName: prev.borrowerName,
        address: prev.address,
        propertyType: prev.propertyType,
        files: prev.files,
      }));
    } catch {
      // On any error still proceed to edit step
    } finally {
      setStep("edit");
      setLoading(false);
    }
  }, [data]);

  const handleDownloadExcel = useCallback(async () => {
    try {
      const res = await fetch("/api/appraisal/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Excel 생성 실패");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `감정평가분석_${data.caseName || "untitled"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  }, [data]);

  return (
    <div className="mx-auto max-w-6xl space-y-6" style={{ fontFamily: "맑은 고딕, sans-serif" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">감정평가서 분석</h1>
          <p className="text-sm text-muted-foreground">
            감정평가서 PDF를 업로드하면 주요 항목을 자동으로 추출합니다.
          </p>
        </div>
        {step === "edit" && (
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              onClick={() => setStep("upload")}
            >
              처음으로
            </Button>
            <Button onClick={handleDownloadExcel}>
              <Download className="mr-1.5 size-4" />
              Excel 다운로드
            </Button>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <div className="size-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-500" />
          <p className="text-sm text-muted-foreground">
            PDF 분석 및 외부 데이터 수집 중...
          </p>
        </div>
      )}

      {/* Step: Upload */}
      {!loading && step === "upload" && (
        <UploadStep
          data={data}
          onUpdate={updateData}
          onAddFile={addFile}
          onRemoveFile={removeFile}
          onStartAnalysis={handleStartAnalysis}
        />
      )}

      {/* Step: Edit — Tab structure */}
      {!loading && step === "edit" && (
        <Tabs defaultValue="collateral">
          <TabsList className="mb-4">
            <TabsTrigger value="collateral">담보분석</TabsTrigger>
            <TabsTrigger value="supply">공급개요</TabsTrigger>
            <TabsTrigger value="comparatives">비준사례</TabsTrigger>
            <TabsTrigger value="market">시장환경</TabsTrigger>
          </TabsList>

          <TabsContent value="collateral">
            <CollateralTab data={data} onUpdate={updateData} />
          </TabsContent>

          <TabsContent value="supply">
            <SupplyTab data={data} onUpdate={updateData} />
          </TabsContent>

          <TabsContent value="comparatives">
            <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-muted-foreground">
              비준사례 탭 — Task 8에서 구현
            </div>
          </TabsContent>

          <TabsContent value="market">
            <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-muted-foreground">
              시장환경 탭 — Task 9에서 구현
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
