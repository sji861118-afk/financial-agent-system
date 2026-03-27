"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar, MobileNav } from "@/components/sidebar-nav";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (isLoginPage) { setChecked(true); return; }
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.replace("/login");
          return;
        }
      } catch {
        router.replace("/login");
        return;
      }
      setChecked(true);
    })();
  }, [isLoginPage, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="size-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileNav />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </>
  );
}
