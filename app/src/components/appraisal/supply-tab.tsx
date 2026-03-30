"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import { Plus, Trash2 } from "lucide-react";
import type {
  AppraisalCase,
  SupplyOverview,
  SupplyRow,
  CollateralDetailItem,
} from "@/types/appraisal";

interface SupplyTabProps {
  data: AppraisalCase;
  onUpdate: (patch: Partial<AppraisalCase>) => void;
}

function fmt(n: number): string {
  return n === 0 ? "" : String(n);
}

function parseNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

export default function SupplyTab({ data, onUpdate }: SupplyTabProps) {
  const supply = data.supply;
  const project = supply.project;
  const detail = data.collateralDetail;

  // ── helpers ───────────────────────────────────────────────────────────────

  const updateProject = (patch: Partial<SupplyOverview["project"]>) => {
    onUpdate({ supply: { ...supply, project: { ...project, ...patch } } });
  };

  const updateSupplyTable = (index: number, patch: Partial<SupplyRow>) => {
    const newTable = [...supply.supplyTable];
    newTable[index] = { ...newTable[index], ...patch };
    onUpdate({ supply: { ...supply, supplyTable: newTable } });
  };

  const addSupplyRow = () => {
    const empty: SupplyRow = {
      category: "",
      type: "",
      units: 0,
      areaSqm: 0,
      areaPyeong: 0,
      pricePerPyeong: 0,
      pricePerUnit: 0,
      totalPrice: 0,
      ratio: 0,
    };
    onUpdate({ supply: { ...supply, supplyTable: [...supply.supplyTable, empty] } });
  };

  const removeSupplyRow = (index: number) => {
    onUpdate({
      supply: {
        ...supply,
        supplyTable: supply.supplyTable.filter((_, i) => i !== index),
      },
    });
  };

  const updateDetail = (index: number, patch: Partial<CollateralDetailItem>) => {
    const newDetail = [...detail];
    newDetail[index] = { ...newDetail[index], ...patch };
    onUpdate({ collateralDetail: newDetail });
  };

  const addDetailRow = () => {
    const empty: CollateralDetailItem = {
      no: detail.length + 1,
      unit: "",
      floor: "",
      areaSqm: 0,
      areaPyeong: 0,
      appraisalValue: 0,
      planPrice: 0,
      releaseCondition: 0,
      appraisalPricePerPyeong: 0,
      planPricePerPyeong: 0,
      status: "미분양",
      remarks: "",
    };
    onUpdate({ collateralDetail: [...detail, empty] });
  };

  const removeDetailRow = (index: number) => {
    onUpdate({ collateralDetail: detail.filter((_, i) => i !== index) });
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Card 1: 사업개요 ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>사업개요</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="proj-name">사업명</Label>
              <Input
                id="proj-name"
                value={project.name}
                onChange={(e) => updateProject({ name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-purpose">사업목적물</Label>
              <Input
                id="proj-purpose"
                value={project.purpose}
                onChange={(e) => updateProject({ purpose: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-developer">시행사</Label>
              <Input
                id="proj-developer"
                value={project.developer}
                onChange={(e) => updateProject({ developer: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-constructor">시공사</Label>
              <Input
                id="proj-constructor"
                value={project.constructor}
                onChange={(e) => updateProject({ constructor: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-address">소재지</Label>
              <Input
                id="proj-address"
                value={project.address}
                onChange={(e) => updateProject({ address: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-zoning">용도지역</Label>
              <Input
                id="proj-zoning"
                value={project.zoning}
                onChange={(e) => updateProject({ zoning: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-landSqm">대지면적 ㎡</Label>
              <Input
                id="proj-landSqm"
                type="number"
                value={fmt(project.landArea.sqm)}
                onChange={(e) =>
                  updateProject({ landArea: { ...project.landArea, sqm: parseNum(e.target.value) } })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-landPyeong">대지면적 평</Label>
              <Input
                id="proj-landPyeong"
                type="number"
                value={fmt(project.landArea.pyeong)}
                onChange={(e) =>
                  updateProject({ landArea: { ...project.landArea, pyeong: parseNum(e.target.value) } })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-bldgSqm">건축면적 ㎡</Label>
              <Input
                id="proj-bldgSqm"
                type="number"
                value={fmt(project.buildingArea.sqm)}
                onChange={(e) =>
                  updateProject({ buildingArea: { ...project.buildingArea, sqm: parseNum(e.target.value) } })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-bldgPyeong">건축면적 평</Label>
              <Input
                id="proj-bldgPyeong"
                type="number"
                value={fmt(project.buildingArea.pyeong)}
                onChange={(e) =>
                  updateProject({ buildingArea: { ...project.buildingArea, pyeong: parseNum(e.target.value) } })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-grossSqm">연면적 ㎡</Label>
              <Input
                id="proj-grossSqm"
                type="number"
                value={fmt(project.grossArea.sqm)}
                onChange={(e) =>
                  updateProject({ grossArea: { ...project.grossArea, sqm: parseNum(e.target.value) } })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-grossPyeong">연면적 평</Label>
              <Input
                id="proj-grossPyeong"
                type="number"
                value={fmt(project.grossArea.pyeong)}
                onChange={(e) =>
                  updateProject({ grossArea: { ...project.grossArea, pyeong: parseNum(e.target.value) } })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-coverage">건폐율</Label>
              <Input
                id="proj-coverage"
                type="number"
                value={fmt(project.coverageRatio)}
                onChange={(e) => updateProject({ coverageRatio: parseNum(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-far">용적률</Label>
              <Input
                id="proj-far"
                type="number"
                value={fmt(project.floorAreaRatio)}
                onChange={(e) => updateProject({ floorAreaRatio: parseNum(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-parking">주차대수</Label>
              <Input
                id="proj-parking"
                type="number"
                value={fmt(project.parking)}
                onChange={(e) => updateProject({ parking: parseNum(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-scale">규모</Label>
              <Input
                id="proj-scale"
                value={project.scale}
                onChange={(e) => updateProject({ scale: e.target.value })}
                placeholder="예: 지하2층~지상15층"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-period">공사기간</Label>
              <Input
                id="proj-period"
                value={project.constructionPeriod}
                onChange={(e) => updateProject({ constructionPeriod: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-completion">준공일</Label>
              <Input
                id="proj-completion"
                value={project.completionDate}
                onChange={(e) => updateProject({ completionDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-salesrate">분양률</Label>
              <Input
                id="proj-salesrate"
                type="number"
                value={fmt(project.salesRate)}
                onChange={(e) => updateProject({ salesRate: parseNum(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 2: 공급 테이블 ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>공급 테이블</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>구분</TableHead>
                  <TableHead>타입</TableHead>
                  <TableHead>세대수</TableHead>
                  <TableHead>전용면적(㎡)</TableHead>
                  <TableHead>전용면적(평)</TableHead>
                  <TableHead>평당가</TableHead>
                  <TableHead>세대당가</TableHead>
                  <TableHead>총액</TableHead>
                  <TableHead>비중(%)</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supply.supplyTable.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-center text-sm text-muted-foreground"
                    >
                      데이터 없음
                    </TableCell>
                  </TableRow>
                )}
                {supply.supplyTable.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Input
                        className="h-7 min-w-[80px] text-xs"
                        value={row.category}
                        onChange={(e) =>
                          updateSupplyTable(idx, { category: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-7 min-w-[60px] text-xs"
                        value={row.type}
                        onChange={(e) =>
                          updateSupplyTable(idx, { type: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-7 w-16 text-xs"
                        type="number"
                        value={fmt(row.units)}
                        onChange={(e) =>
                          updateSupplyTable(idx, { units: parseNum(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-7 w-20 text-xs"
                        type="number"
                        value={fmt(row.areaSqm)}
                        onChange={(e) =>
                          updateSupplyTable(idx, { areaSqm: parseNum(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-7 w-20 text-xs"
                        type="number"
                        value={fmt(row.areaPyeong)}
                        onChange={(e) =>
                          updateSupplyTable(idx, { areaPyeong: parseNum(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-7 w-24 text-xs"
                        type="number"
                        value={fmt(row.pricePerPyeong)}
                        onChange={(e) =>
                          updateSupplyTable(idx, { pricePerPyeong: parseNum(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-7 w-24 text-xs"
                        type="number"
                        value={fmt(row.pricePerUnit)}
                        onChange={(e) =>
                          updateSupplyTable(idx, { pricePerUnit: parseNum(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-7 w-24 text-xs"
                        type="number"
                        value={fmt(row.totalPrice)}
                        onChange={(e) =>
                          updateSupplyTable(idx, { totalPrice: parseNum(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-7 w-16 text-xs"
                        type="number"
                        value={fmt(row.ratio)}
                        onChange={(e) =>
                          updateSupplyTable(idx, { ratio: parseNum(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => removeSupplyRow(idx)}
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
            onClick={addSupplyRow}
          >
            <Plus className="mr-1.5 size-3.5" />
            행 추가
          </Button>
        </CardContent>
      </Card>

      {/* ── Card 3: 상세담보현황 ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>상세담보현황</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="text-xs">No</TableHead>
                  <TableHead className="text-xs">호실</TableHead>
                  <TableHead className="text-xs">층</TableHead>
                  <TableHead className="text-xs">전용(㎡)</TableHead>
                  <TableHead className="text-xs">전용(평)</TableHead>
                  <TableHead className="text-xs">감정가</TableHead>
                  <TableHead className="text-xs">계획분양가</TableHead>
                  <TableHead className="text-xs">해지조건</TableHead>
                  <TableHead className="text-xs">감정평단가</TableHead>
                  <TableHead className="text-xs">분양평단가</TableHead>
                  <TableHead className="text-xs">상태</TableHead>
                  <TableHead className="text-xs">비고</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={13}
                      className="text-center text-sm text-muted-foreground"
                    >
                      데이터 없음
                    </TableCell>
                  </TableRow>
                )}
                {detail.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Input
                        className="h-6 w-12 text-xs"
                        type="number"
                        value={fmt(row.no)}
                        onChange={(e) =>
                          updateDetail(idx, { no: parseNum(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-6 min-w-[60px] text-xs"
                        value={row.unit}
                        onChange={(e) =>
                          updateDetail(idx, { unit: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-6 w-14 text-xs"
                        value={row.floor}
                        onChange={(e) =>
                          updateDetail(idx, { floor: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-6 w-18 text-xs"
                        type="number"
                        value={fmt(row.areaSqm)}
                        onChange={(e) =>
                          updateDetail(idx, { areaSqm: parseNum(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-6 w-18 text-xs"
                        type="number"
                        value={fmt(row.areaPyeong)}
                        onChange={(e) =>
                          updateDetail(idx, { areaPyeong: parseNum(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-6 w-22 text-xs"
                        type="number"
                        value={fmt(row.appraisalValue)}
                        onChange={(e) =>
                          updateDetail(idx, { appraisalValue: parseNum(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-6 w-22 text-xs"
                        type="number"
                        value={fmt(row.planPrice)}
                        onChange={(e) =>
                          updateDetail(idx, { planPrice: parseNum(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-6 w-22 text-xs"
                        type="number"
                        value={fmt(row.releaseCondition)}
                        onChange={(e) =>
                          updateDetail(idx, { releaseCondition: parseNum(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-6 w-22 text-xs"
                        type="number"
                        value={fmt(row.appraisalPricePerPyeong)}
                        onChange={(e) =>
                          updateDetail(idx, { appraisalPricePerPyeong: parseNum(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-6 w-22 text-xs"
                        type="number"
                        value={fmt(row.planPricePerPyeong)}
                        onChange={(e) =>
                          updateDetail(idx, { planPricePerPyeong: parseNum(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.status}
                        onValueChange={(v) =>
                          updateDetail(idx, {
                            status: v as CollateralDetailItem["status"],
                          })
                        }
                      >
                        <SelectTrigger className="h-6 w-20 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="분양">분양</SelectItem>
                          <SelectItem value="미분양">미분양</SelectItem>
                          <SelectItem value="계약">계약</SelectItem>
                          <SelectItem value="잔금납부">잔금납부</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-6 min-w-[60px] text-xs"
                        value={row.remarks}
                        onChange={(e) =>
                          updateDetail(idx, { remarks: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => removeDetailRow(idx)}
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
            onClick={addDetailRow}
          >
            <Plus className="mr-1.5 size-3.5" />
            행 추가
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
