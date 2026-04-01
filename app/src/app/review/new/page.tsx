"use client";

import { DealForm } from "@/components/review/deal-form";

export default function NewDealPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">새 여신 접수</h1>
        <p className="mt-1 text-sm text-slate-400">
          접수 여신 건의 기본정보, 주요조건, 재무현황을 입력합니다
        </p>
      </div>
      <DealForm mode="create" />
    </div>
  );
}
