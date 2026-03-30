"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppraisalCase, ComparativeCase } from "@/types/appraisal";

interface ComparativeTabProps {
  data: AppraisalCase;
  onUpdate: (patch: Partial<AppraisalCase>) => void;
}

export default function ComparativeTab({ data, onUpdate }: ComparativeTabProps) {
  const updateComparative = (globalIndex: number, patch: Partial<ComparativeCase>) => {
    const newList = [...data.comparatives];
    newList[globalIndex] = { ...newList[globalIndex], ...patch };
    onUpdate({ comparatives: newList });
  };

  const addComparative = (type: '거래' | '평가') => {
    const existing = data.comparatives.filter((c) => c.type === type);
    const label =
      type === '거래'
        ? `거래${String.fromCharCode(65 + existing.length)}` // A, B, C...
        : `평가${existing.length + 1}`; // 1, 2, 3...
    const empty: ComparativeCase = {
      type,
      label,
      address: '',
      buildingName: '',
      unit: '',
      areaSqm: 0,
      areaPyeong: 0,
      usage: '',
      price: 0,
      pricePerPyeong: 0,
      baseDate: '',
      purpose: '',
      source: '',
    };
    onUpdate({ comparatives: [...data.comparatives, empty] });
  };

  const removeComparative = (globalIndex: number) => {
    onUpdate({ comparatives: data.comparatives.filter((_, i) => i !== globalIndex) });
  };

  // Build list with global indices for each type
  const transactionItems = data.comparatives
    .map((c, i) => ({ ...c, _idx: i }))
    .filter((c) => c.type === '거래');

  const appraisalItems = data.comparatives
    .map((c, i) => ({ ...c, _idx: i }))
    .filter((c) => c.type === '평가');

  return (
    <div className="space-y-6">
      {/* Card 1: 거래사례 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">거래사례</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => addComparative('거래')}
          >
            <Plus className="mr-1.5 size-3.5" />
            거래사례 추가
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[60px]">구분</TableHead>
                <TableHead className="min-w-[160px]">소재지</TableHead>
                <TableHead className="min-w-[120px]">건물명</TableHead>
                <TableHead className="min-w-[80px]">호수</TableHead>
                <TableHead className="min-w-[90px]">면적(평)</TableHead>
                <TableHead className="min-w-[100px]">금액</TableHead>
                <TableHead className="min-w-[100px]">평단가</TableHead>
                <TableHead className="min-w-[110px]">거래일</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactionItems.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    거래사례가 없습니다. 추가 버튼을 눌러 입력하세요.
                  </TableCell>
                </TableRow>
              ) : (
                transactionItems.map((item) => (
                  <TableRow key={item._idx}>
                    <TableCell className="p-1">
                      <Input
                        value={item.label}
                        onChange={(e) =>
                          updateComparative(item._idx, { label: e.target.value })
                        }
                        className="h-8 min-w-0 text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        value={item.address}
                        onChange={(e) =>
                          updateComparative(item._idx, { address: e.target.value })
                        }
                        className="h-8 min-w-0 text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        value={item.buildingName}
                        onChange={(e) =>
                          updateComparative(item._idx, { buildingName: e.target.value })
                        }
                        className="h-8 min-w-0 text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        value={item.unit}
                        onChange={(e) =>
                          updateComparative(item._idx, { unit: e.target.value })
                        }
                        className="h-8 min-w-0 text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        type="number"
                        value={item.areaPyeong || ''}
                        onChange={(e) =>
                          updateComparative(item._idx, {
                            areaPyeong: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8 min-w-0 text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        type="number"
                        value={item.price || ''}
                        onChange={(e) =>
                          updateComparative(item._idx, {
                            price: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8 min-w-0 text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        type="number"
                        value={item.pricePerPyeong || ''}
                        onChange={(e) =>
                          updateComparative(item._idx, {
                            pricePerPyeong: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8 min-w-0 text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        value={item.baseDate}
                        onChange={(e) =>
                          updateComparative(item._idx, { baseDate: e.target.value })
                        }
                        className="h-8 min-w-0 text-sm"
                        placeholder="YYYY-MM-DD"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => removeComparative(item._idx)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Card 2: 평가사례 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">평가사례</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => addComparative('평가')}
          >
            <Plus className="mr-1.5 size-3.5" />
            평가사례 추가
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[60px]">구분</TableHead>
                <TableHead className="min-w-[160px]">소재지</TableHead>
                <TableHead className="min-w-[120px]">건물명</TableHead>
                <TableHead className="min-w-[80px]">호수</TableHead>
                <TableHead className="min-w-[90px]">면적(평)</TableHead>
                <TableHead className="min-w-[100px]">감정가</TableHead>
                <TableHead className="min-w-[100px]">평단가</TableHead>
                <TableHead className="min-w-[110px]">기준시점</TableHead>
                <TableHead className="min-w-[120px]">평가목적</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {appraisalItems.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    평가사례가 없습니다. 추가 버튼을 눌러 입력하세요.
                  </TableCell>
                </TableRow>
              ) : (
                appraisalItems.map((item) => (
                  <TableRow key={item._idx}>
                    <TableCell className="p-1">
                      <Input
                        value={item.label}
                        onChange={(e) =>
                          updateComparative(item._idx, { label: e.target.value })
                        }
                        className="h-8 min-w-0 text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        value={item.address}
                        onChange={(e) =>
                          updateComparative(item._idx, { address: e.target.value })
                        }
                        className="h-8 min-w-0 text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        value={item.buildingName}
                        onChange={(e) =>
                          updateComparative(item._idx, { buildingName: e.target.value })
                        }
                        className="h-8 min-w-0 text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        value={item.unit}
                        onChange={(e) =>
                          updateComparative(item._idx, { unit: e.target.value })
                        }
                        className="h-8 min-w-0 text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        type="number"
                        value={item.areaPyeong || ''}
                        onChange={(e) =>
                          updateComparative(item._idx, {
                            areaPyeong: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8 min-w-0 text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        type="number"
                        value={item.price || ''}
                        onChange={(e) =>
                          updateComparative(item._idx, {
                            price: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8 min-w-0 text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        type="number"
                        value={item.pricePerPyeong || ''}
                        onChange={(e) =>
                          updateComparative(item._idx, {
                            pricePerPyeong: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8 min-w-0 text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        value={item.baseDate}
                        onChange={(e) =>
                          updateComparative(item._idx, { baseDate: e.target.value })
                        }
                        className="h-8 min-w-0 text-sm"
                        placeholder="YYYY-MM-DD"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        value={item.purpose}
                        onChange={(e) =>
                          updateComparative(item._idx, { purpose: e.target.value })
                        }
                        className="h-8 min-w-0 text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => removeComparative(item._idx)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
