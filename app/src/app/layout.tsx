import type { Metadata } from "next";
import { Noto_Sans_KR, DM_Sans } from "next/font/google";
import "./globals.css";
import { AuthLayout } from "@/components/auth-layout";
import { Toaster } from "@/components/ui/sonner";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-en",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CF1 — 여신심사 자동화 플랫폼",
  description: "DART 전자공시 연동, AI 재무분석, 감정평가서 자동추출",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={`${notoSansKR.variable} ${dmSans.variable} h-full antialiased`}>
      <body className="flex h-full min-h-screen bg-background font-sans text-foreground">
        <AuthLayout>{children}</AuthLayout>
        <Toaster />
      </body>
    </html>
  );
}
