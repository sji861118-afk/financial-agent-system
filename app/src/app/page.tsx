"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, Eye, TrendingUp, Download, RotateCcw } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

interface QueryRecord {
  id: string;
  corpName: string;
  years: string[];
  type: string;
  status: "complete" | "error" | "pending";
  result?: { filename?: string; grade?: string; summary?: string };
  createdAt: string;
}

interface StatsData {
  totalQueries: number;
  weeklyQueries: number;
  totalFiles: number;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function statusLabel(status: QueryRecord["status"]): string {
  switch (status) {
    case "complete":
      return "완료";
    case "error":
      return "실패";
    case "pending":
      return "진행중";
    default:
      return status;
  }
}

function StatusBadge({ status }: { status: QueryRecord["status"] }) {
  const variant =
    status === "complete"
      ? "default"
      : status === "pending"
        ? "secondary"
        : "destructive";
  return <Badge variant={variant}>{statusLabel(status)}</Badge>;
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-200 ${className ?? ""}`}
    />
  );
}

export default function DashboardPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [queries, setQueries] = useState<QueryRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, queriesRes] = await Promise.all([
          fetch("/api/stats"),
          fetch("/api/queries"),
        ]);
        if (statsRes.ok) {
          const statsJson = await statsRes.json();
          setStats(statsJson);
        }
        if (queriesRes.ok) {
          const queriesJson = await queriesRes.json();
          setQueries(queriesJson.queries);
        }
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/financial?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const statsCards = [
    {
      title: "총 조회 건수",
      value: stats ? stats.totalQueries.toLocaleString() : "—",
      icon: Eye,
      color: "text-indigo-500",
      bg: "bg-indigo-50",
    },
    {
      title: "이번 주 조회",
      value: stats ? stats.weeklyQueries.toLocaleString() : "—",
      icon: TrendingUp,
      color: "text-emerald-500",
      bg: "bg-emerald-50",
    },
    {
      title: "생성 파일 수",
      value: stats ? stats.totalFiles.toLocaleString() : "—",
      icon: FileText,
      color: "text-amber-500",
      bg: "bg-amber-50",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-sm text-muted-foreground">
          대출 자동화 시스템 현황을 한눈에 확인하세요.
        </p>
      </div>

      {/* Quick Search */}
      <Card>
        <CardContent className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="기업명을 입력하여 빠른 재무 조회..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-8"
            />
          </div>
          <Button onClick={handleSearch}>조회</Button>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-4">
                  <SkeletonBlock className="size-11 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <SkeletonBlock className="h-4 w-24" />
                    <SkeletonBlock className="h-7 w-16" />
                  </div>
                </CardContent>
              </Card>
            ))
          : statsCards.map((stat) => (
              <Card key={stat.title}>
                <CardContent className="flex items-center gap-4">
                  <div
                    className={`flex size-11 items-center justify-center rounded-lg ${stat.bg}`}
                  >
                    <stat.icon className={`size-5 ${stat.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      {stat.title}
                    </p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Recent Queries Table */}
      <Card>
        <CardHeader>
          <CardTitle>최근 조회 내역</CardTitle>
          <CardDescription>최근에 수행한 조회 내역입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>기업명</TableHead>
                <TableHead>조회 유형</TableHead>
                <TableHead>조회 일시</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">다운로드</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <SkeletonBlock className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <SkeletonBlock className="h-4 w-16" />
                      </TableCell>
                      <TableCell>
                        <SkeletonBlock className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <SkeletonBlock className="h-5 w-12" />
                      </TableCell>
                    </TableRow>
                  ))
                : queries && queries.length > 0
                  ? queries.map((query) => (
                      <TableRow key={query.id}>
                        <TableCell className="font-medium">
                          {query.corpName}
                        </TableCell>
                        <TableCell>{query.type}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(query.createdAt)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={query.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {query.status === "complete" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push(`/financial?q=${encodeURIComponent(query.corpName)}`)}
                                title="다시 조회"
                              >
                                <RotateCcw className="size-4 text-indigo-500" />
                              </Button>
                            )}
                            {query.status === "complete" && query.result?.filename ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const link = document.createElement("a");
                                  link.href = `/api/download/${query.result!.filename}`;
                                  link.download = query.result!.filename!;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                }}
                                title="Excel 다운로드"
                              >
                                <Download className="size-4 text-emerald-600" />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-muted-foreground"
                        >
                          조회 내역이 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
