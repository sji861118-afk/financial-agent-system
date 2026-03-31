"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  BarChart3,
  FileSearch,
  FolderOpen,
  MessageSquare,
  Menu,
  Building2,
  Shield,
  LogOut,
  User,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: "admin" | "user";
}

interface DailyLimit {
  allowed: boolean;
  remaining: number;
  limit: number;
}

const navItems = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/financial", label: "기업 재무현황", icon: BarChart3 },
  { href: "/appraisal", label: "감정평가서 분석", icon: FileSearch },
  { href: "/files", label: "파일 관리", icon: FolderOpen },
  { href: "/feedback", label: "피드백", icon: MessageSquare },
];

function NavLinks({ onNavigate, user }: { onNavigate?: () => void; user: AuthUser | null }) {
  const pathname = usePathname();

  const items = user?.role === "admin"
    ? [...navItems, { href: "/admin", label: "관리자", icon: Shield }]
    : navItems;

  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-indigo-500/10 text-indigo-400"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            )}
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarLogo() {
  return (
    <div className="flex items-center gap-3 px-6 py-5">
      <div className="flex size-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-indigo-600 to-blue-500">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-5 text-white">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <div>
        <h1 className="text-base font-bold text-white" style={{ fontFamily: 'var(--font-en)' }}>CF1</h1>
        <p className="text-xs text-slate-400">Credit Flow One</p>
      </div>
    </div>
  );
}

function UserPanel({ user, dailyLimit }: { user: AuthUser | null; dailyLimit: DailyLimit | null }) {
  const router = useRouter();
  const [showPwChange, setShowPwChange] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const handleChangePassword = async () => {
    if (!newPw || newPw.length < 4) return;
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
    });
    if (res.ok) {
      setShowPwChange(false);
      setCurrentPw("");
      setNewPw("");
    }
  };

  if (!user) return null;

  return (
    <div className="mt-auto border-t border-white/5 px-3 py-4">
      {/* 비밀번호 변경 */}
      {showPwChange && (
        <div className="mb-3 space-y-2 rounded-lg bg-slate-800 p-3">
          <p className="text-xs font-medium text-slate-300">비밀번호 변경</p>
          <input
            type="password"
            placeholder="현재 비밀번호"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            className="w-full rounded bg-slate-700 px-2 py-1.5 text-xs text-white placeholder-slate-500 outline-none"
          />
          <input
            type="password"
            placeholder="새 비밀번호 (4자 이상)"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
            className="w-full rounded bg-slate-700 px-2 py-1.5 text-xs text-white placeholder-slate-500 outline-none"
          />
          <div className="flex gap-1">
            <button onClick={handleChangePassword} className="flex-1 rounded bg-indigo-500 px-2 py-1 text-xs text-white hover:bg-indigo-600">변경</button>
            <button onClick={() => { setShowPwChange(false); setCurrentPw(""); setNewPw(""); }} className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white">취소</button>
          </div>
        </div>
      )}

      {/* Daily limit warning */}
      {dailyLimit && dailyLimit.limit > 0 && (
        <div className="mb-3 px-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">오늘 조회</span>
            <span className={cn(
              "font-medium",
              dailyLimit.remaining <= 5 ? "text-amber-400" : "text-slate-300"
            )}>
              {dailyLimit.limit - dailyLimit.remaining}/{dailyLimit.limit}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-700">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                dailyLimit.remaining <= 5 ? "bg-amber-400" : "bg-indigo-400"
              )}
              style={{ width: `${Math.min(100, ((dailyLimit.limit - dailyLimit.remaining) / dailyLimit.limit) * 100)}%` }}
            />
          </div>
          {dailyLimit.remaining <= 5 && dailyLimit.remaining > 0 && (
            <p className="mt-1 text-[10px] text-amber-400">잔여 {dailyLimit.remaining}건</p>
          )}
        </div>
      )}

      {/* User info */}
      <div className="flex items-center gap-3 rounded-lg px-3 py-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-slate-700">
          <User className="size-4 text-slate-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-slate-200">{user.name}</p>
          <p className="text-xs text-slate-400">
            {user.role === "admin" ? "관리자" : "사용자"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-slate-400 hover:text-white"
          onClick={() => setShowPwChange(!showPwChange)}
          title="비밀번호 변경"
        >
          <KeyRound className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-slate-400 hover:text-white"
          onClick={handleLogout}
          title="로그아웃"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [dailyLimit, setDailyLimit] = useState<DailyLimit | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setDailyLimit(data.dailyLimit);
        }
      } catch {}
    })();
  }, []);

  return (
    <aside className="hidden w-[260px] shrink-0 flex-col border-r border-white/5 bg-[#0f172a] lg:flex">
      <SidebarLogo />
      <NavLinks user={user} />
      <UserPanel user={user} dailyLimit={dailyLimit} />
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [dailyLimit, setDailyLimit] = useState<DailyLimit | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setDailyLimit(data.dailyLimit);
        }
      } catch {}
    })();
  }, []);

  return (
    <div className="flex items-center gap-3 border-b bg-[#0f172a] px-4 py-3 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <Button
          variant="ghost"
          size="icon"
          className="text-slate-300 hover:text-white"
          onClick={() => setOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <SheetContent side="left" className="w-[260px] bg-[#0f172a] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>메뉴</SheetTitle>
            <SheetDescription>사이드바 네비게이션</SheetDescription>
          </SheetHeader>
          <SidebarLogo />
          <NavLinks onNavigate={() => setOpen(false)} user={user} />
          <UserPanel user={user} dailyLimit={dailyLimit} />
        </SheetContent>
      </Sheet>
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-blue-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-white">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <span className="text-sm font-bold text-white" style={{ fontFamily: 'var(--font-en)' }}>CF1</span>
      </div>
      {user && (
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">{user.name}</span>
          {user.role === "admin" && <Badge variant="secondary" className="text-[10px]">관리자</Badge>}
        </div>
      )}
    </div>
  );
}
