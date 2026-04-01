"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Loader2, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DealCard } from "@/components/review/deal-card";
import type { ReviewDeal, DealStatus } from "@/types/review";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "전체", label: "전체" },
  { value: "접수", label: "접수" },
  { value: "검토중", label: "검토중" },
  { value: "검토완료", label: "검토완료" },
  { value: "승인", label: "승인" },
  { value: "반려", label: "반려" },
];

export default function ReviewListPage() {
  const [deals, setDeals] = useState<ReviewDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchDeals = async (status?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status && status !== "전체") params.set("status", status);
      const res = await fetch(`/api/review/deals?${params}`);
      const data = await res.json();
      setDeals(data.deals || []);
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeals(activeTab);
  }, [activeTab]);

  // 클라이언트 사이드 텍스트 검색
  const filtered = searchQuery
    ? deals.filter(
        (d) =>
          d.구분?.includes(searchQuery) ||
          d.차주?.includes(searchQuery) ||
          d.당행접수자?.includes(searchQuery) ||
          d.소개처?.includes(searchQuery)
      )
    : deals;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">여신검토</h1>
          <p className="mt-1 text-sm text-slate-400">
            접수 여신 건 관리 및 검토의견 작성
          </p>
        </div>
        <Link href="/review/new">
          <Button>
            <Plus className="mr-2 size-4" />
            초안 생성
          </Button>
        </Link>
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="건명, 차주, 접수자 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-slate-800 pl-10 text-sm"
        />
      </div>

      {/* 상태 탭 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* 목록 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-white/10 bg-slate-900/50">
          <CardContent className="py-16 text-center">
            <p className="text-sm text-slate-400">
              {searchQuery
                ? "검색 결과가 없습니다"
                : "등록된 여신 건이 없습니다"}
            </p>
            {!searchQuery && (
              <Link href="/review/new">
                <Button variant="outline" className="mt-4">
                  <Plus className="mr-2 size-4" />
                  첫 여신 접수하기
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}

      {/* 통계 */}
      {!loading && deals.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {STATUS_TABS.filter((t) => t.value !== "전체").map((tab) => {
            const count = deals.filter(
              (d) => d.status === tab.value
            ).length;
            return (
              <Card
                key={tab.value}
                className="border-white/10 bg-slate-800/50"
              >
                <CardContent className="px-4 py-3 text-center">
                  <p className="text-lg font-bold text-slate-200">{count}</p>
                  <p className="text-xs text-slate-400">{tab.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
