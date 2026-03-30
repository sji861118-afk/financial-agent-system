"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import type {
  AppraisalCase,
  CollateralAnalysis,
  CollateralItem,
  RightEntry,
  AuctionStatRow,
  RecoveryEstimate,
} from "@/types/appraisal";

interface CollateralTabProps {
  data: AppraisalCase;
  onUpdate: (patch: Partial<AppraisalCase>) => void;
}

function emptyCollateralItem(): CollateralItem {
  return {
    type: "",
    quantity: 0,
    areaSqm: 0,
    areaPyeong: 0,
    appraisalValue: 0,
    collateralRatio: 0,
    priorClaims: 0,
    availableValue: 0,
    ltv: 0,
  };
}

function emptyRightEntry(order: number): RightEntry {
  return {
    order,
    type: "",
    holder: "",
    principal: 0,
    settingRatio: 0,
    maxClaim: 0,
    ltv: 0,
  };
}

function fmt(n: number): string {
  return n === 0 ? "" : String(n);
}

function parseNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

export default function CollateralTab({ data, onUpdate }: CollateralTabProps) {
  const col = data.collateral;
  const stats = data.auctionStats;
  const rec = data.recoveryEstimate;

  // ── helpers ──────────────────────────────────────────────────────────────

  const updateCollateral = (patch: Partial<CollateralAnalysis>) => {
    onUpdate({ collateral: { ...col, ...patch } });
  };

  const updateItem = (idx: number, patch: Partial<CollateralItem>) => {
    const items = col.items.map((it, i) =>
      i === idx ? { ...it, ...patch } : it
    );
    updateCollateral({ items });
  };

  const addItem = () => {
    updateCollateral({ items: [...col.items, emptyCollateralItem()] });
  };

  const removeItem = (idx: number) => {
    updateCollateral({ items: col.items.filter((_, i) => i !== idx) });
  };

  const updateRight = (idx: number, patch: Partial<RightEntry>) => {
    const rights = col.rights.map((r, i) =>
      i === idx ? { ...r, ...patch } : r
    );
    updateCollateral({ rights });
  };

  const addRight = () => {
    updateCollateral({
      rights: [...col.rights, emptyRightEntry(col.rights.length + 1)],
    });
  };

  const removeRight = (idx: number) => {
    updateCollateral({ rights: col.rights.filter((_, i) => i !== idx) });
  };

  const updateAuctionRow = (
    idx: number,
    field: "regional" | "district" | "dong",
    subField: "rate" | "count",
    value: string
  ) => {
    const newStats = stats.stats.map((row, i) =>
      i === idx
        ? {
            ...row,
            [field]: { ...row[field], [subField]: parseNum(value) },
          }
        : row
    );
    onUpdate({ auctionStats: { ...stats, stats: newStats } });
  };

  const updateRecovery = (patch: Partial<RecoveryEstimate>) => {
    const next = { ...rec, ...patch };
    const grossRecovery = next.appraisalValue * (next.appliedRate / 100);
    next.distributionAmount = grossRecovery - next.priorClaims;
    if (next.pariPassuShare > 0) {
      next.recoveryAmount =
        next.distributionAmount * (next.pariPassuShare / 100);
    } else {
      next.recoveryAmount = next.distributionAmount;
    }
    onUpdate({ recoveryEstimate: next });
  };

  // ── rate options from auctionStats ───────────────────────────────────────

  const rateOptions: { label: string; rate: number; period: string }[] =
    stats.stats.map((row) => ({
      label: `${row.period} ${stats.district || "지역"} ${row.district.rate}%`,
      rate: row.district.rate,
      period: row.period,
    }));

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Card 1: 담보물 조사 ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>담보물 조사</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 기본 정보 그리드 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(
              [
                ["소유자", "owner"],
                ["위탁자", "trustee"],
                ["평가기관", "appraiser"],
                ["채무자", "debtor"],
                ["평가목적", "purpose"],
                ["제출처", "submittedTo"],
                ["기준시점", "baseDate"],
                ["일련번호", "serialNo"],
              ] as [string, keyof CollateralAnalysis][]
            ).map(([label, key]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`col-${key}`}>{label}</Label>
                <Input
                  id={`col-${key}`}
                  value={(col[key] as string) ?? ""}
                  onChange={(e) =>
                    updateCollateral({ [key]: e.target.value })
                  }
                />
              </div>
            ))}

            <div className="space-y-1.5">
              <Label htmlFor="col-appraisalValue">감정평가액</Label>
              <Input
                id="col-appraisalValue"
                type="number"
                value={fmt(col.appraisalValue)}
                onChange={(e) =>
                  updateCollateral({ appraisalValue: parseNum(e.target.value) })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="col-collateralRatio">담보인정비율</Label>
              <Input
                id="col-collateralRatio"
                type="number"
                value={fmt(col.collateralRatio)}
                onChange={(e) =>
                  updateCollateral({
                    collateralRatio: parseNum(e.target.value),
                  })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="col-priorClaims">선순위</Label>
              <Input
                id="col-priorClaims"
                type="number"
                value={fmt(col.priorClaims)}
                onChange={(e) =>
                  updateCollateral({ priorClaims: parseNum(e.target.value) })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="col-ltv">LTV</Label>
              <Input
                id="col-ltv"
                type="number"
                value={fmt(col.ltv)}
                onChange={(e) =>
                  updateCollateral({ ltv: parseNum(e.target.value) })
                }
              />
            </div>
          </div>

          {/* 담보물 목록 */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              담보물 목록
            </h3>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>종류</TableHead>
                    <TableHead>수량</TableHead>
                    <TableHead>면적(㎡)</TableHead>
                    <TableHead>면적(평)</TableHead>
                    <TableHead>감정가</TableHead>
                    <TableHead>인정비율(%)</TableHead>
                    <TableHead>선순위</TableHead>
                    <TableHead>가용가</TableHead>
                    <TableHead>LTV(%)</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {col.items.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="text-center text-sm text-muted-foreground"
                      >
                        데이터 없음
                      </TableCell>
                    </TableRow>
                  )}
                  {col.items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Input
                          className="h-7 min-w-[80px] text-xs"
                          value={item.type}
                          onChange={(e) =>
                            updateItem(idx, { type: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 w-16 text-xs"
                          type="number"
                          value={fmt(item.quantity)}
                          onChange={(e) =>
                            updateItem(idx, {
                              quantity: parseNum(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 w-20 text-xs"
                          type="number"
                          value={fmt(item.areaSqm)}
                          onChange={(e) =>
                            updateItem(idx, {
                              areaSqm: parseNum(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 w-20 text-xs"
                          type="number"
                          value={fmt(item.areaPyeong)}
                          onChange={(e) =>
                            updateItem(idx, {
                              areaPyeong: parseNum(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 w-24 text-xs"
                          type="number"
                          value={fmt(item.appraisalValue)}
                          onChange={(e) =>
                            updateItem(idx, {
                              appraisalValue: parseNum(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 w-20 text-xs"
                          type="number"
                          value={fmt(item.collateralRatio)}
                          onChange={(e) =>
                            updateItem(idx, {
                              collateralRatio: parseNum(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 w-24 text-xs"
                          type="number"
                          value={fmt(item.priorClaims)}
                          onChange={(e) =>
                            updateItem(idx, {
                              priorClaims: parseNum(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 w-24 text-xs"
                          type="number"
                          value={fmt(item.availableValue)}
                          onChange={(e) =>
                            updateItem(idx, {
                              availableValue: parseNum(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 w-20 text-xs"
                          type="number"
                          value={fmt(item.ltv)}
                          onChange={(e) =>
                            updateItem(idx, { ltv: parseNum(e.target.value) })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          aria-label="행 삭제"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={addItem}
            >
              <Plus className="mr-1.5 size-3.5" />
              행 추가
            </Button>
          </div>

          {/* 권리현황 */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              권리현황
            </h3>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>순위</TableHead>
                    <TableHead>권리종류</TableHead>
                    <TableHead>권리자명</TableHead>
                    <TableHead>원금</TableHead>
                    <TableHead>설정비율(%)</TableHead>
                    <TableHead>채권최고액</TableHead>
                    <TableHead>LTV(%)</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {col.rights.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-sm text-muted-foreground"
                      >
                        데이터 없음
                      </TableCell>
                    </TableRow>
                  )}
                  {col.rights.map((right, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Input
                          className="h-7 w-14 text-xs"
                          type="number"
                          value={fmt(right.order)}
                          onChange={(e) =>
                            updateRight(idx, {
                              order: parseNum(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 min-w-[80px] text-xs"
                          value={right.type}
                          onChange={(e) =>
                            updateRight(idx, { type: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 min-w-[80px] text-xs"
                          value={right.holder}
                          onChange={(e) =>
                            updateRight(idx, { holder: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 w-24 text-xs"
                          type="number"
                          value={fmt(right.principal)}
                          onChange={(e) =>
                            updateRight(idx, {
                              principal: parseNum(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 w-20 text-xs"
                          type="number"
                          value={fmt(right.settingRatio)}
                          onChange={(e) =>
                            updateRight(idx, {
                              settingRatio: parseNum(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 w-24 text-xs"
                          type="number"
                          value={fmt(right.maxClaim)}
                          onChange={(e) =>
                            updateRight(idx, {
                              maxClaim: parseNum(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 w-20 text-xs"
                          type="number"
                          value={fmt(right.ltv)}
                          onChange={(e) =>
                            updateRight(idx, { ltv: parseNum(e.target.value) })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => removeRight(idx)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          aria-label="행 삭제"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={addRight}
            >
              <Plus className="mr-1.5 size-3.5" />
              행 추가
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 2: 지역·용도별 낙찰통계 ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            지역·용도별 낙찰통계
            {stats.retrievedAt && (
              <Badge variant="secondary" className="ml-auto text-xs font-normal">
                인포케어 (조회일: {stats.retrievedAt})
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.stats.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>기간</TableHead>
                    <TableHead>{stats.region || "광역"} 낙찰가율</TableHead>
                    <TableHead>건수</TableHead>
                    <TableHead>{stats.district || "구"} 낙찰가율</TableHead>
                    <TableHead>건수</TableHead>
                    <TableHead>{stats.dong || "동"} 낙찰가율</TableHead>
                    <TableHead>건수</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(["12개월", "6개월", "3개월"] as AuctionStatRow["period"][]).map(
                    (period) => {
                      const rowIdx = stats.stats.findIndex(
                        (r) => r.period === period
                      );
                      const row = stats.stats[rowIdx];
                      if (!row) return null;
                      return (
                        <TableRow key={period}>
                          <TableCell className="font-medium">{period}</TableCell>
                          <TableCell>
                            <Input
                              className="h-7 w-20 text-xs"
                              type="number"
                              value={fmt(row.regional.rate)}
                              onChange={(e) =>
                                updateAuctionRow(
                                  rowIdx,
                                  "regional",
                                  "rate",
                                  e.target.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-7 w-16 text-xs"
                              type="number"
                              value={fmt(row.regional.count)}
                              onChange={(e) =>
                                updateAuctionRow(
                                  rowIdx,
                                  "regional",
                                  "count",
                                  e.target.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-7 w-20 text-xs"
                              type="number"
                              value={fmt(row.district.rate)}
                              onChange={(e) =>
                                updateAuctionRow(
                                  rowIdx,
                                  "district",
                                  "rate",
                                  e.target.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-7 w-16 text-xs"
                              type="number"
                              value={fmt(row.district.count)}
                              onChange={(e) =>
                                updateAuctionRow(
                                  rowIdx,
                                  "district",
                                  "count",
                                  e.target.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-7 w-20 text-xs"
                              type="number"
                              value={fmt(row.dong.rate)}
                              onChange={(e) =>
                                updateAuctionRow(
                                  rowIdx,
                                  "dong",
                                  "rate",
                                  e.target.value
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-7 w-16 text-xs"
                              type="number"
                              value={fmt(row.dong.count)}
                              onChange={(e) =>
                                updateAuctionRow(
                                  rowIdx,
                                  "dong",
                                  "count",
                                  e.target.value
                                )
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    }
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                인포케어 낙찰통계가 자동 조회되지 않았습니다. 수동으로
                입력해주세요.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>광역 (시/도)</Label>
                  <Input
                    value={stats.region}
                    onChange={(e) =>
                      onUpdate({
                        auctionStats: { ...stats, region: e.target.value },
                      })
                    }
                    placeholder="예: 서울"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>구/군</Label>
                  <Input
                    value={stats.district}
                    onChange={(e) =>
                      onUpdate({
                        auctionStats: { ...stats, district: e.target.value },
                      })
                    }
                    placeholder="예: 강남구"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>동/읍/면</Label>
                  <Input
                    value={stats.dong}
                    onChange={(e) =>
                      onUpdate({
                        auctionStats: { ...stats, dong: e.target.value },
                      })
                    }
                    placeholder="예: 역삼동"
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Card 3: 회수예상가 산출 ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>회수예상가 산출</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* 감정가 — display only */}
            <div className="space-y-1.5">
              <Label>감정가</Label>
              <Input
                readOnly
                value={fmt(col.appraisalValue)}
                className="bg-gray-50"
              />
            </div>

            {/* 적용 낙찰가율 */}
            <div className="space-y-1.5">
              <Label>적용 낙찰가율 (%)</Label>
              {rateOptions.length > 0 ? (
                <Select
                  value={String(rec.appliedRate)}
                  onValueChange={(v) => {
                    const selected = rateOptions.find(
                      (o) => String(o.rate) === v
                    );
                    updateRecovery({
                      appliedRate: parseNum(v),
                      appliedPeriod: selected?.period ?? rec.appliedPeriod,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="낙찰가율 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {rateOptions.map((opt) => (
                      <SelectItem key={opt.label} value={String(opt.rate)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="number"
                  value={fmt(rec.appliedRate)}
                  onChange={(e) =>
                    updateRecovery({ appliedRate: parseNum(e.target.value) })
                  }
                  placeholder="예: 85"
                />
              )}
            </div>

            {/* 선순위 */}
            <div className="space-y-1.5">
              <Label>선순위</Label>
              <Input
                type="number"
                value={fmt(rec.priorClaims)}
                onChange={(e) =>
                  updateRecovery({ priorClaims: parseNum(e.target.value) })
                }
              />
            </div>

            {/* 동순위 당사 지분(%) */}
            <div className="space-y-1.5">
              <Label>동순위 당사 지분 (%)</Label>
              <Input
                type="number"
                value={fmt(rec.pariPassuShare)}
                onChange={(e) =>
                  updateRecovery({ pariPassuShare: parseNum(e.target.value) })
                }
                placeholder="0이면 단독 선순위"
              />
            </div>

            {/* 배분액 — auto-calculated */}
            <div className="space-y-1.5">
              <Label>배분액</Label>
              <Input
                readOnly
                value={fmt(rec.distributionAmount)}
                className="bg-gray-50"
              />
            </div>

            {/* 회수액 */}
            <div className="space-y-1.5">
              <Label>회수액</Label>
              <Input
                type="number"
                value={fmt(rec.recoveryAmount)}
                onChange={(e) =>
                  updateRecovery({ recoveryAmount: parseNum(e.target.value) })
                }
              />
            </div>

            {/* 손실액 */}
            <div className="space-y-1.5">
              <Label>손실액</Label>
              <Input
                type="number"
                value={fmt(rec.lossAmount)}
                onChange={(e) =>
                  updateRecovery({ lossAmount: parseNum(e.target.value) })
                }
              />
            </div>
          </div>

          {/* 심사의견 */}
          <div className="space-y-1.5">
            <Label htmlFor="rec-opinion">심사의견</Label>
            <Textarea
              id="rec-opinion"
              rows={4}
              value={rec.opinion}
              onChange={(e) => updateRecovery({ opinion: e.target.value })}
              placeholder="담보물에 대한 심사의견을 입력하세요."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
