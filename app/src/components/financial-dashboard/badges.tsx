import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function GradeBadge({ grade }: { grade: string }) {
  const colorMap: Record<string, string> = {
    AAA: "bg-emerald-100 text-emerald-700 border-emerald-300",
    AA: "bg-emerald-100 text-emerald-700 border-emerald-300",
    A: "bg-emerald-50 text-emerald-600 border-emerald-200",
    BBB: "bg-blue-100 text-blue-700 border-blue-300",
    BB: "bg-blue-50 text-blue-600 border-blue-200",
    B: "bg-amber-100 text-amber-700 border-amber-300",
    CCC: "bg-amber-100 text-amber-700 border-amber-300",
    CC: "bg-orange-100 text-orange-700 border-orange-300",
    C: "bg-red-100 text-red-700 border-red-300",
    D: "bg-red-200 text-red-800 border-red-400",
  };
  const fontSize = grade.length >= 3 ? "text-sm" : grade.length >= 2 ? "text-base" : "text-xl";
  return (
    <span
      className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${fontSize} font-bold border-2 ${
        colorMap[grade] || "bg-gray-100 text-gray-700 border-gray-300"
      }`}
    >
      {grade}
    </span>
  );
}

export function RiskBadge({ level }: { level: string }) {
  if (level === "양호") {
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-100">{level}</Badge>;
  }
  if (level === "보통") {
    return <Badge className="bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100">{level}</Badge>;
  }
  if (level === "주의") {
    return <Badge className="bg-red-100 text-red-700 border-red-300 hover:bg-red-100">{level}</Badge>;
  }
  return <Badge variant="secondary">{level}</Badge>;
}

export function TrendIcon({ icon }: { icon: string }) {
  if (icon === "up" || icon === "↑") return <TrendingUp className="h-4 w-4 text-emerald-600" />;
  if (icon === "down" || icon === "↓") return <TrendingDown className="h-4 w-4 text-red-600" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
}
