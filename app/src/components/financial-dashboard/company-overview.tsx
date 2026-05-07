"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardCompanyInfo } from "./types";

interface CompanyOverviewProps {
  companyInfo: DashboardCompanyInfo;
  industry?: string;
  fsType?: string;
  basisLabel?: string;
}

interface FieldProps {
  label: string;
  value: string | undefined;
  link?: boolean;
}

function Field({ label, value, link }: FieldProps) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2 text-sm py-1.5 border-b border-slate-100">
      <span className="text-slate-500 text-xs">{label}</span>
      {link && value ? (
        <a
          href={value.startsWith("http") ? value : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline truncate"
        >
          {value}
        </a>
      ) : (
        <span className="text-slate-700 truncate">{value || "-"}</span>
      )}
    </div>
  );
}

function formatCorpCls(corpCls: string | undefined): string {
  switch (corpCls) {
    case "Y": return "유가";
    case "K": return "코스닥";
    case "N": return "코넥스";
    case "E": return "외감 (비상장)";
    default: return corpCls || "-";
  }
}

function formatEstDt(estDt: string | undefined): string {
  if (!estDt || estDt.length < 8) return estDt || "-";
  const y = estDt.slice(0, 4);
  const m = estDt.slice(4, 6);
  const d = estDt.slice(6, 8);
  return `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;
}

export function CompanyOverview({ companyInfo, industry, fsType, basisLabel }: CompanyOverviewProps) {
  const ci = companyInfo;
  return (
    <Card className="border-slate-200 h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-slate-700">기업 개요</CardTitle>
        {basisLabel && <span className="text-xs text-slate-400">{basisLabel}</span>}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div>
            <Field label="대표이사" value={ci.ceoNm} />
            <Field label="법인구분" value={formatCorpCls(ci.corpCls)} />
            <Field label="법인 등록번호" value={ci.jurirNo} />
            <Field label="사업자 등록번호" value={ci.bizrNo} />
            <Field label="종목코드" value={ci.stockCode || "비상장"} />
          </div>
          <div>
            <Field label="설립일자" value={formatEstDt(ci.estDt)} />
            <Field label="산업 분류" value={industry || ci.indutyCode || "-"} />
            <Field label="결산월" value={ci.accMt ? `${parseInt(ci.accMt, 10)}월` : "-"} />
            <Field label="재무제표 기준" value={fsType || "-"} />
            <Field label="회사 주소" value={ci.adres} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
