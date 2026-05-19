"use client";

import { useState, useMemo, useRef } from "react";
import { AlertTriangle, Upload, Loader2, Search, Download, FileSpreadsheet, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import type { NameMatch, InsolvencyMatchResult, ResolvedCompany, InsolvencyRow, YN, WarningFlags } from "@/lib/insolvency/types";

type Step = 1 | 2 | 3;

interface MatchRowState {
  inputName: string;
  candidates: NameMatch[];
  selectedCorpCode: string;   // 사용자가 dropdown으로 선택한 corp_code
  manualCorpCode: string;     // 후보 0건일 때 수동 입력
}

const FLAG_LABELS: Array<{ key: keyof Omit<WarningFlags, "evidence">; label: string; auto: boolean }> = [
  { key: "threeYearsLoss",     label: "3년연속결손",       auto: true },
  { key: "fullCapitalImpair",  label: "완전자본잠식",      auto: true },
  { key: "borrowGtRevenue",    label: "차입금>매출액",     auto: true },
  { key: "internalConflict",   label: "경영상내분",        auto: false },
  { key: "operationStopped",   label: "3개월조업중단",     auto: false },
  { key: "auditOpinionReject", label: "감사의견거절",      auto: true },
  { key: "bankruptcy",         label: "부도",              auto: false },
  { key: "consortiumLoan",     label: "컨소시엄대출",      auto: false },
];

async function parseXlsxNames(file: File): Promise<string[]> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: string[] = [];
  ws.eachRow((row) => {
    const v = row.getCell(1).value as unknown;
    if (v === null || v === undefined) return;
    let s: string;
    if (typeof v === "object" && v !== null) {
      const obj = v as { text?: unknown; result?: unknown };
      s = String(obj.text ?? obj.result ?? "");
    } else {
      s = String(v);
    }
    const trimmed = s.trim();
    if (!trimmed) return;
    if (/고객명|회사명|차주명|기업명|상호/.test(trimmed)) return; // 헤더 자동 skip
    out.push(trimmed);
  });
  return out;
}

function fmtNum(v: number | undefined): string {
  if (v === undefined || v === null || isNaN(v)) return "-";
  if (v === 0) return "-";
  return Math.round(v / 1_000_000).toLocaleString("ko-KR");
}

export default function InsolvencyCheckPage() {
  const [step, setStep] = useState<Step>(1);
  const [rawInput, setRawInput] = useState("");
  const [branch, setBranch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [matching, setMatching] = useState(false);
  const [matches, setMatches] = useState<MatchRowState[]>([]);

  const [fetching, setFetching] = useState(false);
  const [rows, setRows] = useState<InsolvencyRow[]>([]);
  const [fetchErrors, setFetchErrors] = useState<Array<{ inputName: string; reason: string }>>([]);
  const [downloading, setDownloading] = useState(false);

  const names = useMemo(() => {
    return rawInput
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }, [rawInput]);

  // ─── Step 1: 입력 ───
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseXlsxNames(file);
      if (parsed.length === 0) {
        toast.error("회사명을 찾을 수 없습니다. 1행 1번째 컬럼에 회사명이 있는지 확인해주세요.");
        return;
      }
      // 기존 입력과 병합 (중복 제거)
      const existing = new Set(names);
      const merged = [...names, ...parsed.filter((p) => !existing.has(p))];
      setRawInput(merged.join("\n"));
      toast.success(`${parsed.length}건 추가됨 (총 ${merged.length}건)`);
    } catch (err: unknown) {
      toast.error(`Excel 파싱 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleMatch = async () => {
    if (names.length === 0) {
      toast.error("회사명을 입력해주세요.");
      return;
    }
    setMatching(true);
    try {
      const res = await fetch("/api/insolvency/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { results: InsolvencyMatchResult[] } = await res.json();
      setMatches(
        data.results.map((r) => ({
          inputName: r.inputName,
          candidates: r.candidates,
          selectedCorpCode: r.candidates[0]?.corpCode || "",
          manualCorpCode: "",
        })),
      );
      setStep(2);
      const okCount = data.results.filter((r) => r.candidates.length >= 1).length;
      toast.success(`매칭 완료: ${okCount}/${data.results.length} 건 매칭됨`);
    } catch (err: unknown) {
      toast.error(`매칭 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMatching(false);
    }
  };

  // ─── Step 2: 매칭 결과 ───
  const updateMatch = (idx: number, patch: Partial<MatchRowState>) => {
    setMatches((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const resolvedItems: ResolvedCompany[] = useMemo(() => {
    return matches
      .map((m) => {
        const cand = m.candidates.find((c) => c.corpCode === m.selectedCorpCode);
        const corpCode = cand?.corpCode || m.manualCorpCode.trim();
        if (!corpCode) return null;
        return {
          inputName: m.inputName,
          corpCode,
          corpName: cand?.corpName || m.inputName,
          stockCode: cand?.stockCode || "",
        };
      })
      .filter((x): x is ResolvedCompany => x !== null);
  }, [matches]);

  const handleFetch = async () => {
    if (resolvedItems.length === 0) {
      toast.error("매칭된 기업이 없습니다.");
      return;
    }
    setFetching(true);
    try {
      const res = await fetch("/api/insolvency/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: resolvedItems }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { rows: InsolvencyRow[]; errors?: Array<{ inputName: string; reason: string }> } = await res.json();
      setRows(data.rows);
      setFetchErrors(data.errors || []);
      setStep(3);
      toast.success(`재무 조회 완료: ${data.rows.length}건 성공${data.errors?.length ? ` / ${data.errors.length}건 실패` : ""}`);
    } catch (err: unknown) {
      toast.error(`조회 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setFetching(false);
    }
  };

  // ─── Step 3: override + 다운로드 ───
  const updateFlag = (rowIdx: number, key: keyof Omit<WarningFlags, "evidence">, val: YN) => {
    setRows((prev) =>
      prev.map((r, i) =>
        i === rowIdx
          ? { ...r, flagOverrides: { ...(r.flagOverrides || {}), [key]: val } }
          : r,
      ),
    );
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/insolvency/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, branch: branch.trim() || "OO지점" }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ""}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `부실징후점검_${branch.trim() || "OO지점"}_${new Date().toISOString().slice(2, 10).replace(/-/g, "")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel 다운로드 완료");
    } catch (err: unknown) {
      toast.error(`다운로드 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setMatches([]);
    setRows([]);
    setFetchErrors([]);
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <div className="flex items-center gap-3">
            <AlertTriangle className="size-6 text-amber-400" />
            <h1 className="text-2xl font-bold">부실징후점검 (전수조사)</h1>
            <Badge variant="outline" className="text-xs">Step {step}/3</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            회사명단을 입력하면 DART에서 3개년 재무를 자동 추출하고 4개 자동 판정 + 4개 수동 입력으로 PDF 양식과 동일한 Excel을 생성합니다.
          </p>
        </header>

        {/* ─── STEP 1 ─── */}
        {step === 1 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-base">Step 1. 회사명단 입력</CardTitle>
              <CardDescription>
                한 줄에 한 회사씩. (주)·㈜·주식회사는 자동 정규화됩니다. Excel 업로드 시 A열에서만 회사명을 읽습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm">지점명 (Excel 파일명에 포함)</Label>
                <Input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="예: 강남지점"
                  className="mt-1 bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>

              <div>
                <Label className="text-sm">회사명 ({names.length}건)</Label>
                <textarea
                  className="mt-1 w-full min-h-[200px] rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 font-mono"
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder={"(주)한국토지신탁\n신한자산신탁(주)\n케이비부동산신탁(주)\n..."}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  className="border-slate-700 text-slate-200"
                >
                  <Upload className="size-4 mr-2" />
                  Excel 업로드 (A열 회사명)
                </Button>
                <Button
                  onClick={handleMatch}
                  disabled={matching || names.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-500"
                >
                  {matching ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Search className="size-4 mr-2" />}
                  매칭 조회 ({names.length}건)
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── STEP 2 ─── */}
        {step === 2 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Step 2. 매칭 확인 ({resolvedItems.length}/{matches.length})</CardTitle>
                <CardDescription>
                  후보 N건이면 dropdown에서 선택, 0건이면 corp_code 직접 입력하세요.
                </CardDescription>
              </div>
              <Button variant="ghost" onClick={() => setStep(1)} className="text-slate-400">
                <X className="size-4 mr-1" /> 다시 입력
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800">
                    <TableHead className="text-slate-300">입력명</TableHead>
                    <TableHead className="text-slate-300">매칭 회사 선택</TableHead>
                    <TableHead className="text-slate-300">상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.map((m, idx) => (
                    <TableRow key={idx} className="border-slate-800">
                      <TableCell className="text-sm">{m.inputName}</TableCell>
                      <TableCell>
                        {m.candidates.length === 0 ? (
                          <Input
                            value={m.manualCorpCode}
                            onChange={(e) => updateMatch(idx, { manualCorpCode: e.target.value })}
                            placeholder="corp_code 8자리 (예: 00126380)"
                            className="bg-slate-800 border-slate-700 text-slate-100 max-w-xs"
                          />
                        ) : (
                          <select
                            value={m.selectedCorpCode}
                            onChange={(e) => updateMatch(idx, { selectedCorpCode: e.target.value })}
                            className="w-full max-w-md rounded-md bg-slate-800 border border-slate-700 px-2 py-1.5 text-sm text-slate-100"
                          >
                            <option value="">(선택 안 함)</option>
                            {m.candidates.map((c) => (
                              <option key={c.corpCode} value={c.corpCode}>
                                {c.corpName} {c.stockCode && `[${c.stockCode}]`} {c.ceo && ` · CEO: ${c.ceo}`} ({c.corpCode})
                              </option>
                            ))}
                          </select>
                        )}
                      </TableCell>
                      <TableCell>
                        {m.candidates.length === 0 ? (
                          <Badge variant="destructive" className="text-xs">매칭 없음</Badge>
                        ) : m.candidates.length === 1 ? (
                          <Badge className="bg-green-700 text-xs">자동 매칭</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">{m.candidates.length}건 후보</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={handleFetch}
                  disabled={fetching || resolvedItems.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-500"
                >
                  {fetching ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Search className="size-4 mr-2" />}
                  재무 일괄 조회 ({resolvedItems.length}건)
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                ※ 회사당 약 5~10초 소요. 15건 초과 시 클라이언트에서 분할 호출 권장 (Vercel 60s 한계).
              </p>
            </CardContent>
          </Card>
        )}

        {/* ─── STEP 3 ─── */}
        {step === 3 && (
          <>
            {fetchErrors.length > 0 && (
              <Card className="bg-red-950/30 border-red-900">
                <CardHeader>
                  <CardTitle className="text-sm text-red-400">
                    조회 실패 {fetchErrors.length}건
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-xs text-red-300 space-y-1">
                    {fetchErrors.map((e, i) => (
                      <li key={i}>• {e.inputName} — {e.reason}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Step 3. 결과 확인 + 다운로드</CardTitle>
                  <CardDescription>
                    자동 판정값은 dropdown으로 override 가능. 수동 4개(내분/조업중단/부도/컨소시엄)는 기본 N으로 입력되어 있습니다.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={handleReset} className="text-slate-400">
                    <X className="size-4 mr-1" /> 초기화
                  </Button>
                  <Button
                    onClick={handleDownload}
                    disabled={downloading || rows.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-500"
                  >
                    {downloading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Download className="size-4 mr-2" />}
                    Excel 다운로드
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="border-slate-800">
                      <TableHead className="text-slate-300 sticky left-0 bg-slate-900 z-10 min-w-[140px]">고객명</TableHead>
                      <TableHead className="text-slate-300">설립일</TableHead>
                      {rows[0]?.years.map((y, gi) => (
                        <TableHead key={gi} colSpan={4} className="text-center text-amber-300 border-l border-slate-700">
                          {y}년 (백만)
                        </TableHead>
                      ))}
                      {FLAG_LABELS.map((f) => (
                        <TableHead key={f.key} className={`text-center min-w-[80px] ${f.auto ? "text-cyan-300" : "text-purple-300"}`}>
                          {f.label}
                          {f.auto && <span className="block text-[10px] text-cyan-500">자동</span>}
                          {!f.auto && <span className="block text-[10px] text-purple-500">수동</span>}
                        </TableHead>
                      ))}
                    </TableRow>
                    <TableRow className="border-slate-800">
                      <TableHead colSpan={2} className="text-slate-500 sticky left-0 bg-slate-900 z-10"></TableHead>
                      {rows[0]?.years.map((_, gi) => (
                        <>
                          <TableHead key={`a-${gi}`} className="text-slate-400 border-l border-slate-700">자산</TableHead>
                          <TableHead key={`b-${gi}`} className="text-slate-400">차입금</TableHead>
                          <TableHead key={`c-${gi}`} className="text-slate-400">매출</TableHead>
                          <TableHead key={`d-${gi}`} className="text-slate-400">순익</TableHead>
                        </>
                      ))}
                      {FLAG_LABELS.map((f) => (
                        <TableHead key={`flag-empty-${f.key}`}></TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, idx) => {
                      const finalFlags = { ...r.flags, ...(r.flagOverrides || {}) };
                      return (
                        <TableRow key={idx} className="border-slate-800">
                          <TableCell className="font-medium sticky left-0 bg-slate-900 z-10">{r.corpName}</TableCell>
                          <TableCell className="text-slate-400">{r.estDt}</TableCell>
                          {r.years.map((y, gi) => {
                            const yc = r.cells.byYear[y];
                            return (
                              <>
                                <TableCell key={`a-${gi}`} className="text-right border-l border-slate-700">{fmtNum(yc?.totalAssets)}</TableCell>
                                <TableCell key={`b-${gi}`} className="text-right">{fmtNum(yc?.borrowings)}</TableCell>
                                <TableCell key={`c-${gi}`} className="text-right">{fmtNum(yc?.revenue)}</TableCell>
                                <TableCell key={`d-${gi}`} className={`text-right ${yc?.netIncome !== undefined && yc.netIncome < 0 ? "text-red-400" : ""}`}>
                                  {fmtNum(yc?.netIncome)}
                                </TableCell>
                              </>
                            );
                          })}
                          {FLAG_LABELS.map((f) => {
                            const val = (finalFlags[f.key] as YN) || "-";
                            const auto = f.auto;
                            return (
                              <TableCell key={f.key} className="text-center">
                                <select
                                  value={val}
                                  onChange={(e) => updateFlag(idx, f.key, e.target.value as YN)}
                                  className={`rounded px-1.5 py-0.5 text-xs ${
                                    val === "Y"
                                      ? "bg-red-900/50 text-red-300"
                                      : val === "N"
                                        ? "bg-slate-800 text-slate-300"
                                        : "bg-slate-800 text-slate-500"
                                  }`}
                                  title={auto ? (r.flags.evidence[f.key as keyof typeof r.flags.evidence] || "근거 없음") : "수동 입력"}
                                >
                                  <option value="Y">Y</option>
                                  <option value="N">N</option>
                                  <option value="-">-</option>
                                </select>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <p className="mt-3 text-xs text-slate-500">
                  <FileSpreadsheet className="inline size-3 mr-1" />
                  Excel 출력 시 PDF 양식과 동일한 가로형 35열로 변환됩니다. "자동판정근거" 보조 시트에 4개 룰의 상세 evidence가 포함됩니다.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
