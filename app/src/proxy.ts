import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET_KEY = process.env.JWT_SECRET || "loan-app-jwt-secret-key-2024-change-in-production";
const secret = new TextEncoder().encode(JWT_SECRET_KEY);
const COOKIE_NAME = "loan-app-token";

// Public paths that don't require authentication
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg")
  ) {
    return NextResponse.next();
  }

  // Check auth token
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    // API routes return 401, pages redirect to login
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, secret);

    // Admin-only routes
    if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
      if (payload.role !== "admin") {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/", request.url));
      }
    }

    // Add user info to headers for API routes
    const response = NextResponse.next();
    response.headers.set("x-user-id", String(payload.userId));
    response.headers.set("x-user-name", String(payload.username));
    response.headers.set("x-user-role", String(payload.role));
    return response;
  } catch {
    // Invalid token
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "세션이 만료되었습니다." }, { status: 401 });
    }
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
