"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DealStatusBadge } from "./deal-status-badge";
import type { ReviewDeal } from "@/types/review";

export function DealCard({ deal }: { deal: ReviewDeal }) {
  return (
    <Link href={`/review/${deal.id}`}>
      <Card className="border-white/10 bg-slate-800/50 transition-colors hover:bg-slate-800/80">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-medium text-slate-200">
                {deal.구분 || "제목 없음"}
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">
                {deal.차주}
              </p>
            </div>
            <DealStatusBadge status={deal.status} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
            <span>{deal.접수일}</span>
            <span className="text-slate-600">|</span>
            <span className="font-medium text-indigo-400">
              {deal.모집금액}
            </span>
            {deal.당행접수자 && (
              <>
                <span className="text-slate-600">|</span>
                <span>{deal.당행접수자}</span>
              </>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            <Badge
              variant="outline"
              className="border-indigo-500/30 bg-indigo-500/10 text-[10px] text-indigo-300"
            >
              {deal.productType}
            </Badge>
            {deal.productSubtype && (
              <Badge
                variant="outline"
                className="border-slate-500/30 text-[10px] text-slate-400"
              >
                {deal.productSubtype}
              </Badge>
            )}
            {deal.tags?.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="border-slate-600/30 text-[10px] text-slate-500"
              >
                {tag}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
