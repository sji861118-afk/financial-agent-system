import { type NextRequest } from "next/server";
import { resetPassword, logActivity } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { id, newPassword } = await request.json();
    if (!id || !newPassword || newPassword.length < 4) {
      return Response.json({ error: "ID와 4자 이상의 비밀번호가 필요합니다." }, { status: 400 });
    }
    const ok = await resetPassword(id, newPassword);
    if (!ok) {
      return Response.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    const adminId = request.headers.get("x-user-id") || "";
    const adminName = request.headers.get("x-user-name") || "";
    await logActivity(adminId, adminName, "admin_action", `비밀번호 초기화: ${id}`);

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "비밀번호 초기화 실패" }, { status: 500 });
  }
}
