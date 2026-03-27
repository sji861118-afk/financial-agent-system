import { type NextRequest } from "next/server";
import { logActivity } from "@/lib/auth";
import { getDataStore } from "@/lib/firebase-admin";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const OUTPUT_DIR = path.join(os.tmpdir(), "loan-app-output");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // 활동 로그
  const userId = request.headers.get("x-user-id") || "";
  const userName = request.headers.get("x-user-name") || "";
  if (userId) {
    await logActivity(userId, userName, "download", `다운로드: ${filename}`);
  }

  if (!filename) {
    return Response.json({ error: "파일명이 필요합니다." }, { status: 400 });
  }

  const safeName = path.basename(filename);
  const encodedName = encodeURIComponent(safeName);

  // 1) 로컬 파일 시스템에서 시도
  const filePath = path.join(OUTPUT_DIR, safeName);
  if (fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    return new Response(fileBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "Content-Length": String(fileBuffer.length),
      },
    });
  }

  // 2) Firestore에서 base64 가져오기 (fallback)
  try {
    const store = getDataStore();
    const fileRecord = await store.getFileByName(safeName);
    if (fileRecord?.downloadUrl) {
      const buffer = Buffer.from(fileRecord.downloadUrl, "base64");
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
          "Content-Length": String(buffer.length),
        },
      });
    }
  } catch (e) {
    console.error("Firestore download fallback error:", e);
  }

  return Response.json(
    { error: `파일을 찾을 수 없습니다: ${safeName}` },
    { status: 404 }
  );
}
