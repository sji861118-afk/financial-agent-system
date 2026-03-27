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
  if (!db) return Response.json({ error: "저장소 연결 실패" }, { status: 500 });

  const snap = await db.collection("feedback")
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();

  interface Post {
    id: string;
    content: string;
    category: string;
    username: string;
    parentId: string | null;
    resolved: boolean;
    createdAt: string;
  }

  const allPosts = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Post[];
  const roots = allPosts.filter((p) => !p.parentId);
  const replies = (pid: string) => allPosts.filter((p) => p.parentId === pid);

  // Claude에게 전달하기 좋은 마크다운 포맷으로 변환
  let md = `# 피드백 목록 (${new Date().toISOString().slice(0, 10)})\n\n`;
  md += `총 ${roots.length}건 (미해결: ${roots.filter((p) => !p.resolved).length}건)\n\n`;

  for (const post of roots) {
    const status = post.resolved ? "[해결됨]" : "[미해결]";
    const date = post.createdAt.slice(0, 16).replace("T", " ");
    md += `---\n\n`;
    md += `## ${status} [${post.category}] ${post.content.slice(0, 80)}\n\n`;
    md += `- **작성자:** ${post.username}\n`;
    md += `- **일시:** ${date}\n`;
    md += `- **상태:** ${post.resolved ? "해결됨" : "미해결"}\n`;
    md += `- **내용:** ${post.content}\n`;

    const postReplies = replies(post.id);
    if (postReplies.length > 0) {
      md += `- **답글:**\n`;
      for (const r of postReplies) {
        md += `  - ${r.username} (${r.createdAt.slice(0, 16).replace("T", " ")}): ${r.content}\n`;
      }
    }
    md += `\n`;
  }

  const encodedName = encodeURIComponent(`피드백_${new Date().toISOString().slice(0, 10)}.md`);

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
    },
  });
}
