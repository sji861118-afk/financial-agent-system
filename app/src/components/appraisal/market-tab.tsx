"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import type {
  AppraisalCase,
  MarketAnalysis,
  RealTransactionRow,
  LandPriceRow,
  NearbyComplex,
} from "@/types/appraisal";

interface MarketTabProps {
  data: AppraisalCase;
  onUpdate: (patch: Partial<AppraisalCase>) => void;
}

function parseNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function fmt(n: number): string {
  return n === 0 ? "" : String(n);
}

export default function MarketTab({ data, onUpdate }: MarketTabProps) {
  const market = data.marketAnalysis;

  // ── helpers ───────────────────────────────────────────────────────────────

  const updateLocation = (patch: Partial<MarketAnalysis["location"]>) => {
    onUpdate({
      marketAnalysis: {
        ...market,
        location: { ...market.location, ...patch },
      },
    });
  };

  const updateRealTransactions = (rows: RealTransactionRow[]) => {
    onUpdate({
      marketAnalysis: {
        ...market,
        realTransactions: { ...market.realTransactions, data: rows },
      },
    });
  };

  const updateLandPrices = (rows: LandPriceRow[]) => {
    onUpdate({
      marketAnalysis: {
        ...market,
        officialLandPrice: { ...market.officialLandPrice, data: rows },
      },
    });
  };

  const updateNearbyComplexes = (rows: NearbyComplex[]) => {
    onUpdate({
      marketAnalysis: {
        ...market,
        priceComparison: { ...market.priceComparison, nearbyComplexes: rows },
      },
    });
  };

  // ── Real Transactions ────────────────────────────────────────────────────

  const addRealTransaction = () => {
    updateRealTransactions([
      ...market.realTransactions.data,
      {
        address: "",
        buildingName: "",
        areaSqm: 0,
        price: 0,
        pricePerPyeong: 0,
        transactionDate: "",
        floor: "",
      },
    ]);
  };

  const removeRealTransaction = (idx: number) => {
    updateRealTransactions(market.realTransactions.data.filter((_, i) => i !== idx));
  };

  const updateRealTransactionRow = (idx: number, patch: Partial<RealTransactionRow>) => {
    updateRealTransactions(
      market.realTransactions.data.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    );
  };

  // ── Land Prices ──────────────────────────────────────────────────────────

  const addLandPrice = () => {
    updateLandPrices([
      ...market.officialLandPrice.data,
      { address: "", pricePerSqm: 0, year: new Date().getFullYear(), changeRate: 0 },
    ]);
  };

  const removeLandPrice = (idx: number) => {
    updateLandPrices(market.officialLandPrice.data.filter((_, i) => i !== idx));
  };

  const updateLandPriceRow = (idx: number, patch: Partial<LandPriceRow>) => {
    updateLandPrices(
      market.officialLandPrice.data.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    );
  };

  // ── Nearby Complexes ─────────────────────────────────────────────────────

  const addNearbyComplex = () => {
    updateNearbyComplexes([
      ...market.priceComparison.nearbyComplexes,
      {
        name: "",
        distance: "",
        source: "",
        areaSqm: 0,
        pricePerPyeong: 0,
        completionYear: 0,
        salesRate: 0,
      },
    ]);
  };

  const removeNearbyComplex = (idx: number) => {
    updateNearbyComplexes(
      market.priceComparison.nearbyComplexes.filter((_, i) => i !== idx)
    );
  };

  const updateNearbyComplexRow = (idx: number, patch: Partial<NearbyComplex>) => {
    updateNearbyComplexes(
      market.priceComparison.nearbyComplexes.map((row, i) =>
        i === idx ? { ...row, ...patch } : row
      )
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Card 1: 입지환경 */}
      <Card>
        <CardHeader>
          <CardTitle>입지환경</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>입지 종합</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={market.location.description}
              onChange={(e) => updateLocation({ description: e.target.value })}
              placeholder="입지 종합 의견을 입력하세요"
            />
          </div>
          <div className="space-y-1.5">
            <Label>교통 환경</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={market.location.transportation}
              onChange={(e) => updateLocation({ transportation: e.target.value })}
              placeholder="교통 환경을 입력하세요"
            />
          </div>
          <div className="space-y-1.5">
            <Label>교육 환경</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={market.location.education}
              onChange={(e) => updateLocation({ education: e.target.value })}
              placeholder="교육 환경을 입력하세요"
            />
          </div>
          <div className="space-y-1.5">
            <Label>생활 편의시설</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={market.location.amenities}
              onChange={(e) => updateLocation({ amenities: e.target.value })}
              placeholder="생활 편의시설을 입력하세요"
            />
          </div>
        </CardContent>
      </Card>

      {/* Card 2: 실거래가 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>실거래가</CardTitle>
          <div className="flex items-center gap-2">
            {market.realTransactions.source &&
              market.realTransactions.source !== "미설정" &&
              market.realTransactions.retrievedAt && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {market.realTransactions.source} (조회일:{" "}
                  {market.realTransactions.retrievedAt.slice(0, 10)})
                </Badge>
              )}
            <Button size="sm" variant="outline" onClick={addRealTransaction}>
              <Plus className="mr-1 size-3.5" />
              거래사례 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>소재지</TableHead>
                  <TableHead>건물명</TableHead>
                  <TableHead className="text-right">면적(㎡)</TableHead>
                  <TableHead className="text-right">거래가(백만원)</TableHead>
                  <TableHead className="text-right">평단가</TableHead>
                  <TableHead>거래일</TableHead>
                  <TableHead>층</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {market.realTransactions.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                      거래사례를 추가하세요
                    </TableCell>
                  </TableRow>
                ) : (
                  market.realTransactions.data.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Input
                          value={row.address}
                          onChange={(e) =>
                            updateRealTransactionRow(idx, { address: e.target.value })
                          }
                          className="h-8 min-w-[120px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.buildingName}
                          onChange={(e) =>
                            updateRealTransactionRow(idx, { buildingName: e.target.value })
                          }
                          className="h-8 min-w-[100px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={fmt(row.areaSqm)}
                          onChange={(e) =>
                            updateRealTransactionRow(idx, { areaSqm: parseNum(e.target.value) })
                          }
                          className="h-8 w-20 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={fmt(row.price)}
                          onChange={(e) =>
                            updateRealTransactionRow(idx, { price: parseNum(e.target.value) })
                          }
                          className="h-8 w-24 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={fmt(row.pricePerPyeong)}
                          onChange={(e) =>
                            updateRealTransactionRow(idx, {
                              pricePerPyeong: parseNum(e.target.value),
                            })
                          }
                          className="h-8 w-24 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.transactionDate}
                          onChange={(e) =>
                            updateRealTransactionRow(idx, { transactionDate: e.target.value })
                          }
                          className="h-8 w-28"
                          placeholder="2024-01"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.floor}
                          onChange={(e) =>
                            updateRealTransactionRow(idx, { floor: e.target.value })
                          }
                          className="h-8 w-16"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive"
                          onClick={() => removeRealTransaction(idx)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Card 3: 공시지가 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>공시지가</CardTitle>
          <div className="flex items-center gap-2">
            {market.officialLandPrice.source &&
              market.officialLandPrice.source !== "미설정" &&
              market.officialLandPrice.retrievedAt && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {market.officialLandPrice.source} (조회일:{" "}
                  {market.officialLandPrice.retrievedAt.slice(0, 10)})
                </Badge>
              )}
            <Button size="sm" variant="outline" onClick={addLandPrice}>
              <Plus className="mr-1 size-3.5" />
              공시지가 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>소재지</TableHead>
                  <TableHead className="text-right">㎡당 가격</TableHead>
                  <TableHead className="text-right">연도</TableHead>
                  <TableHead className="text-right">증감률(%)</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {market.officialLandPrice.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      공시지가를 추가하세요
                    </TableCell>
                  </TableRow>
                ) : (
                  market.officialLandPrice.data.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Input
                          value={row.address}
                          onChange={(e) =>
                            updateLandPriceRow(idx, { address: e.target.value })
                          }
                          className="h-8 min-w-[150px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={fmt(row.pricePerSqm)}
                          onChange={(e) =>
                            updateLandPriceRow(idx, { pricePerSqm: parseNum(e.target.value) })
                          }
                          className="h-8 w-28 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={fmt(row.year)}
                          onChange={(e) =>
                            updateLandPriceRow(idx, { year: parseNum(e.target.value) })
                          }
                          className="h-8 w-20 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={fmt(row.changeRate)}
                          onChange={(e) =>
                            updateLandPriceRow(idx, { changeRate: parseNum(e.target.value) })
                          }
                          className="h-8 w-20 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive"
                          onClick={() => removeLandPrice(idx)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Card 4: 주변 시세 분석 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>주변 시세 분석</CardTitle>
          <Button size="sm" variant="outline" onClick={addNearbyComplex}>
            <Plus className="mr-1 size-3.5" />
            인근 단지 추가
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>시세 분석 의견</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={market.priceComparison.description}
              onChange={(e) =>
                onUpdate({
                  marketAnalysis: {
                    ...market,
                    priceComparison: {
                      ...market.priceComparison,
                      description: e.target.value,
                    },
                  },
                })
              }
              placeholder="주변 시세 분석 의견을 입력하세요"
            />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>단지명</TableHead>
                  <TableHead>거리</TableHead>
                  <TableHead className="text-right">면적(㎡)</TableHead>
                  <TableHead className="text-right">평단가</TableHead>
                  <TableHead className="text-right">준공년도</TableHead>
                  <TableHead className="text-right">분양률(%)</TableHead>
                  <TableHead>출처</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {market.priceComparison.nearbyComplexes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                      인근 단지를 추가하세요
                    </TableCell>
                  </TableRow>
                ) : (
                  market.priceComparison.nearbyComplexes.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Input
                          value={row.name}
                          onChange={(e) =>
                            updateNearbyComplexRow(idx, { name: e.target.value })
                          }
                          className="h-8 min-w-[100px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.distance}
                          onChange={(e) =>
                            updateNearbyComplexRow(idx, { distance: e.target.value })
                          }
                          className="h-8 w-20"
                          placeholder="200m"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={fmt(row.areaSqm)}
                          onChange={(e) =>
                            updateNearbyComplexRow(idx, { areaSqm: parseNum(e.target.value) })
                          }
                          className="h-8 w-20 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={fmt(row.pricePerPyeong)}
                          onChange={(e) =>
                            updateNearbyComplexRow(idx, {
                              pricePerPyeong: parseNum(e.target.value),
                            })
                          }
                          className="h-8 w-24 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={fmt(row.completionYear)}
                          onChange={(e) =>
                            updateNearbyComplexRow(idx, {
                              completionYear: parseNum(e.target.value),
                            })
                          }
                          className="h-8 w-20 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={fmt(row.salesRate)}
                          onChange={(e) =>
                            updateNearbyComplexRow(idx, { salesRate: parseNum(e.target.value) })
                          }
                          className="h-8 w-20 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.source}
                          onChange={(e) =>
                            updateNearbyComplexRow(idx, { source: e.target.value })
                          }
                          className="h-8 min-w-[80px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive"
                          onClick={() => removeNearbyComplex(idx)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
