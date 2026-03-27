"use client";

import { useState, useCallback } from "react";
import { FileUp, CheckCircle2, XCircle, FileText } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppraisalResult } from "@/types";

const extractionTags = [
  { key: "collateralSurvey" as const, label: "담보물 조사표" },
  { key: "locationMap" as const, label: "위치도" },
  { key: "comparativeCases" as const, label: "비준사례" },
  { key: "auctionStats" as const, label: "낙찰률통계" },
];

const mockResults: AppraisalResult[] = [
  {
    id: "1",
    caseName: "강남구 역삼동 오피스텔",
    companyName: "삼성전자",
    fileName: "감정평가서_역삼동_2026.pdf",
    uploadedAt: "2026-03-19 14:00",
    extractionStatus: {
      collateralSurvey: true,
      locationMap: true,
      comparativeCases: true,
      auctionStats: false,
    },
  },
  {
    id: "2",
    caseName: "서초구 반포동 아파트",
    companyName: "",
    fileName: "감정평가서_반포동_2026.pdf",
    uploadedAt: "2026-03-18 10:30",
    extractionStatus: {
      collateralSurvey: true,
      locationMap: false,
      comparativeCases: true,
      auctionStats: true,
    },
  },
  {
    id: "3",
    caseName: "마포구 상암동 상가",
    companyName: "카카오",
    fileName: "감정평가서_상암동_2026.pdf",
    uploadedAt: "2026-03-17 16:45",
    extractionStatus: {
      collateralSurvey: true,
      locationMap: true,
      comparativeCases: false,
      auctionStats: false,
    },
  },
];

function StatusIcon({ extracted }: { extracted: boolean }) {
  return extracted ? (
    <CheckCircle2 className="size-4 text-emerald-500" />
  ) : (
    <XCircle className="size-4 text-gray-300" />
  );
}

export default function AppraisalPage() {
  const [caseName, setCaseName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") {
      setUploadedFile(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setUploadedFile(file);
    }
  };

  const handleAnalyze = () => {
    // Placeholder for analysis trigger
    console.log("Analyzing:", { caseName, companyName, uploadedFile });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">감정평가서 분석</h1>
        <p className="text-sm text-muted-foreground">
          감정평가서 PDF를 업로드하면 주요 항목을 자동으로 추출합니다.
        </p>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="size-5 text-indigo-500" />
            감정평가서 업로드
          </CardTitle>
          <CardDescription>
            PDF 파일만 업로드 가능합니다. 드래그 앤 드롭을 지원합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="caseName">건명 (필수)</Label>
              <Input
                id="caseName"
                placeholder="예: 강남구 역삼동 오피스텔"
                value={caseName}
                onChange={(e) => setCaseName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName">기업명 (선택)</Label>
              <Input
                id="companyName"
                placeholder="관련 기업명 입력"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
          </div>

          {/* Drag & Drop Area */}
          <div
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
              dragActive
                ? "border-indigo-500 bg-indigo-50"
                : uploadedFile
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-gray-300 hover:border-indigo-400"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {uploadedFile ? (
              <>
                <FileText className="mb-3 size-10 text-emerald-500" />
                <p className="text-sm font-medium text-emerald-700">
                  {uploadedFile.name}
                </p>
                <p className="mt-1 text-xs text-emerald-600">
                  {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => setUploadedFile(null)}
                >
                  다른 파일 선택
                </Button>
              </>
            ) : (
              <>
                <FileUp className="mb-3 size-10 text-gray-400" />
                <p className="text-sm font-medium text-gray-700">
                  PDF 파일을 드래그하여 놓거나 클릭하여 업로드
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PDF 파일만 지원 (최대 50MB)
                </p>
                <label className="cursor-pointer">
                  <span className="mt-4 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm font-medium transition-colors hover:bg-muted">
                    파일 선택
                  </span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </label>
              </>
            )}
          </div>

          {/* Extraction Status Tags */}
          <div>
            <Label className="mb-2">추출 항목</Label>
            <div className="flex flex-wrap gap-2">
              {extractionTags.map((tag) => (
                <Badge
                  key={tag.key}
                  variant="outline"
                  className="px-3 py-1.5"
                >
                  {tag.label}
                </Badge>
              ))}
            </div>
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={!caseName.trim() || !uploadedFile}
            className="w-full sm:w-auto"
          >
            분석 시작
          </Button>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>분석 결과</CardTitle>
          <CardDescription>
            업로드된 감정평가서의 추출 상태입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>건명</TableHead>
                <TableHead>기업명</TableHead>
                <TableHead>파일명</TableHead>
                <TableHead>업로드 일시</TableHead>
                {extractionTags.map((tag) => (
                  <TableHead key={tag.key} className="text-center">
                    {tag.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockResults.map((result) => (
                <TableRow key={result.id}>
                  <TableCell className="font-medium">
                    {result.caseName}
                  </TableCell>
                  <TableCell>
                    {result.companyName || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {result.fileName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {result.uploadedAt}
                  </TableCell>
                  {extractionTags.map((tag) => (
                    <TableCell key={tag.key} className="text-center">
                      <StatusIcon
                        extracted={result.extractionStatus[tag.key]}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
