"use client";

import { useState, useMemo, useRef, Fragment } from "react";
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
  selectedCorpCode: string;
  manualCorpCode: string;
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
    if (/고객명|회사명|차주명|기업명|상호/.test(trimmed)) return;
    out.push(trimmed);
  });
  return out;
}

function fmtNum(v: number | undefined): string {
  if (v === undefined || v === null || isNaN(v)) return "-";
  if (v === 0) return "-";
  return Math.round(v / 1_000_000).toLocaleString("ko-KR");
}

function YNSelect({ value, auto, evidence, onChange }: {
  value: YN;
  auto: boolean;
  evidence?: string;
  onChange: (v: YN) => void;
}) {
  const cls =
    value === "Y"
      ? "bg-red-50 text-red-700 border-red-200"
      : value === "N"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-gray-50 text-gray-500 border-gray-200";
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as YN)}
      className={`rounded border px-1.5 py-0.5 text-xs font-medium ${cls}`}
      title={auto ? (evidence || "근거 없음") : "수동 입력"}
    >
      <option value="Y">Y</option>
      <option value="N">N</option>
      <option value="-">-</option>
    </select>
  );
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseXlsxNames(file);
      if (parsed.length === 0) {
        toast.error("회사명을 찾을 수 없습니다. 1행 1번째 컬럼에 회사명이 있는지 확인해주세요.");
        return;
      }
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
    <div className="flex-1 overflow-auto bg-muted/30 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <div className="flex items-center gap-3">
            <AlertTriangle className="size-6 text-amber-500" />
            <h1 className="text-2xl font-bold text-foreground">부실징후점검 (전수조사)</h1>
            <Badge variant="outline" className="text-xs">Step {step}/3</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            회사명단을 입력하면 DART에서 3개년 재무를 자동 추출하고 4개 자동 판정 + 4개 수동 입력으로 PDF 양식과 동일한 Excel을 생성합니다.
          </p>
        </header>

        {/* ─── STEP 1 ─── */}
        {step === 1 && (
          <Card>
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
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-sm">회사명 ({names.length}건)</Label>
                <textarea
                  className="mt-1 w-full min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder={"삼성전자\n..."}
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
                >
                  <Upload className="size-4 mr-2" />
                  Excel 업로드 (A열 회사명)
                </Button>
                <Button
                  onClick={handleMatch}
                  disabled={matching || names.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700"
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Step 2. 매칭 확인 ({resolvedItems.length}/{matches.length})</CardTitle>
                <CardDescription>
                  후보 N건이면 dropdown에서 선택, 0건이면 corp_code 직접 입력하세요.
                </CardDescription>
              </div>
              <Button variant="ghost" onClick={() => setStep(1)}>
                <X className="size-4 mr-1" /> 다시 입력
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>입력명</TableHead>
                    <TableHead>매칭 회사 선택</TableHead>
                    <TableHead className="w-[140px]">상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.map((m, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-sm font-medium">{m.inputName}</TableCell>
                      <TableCell>
                        {m.candidates.length === 0 ? (
                          <Input
                            value={m.manualCorpCode}
                            onChange={(e) => updateMatch(idx, { manualCorpCode: e.target.value })}
                            placeholder="corp_code 8자리 (예: 00126380)"
                            className="max-w-xs"
                          />
                        ) : (
                          <select
                            value={m.selectedCorpCode}
                            onChange={(e) => updateMatch(idx, { selectedCorpCode: e.target.value })}
                            className="w-full max-w-md rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-100 text-xs">자동 매칭</Badge>
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
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {fetching ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Search className="size-4 mr-2" />}
                  재무 일괄 조회 ({resolvedItems.length}건)
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                ※ 회사당 약 5~10초 소요. 15건 초과 시 클라이언트에서 분할 호출 권장 (Vercel 60s 한계).
              </p>
            </CardContent>
          </Card>
        )}

        {/* ─── STEP 3 ─── */}
        {step === 3 && (
          <>
            {fetchErrors.length > 0 && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="text-sm text-red-700">
                    조회 실패 {fetchErrors.length}건
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-xs text-red-600 space-y-1">
                    {fetchErrors.map((e, i) => (
                      <li key={i}>• {e.inputName} — {e.reason}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Step 3. 결과 확인 + 다운로드</CardTitle>
                  <CardDescription>
                    자동 판정값은 dropdown으로 override 가능. 수동 4개(내분/조업중단/부도/컨소시엄)는 기본 N으로 입력되어 있습니다.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={handleReset}>
                    <X className="size-4 mr-1" /> 초기화
                  </Button>
                  <Button
                    onClick={handleDownload}
                    disabled={downloading || rows.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {downloading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Download className="size-4 mr-2" />}
                    Excel 다운로드
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10 min-w-[140px]">고객명</TableHead>
                      <TableHead>설립일</TableHead>
                      {rows[0]?.years.map((y, gi) => (
                        <TableHead key={`yh-${gi}`} colSpan={4} className="text-center text-amber-700 border-l">
                          {y}년 (백만)
                        </TableHead>
                      ))}
                      {FLAG_LABELS.map((f) => (
                        <TableHead key={f.key} className={`text-center min-w-[80px] ${f.auto ? "text-cyan-700" : "text-purple-700"}`}>
                          {f.label}
                          {f.auto && <span className="block text-[10px] text-cyan-500 font-normal">자동</span>}
                          {!f.auto && <span className="block text-[10px] text-purple-500 font-normal">수동</span>}
                        </TableHead>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableHead colSpan={2} className="sticky left-0 bg-background z-10"></TableHead>
                      {rows[0]?.years.map((_, gi) => (
                        <Fragment key={`subh-${gi}`}>
                          <TableHead className="text-muted-foreground border-l text-right">자산</TableHead>
                          <TableHead className="text-muted-foreground text-right">차입금</TableHead>
                          <TableHead className="text-muted-foreground text-right">매출</TableHead>
                          <TableHead className="text-muted-foreground text-right">순익</TableHead>
                        </Fragment>
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
                        <TableRow key={idx}>
                          <TableCell className="font-medium sticky left-0 bg-background z-10">{r.corpName}</TableCell>
                          <TableCell className="text-muted-foreground">{r.estDt}</TableCell>
                          {r.years.map((y, gi) => {
                            const yc = r.cells.byYear[y];
                            const neg = yc?.netIncome !== undefined && yc.netIncome < 0;
                            return (
                              <Fragment key={`yc-${gi}`}>
                                <TableCell className="text-right border-l">{fmtNum(yc?.totalAssets)}</TableCell>
                                <TableCell className="text-right">{fmtNum(yc?.borrowings)}</TableCell>
                                <TableCell className="text-right">{fmtNum(yc?.revenue)}</TableCell>
                                <TableCell className={`text-right ${neg ? "text-red-600 font-medium" : ""}`}>
                                  {fmtNum(yc?.netIncome)}
                                </TableCell>
                              </Fragment>
                            );
                          })}
                          {FLAG_LABELS.map((f) => {
                            const val = (finalFlags[f.key] as YN) || "-";
                            return (
                              <TableCell key={f.key} className="text-center">
                                <YNSelect
                                  value={val}
                                  auto={f.auto}
                                  evidence={r.flags.evidence[f.key as keyof typeof r.flags.evidence]}
                                  onChange={(v) => updateFlag(idx, f.key, v)}
                                />
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <p className="mt-3 text-xs text-muted-foreground">
                  <FileSpreadsheet className="inline size-3 mr-1" />
                  Excel 출력 시 PDF 양식과 동일한 가로형 35열로 변환됩니다. &quot;자동판정근거&quot; 보조 시트에 4개 룰의 상세 evidence가 포함됩니다.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
