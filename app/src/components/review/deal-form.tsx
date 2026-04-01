"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FinancialSnapshotTable } from "./financial-snapshot-table";
import { Plus, Trash2, Search, Loader2, X } from "lucide-react";
import type {
  ReviewDeal,
  FinancialSnapshot,
  FinancialRow,
  ProductMajorType,
} from "@/types/review";

// ─── DART 회사 검색 + 재무 조회 인라인 ───────────────────────

function DartCompanyLookup({
  onAdd,
}: {
  onAdd: (snapshot: FinancialSnapshot) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { corpCode: string; corpName: string }[]
  >([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/dart/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: query }),
      });
      const data = await res.json();
      setResults(data.results?.slice(0, 10) || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const selectCompany = async (corpCode: string, corpName: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/dart/financial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpCode, years: ["2024", "2023", "2022"] }),
      });
      const data = await res.json();

      // DART 응답을 FinancialSnapshot으로 변환
      const rows: FinancialRow[] = [];
      if (data.financials) {
        for (const f of data.financials) {
          rows.push({
            결산년월: `'${f.year?.slice(2)} 년`,
            자산총계: Math.round((f.totalAssets || 0) / 1e8),
            부채총계: Math.round((f.totalLiabilities || 0) / 1e8),
            자본총계: Math.round((f.totalEquity || 0) / 1e8),
            매출액: Math.round((f.revenue || 0) / 1e8),
            영업이익: Math.round((f.operatingProfit || 0) / 1e8),
            당기순이익: Math.round((f.netIncome || 0) / 1e8),
          });
        }
      }

      onAdd({
        회사명: corpName,
        역할: "차주",
        기준: "연결",
        데이터: rows,
      });

      setQuery("");
      setResults([]);
    } catch {
      // DART 조회 실패 시 빈 스냅샷이라도 추가
      onAdd({
        회사명: corpName,
        역할: "차주",
        기준: "연결",
        데이터: [],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="회사명으로 DART 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          className="bg-slate-800 text-sm"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={search}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
        </Button>
      </div>
      {results.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-slate-800">
          {results.map((r) => (
            <button
              key={r.corpCode}
              onClick={() => selectCompany(r.corpCode, r.corpName)}
              className="w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-white/5"
            >
              {r.corpName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 수동 재무 입력 행 ──────────────────────────────────────

function ManualFinancialRow({
  row,
  onChange,
  onRemove,
}: {
  row: FinancialRow;
  onChange: (r: FinancialRow) => void;
  onRemove: () => void;
}) {
  const numField = (
    field: keyof Omit<FinancialRow, "결산년월">,
    placeholder: string
  ) => (
    <Input
      type="number"
      placeholder={placeholder}
      value={row[field] || ""}
      onChange={(e) =>
        onChange({ ...row, [field]: parseFloat(e.target.value) || 0 })
      }
      className="h-7 bg-slate-800 text-xs"
    />
  );

  return (
    <tr className="border-t border-white/5">
      <td className="px-1 py-1">
        <Input
          placeholder="'24 년"
          value={row.결산년월}
          onChange={(e) => onChange({ ...row, 결산년월: e.target.value })}
          className="h-7 w-20 bg-slate-800 text-xs"
        />
      </td>
      <td className="px-1 py-1">{numField("자산총계", "자산")}</td>
      <td className="px-1 py-1">{numField("부채총계", "부채")}</td>
      <td className="px-1 py-1">{numField("자본총계", "자본")}</td>
      <td className="px-1 py-1">{numField("매출액", "매출")}</td>
      <td className="px-1 py-1">{numField("영업이익", "영업이익")}</td>
      <td className="px-1 py-1">{numField("당기순이익", "순이익")}</td>
      <td className="px-1 py-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={onRemove}
        >
          <Trash2 className="size-3 text-red-400" />
        </Button>
      </td>
    </tr>
  );
}

// ─── 메인 폼 ────────────────────────────────────────────────

interface DealFormProps {
  initialData?: Partial<ReviewDeal>;
  mode: "create" | "edit";
}

export function DealForm({ initialData, mode }: DealFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // 폼 상태
  const [접수일, set접수일] = useState(
    initialData?.접수일 || new Date().toISOString().slice(0, 10)
  );
  const [구분, set구분] = useState(initialData?.구분 || "");
  const [당행접수자, set당행접수자] = useState(initialData?.당행접수자 || "");
  const [소개처, set소개처] = useState(initialData?.소개처 || "");
  const [차주, set차주] = useState(initialData?.차주 || "");
  const [주소, set주소] = useState(initialData?.주소 || "");
  const [금리수수료기간, set금리수수료기간] = useState(
    initialData?.금리수수료기간 || ""
  );
  const [모집금액, set모집금액] = useState(initialData?.모집금액 || "");
  const [자금용도, set자금용도] = useState(initialData?.자금용도 || "");
  const [주요채권보전, set주요채권보전] = useState(
    initialData?.주요채권보전 || ""
  );
  const [대출개요, set대출개요] = useState(initialData?.대출개요 || "");

  // 분류
  const [productType, setProductType] = useState(
    initialData?.productType || ""
  );
  const [productSubtype, setProductSubtype] = useState(
    initialData?.productSubtype || ""
  );
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [tagInput, setTagInput] = useState("");

  // 재무현황
  const [재무현황, set재무현황] = useState<FinancialSnapshot[]>(
    initialData?.재무현황 || []
  );

  // 자동 분류 호출
  const autoClassify = useCallback(async () => {
    try {
      const res = await fetch("/api/review/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 구분, 주소, 자금용도, 대출개요 }),
      });
      const data = await res.json();
      if (data.productType) setProductType(data.productType);
      if (data.productSubtype) setProductSubtype(data.productSubtype);
      if (data.suggestedTags?.length) {
        setTags((prev) => [
          ...new Set([...prev, ...data.suggestedTags]),
        ]);
      }
    } catch {}
  }, [구분, 주소, 자금용도, 대출개요]);

  // 태그 추가
  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };

  // 재무 스냅샷 추가 (DART)
  const addFinancialSnapshot = (snapshot: FinancialSnapshot) => {
    set재무현황([...재무현황, snapshot]);
  };

  // 재무 스냅샷 수동 추가
  const addManualSnapshot = () => {
    set재무현황([
      ...재무현황,
      {
        회사명: "",
        역할: "차주",
        기준: "연결",
        데이터: [
          {
            결산년월: "",
            자산총계: 0,
            부채총계: 0,
            자본총계: 0,
            매출액: 0,
            영업이익: 0,
            당기순이익: 0,
          },
        ],
      },
    ]);
  };

  // 저장
  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        접수일,
        구분,
        당행접수자,
        소개처,
        차주,
        주소,
        금리수수료기간,
        모집금액,
        자금용도,
        주요채권보전,
        대출개요,
        productType,
        productSubtype,
        tags,
        재무현황,
        재무지표: [],
        attachments: [],
      };

      if (mode === "create") {
        const res = await fetch("/api/review/deals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.id) {
          router.push(`/review/${data.id}`);
        }
      } else if (initialData?.id) {
        await fetch(`/api/review/deals/${initialData.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        router.push(`/review/${initialData.id}`);
      }
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 기본정보 */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200">기본정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label className="text-xs text-slate-400">접수일</Label>
              <Input
                type="date"
                value={접수일}
                onChange={(e) => set접수일(e.target.value)}
                className="bg-slate-800 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-400">당행접수자</Label>
              <Input
                value={당행접수자}
                onChange={(e) => set당행접수자(e.target.value)}
                placeholder="차영섭 상무"
                className="bg-slate-800 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-400">소개처</Label>
              <Input
                value={소개처}
                onChange={(e) => set소개처(e.target.value)}
                placeholder="신한은행 김병주 부장"
                className="bg-slate-800 text-sm"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-slate-400">구분 (대출 건명)</Label>
            <Input
              value={구분}
              onChange={(e) => set구분(e.target.value)}
              onBlur={autoClassify}
              placeholder="화성 석포리 물류센터 담보대출 리파이낸싱"
              className="bg-slate-800 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs text-slate-400">차주</Label>
              <Input
                value={차주}
                onChange={(e) => set차주(e.target.value)}
                placeholder="이지스일반사모부동산투자신탁제451호"
                className="bg-slate-800 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-400">주소 / 상세</Label>
              <Input
                value={주소}
                onChange={(e) => set주소(e.target.value)}
                placeholder="경기 화성시 장안면 석포리 147-12번지 일원"
                className="bg-slate-800 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 주요조건 */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200">주요조건</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs text-slate-400">
                금리 / 수수료 / 기간
              </Label>
              <Input
                value={금리수수료기간}
                onChange={(e) => set금리수수료기간(e.target.value)}
                placeholder="6.0%(참여수수료 1.0%) / 24개월"
                className="bg-slate-800 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-400">모집금액</Label>
              <Input
                value={모집금액}
                onChange={(e) => set모집금액(e.target.value)}
                placeholder="총 285억원"
                className="bg-slate-800 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs text-slate-400">자금용도</Label>
              <Input
                value={자금용도}
                onChange={(e) => set자금용도(e.target.value)}
                placeholder="기 대출금 상환, 금융수수료, 각종 비용 등"
                className="bg-slate-800 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-400">주요 채권보전</Label>
              <Input
                value={주요채권보전}
                onChange={(e) => set주요채권보전(e.target.value)}
                placeholder="1순위 근저당권"
                className="bg-slate-800 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 분류 + 태그 */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200">분류 / 태그</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label className="text-xs text-slate-400">상품 대분류</Label>
              <select
                value={productType}
                onChange={(e) =>
                  setProductType(e.target.value as ProductMajorType)
                }
                className="w-full rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              >
                <option value="">자동분류</option>
                <option value="PF">PF</option>
                <option value="브릿지">브릿지</option>
                <option value="기업신용">기업신용</option>
                <option value="사모사채">사모사채</option>
                <option value="담보대출">담보대출</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-slate-400">소분류</Label>
              <Input
                value={productSubtype}
                onChange={(e) => setProductSubtype(e.target.value)}
                placeholder="자동분류됨"
                className="bg-slate-800 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-400">태그 추가</Label>
              <div className="flex gap-1">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTag()}
                  placeholder="태그 입력"
                  className="bg-slate-800 text-sm"
                />
                <Button variant="outline" size="sm" onClick={addTag}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="cursor-pointer border-indigo-500/30 text-xs text-indigo-300 hover:bg-red-500/10"
                  onClick={() => setTags(tags.filter((t) => t !== tag))}
                >
                  {tag} <X className="ml-1 size-3" />
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 대출개요 */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200">대출개요</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={대출개요}
            onChange={(e) => set대출개요(e.target.value)}
            placeholder="본건은 차주인 ..."
            rows={5}
            className="bg-slate-800 text-sm"
          />
        </CardContent>
      </Card>

      {/* 재무현황 */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base text-slate-200">
              재무현황
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={addManualSnapshot}
              >
                <Plus className="mr-1 size-4" />
                수동 추가
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <DartCompanyLookup onAdd={addFinancialSnapshot} />

          {재무현황.map((snapshot, idx) => (
            <div key={idx} className="relative">
              <button
                onClick={() =>
                  set재무현황(재무현황.filter((_, i) => i !== idx))
                }
                className="absolute -top-1 right-0 rounded p-1 text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="size-3" />
              </button>

              {/* 회사명/역할 편집 */}
              <div className="mb-2 flex gap-2">
                <Input
                  value={snapshot.회사명}
                  onChange={(e) => {
                    const updated = [...재무현황];
                    updated[idx] = { ...updated[idx], 회사명: e.target.value };
                    set재무현황(updated);
                  }}
                  placeholder="회사명"
                  className="h-7 w-40 bg-slate-800 text-xs"
                />
                <select
                  value={snapshot.역할}
                  onChange={(e) => {
                    const updated = [...재무현황];
                    updated[idx] = { ...updated[idx], 역할: e.target.value };
                    set재무현황(updated);
                  }}
                  className="h-7 rounded border border-white/10 bg-slate-800 px-2 text-xs text-slate-300"
                >
                  <option value="차주">차주</option>
                  <option value="시공사">시공사</option>
                  <option value="시행사">시행사</option>
                  <option value="연대보증인">연대보증인</option>
                  <option value="관계사">관계사</option>
                </select>
                <select
                  value={snapshot.기준}
                  onChange={(e) => {
                    const updated = [...재무현황];
                    updated[idx] = { ...updated[idx], 기준: e.target.value };
                    set재무현황(updated);
                  }}
                  className="h-7 rounded border border-white/10 bg-slate-800 px-2 text-xs text-slate-300"
                >
                  <option value="연결">연결</option>
                  <option value="개별">개별</option>
                </select>
              </div>

              {snapshot.데이터.length > 0 ? (
                <FinancialSnapshotTable snapshot={snapshot} />
              ) : (
                <p className="text-xs text-slate-500">
                  재무 데이터 없음 (DART 조회 결과가 없거나 수동 입력 필요)
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 저장 버튼 */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => router.push("/review")}
        >
          취소
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
          {mode === "create" ? "접수 등록" : "수정 저장"}
        </Button>
      </div>
    </div>
  );
}
