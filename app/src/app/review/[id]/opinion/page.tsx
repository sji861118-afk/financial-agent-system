"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DealStatusBadge } from "@/components/review/deal-status-badge";
import type { ReviewDeal, Department, ProgressStatus } from "@/types/review";

const DEPARTMENTS: Department[] = ["영업점", "영추부", "심사부"];
const PROGRESS_OPTIONS: ProgressStatus[] = ["진행", "보류", "반려"];

function BulletEditor({
  items,
  onChange,
  label,
  colorClass,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  label: string;
  colorClass: string;
}) {
  const addItem = () => onChange([...items, ""]);
  const removeItem = (idx: number) =>
    onChange(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, val: string) => {
    const updated = [...items];
    updated[idx] = val;
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className={`text-xs font-medium ${colorClass}`}>{label}</Label>
        <Button variant="ghost" size="sm" onClick={addItem} className="h-6">
          <Plus className="mr-1 size-3" />
          추가
        </Button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <span className={`mt-2 text-sm ${colorClass}`}>□</span>
          <Textarea
            value={item}
            onChange={(e) => updateItem(i, e.target.value)}
            placeholder={`${label} 항목을 입력하세요...`}
            rows={2}
            className="flex-1 bg-slate-800 text-sm"
          />
          <Button
            variant="ghost"
            size="icon"
            className="mt-1 size-7 shrink-0"
            onClick={() => removeItem(i)}
          >
            <Trash2 className="size-3 text-red-400" />
          </Button>
        </div>
      ))}
      {items.length === 0 && (
        <p className="text-xs text-slate-500">
          항목이 없습니다. "추가" 버튼을 클릭하세요.
        </p>
      )}
    </div>
  );
}

export default function OpinionPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.id as string;

  const [deal, setDeal] = useState<ReviewDeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 폼 상태
  const [department, setDepartment] = useState<Department>("영업점");
  const [authorName, setAuthorName] = useState("");
  const [장점, set장점] = useState<string[]>([""]);
  const [단점, set단점] = useState<string[]>([""]);
  const [진행여부, set진행여부] = useState<ProgressStatus>("진행");
  const [보완사항, set보완사항] = useState("");
  const [컨택자, set컨택자] = useState("");

  useEffect(() => {
    if (!dealId) return;
    (async () => {
      try {
        const res = await fetch(`/api/review/deals/${dealId}`);
        const data = await res.json();
        setDeal(data.deal);
      } catch {}
      setLoading(false);
    })();
  }, [dealId]);

  const handleSubmit = async () => {
    // 빈 항목 필터
    const filteredPros = 장점.filter((s) => s.trim());
    const filteredCons = 단점.filter((s) => s.trim());

    setSaving(true);
    try {
      const res = await fetch("/api/review/opinions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          authorName,
          department,
          장점: filteredPros,
          단점: filteredCons,
          진행여부,
          보완사항,
          컨택자: department === "영업점" ? 컨택자 : "",
        }),
      });
      if (res.ok) {
        router.push(`/review/${dealId}`);
      }
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="py-20 text-center text-sm text-slate-400">
        건을 찾을 수 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/review/${dealId}`)}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold text-white">검토의견 작성</h1>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>{deal.구분}</span>
            <DealStatusBadge status={deal.status} />
          </div>
        </div>
      </div>

      {/* 작성자 정보 */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200">작성자 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label className="text-xs text-slate-400">부서</Label>
              <div className="mt-1 flex gap-2">
                {DEPARTMENTS.map((dept) => (
                  <Button
                    key={dept}
                    variant={department === dept ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDepartment(dept)}
                  >
                    {dept}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-400">작성자명</Label>
              <Input
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="홍길동 부장"
                className="bg-slate-800 text-sm"
              />
            </div>
            {department === "영업점" && (
              <div>
                <Label className="text-xs text-slate-400">컨택자</Label>
                <Input
                  value={컨택자}
                  onChange={(e) => set컨택자(e.target.value)}
                  placeholder="전경호 부장"
                  className="bg-slate-800 text-sm"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 장점 */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardContent className="pt-6">
          <BulletEditor
            items={장점}
            onChange={set장점}
            label="장점"
            colorClass="text-emerald-400"
          />
        </CardContent>
      </Card>

      {/* 단점 */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardContent className="pt-6">
          <BulletEditor
            items={단점}
            onChange={set단점}
            label="단점"
            colorClass="text-red-400"
          />
        </CardContent>
      </Card>

      {/* 진행여부 + 보완사항 */}
      <Card className="border-white/10 bg-slate-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200">
            진행여부 / 보완사항
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-slate-400">진행여부</Label>
            <div className="mt-1 flex gap-2">
              {PROGRESS_OPTIONS.map((opt) => (
                <Button
                  key={opt}
                  variant={진행여부 === opt ? "default" : "outline"}
                  size="sm"
                  onClick={() => set진행여부(opt)}
                  className={
                    진행여부 === opt
                      ? opt === "진행"
                        ? "bg-green-600 hover:bg-green-700"
                        : opt === "반려"
                          ? "bg-red-600 hover:bg-red-700"
                          : "bg-amber-600 hover:bg-amber-700"
                      : ""
                  }
                >
                  {opt}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-400">보완사항</Label>
            <Textarea
              value={보완사항}
              onChange={(e) => set보완사항(e.target.value)}
              placeholder="□ 보완 필요 사항을 입력하세요"
              rows={3}
              className="bg-slate-800 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* 저장 */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => router.push(`/review/${dealId}`)}
        >
          취소
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
          의견 제출
        </Button>
      </div>
    </div>
  );
}
