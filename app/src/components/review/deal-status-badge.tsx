"use client";

import { Badge } from "@/components/ui/badge";
import type { DealStatus } from "@/types/review";

const STATUS_CONFIG: Record<
  DealStatus,
  { label: string; className: string }
> = {
  접수: { label: "접수", className: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
  검토중: { label: "검토중", className: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  검토완료: { label: "검토완료", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  신청서작성: { label: "신청서작성", className: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  승인: { label: "승인", className: "bg-green-500/20 text-green-300 border-green-500/30" },
  반려: { label: "반려", className: "bg-red-500/20 text-red-300 border-red-500/30" },
  보류: { label: "보류", className: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
};

export function DealStatusBadge({ status }: { status: DealStatus }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG["접수"];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
