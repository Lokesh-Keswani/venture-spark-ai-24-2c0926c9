import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendCoachMessage } from "@/lib/coach.functions";
import { toast } from "sonner";
import { Plus, Send, MessageSquare, Loader2, Trash2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/coach")({
  head: () => ({ meta: [{ title: "AI Co-Founder — VentureIQ AI" }] }),
  component: Coach,
});

function Coach() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: conversations } = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_conversations")
        .select("id, title, project_id, updated_at, startup_projects(startup_name)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: projects } = useQuery({
    queryKey: ["projects-min", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("startup_projects")
        .select("id, startup_name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!activeId && conversations && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId]);

  async function newConversation(projectId?: string) {
    if (!user) return;
    const { data, error } = await supabase
      .from("chat_conversations")
      .insert({ user_id: user.id, project_id: projectId ?? null, title: "New conversation" })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["conversations"] });
    setActiveId(data.id);
  }

  async function deleteConversation(id: string) {
    if (!confirm("Delete this conversation?")) return;
    const { error } = await supabase.from("chat_conversations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["conversations"] });
    if (activeId === id) setActiveId(null);
  }

  return (
    <div className="mx-auto grid h-[calc(100vh-3.5rem)] w-full max-w-7xl grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden flex-col border-r border-border bg-card/40 md:flex">
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <h2 className="font-display text-sm font-semibold">Conversations</h2>
          <NewMenu projects={projects ?? []} onNew={newConversation} />
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {(conversations ?? []).length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground">No conversations yet.</p>
          )}
          {(conversations ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`group flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                activeId === c.id
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/60"
              }`}
            >
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{c.title}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {(c.startup_projects as { startup_name?: string } | null)?.startup_name ?? "General"} ·{" "}
                  {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
                </div>
              </div>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(c.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    deleteConversation(c.id);
                  }
                }}
                className="hidden rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive group-hover:inline-flex"
                aria-label="Delete conversation"
              >
                <Trash2 className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="flex items-center justify-between border-b border-border bg-card/40 p-3 md:hidden">
          <h2 className="font-display text-sm font-semibold">AI Co-Founder</h2>
          <NewMenu projects={projects ?? []} onNew={newConversation} />
        </div>
        {activeId ? (
          <ChatPane key={activeId} conversationId={activeId} />
        ) : (
          <EmptyChat onNew={() => newConversation()} />
        )}
      </section>
    </div>
  );
}

function NewMenu({
  projects,
  onNew,
}: {
  projects: Array<{ id: string; startup_name: string }>;
  onNew: (projectId?: string) => void;
}) {
  return (
    <div className="relative">
      <details className="group">
        <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground shadow-glow hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> New
        </summary>
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-border bg-popover p-1 shadow-soft">
          <button
            onClick={() => onNew()}
            className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            General conversation
          </button>
          {projects.length > 0 && (
            <div className="my-1 border-t border-border" />
          )}
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => onNew(p.id)}
              className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              About: {p.startup_name}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

function EmptyChat({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="h-6 w-6" />
      </span>
      <h3 className="mt-4 font-display text-xl font-semibold">Your AI co-founder is ready</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Ask about strategy, product, marketing, customer acquisition, technical architecture, or
        fundraising. Context is retained across messages.
      </p>
      <Button onClick={onNew} className="mt-5 shadow-glow">
        <Plus className="mr-1.5 h-4 w-4" /> Start a conversation
      </Button>
    </div>
  );
}

function ChatPane({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const send = useServerFn(sendCoachMessage);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [conversationId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");

    // optimistic user message
    qc.setQueryData<typeof messages>(["messages", conversationId], (cur) => [
      ...(cur ?? []),
      {
        id: `tmp-${Date.now()}`,
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      await send({ data: { conversationId, content: text } });
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-5">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {(messages ?? []).map((m) => (
            <MessageBubble key={m.id} role={m.role as "user" | "assistant"} content={m.content} />
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Co-founder is thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <form onSubmit={onSubmit} className="border-t border-border bg-card/40 px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            placeholder="Ask anything — strategy, product, marketing, fundraising…"
            rows={1}
            className="min-h-[44px] resize-none"
          />
          <Button type="submit" disabled={busy || !input.trim()} size="icon" className="shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-soft">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="prose prose-sm max-w-none flex-1 text-sm leading-relaxed text-foreground dark:prose-invert">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
