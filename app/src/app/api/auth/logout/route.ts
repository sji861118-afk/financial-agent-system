import { type NextRequest } from "next/server";
import { getCookieName, logActivity, verifyToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const cookieName = getCookieName();
  const token = request.cookies.get(cookieName)?.value;

  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      await logActivity(payload.userId, payload.username, "logout", "로그아웃");
    }
  }

  const headers = new Headers();
  headers.set("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers,
  });
}
