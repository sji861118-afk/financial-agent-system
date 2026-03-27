import { type NextRequest } from "next/server";
import { verifyToken, getUserById, checkDailyLimit, getCookieName, ensureDefaultAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(getCookieName())?.value;
  if (!token) {
    return Response.json({ error: "인증 필요" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return Response.json({ error: "세션 만료" }, { status: 401 });
  }

  await ensureDefaultAdmin();
  const user = await getUserById(payload.userId);
  if (!user || !user.active) {
    return Response.json({ error: "비활성 계정" }, { status: 403 });
  }

  const limitInfo = await checkDailyLimit(user.id);

  return Response.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
    dailyLimit: limitInfo,
  });
}
