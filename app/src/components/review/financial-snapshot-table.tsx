"use client";

import type { FinancialSnapshot } from "@/types/review";

function formatAmount(val: number): string {
  if (val === 0) return "-";
  return val.toLocaleString("ko-KR");
}

export function FinancialSnapshotTable({
  snapshot,
}: {
  snapshot: FinancialSnapshot;
}) {
  if (!snapshot.데이터?.length) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-slate-200">
          {snapshot.회사명}
        </span>
        <span className="text-xs text-slate-400">
          {snapshot.역할} ({snapshot.기준}기준)
        </span>
        <span className="ml-auto text-[10px] text-slate-500">(단위: 억원)</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-800/50">
              <th className="px-3 py-1.5 text-left font-medium text-slate-400">
                결산년월
              </th>
              <th className="px-3 py-1.5 text-right font-medium text-slate-400">
                자산총계
              </th>
              <th className="px-3 py-1.5 text-right font-medium text-slate-400">
                부채총계
              </th>
              <th className="px-3 py-1.5 text-right font-medium text-slate-400">
                자본총계
              </th>
              <th className="px-3 py-1.5 text-right font-medium text-slate-400">
                매출액
              </th>
              <th className="px-3 py-1.5 text-right font-medium text-slate-400">
                영업이익
              </th>
              <th className="px-3 py-1.5 text-right font-medium text-slate-400">
                당기순이익
              </th>
            </tr>
          </thead>
          <tbody>
            {snapshot.데이터.map((row, i) => (
              <tr
                key={i}
                className="border-t border-white/5 hover:bg-white/5"
              >
                <td className="px-3 py-1.5 text-slate-300">
                  {row.결산년월}
                </td>
                <td className="px-3 py-1.5 text-right text-slate-300">
                  {formatAmount(row.자산총계)}
                </td>
                <td className="px-3 py-1.5 text-right text-slate-300">
                  {formatAmount(row.부채총계)}
                </td>
                <td className="px-3 py-1.5 text-right text-slate-300">
                  {formatAmount(row.자본총계)}
                </td>
                <td className="px-3 py-1.5 text-right text-slate-300">
                  {formatAmount(row.매출액)}
                </td>
                <td
                  className={`px-3 py-1.5 text-right ${
                    row.영업이익 < 0 ? "text-red-400" : "text-slate-300"
                  }`}
                >
                  {formatAmount(row.영업이익)}
                </td>
                <td
                  className={`px-3 py-1.5 text-right ${
                    row.당기순이익 < 0 ? "text-red-400" : "text-slate-300"
                  }`}
                >
                  {formatAmount(row.당기순이익)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
