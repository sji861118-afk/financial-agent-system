import { type NextRequest } from "next/server";
import { getDataStore } from "@/lib/firebase-admin";
import { getApps, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getDb() {
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) return null;
  try {
    const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(key)) });
    return getFirestore(app);
  } catch { return null; }
}

export async function GET() {
  const db = getDb();
  if (!db) return Response.json({ posts: [] });

  const snap = await db.collection("feedback")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  const posts = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return Response.json({ posts });
}

export async function POST(request: NextRequest) {
  const db = getDb();
  if (!db) return Response.json({ error: "저장소 연결 실패" }, { status: 500 });

  const { content, category, username, parentId } = await request.json();

  if (!content?.trim()) {
    return Response.json({ error: "내용을 입력하세요." }, { status: 400 });
  }

  const post = {
    content: content.trim(),
    category: category || "기타",
    username: username || "익명",
    parentId: parentId || null,
    resolved: false,
    createdAt: new Date().toISOString(),
  };

  const docRef = await db.collection("feedback").add(post);

  return Response.json({ success: true, id: docRef.id });
}

export async function PUT(request: NextRequest) {
  const db = getDb();
  if (!db) return Response.json({ error: "저장소 연결 실패" }, { status: 500 });

  const { id, resolved, content, category } = await request.json();
  if (!id) return Response.json({ error: "ID 필요" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (resolved !== undefined) updates.resolved = !!resolved;
  if (content !== undefined) updates.content = content.trim();
  if (category !== undefined) updates.category = category;
  if (Object.keys(updates).length === 0) return Response.json({ error: "변경사항 없음" }, { status: 400 });

  updates.updatedAt = new Date().toISOString();
  await db.collection("feedback").doc(id).update(updates);
  return Response.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const db = getDb();
  if (!db) return Response.json({ error: "저장소 연결 실패" }, { status: 500 });

  const { id } = await request.json();
  if (!id) return Response.json({ error: "ID 필요" }, { status: 400 });

  // 답글도 함께 삭제
  const repliesSnap = await db.collection("feedback").where("parentId", "==", id).get();
  const batch = db.batch();
  repliesSnap.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(db.collection("feedback").doc(id));
  await batch.commit();

  return Response.json({ success: true });
}
