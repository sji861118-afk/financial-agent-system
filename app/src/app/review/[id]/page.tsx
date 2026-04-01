"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  FileText,
  MessageSquarePlus,
  ArrowLeft,
  Building2,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DealStatusBadge } from "@/components/review/deal-status-badge";
import { FinancialSnapshotTable } from "@/components/review/financial-snapshot-table";
import type { ReviewDeal, ReviewOpinion, Department } from "@/types/review";

const DEPT_ORDER: Department[] = ["영업점", "영추부", "심사부"];
const DEPT_COLOR: Record<Department, string> = {
  영업점: "border-blue-500/30 bg-blue-500/5",
  영추부: "border-emerald-500/30 bg-emerald-500/5",
  심사부: "border-amber-500/30 bg-amber-500/5",
};

function OpinionCard({ opinion }: { opinion: ReviewOpinion }) {
  return (
    <Card className={`border ${DEPT_COLOR[opinion.department]}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-xs"
            >
              {opinion.department}
            </Badge>
            <span className="text-sm font-medium text-slate-200">
              {opinion.authorName}
            </span>
          </div>
          <Badge
            variant="outline"
            className={
              opinion.진행여부 === "진행"
                ? "border-green-500/30 text-green-300"
                : opinion.진행여부 === "반려"
                  ? "border-red-500/30 text-red-300"
                  : "border-amber-500/30 text-amber-300"
            }
          >
            {opinion.진행여부}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 장점 */}
        {opinion.장점?.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-emerald-400">장점</p>
            <ul className="space-y-1">
              {opinion.장점.map((item, i) => (
                <li key={i} className="text-xs text-slate-300">
                  <span className="mr-1 text-emerald-400">□</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 단점 */}
        {opinion.단점?.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-red-400">단점</p>
            <ul className="space-y-1">
              {opinion.단점.map((item, i) => (
                <li key={i} className="text-xs text-slate-300">
                  <span className="mr-1 text-red-400">□</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 보완사항 */}
        {opinion.보완사항 && (
          <div>
            <p className="text-xs font-medium text-slate-400">보완사항</p>
            <p className="text-xs text-slate-300">{opinion.보완사항}</p>
          </div>
        )}

        {/* 컨택자 */}
        {opinion.컨택자 && (
          <p className="text-xs text-slate-400">
            컨택자: {opinion.컨택자}
          </p>
        )}

        <p className="text-[10px] text-slate-500">
          {new Date(opinion.createdAt).toLocaleString("ko-KR")}
        </p>
      </CardContent>
    </Card>
  );
}

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.id as string;

  const [deal, setDeal] = useState<ReviewDeal | null>(null);
  const [opinions, setOpinions] = useState<ReviewOpinion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const handleGenerateDocx = async () => {
    if (!dealId) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/review/generate-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`초안 생성 실패: ${err.error || '알 수 없는 오류'}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      a.download = filenameMatch ? decodeURIComponent(filenameMatch[1]) : `${deal?.차주}_초안.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('초안 생성 중 오류가 발생했습니다');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (!dealId) return;
    (async () => {
      try {
        const res = await fetch(`/api/review/deals/${dealId}`);
        const data = await res.json();
        setDeal(data.deal);
        setOpinions(data.opinions || []);
      } catch {
        setDeal(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [dealId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-slate-400">건을 찾을 수 없습니다</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/review")}
        >
          목록으로
        </Button>
      </div>
    );
  }

  // 부서별 의견 정리
  const opinionByDept: Record<string, ReviewOpinion> = {};
  for (const op of opinions) {
    opinionByDept[op.department] = op;
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/review")}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white">{deal.구분}</h1>
              <DealStatusBadge status={deal.status} />
            </div>
            <p className="text-sm text-slate-400">
              {deal.차주} | {deal.접수일} | {deal.모집금액}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleGenerateDocx}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            {generating ? '생성 중...' : '초안 생성'}
          </Button>
          <Link href={`/review/${dealId}/opinion`}>
            <Button>
              <MessageSquarePlus className="mr-2 size-4" />
              의견 작성
            </Button>
          </Link>
        </div>
      </div>

      {/* 기본정보 */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200">기본정보</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-4">
            <div>
              <span className="text-xs text-slate-400">당행접수자</span>
              <p className="text-slate-200">{deal.당행접수자 || "-"}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">소개처</span>
              <p className="text-slate-200">{deal.소개처 || "-"}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">차주</span>
              <p className="text-slate-200">{deal.차주 || "-"}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">주소</span>
              <p className="text-slate-200">{deal.주소 || "-"}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">
                금리/수수료/기간
              </span>
              <p className="text-slate-200">
                {deal.금리수수료기간 || "-"}
              </p>
            </div>
            <div>
              <span className="text-xs text-slate-400">모집금액</span>
              <p className="font-medium text-indigo-400">
                {deal.모집금액 || "-"}
              </p>
            </div>
            <div>
              <span className="text-xs text-slate-400">자금용도</span>
              <p className="text-slate-200">{deal.자금용도 || "-"}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">주요 채권보전</span>
              <p className="text-slate-200">{deal.주요채권보전 || "-"}</p>
            </div>
          </div>

          {/* 태그 */}
          <div className="mt-3 flex flex-wrap gap-1">
            <Badge
              variant="outline"
              className="border-indigo-500/30 bg-indigo-500/10 text-xs text-indigo-300"
            >
              {deal.productType}
            </Badge>
            {deal.productSubtype && (
              <Badge
                variant="outline"
                className="border-slate-500/30 text-xs text-slate-400"
              >
                {deal.productSubtype}
              </Badge>
            )}
            {deal.tags?.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="border-slate-600/30 text-xs text-slate-500"
              >
                {tag}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 대출개요 */}
      {deal.대출개요 && (
        <Card className="border-white/10 bg-slate-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-200">
              대출개요
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-slate-300">
              {deal.대출개요}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 재무현황 */}
      {deal.재무현황?.length > 0 && (
        <Card className="border-white/10 bg-slate-900/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-200">
              재무현황
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {deal.재무현황.map((snapshot, idx) => (
              <FinancialSnapshotTable key={idx} snapshot={snapshot} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* 검토의견 타임라인 */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200">
            검토의견
          </CardTitle>
        </CardHeader>
        <CardContent>
          {opinions.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-400">
                아직 작성된 검토의견이 없습니다
              </p>
              <Link href={`/review/${dealId}/opinion`}>
                <Button variant="outline" className="mt-3" size="sm">
                  <MessageSquarePlus className="mr-2 size-4" />
                  첫 의견 작성하기
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 부서 순서대로 표시 */}
              {DEPT_ORDER.map((dept) => {
                const op = opinionByDept[dept];
                if (!op) {
                  return (
                    <div
                      key={dept}
                      className="rounded-lg border border-dashed border-white/10 p-4 text-center"
                    >
                      <p className="text-xs text-slate-500">
                        {dept} 의견 대기 중
                      </p>
                    </div>
                  );
                }
                return <OpinionCard key={dept} opinion={op} />;
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
