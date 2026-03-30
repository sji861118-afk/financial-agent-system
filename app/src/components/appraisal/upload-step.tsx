"use client";

import { useCallback, useRef } from "react";
import { FileUp, FileText, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppraisalCase, UploadedFile, PropertyType } from "@/types/appraisal";

const PROPERTY_TYPES: PropertyType[] = [
  "아파트",
  "지식산업센터",
  "오피스텔",
  "오피스",
  "토지",
  "근린생활시설",
  "상가",
  "기타",
];

interface UploadStepProps {
  data: AppraisalCase;
  onUpdate: (patch: Partial<AppraisalCase>) => void;
  onAddFile: (file: UploadedFile) => void;
  onRemoveFile: (fileId: string) => void;
  onStartAnalysis: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function parseAddress(full: string) {
  const parts = full.trim().split(/\s+/);
  const sido = parts[0] ?? "";
  const gugun = parts[1] ?? "";
  const dong = parts[2] ?? "";
  const detail = parts.slice(3).join(" ");
  return { sido, gugun, dong, detail, full };
}

type FileAreaType = "appraisal" | "feasibility" | "reference";

interface FileAreaConfig {
  type: FileAreaType;
  label: string;
  accept: string;
  desc: string;
}

const FILE_AREAS: FileAreaConfig[] = [
  {
    type: "appraisal",
    label: "감정평가서",
    accept: ".pdf,application/pdf",
    desc: "PDF 1~2개",
  },
  {
    type: "feasibility",
    label: "사업성평가보고서",
    accept: ".pdf,application/pdf",
    desc: "PDF 0~2개 (선택)",
  },
  {
    type: "reference",
    label: "IM / 참고자료",
    accept: ".pdf,.xlsx,.xls,application/pdf",
    desc: "PDF, Excel (선택)",
  },
];

interface SingleFileAreaProps {
  config: FileAreaConfig;
  files: UploadedFile[];
  onAddFile: (file: UploadedFile) => void;
  onRemoveFile: (fileId: string) => void;
}

function SingleFileArea({
  config,
  files,
  onAddFile,
  onRemoveFile,
}: SingleFileAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const addFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      Array.from(fileList).forEach((f) => {
        const newFile: UploadedFile = {
          id: crypto.randomUUID(),
          name: f.name,
          size: f.size,
          type: config.type,
          file: f,
        };
        onAddFile(newFile);
      });
    },
    [config.type, onAddFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      addFiles(e.target.files);
      if (inputRef.current) inputRef.current.value = "";
    },
    [addFiles]
  );

  const areaFiles = files.filter((f) => f.type === config.type);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileUp className="size-4 text-indigo-500" />
          {config.label}
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {config.desc}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Drag & Drop Zone */}
        <div
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors border-gray-300 hover:border-indigo-400 cursor-pointer"
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <FileUp className="mb-2 size-8 text-gray-400" />
          <p className="text-sm text-gray-600">
            파일을 드래그하거나 클릭하여 추가
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{config.desc}</p>
        </div>

        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept={config.accept}
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* File list */}
        {areaFiles.length > 0 && (
          <ul className="space-y-1.5">
            {areaFiles.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2"
              >
                <FileText className="size-4 shrink-0 text-indigo-400" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">
                  {f.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatFileSize(f.size)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile(f.id);
                  }}
                  className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                  aria-label="파일 삭제"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Additional file button */}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted">
          <FileUp className="size-3.5" />
          파일 추가
          <input
            type="file"
            accept={config.accept}
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
        </label>
      </CardContent>
    </Card>
  );
}

export function UploadStep({
  data,
  onUpdate,
  onAddFile,
  onRemoveFile,
  onStartAnalysis,
}: UploadStepProps) {
  const appraisalFiles = data.files.filter((f) => f.type === "appraisal");
  const canStart = data.caseName.trim() !== "" && appraisalFiles.length > 0;

  return (
    <div className="space-y-6">
      {/* 기본정보 */}
      <Card>
        <CardHeader>
          <CardTitle>기본정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* 건명 */}
            <div className="space-y-2">
              <Label htmlFor="caseName">
                건명 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="caseName"
                placeholder="예: 강남구 역삼동 오피스텔"
                value={data.caseName}
                onChange={(e) => onUpdate({ caseName: e.target.value })}
              />
            </div>

            {/* 차주명 */}
            <div className="space-y-2">
              <Label htmlFor="borrowerName">차주명</Label>
              <Input
                id="borrowerName"
                placeholder="예: 홍길동"
                value={data.borrowerName}
                onChange={(e) => onUpdate({ borrowerName: e.target.value })}
              />
            </div>

            {/* 물건유형 */}
            <div className="space-y-2">
              <Label>물건유형</Label>
              <Select
                value={data.propertyType}
                onValueChange={(v) =>
                  onUpdate({ propertyType: v as PropertyType })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="물건유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((pt) => (
                    <SelectItem key={pt} value={pt}>
                      {pt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 소재지 */}
            <div className="space-y-2">
              <Label htmlFor="address">소재지</Label>
              <Input
                id="address"
                placeholder="예: 서울특별시 강남구 역삼동 123-1"
                value={data.address.full}
                onChange={(e) =>
                  onUpdate({ address: parseAddress(e.target.value) })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 파일 업로드 3영역 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {FILE_AREAS.map((config) => (
          <SingleFileArea
            key={config.type}
            config={config}
            files={data.files}
            onAddFile={onAddFile}
            onRemoveFile={onRemoveFile}
          />
        ))}
      </div>

      {/* 분석 시작 버튼 */}
      <div className="flex justify-end">
        <Button
          size="lg"
          disabled={!canStart}
          onClick={onStartAnalysis}
          className="px-8"
        >
          분석 시작
        </Button>
      </div>
    </div>
  );
}
