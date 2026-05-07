"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DashboardFinancialRow } from "./types";

interface DetailedStatementsProps {
  bsItems: DashboardFinancialRow[];
  isItems: DashboardFinancialRow[];
  cfItems: DashboardFinancialRow[] | undefined;
  years: string[];
  basisLabel?: string;
}

interface StatementTableProps {
  title: string;
  rows: DashboardFinancialRow[];
  years: string[];
  emptyText: string;
}

function depthClasses(depth: number | undefined): string {
  switch (depth) {
    case 0: return "font-bold text-slate-900";
    case 1: return "font-medium text-slate-800";
    case 2: return "text-slate-700";
    default: return "text-slate-700";
  }
}

function indentPx(depth: number | undefined): number {
  switch (depth) {
    case 0: return 0;
    case 1: return 12;
    case 2: return 24;
    default: return 0;
  }
}

function formatCellValue(v: string | number | undefined): { display: string; isNeg: boolean; isEmpty: boolean } {
  if (v === undefined || v === null) return { display: "-", isNeg: false, isEmpty: true };
  const s = String(v).trim();
  if (!s || s === "-") return { display: "-", isNeg: false, isEmpty: true };
  // Pre-formatted strings (from DART toMillions) often have commas; detect negative
  const isNeg = s.startsWith("-") || (s.startsWith("(") && s.endsWith(")"));
  return { display: s, isNeg, isEmpty: false };
}

function StatementTable({ title, rows, years, emptyText }: StatementTableProps) {
  const sortedYears = useMemo(() => [...years].sort(), [years]);

  if (!rows?.length) {
    return (
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-slate-400">{emptyText}</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-slate-700">{title}</CardTitle>
        <span className="text-[10px] text-slate-400">단위: 백만원</span>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto rounded-md border border-slate-100">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0">
              <TableRow>
                <TableHead className="text-xs sticky left-0 bg-slate-50 z-10 min-w-[200px]">계정</TableHead>
                {sortedYears.map((y) => (
                  <TableHead key={y} className="text-xs text-right tabular-nums">
                    {y}
                  </TableHead>
                ))}
                <TableHead className="text-xs text-center w-16">주석</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => {
                const cls = depthClasses(row.depth);
                const padLeft = indentPx(row.depth);
                const isTotal = row.depth === 0;
                return (
                  <TableRow
                    key={`${row.account}-${i}`}
                    className={isTotal ? "bg-slate-50/60 hover:bg-slate-100/60" : ""}
                  >
                    <TableCell
                      className={`text-xs ${cls} sticky left-0 bg-white z-0 ${isTotal ? "bg-slate-50/60" : ""}`}
                      style={{ paddingLeft: 12 + padLeft }}
                    >
                      {row.account}
                    </TableCell>
                    {sortedYears.map((y) => {
                      const { display, isNeg, isEmpty } = formatCellValue(row[y]);
                      return (
                        <TableCell
                          key={y}
                          className={`text-xs text-right tabular-nums ${cls} ${
                            isNeg ? "text-red-600" : isEmpty ? "text-slate-300" : ""
                          }`}
                        >
                          {display}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-[10px] text-slate-400 text-center">
                      {row.noteRef || "-"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export function DetailedStatements({ bsItems, isItems, cfItems, years, basisLabel }: DetailedStatementsProps) {
  return (
    <div className="space-y-3">
      {basisLabel && (
        <div className="text-xs text-slate-500">
          상세 재무제표 — <span className="font-medium text-slate-700">{basisLabel}</span>
        </div>
      )}
      <Tabs defaultValue="bs">
        <TabsList>
          <TabsTrigger value="bs">재무상태표 (BS)</TabsTrigger>
          <TabsTrigger value="is">손익계산서 (IS)</TabsTrigger>
          <TabsTrigger value="cf">현금흐름표 (CF)</TabsTrigger>
        </TabsList>
        <TabsContent value="bs" className="mt-3">
          <StatementTable
            title="재무상태표"
            rows={bsItems}
            years={years}
            emptyText="재무상태표 데이터가 없습니다."
          />
        </TabsContent>
        <TabsContent value="is" className="mt-3">
          <StatementTable
            title="손익계산서"
            rows={isItems}
            years={years}
            emptyText="손익계산서 데이터가 없습니다."
          />
        </TabsContent>
        <TabsContent value="cf" className="mt-3">
          <StatementTable
            title="현금흐름표"
            rows={cfItems || []}
            years={years}
            emptyText="현금흐름표 데이터가 없습니다."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
