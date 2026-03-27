import { type NextRequest } from "next/server";
import { verifyToken, getUserById, resetPassword, getCookieName } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(getCookieName())?.value;
  if (!token) {
    return Response.json({ error: "인증 필요" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return Response.json({ error: "세션 만료" }, { status: 401 });
  }

  const { currentPassword, newPassword } = await request.json();
  if (!newPassword || newPassword.length < 4) {
    return Response.json({ error: "새 비밀번호는 4자 이상이어야 합니다." }, { status: 400 });
  }

  const user = await getUserById(payload.userId);
  if (!user) {
    return Response.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  // 비밀번호 변경 강제인 경우 현재 비밀번호 확인 생략
  if (!user.mustChangePassword) {
    if (!currentPassword) {
      return Response.json({ error: "현재 비밀번호를 입력하세요." }, { status: 400 });
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return Response.json({ error: "현재 비밀번호가 일치하지 않습니다." }, { status: 401 });
    }
  }

  await resetPassword(user.id, newPassword);
  return Response.json({ success: true });
}
