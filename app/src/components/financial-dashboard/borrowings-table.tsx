"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DashboardBorrowingNotes } from "./types";

interface BorrowingsTableProps {
  notes: DashboardBorrowingNotes | null | undefined;
}

export function BorrowingsTable({ notes }: BorrowingsTableProps) {
  if (!notes || !notes.details?.length) {
    return (
      <Card className="border-slate-200 h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">차입금 현황</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-slate-400">
          감사보고서 차입금 주석이 응답에 포함되어 있지 않습니다. (현재 라우트 응답에서 스킵 — 후속 작업 예정)
        </CardContent>
      </Card>
    );
  }

  const top = notes.details.slice(0, 12);

  return (
    <Card className="border-slate-200 h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-slate-700">
          차입금 현황 <span className="text-xs font-normal text-slate-400 ml-1">{notes.fiscalYear}</span>
        </CardTitle>
        <div className="text-xs text-slate-500">
          합계 <span className="font-bold tabular-nums text-slate-700">{notes.totalCurrent || "-"}</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="max-h-[360px] overflow-y-auto rounded-md border border-slate-100">
          <Table>
            <TableHeader className="sticky top-0 bg-slate-50">
              <TableRow>
                <TableHead className="text-xs">구분</TableHead>
                <TableHead className="text-xs">차입처</TableHead>
                <TableHead className="text-xs text-right">금리</TableHead>
                <TableHead className="text-xs text-right">만기</TableHead>
                <TableHead className="text-xs text-right">잔액</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((d, i) => (
                <TableRow key={`${d.lender}-${i}`}>
                  <TableCell className="text-xs">{d.category || "-"}</TableCell>
                  <TableCell className="text-xs">{d.lender || "-"}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{d.interestRate || "-"}</TableCell>
                  <TableCell className="text-xs text-right">{d.maturityDate || "-"}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums font-medium">
                    {d.currentAmount || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {notes.details.length > 12 && (
          <div className="mt-2 text-[11px] text-slate-400 text-right">
            상위 12건 표시 · 전체 {notes.details.length}건
          </div>
        )}
      </CardContent>
    </Card>
  );
}
