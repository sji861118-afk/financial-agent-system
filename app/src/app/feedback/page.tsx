"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  MessageSquarePlus, CheckCircle2, Circle, Reply, Send, Pencil, Trash2, FileDown, Copy,
} from "lucide-react";
import { toast } from "sonner";

interface FeedbackPost {
  id: string;
  content: string;
  category: string;
  username: string;
  parentId: string | null;
  resolved: boolean;
  createdAt: string;
}

const CATEGORIES = [
  { value: "데이터오류", label: "데이터 오류", color: "bg-red-100 text-red-700" },
  { value: "기능오류", label: "기능 오류", color: "bg-orange-100 text-orange-700" },
  { value: "개선요청", label: "개선 요청", color: "bg-blue-100 text-blue-700" },
  { value: "질문", label: "질문", color: "bg-purple-100 text-purple-700" },
  { value: "기타", label: "기타", color: "bg-gray-100 text-gray-700" },
];

function formatDate(s: string) {
  const d = new Date(s);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getCategoryStyle(cat: string) {
  return CATEGORIES.find((c) => c.value === cat) || CATEGORIES[4];
}

export default function FeedbackPage() {
  const [posts, setPosts] = useState<FeedbackPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("데이터오류");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [filter, setFilter] = useState("all");

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/feedback");
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchPosts();
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      } catch {}
    })();
  }, [fetchPosts]);

  const handleSubmit = async () => {
    if (!content.trim()) { toast.error("내용을 입력하세요."); return; }
    setSubmitting(true);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        category,
        username: user?.name || "익명",
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success("등록되었습니다.");
      setContent("");
      fetchPosts();
    } else {
      toast.error("등록 실패");
    }
  };

  const handleReply = async (parentId: string) => {
    if (!replyContent.trim()) return;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: replyContent,
        category: "답변",
        username: user?.name || "익명",
        parentId,
      }),
    });
    setReplyTo(null);
    setReplyContent("");
    fetchPosts();
  };

  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return;
    await fetch("/api/feedback", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, content: editContent }),
    });
    setEditingId(null);
    setEditContent("");
    fetchPosts();
    toast.success("수정되었습니다.");
  };

  const handleDelete = async (post: FeedbackPost) => {
    if (!confirm(`"${post.content.slice(0, 30)}..." 삭제하시겠습니까?`)) return;
    await fetch("/api/feedback", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id }),
    });
    fetchPosts();
    toast.success("삭제되었습니다.");
  };

  const handleExport = () => {
    window.open("/api/feedback/export", "_blank");
  };

  const handleCopyForClaude = async () => {
    const res = await fetch("/api/feedback/export");
    const text = await res.text();
    await navigator.clipboard.writeText(text);
    toast.success("클립보드에 복사되었습니다. Claude에 붙여넣기하세요.");
  };

  const toggleResolved = async (post: FeedbackPost) => {
    await fetch("/api/feedback", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id, resolved: !post.resolved }),
    });
    fetchPosts();
  };

  const rootPosts = posts.filter((p) => !p.parentId);
  const replies = (parentId: string) => posts.filter((p) => p.parentId === parentId);

  const filteredPosts = filter === "all"
    ? rootPosts
    : filter === "open"
      ? rootPosts.filter((p) => !p.resolved)
      : filter === "resolved"
        ? rootPosts.filter((p) => p.resolved)
        : rootPosts.filter((p) => p.category === filter);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">피드백</h1>
        <p className="text-sm text-muted-foreground">
          오류 신고, 데이터 문제, 개선 요청을 남겨주세요.
        </p>
      </div>

      {/* 작성 폼 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquarePlus className="size-5" />
            새 피드백
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="내용을 입력하세요 (예: 삼성전자 2024년 자산총계 누락)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="flex-1"
            />
            <Button onClick={handleSubmit} disabled={submitting}>
              <Send className="mr-1.5 size-4" />
              {submitting ? "등록 중..." : "등록"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 필터 + 추출 */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            { value: "all", label: "전체" },
            { value: "open", label: "미해결" },
            { value: "resolved", label: "해결됨" },
            ...CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
          ].map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={handleCopyForClaude} title="Claude용 복사">
            <Copy className="mr-1 size-3.5" />복사
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} title="마크다운 파일 다운로드">
            <FileDown className="mr-1 size-3.5" />.md
          </Button>
        </div>
      </div>

      {/* 게시글 목록 */}
      {loading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            불러오는 중...
          </CardContent>
        </Card>
      ) : filteredPosts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            등록된 피드백이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredPosts.map((post) => {
            const catStyle = getCategoryStyle(post.category);
            const postReplies = replies(post.id);
            return (
              <Card key={post.id} className={post.resolved ? "opacity-60" : ""}>
                <CardContent className="py-4">
                  {/* 헤더 */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge className={catStyle.color} variant="secondary">
                        {catStyle.label}
                      </Badge>
                      <span className="text-sm font-medium">{post.username}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(post.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {(user?.role === "admin" || user?.name === post.username) && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => {
                            setEditingId(editingId === post.id ? null : post.id);
                            setEditContent(post.content);
                          }} title="수정">
                            <Pencil className="size-3.5 text-gray-400" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(post)} title="삭제">
                            <Trash2 className="size-3.5 text-red-400" />
                          </Button>
                        </>
                      )}
                      {user?.role === "admin" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleResolved(post)}
                          title={post.resolved ? "미해결로 변경" : "해결됨으로 변경"}
                        >
                          {post.resolved
                            ? <CheckCircle2 className="size-4 text-emerald-500" />
                            : <Circle className="size-4 text-gray-400" />}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReplyTo(replyTo === post.id ? null : post.id)}
                      >
                        <Reply className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {/* 본문 / 수정 모드 */}
                  {editingId === post.id ? (
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleEdit(post.id)}
                        className="flex-1"
                        autoFocus
                      />
                      <Button size="sm" onClick={() => handleEdit(post.id)}>저장</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>취소</Button>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm whitespace-pre-wrap">{post.content}</p>
                  )}

                  {/* 해결됨 표시 */}
                  {post.resolved && (
                    <Badge variant="secondary" className="mt-2 bg-emerald-50 text-emerald-700">
                      해결됨
                    </Badge>
                  )}

                  {/* 답글 목록 */}
                  {postReplies.length > 0 && (
                    <div className="mt-3 space-y-2 border-l-2 border-gray-200 pl-4">
                      {postReplies.map((reply) => (
                        <div key={reply.id} className="text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{reply.username}</span>
                            <span className="text-xs text-muted-foreground">{formatDate(reply.createdAt)}</span>
                          </div>
                          <p className="mt-0.5 whitespace-pre-wrap text-gray-700">{reply.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 답글 입력 */}
                  {replyTo === post.id && (
                    <div className="mt-3 flex gap-2">
                      <Input
                        placeholder="답글 입력..."
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleReply(post.id)}
                        className="flex-1"
                        autoFocus
                      />
                      <Button size="sm" onClick={() => handleReply(post.id)}>답글</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
