"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Users, BarChart3, ScrollText, Plus, RotateCcw, UserX, UserCheck,
  TrendingUp, Eye, Download, LogIn, UserPlus,
} from "lucide-react";
import { toast } from "sonner";

interface UserRecord {
  id: string;
  username: string;
  name: string;
  role: "admin" | "user";
  active: boolean;
  dailyLimit: number;
  createdAt: string;
}

interface UsageStats {
  totalQueries: number;
  totalDownloads: number;
  totalLogins: number;
  activeUsers: number;
  userStats: { username: string; queries: number; downloads: number; logins: number }[];
  dailyTrend: { date: string; count: number }[];
}

interface ActivityLogEntry {
  id: string;
  userId: string;
  username: string;
  action: string;
  detail: string;
  createdAt: string;
}

function formatDate(s: string) {
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function actionLabel(action: string) {
  switch (action) {
    case "login": return "로그인";
    case "logout": return "로그아웃";
    case "query": return "조회";
    case "download": return "다운로드";
    case "admin_action": return "관리";
    default: return action;
  }
}

export default function AdminPage() {
  const [tab, setTab] = useState("users");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">관리자</h1>
        <p className="text-sm text-muted-foreground">사용자 관리 및 시스템 사용 현황</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="users"><Users className="mr-1.5 size-4" />사용자 관리</TabsTrigger>
          <TabsTrigger value="stats"><BarChart3 className="mr-1.5 size-4" />사용 통계</TabsTrigger>
          <TabsTrigger value="logs"><ScrollText className="mr-1.5 size-4" />활동 로그</TabsTrigger>
        </TabsList>

        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="stats"><StatsTab /></TabsContent>
        <TabsContent value="logs"><LogsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Users Tab ───────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkIds, setBulkIds] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", name: "", password: "", role: "user" as const, dailyLimit: 30 });
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
  const [resetPw, setResetPw] = useState("");

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async () => {
    if (!newUser.username || !newUser.name || !newUser.password) {
      toast.error("모든 필드를 입력하세요.");
      return;
    }
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error); return; }
    toast.success(`${newUser.name} 계정이 생성되었습니다.`);
    setShowCreate(false);
    setNewUser({ username: "", name: "", password: "", role: "user", dailyLimit: 30 });
    fetchUsers();
  };

  const toggleActive = async (user: UserRecord) => {
    await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, active: !user.active }),
    });
    toast.success(`${user.name} 계정이 ${user.active ? "비활성" : "활성"}화되었습니다.`);
    fetchUsers();
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !resetPw || resetPw.length < 4) {
      toast.error("4자 이상의 비밀번호를 입력하세요.");
      return;
    }
    const res = await fetch("/api/admin/users/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: resetTarget.id, newPassword: resetPw }),
    });
    if (res.ok) {
      toast.success(`${resetTarget.name}의 비밀번호가 초기화되었습니다.`);
      setResetTarget(null);
      setResetPw("");
    }
  };

  const handleBulkCreate = async () => {
    const ids = bulkIds.split(/[\n,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!ids.length) { toast.error("아이디를 입력하세요."); return; }
    const unique = [...new Set(ids)];
    setBulkLoading(true);
    let success = 0;
    let failed = 0;
    for (const id of unique) {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: id, name: id, password: "9999", role: "user", dailyLimit: 30 }),
      });
      if (res.ok) success++;
      else failed++;
    }
    setBulkLoading(false);
    toast.success(`${success}명 등록 완료${failed > 0 ? `, ${failed}명 실패 (중복 등)` : ""}`);
    setShowBulk(false);
    setBulkIds("");
    fetchUsers();
  };

  const handleDelete = async (user: UserRecord) => {
    if (!confirm(`${user.name} 계정을 삭제하시겠습니까?`)) return;
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error); return; }
    toast.success("계정이 삭제되었습니다.");
    fetchUsers();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>사용자 목록</CardTitle>
          <CardDescription>총 {users.length}명의 사용자</CardDescription>
        </div>
        <div className="flex gap-2">
        <Dialog open={showBulk} onOpenChange={setShowBulk}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><UserPlus className="mr-1.5 size-4" />대량 등록</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>대량 사용자 등록</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">아이디를 줄바꿈, 쉼표, 또는 공백으로 구분하여 입력하세요. 비밀번호는 일괄 <strong>9999</strong>로 설정됩니다.</p>
              <textarea
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={"hong\nkim\nlee\npark"}
                value={bulkIds}
                onChange={(e) => setBulkIds(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                입력된 아이디: {bulkIds.split(/[\n,\s]+/).filter(Boolean).length}명
              </p>
              <Button onClick={handleBulkCreate} className="w-full" disabled={bulkLoading}>
                {bulkLoading ? "등록 중..." : "일괄 등록"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1.5 size-4" />사용자 추가</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>새 사용자 추가</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>아이디</Label>
                <Input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} placeholder="아이디" />
              </div>
              <div className="space-y-2">
                <Label>이름</Label>
                <Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="이름" />
              </div>
              <div className="space-y-2">
                <Label>비밀번호</Label>
                <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="비밀번호 (4자 이상)" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>역할</Label>
                  <Select value={newUser.role} onValueChange={(v: "admin" | "user") => setNewUser({ ...newUser, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">일반사용자</SelectItem>
                      <SelectItem value="admin">관리자</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>일일 조회 제한</Label>
                  <Input type="number" value={newUser.dailyLimit} onChange={(e) => setNewUser({ ...newUser, dailyLimit: Number(e.target.value) })} />
                </div>
              </div>
              <Button onClick={handleCreate} className="w-full">생성</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>아이디</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>역할</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>일일 제한</TableHead>
              <TableHead>생성일</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">불러오는 중...</TableCell></TableRow>
            ) : users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.username}</TableCell>
                <TableCell>{user.name}</TableCell>
                <TableCell>
                  <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                    {user.role === "admin" ? "관리자" : "사용자"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.active ? "default" : "destructive"}>
                    {user.active ? "활성" : "비활성"}
                  </Badge>
                </TableCell>
                <TableCell>{user.dailyLimit === 0 ? "무제한" : `${user.dailyLimit}건`}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(user)} title={user.active ? "비활성화" : "활성화"}>
                      {user.active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                    </Button>
                    <Dialog open={resetTarget?.id === user.id} onOpenChange={(open) => { if (!open) setResetTarget(null); }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={() => setResetTarget(user)} title="비밀번호 초기화">
                          <RotateCcw className="size-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>{user.name} 비밀번호 초기화</DialogTitle></DialogHeader>
                        <div className="space-y-4">
                          <Input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="새 비밀번호 (4자 이상)" />
                          <Button onClick={handleResetPassword} className="w-full">초기화</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(user)} title="삭제" className="text-red-500 hover:text-red-700">
                      <UserX className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Stats Tab ───────────────────────────────────────────────

function StatsTab() {
  const [period, setPeriod] = useState<"7d" | "30d" | "all">("7d");
  const [stats, setStats] = useState<UsageStats | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/stats?period=${period}`);
      if (res.ok) setStats(await res.json());
    })();
  }, [period]);

  const periodLabel = { "7d": "최근 7일", "30d": "최근 30일", all: "전체" };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["7d", "30d", "all"] as const).map((p) => (
          <Button key={p} variant={period === p ? "default" : "outline"} size="sm" onClick={() => setPeriod(p)}>
            {periodLabel[p]}
          </Button>
        ))}
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard icon={Eye} label="총 조회" value={stats.totalQueries} color="text-indigo-500" bg="bg-indigo-50" />
            <StatCard icon={Download} label="다운로드" value={stats.totalDownloads} color="text-emerald-500" bg="bg-emerald-50" />
            <StatCard icon={LogIn} label="로그인" value={stats.totalLogins} color="text-amber-500" bg="bg-amber-50" />
            <StatCard icon={Users} label="활성 사용자" value={stats.activeUsers} color="text-rose-500" bg="bg-rose-50" />
          </div>

          {/* Daily Trend */}
          {stats.dailyTrend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">일별 조회 추세</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-40 items-end gap-1">
                  {stats.dailyTrend.map((d) => {
                    const max = Math.max(...stats.dailyTrend.map((t) => t.count), 1);
                    const height = (d.count / max) * 100;
                    return (
                      <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-xs text-muted-foreground">{d.count}</span>
                        <div
                          className="w-full rounded-t bg-indigo-400"
                          style={{ height: `${Math.max(height, 4)}%` }}
                        />
                        <span className="text-[10px] text-muted-foreground">{d.date.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* User Rankings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">사용자별 사용량</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>순위</TableHead>
                    <TableHead>사용자</TableHead>
                    <TableHead className="text-right">조회</TableHead>
                    <TableHead className="text-right">다운로드</TableHead>
                    <TableHead className="text-right">로그인</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.userStats.map((u, i) => (
                    <TableRow key={u.username}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{u.username}</TableCell>
                      <TableCell className="text-right">{u.queries}</TableCell>
                      <TableCell className="text-right">{u.downloads}</TableCell>
                      <TableCell className="text-right">{u.logins}</TableCell>
                    </TableRow>
                  ))}
                  {stats.userStats.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">데이터가 없습니다.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, bg }: { icon: any; label: string; value: number; color: string; bg: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className={`flex size-11 items-center justify-center rounded-lg ${bg}`}>
          <Icon className={`size-5 ${color}`} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value.toLocaleString()}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Logs Tab ────────────────────────────────────────────────

function LogsTab() {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams({ limit: "200" });
      if (filter) params.set("action", filter);
      const res = await fetch(`/api/admin/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
      }
      setLoading(false);
    })();
  }, [filter]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>활동 로그</CardTitle>
          <CardDescription>최근 200건의 활동 기록</CardDescription>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-32"><SelectValue placeholder="전체" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="login">로그인</SelectItem>
            <SelectItem value="query">조회</SelectItem>
            <SelectItem value="download">다운로드</SelectItem>
            <SelectItem value="admin_action">관리</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>시간</TableHead>
              <TableHead>사용자</TableHead>
              <TableHead>활동</TableHead>
              <TableHead>상세</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center">불러오는 중...</TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">로그가 없습니다.</TableCell></TableRow>
            ) : logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-muted-foreground whitespace-nowrap">{formatDate(log.createdAt)}</TableCell>
                <TableCell className="font-medium">{log.username}</TableCell>
                <TableCell>
                  <Badge variant="outline">{actionLabel(log.action)}</Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate">{log.detail}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
