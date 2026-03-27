"use client";

import { useEffect, useState } from "react";
import { Download, FolderOpen, FileX } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// API response shape (uses `name` instead of `fileName`)
interface ApiFileRecord {
  id: string;
  name: string;
  size: number;
  type: string;
  createdAt: string;
  storagePath?: string;
  downloadUrl?: string;
}

type FileType = "재무분석" | "감정평가" | "보고서";

interface FileItem {
  id: string;
  name: string;
  size: number;
  type: FileType;
  createdAt: string;
}

function mapApiFile(raw: ApiFileRecord): FileItem {
  const validTypes: FileType[] = ["재무분석", "감정평가", "보고서"];
  const type = validTypes.includes(raw.type as FileType)
    ? (raw.type as FileType)
    : "보고서"; // fallback for unknown types
  return {
    id: raw.id,
    name: raw.name,
    size: raw.size,
    type,
    createdAt: raw.createdAt,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return dateStr;
  }
}

function TypeBadge({ type }: { type: FileType }) {
  const variantMap: Record<FileType, "default" | "secondary" | "outline"> = {
    재무분석: "default",
    감정평가: "secondary",
    보고서: "outline",
  };
  return <Badge variant={variantMap[type]}>{type}</Badge>;
}

function LoadingSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>파일명</TableHead>
          <TableHead>크기</TableHead>
          <TableHead>생성일시</TableHead>
          <TableHead>타입</TableHead>
          <TableHead className="text-center">다운로드</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell>
              <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            </TableCell>
            <TableCell>
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            </TableCell>
            <TableCell>
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            </TableCell>
            <TableCell>
              <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
            </TableCell>
            <TableCell className="text-center">
              <div className="mx-auto h-8 w-8 animate-pulse rounded bg-muted" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FileX className="mb-4 size-12 text-muted-foreground/50" />
      <h3 className="text-lg font-medium text-gray-900">파일이 없습니다</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        아직 생성된 파일이 없습니다. 재무분석이나 감정평가를 실행하면 여기에
        파일이 표시됩니다.
      </p>
    </div>
  );
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFiles() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/files");
        if (!res.ok) {
          throw new Error(`파일 목록을 불러오지 못했습니다. (${res.status})`);
        }
        const data: { success: boolean; files: ApiFileRecord[] } =
          await res.json();
        if (!data.success) {
          throw new Error("파일 목록 조회에 실패했습니다.");
        }
        setFiles(data.files.map(mapApiFile));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다."
        );
      } finally {
        setLoading(false);
      }
    }

    fetchFiles();
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">파일 관리</h1>
        <p className="text-sm text-muted-foreground">
          생성된 분석 보고서와 업로드된 파일을 관리합니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="size-5 text-indigo-500" />
            파일 목록
          </CardTitle>
          <CardDescription>
            {loading
              ? "파일 목록을 불러오는 중..."
              : `총 ${files.length}개의 파일이 있습니다.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <LoadingSkeleton />
          ) : files.length === 0 ? (
            <EmptyState />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>파일명</TableHead>
                  <TableHead>크기</TableHead>
                  <TableHead>생성일시</TableHead>
                  <TableHead>타입</TableHead>
                  <TableHead className="text-center">다운로드</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell className="max-w-[300px] truncate font-medium">
                      {file.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatFileSize(file.size)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(file.createdAt)}
                    </TableCell>
                    <TableCell>
                      <TypeBadge type={file.type} />
                    </TableCell>
                    <TableCell className="text-center">
                      <a href={`/api/download/${encodeURIComponent(file.name)}`} download>
                        <Button variant="ghost" size="icon-sm">
                          <Download className="size-4" />
                        </Button>
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
