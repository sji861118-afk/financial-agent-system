import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthLayout } from "@/components/auth-layout";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "대출 자동화 시스템",
  description: "금융 대출 신청서 작성 자동화 SaaS",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={`${inter.variable} h-full antialiased`}>
      <body className="flex h-full min-h-screen bg-gray-50 font-sans">
        <AuthLayout>{children}</AuthLayout>
        <Toaster />
      </body>
    </html>
  );
}
