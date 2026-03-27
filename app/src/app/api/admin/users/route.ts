import { type NextRequest } from "next/server";
import { getUsers, createUser, updateUser, deleteUser, resetPassword, logActivity } from "@/lib/auth";

export async function GET() {
  return Response.json({ users: await getUsers() });
}

export async function POST(request: NextRequest) {
  try {
    const { username, name, password, role, dailyLimit } = await request.json();
    if (!username || !name || !password) {
      return Response.json({ error: "아이디, 이름, 비밀번호는 필수입니다." }, { status: 400 });
    }
    if (password.length < 4) {
      return Response.json({ error: "비밀번호는 4자 이상이어야 합니다." }, { status: 400 });
    }
    const user = await createUser(username, name, password, role || "user", dailyLimit ?? 30);

    const adminId = request.headers.get("x-user-id") || "";
    const adminName = request.headers.get("x-user-name") || "";
    await logActivity(adminId, adminName, "admin_action", `사용자 생성: ${username} (${name})`);

    return Response.json({ success: true, user });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "사용자 생성 실패";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, name, role, active, dailyLimit } = await request.json();
    if (!id) {
      return Response.json({ error: "사용자 ID가 필요합니다." }, { status: 400 });
    }
    const user = await updateUser(id, { name, role, active, dailyLimit });
    if (!user) {
      return Response.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    const adminId = request.headers.get("x-user-id") || "";
    const adminName = request.headers.get("x-user-name") || "";
    await logActivity(adminId, adminName, "admin_action", `사용자 수정: ${user.username}`);

    return Response.json({ success: true, user });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "수정 실패";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) {
      return Response.json({ error: "사용자 ID가 필요합니다." }, { status: 400 });
    }
    await deleteUser(id);

    const adminId = request.headers.get("x-user-id") || "";
    const adminName = request.headers.get("x-user-name") || "";
    await logActivity(adminId, adminName, "admin_action", `사용자 삭제: ${id}`);

    return Response.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "삭제 실패";
    return Response.json({ error: message }, { status: 400 });
  }
}
