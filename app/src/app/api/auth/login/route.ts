import { type NextRequest } from "next/server";
import { authenticate, createToken, logActivity, getCookieName, ensureDefaultAdmin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    await ensureDefaultAdmin();
    const { username, password } = await request.json();

    if (!username || !password) {
      return Response.json({ error: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
    }

    const user = await authenticate(username, password);
    if (!user) {
      return Response.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const token = await createToken(user);
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
    await logActivity(user.id, user.username, "login", "로그인", ip);

    const response = Response.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    });

    // Set cookie via headers
    const cookieName = getCookieName();
    const headers = new Headers(response.headers);
    headers.set(
      "Set-Cookie",
      `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
    );

    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    console.error("Login error:", error);
    return Response.json({ error: "로그인 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
