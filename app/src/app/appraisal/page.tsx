'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ApplicationFormType, ReviewFinding, GenerateAppraisalResponse } from '@/types/appraisal';

const TYPE_LABELS: Record<ApplicationFormType | 'auto', string> = {
  'auto': '자동 감지',
  'apartment-pf': '아파트 PF',
  'industrial-center': '지식산업센터',
  'land-pf': '토지 PF (브릿지)',
};

export default function AppraisalPage() {
  const [appraisalFiles, setAppraisalFiles] = useState<File[]>([]);
  const [feasibilityFiles, setFeasibilityFiles] = useState<File[]>([]);
  const [propertyType, setPropertyType] = useState<ApplicationFormType | 'auto'>('auto');
  const [loading, setLoading] = useState(false);
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const [result, setResult] = useState<GenerateAppraisalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (appraisalFiles.length === 0) {
      setError('감정평가서 PDF를 1개 이상 업로드해주세요');
      return;
    }
    setLoading(true);
    setError(null);
    setFindings([]);
    setResult(null);

    const fd = new FormData();
    appraisalFiles.forEach(f => fd.append('appraisalFiles', f));
    feasibilityFiles.forEach(f => fd.append('feasibilityFiles', f));
    fd.append('propertyType', propertyType);

    try {
      const res = await fetch('/api/appraisal/generate', { method: 'POST', body: fd });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('서버 응답 파싱 실패: ' + text.slice(0, 200));
      }

      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      setResult(json);
      setFindings(json.findings ?? []);

      // 다운로드 트리거
      const bin = atob(json.excelBase64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = json.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const errorCount = findings.filter(f => f.severity === 'ERROR').length;
  const warningCount = findings.filter(f => f.severity === 'WARNING').length;
  const infoCount = findings.filter(f => f.severity === 'INFO').length;

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">감정평가서 분석 → 신청서 양식 Excel</h1>

      <Card>
        <CardHeader>
          <CardTitle>업로드</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>감정평가서 PDF (필수, 1~2개)</Label>
            <input type="file" multiple accept="application/pdf"
              onChange={e => setAppraisalFiles(Array.from(e.target.files ?? []))}
              className="mt-2 block w-full text-sm" />
            <p className="text-xs text-gray-500 mt-1">선택됨: {appraisalFiles.length}개</p>
          </div>

          <div>
            <Label>사업성평가보고서 PDF (선택, 0~2개)</Label>
            <input type="file" multiple accept="application/pdf"
              onChange={e => setFeasibilityFiles(Array.from(e.target.files ?? []))}
              className="mt-2 block w-full text-sm" />
            <p className="text-xs text-gray-500 mt-1">선택됨: {feasibilityFiles.length}개</p>
          </div>

          <div>
            <Label>물건유형</Label>
            <Select value={propertyType} onValueChange={v => setPropertyType(v as ApplicationFormType | 'auto')}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(TYPE_LABELS) as [ApplicationFormType | 'auto', string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleGenerate} disabled={loading || appraisalFiles.length === 0} className="w-full">
            {loading ? '생성 중...' : '신청서 Excel 생성'}
          </Button>

          {error && (
            <div className="rounded border border-red-300 bg-red-50 p-3 text-red-700 text-sm">{error}</div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>감수 결과</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-4 text-sm">
              <span className="bg-red-500 text-white px-2 py-1 rounded">ERROR {errorCount}</span>
              <span className="bg-orange-500 text-white px-2 py-1 rounded">WARNING {warningCount}</span>
              <span className="bg-gray-500 text-white px-2 py-1 rounded">INFO {infoCount}</span>
              <span className="text-gray-500">감지 유형: {TYPE_LABELS[result.detectedType]} (신뢰도 {(result.detectionConfidence * 100).toFixed(0)}%)</span>
            </div>
            {findings.length === 0 ? (
              <p className="text-green-600">검토할 사항 없음</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-auto">
                {findings.map((f, i) => (
                  <div key={i} className={`p-2 border-l-4 text-sm ${
                    f.severity === 'ERROR' ? 'border-red-500 bg-red-50'
                    : f.severity === 'WARNING' ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-400 bg-gray-50'
                  }`}>
                    <div className="font-medium">[{f.perspective === 'appraiser' ? '감정평가사' : '심사역'}] {f.category} — {f.message}</div>
                    {f.detail && <div className="text-xs text-gray-600 mt-1">{f.detail}</div>}
                    {f.suggestedAction && <div className="text-xs text-blue-700 mt-1">💡 {f.suggestedAction}</div>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
