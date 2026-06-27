import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Activity,
  Download,
  File as FileIcon,
  Loader2,
  Mic,
  Paperclip,
  Send,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Profile = { id: string; full_name: string | null; email: string | null; avatar_url: string | null };

function useProjectProfiles(userIds: string[]) {
  return useQuery({
    queryKey: ["profiles", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", userIds);
      return new Map((data ?? []).map((p) => [p.id, p as Profile]));
    },
  });
}

function Avatar({ p, size = 8 }: { p?: Profile; size?: number }) {
  const initial = (p?.full_name || p?.email || "?").charAt(0).toUpperCase();
  const sz = `h-${size} w-${size}`;
  return (
    <div className={`grid ${sz} shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground`}>
      {initial}
    </div>
  );
}

/* ============================================================
 * CHAT PANEL — realtime team chat with voice notes
 * ============================================================ */
export function ChatPanel({ projectId, canSend }: { projectId: string; canSend: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [sending, setSending] = useState(false);

  const { data: messages = [] } = useQuery({
    queryKey: ["project-messages", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_messages")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const userIds = useMemo(() => Array.from(new Set(messages.map((m) => m.user_id))), [messages]);
  const { data: profiles } = useProjectProfiles(userIds);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`project-messages-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_messages", filter: `project_id=eq.${projectId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["project-messages", projectId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, qc]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    if (!user || !text.trim() || sending) return;
    setSending(true);
    const body = text.trim();
    setText("");
    const { error } = await supabase.from("project_messages").insert({
      project_id: projectId,
      user_id: user.id,
      kind: "text",
      content: body,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      setText(body);
    }
  }

  async function deleteMessage(id: string, voicePath?: string | null) {
    if (!confirm("Delete this message?")) return;
    if (voicePath) {
      await supabase.storage.from("project-voice").remove([voicePath]).catch(() => {});
    }
    const { error } = await supabase.from("project_messages").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-2xl border border-border bg-card/60 backdrop-blur">
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="grid h-full place-items-center text-sm text-muted-foreground">
            Start the conversation — say hi 👋
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.user_id === user?.id;
            const p = profiles?.get(m.user_id);
            return (
              <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                <Avatar p={p} />
                <div className={`group max-w-[75%] min-w-0 ${mine ? "items-end" : "items-start"} flex flex-col`}>
                  <div
                    className={`rounded-2xl px-3.5 py-2 text-sm shadow-soft ${
                      mine ? "bg-primary text-primary-foreground" : "bg-background border border-border"
                    }`}
                  >
                    {!mine && (
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider opacity-70">
                        {p?.full_name || p?.email || "Member"}
                      </div>
                    )}
                    {m.kind === "voice" ? (
                      <VoicePlayer path={m.voice_path!} duration={Number(m.voice_duration ?? 0)} />
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    )}
                  </div>
                  <div className={`mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground ${mine ? "flex-row-reverse" : ""}`}>
                    <span>{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</span>
                    {mine && (
                      <button
                        onClick={() => deleteMessage(m.id, m.voice_path)}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {canSend ? (
        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message the team…"
              rows={1}
              className="min-h-[40px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <VoiceRecorder projectId={projectId} />
            <Button onClick={send} disabled={!text.trim() || sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border p-3 text-center text-xs text-muted-foreground">
          Viewers can read but not send messages.
        </div>
      )}
    </div>
  );
}

function VoicePlayer({ path, duration }: { path: string; duration: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.storage
      .from("project-voice")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (alive && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  return (
    <div className="flex items-center gap-2">
      <Mic className="h-3.5 w-3.5 opacity-70" />
      {url ? (
        <audio controls src={url} className="h-8 max-w-[220px]" />
      ) : (
        <Loader2 className="h-3 w-3 animate-spin" />
      )}
      {duration > 0 && <span className="text-[10px] opacity-70">{Math.round(duration)}s</span>}
    </div>
  );
}

function VoiceRecorder({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const chunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startedAtRef = useRef<number>(0);

  async function start() {
    if (!user) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        const duration = (Date.now() - startedAtRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: mime });
        stream.getTracks().forEach((t) => t.stop());
        setUploading(true);
        try {
          const path = `${projectId}/${crypto.randomUUID()}.webm`;
          const { error: ue } = await supabase.storage
            .from("project-voice")
            .upload(path, blob, { contentType: mime });
          if (ue) throw ue;
          const { error: me } = await supabase.from("project_messages").insert({
            project_id: projectId,
            user_id: user.id,
            kind: "voice",
            voice_path: path,
            voice_duration: duration,
          });
          if (me) throw me;
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Voice upload failed");
        } finally {
          setUploading(false);
        }
      };
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  }
  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <Button
      type="button"
      variant={recording ? "destructive" : "outline"}
      size="icon"
      onClick={recording ? stop : start}
      disabled={uploading}
      aria-label={recording ? "Stop recording" : "Record voice note"}
    >
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : recording ? (
        <Square className="h-4 w-4 animate-pulse" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  );
}

/* ============================================================
 * FILES PANEL
 * ============================================================ */
export function FilesPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: files = [] } = useQuery({
    queryKey: ["project-files", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_files")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const userIds = useMemo(() => Array.from(new Set(files.map((f) => f.uploaded_by))), [files]);
  const { data: profiles } = useProjectProfiles(userIds);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Max file size is 25MB");
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${projectId}/${crypto.randomUUID()}-${safeName}`;
      const { error: ue } = await supabase.storage
        .from("project-files")
        .upload(path, file, { contentType: file.type });
      if (ue) throw ue;
      const { error: ie } = await supabase.from("project_files").insert({
        project_id: projectId,
        uploaded_by: user.id,
        name: file.name,
        path,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (ie) throw ie;
      await supabase.from("project_activity").insert({
        project_id: projectId,
        user_id: user.id,
        action: "file.uploaded",
        target: file.name,
      });
      toast.success(`Uploaded ${file.name}`);
      qc.invalidateQueries({ queryKey: ["project-files", projectId] });
      qc.invalidateQueries({ queryKey: ["project-activity", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function download(path: string, name: string) {
    const { data, error } = await supabase.storage.from("project-files").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) return toast.error("Could not download");
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = name;
    a.click();
  }

  async function del(id: string, path: string) {
    if (!confirm("Delete this file?")) return;
    await supabase.storage.from("project-files").remove([path]).catch(() => {});
    const { error } = await supabase.from("project_files").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["project-files", projectId] });
  }

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-semibold">Files</h3>
          <p className="text-xs text-muted-foreground">PDF, PNG, JPG, PPTX, DOCX, XLSX up to 25MB.</p>
        </div>
        {canEdit && (
          <>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".pdf,.png,.jpg,.jpeg,.pptx,.docx,.xlsx,image/*"
              onChange={onFile}
            />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="mr-1.5 h-4 w-4" />}
              Upload
            </Button>
          </>
        )}
      </div>
      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No files yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {files.map((f) => {
            const p = profiles?.get(f.uploaded_by);
            return (
              <li key={f.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <FileIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{f.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {(p?.full_name || p?.email || "Member")} ·{" "}
                    {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                    {f.size_bytes && ` · ${Math.round((f.size_bytes / 1024) * 10) / 10}KB`}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onClick={() => download(f.path, f.name)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {(f.uploaded_by === user?.id || canEdit) && (
                    <Button size="icon" variant="ghost" onClick={() => del(f.id, f.path)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ============================================================
 * COMMENTS PANEL — comments on analysis / pitch / roadmap / investor
 * ============================================================ */
type CommentTarget = "analysis" | "pitch" | "roadmap" | "investor";

export function CommentsPanel({ projectId, canComment }: { projectId: string; canComment: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [target, setTarget] = useState<CommentTarget>("analysis");
  const [body, setBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const { data: comments = [] } = useQuery({
    queryKey: ["project-comments", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_comments")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`project-comments-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_comments", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["project-comments", projectId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, qc]);

  const userIds = useMemo(() => Array.from(new Set(comments.map((c) => c.user_id))), [comments]);
  const { data: profiles } = useProjectProfiles(userIds);

  const filtered = comments.filter((c) => c.target === target && !c.parent_id);

  async function add() {
    if (!user || !body.trim()) return;
    const { error } = await supabase.from("project_comments").insert({
      project_id: projectId,
      user_id: user.id,
      target,
      parent_id: replyingTo,
      body: body.trim(),
    });
    if (error) return toast.error(error.message);
    setBody("");
    setReplyingTo(null);
  }

  async function resolve(id: string, resolved: boolean) {
    await supabase.from("project_comments").update({ resolved: !resolved }).eq("id", id);
  }
  async function del(id: string) {
    if (!confirm("Delete this comment?")) return;
    await supabase.from("project_comments").delete().eq("id", id);
  }

  const targets: { id: CommentTarget; label: string }[] = [
    { id: "analysis", label: "Analysis" },
    { id: "pitch", label: "Pitch Deck" },
    { id: "roadmap", label: "Roadmap" },
    { id: "investor", label: "Investor Readiness" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {targets.map((t) => (
          <button
            key={t.id}
            onClick={() => setTarget(t.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              target === t.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No comments on this section yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((c) => {
            const p = profiles?.get(c.user_id);
            const replies = comments.filter((r) => r.parent_id === c.id);
            return (
              <li
                key={c.id}
                className={`rounded-xl border border-border bg-background/50 p-3 ${c.resolved ? "opacity-60" : ""}`}
              >
                <div className="flex gap-2">
                  <Avatar p={p} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{p?.full_name || p?.email || "Member"}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
                    <div className="mt-2 flex gap-2 text-[11px]">
                      {canComment && (
                        <button
                          onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                          className="text-primary hover:underline"
                        >
                          {replyingTo === c.id ? "Cancel" : "Reply"}
                        </button>
                      )}
                      {canComment && (
                        <button onClick={() => resolve(c.id, c.resolved)} className="text-muted-foreground hover:text-foreground">
                          {c.resolved ? "Reopen" : "Resolve"}
                        </button>
                      )}
                      {c.user_id === user?.id && (
                        <button onClick={() => del(c.id)} className="text-muted-foreground hover:text-destructive">
                          Delete
                        </button>
                      )}
                    </div>
                    {replies.length > 0 && (
                      <ul className="mt-3 space-y-2 border-l-2 border-border pl-3">
                        {replies.map((r) => {
                          const rp = profiles?.get(r.user_id);
                          return (
                            <li key={r.id} className="text-sm">
                              <div className="flex items-center gap-1.5">
                                <Avatar p={rp} size={6} />
                                <span className="text-xs font-semibold">{rp?.full_name || rp?.email}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                                </span>
                              </div>
                              <p className="ml-7 mt-0.5 whitespace-pre-wrap break-words">{r.body}</p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canComment && (
        <div className="mt-4 rounded-xl border border-border bg-background/50 p-3">
          {replyingTo && (
            <p className="mb-1.5 text-[11px] text-muted-foreground">
              Replying — <button className="text-primary" onClick={() => setReplyingTo(null)}>cancel</button>
            </p>
          )}
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Add a comment on ${target}…`}
            rows={2}
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={add} disabled={!body.trim()}>
              Post comment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * ACTIVITY PANEL
 * ============================================================ */
export function ActivityPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data: activity = [] } = useQuery({
    queryKey: ["project-activity", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_activity")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`project-activity-${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "project_activity", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["project-activity", projectId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, qc]);

  const userIds = useMemo(
    () => Array.from(new Set(activity.map((a) => a.user_id).filter(Boolean) as string[])),
    [activity],
  );
  const { data: profiles } = useProjectProfiles(userIds);

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="font-display text-base font-semibold">Activity feed</h3>
      </div>
      {activity.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="space-y-3">
          {activity.map((a) => {
            const p = a.user_id ? profiles?.get(a.user_id) : null;
            return (
              <li key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                <Avatar p={p ?? undefined} />
                <div className="min-w-0">
                  <div className="break-words text-sm">
                    <span className="font-semibold">{p?.full_name || p?.email || "Someone"}</span>{" "}
                    <span className="text-muted-foreground">{a.action.replace(/[._]/g, " ")}</span>
                    {a.target && (
                      <>
                        {" · "}
                        <span className="font-medium">{a.target}</span>
                      </>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
