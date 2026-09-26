"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { BusinessAvatar } from "@/components/dashboard/BusinessAvatar";
import { PoweredByArga } from "@/components/branding/PoweredByArga";
import { WHATSAPP_DISPLAY_NAME } from "@/lib/branding";
import {
  requestNotificationPermission,
  showCustomerMessageNotification,
} from "@/lib/notifications";
import type { Conversation, Message, ConversationStatus } from "@/types";

type ConvWithPreview = Conversation & { lastMessage: string };

const STATUS_LABEL: Record<ConversationStatus, string> = {
  ai_active: "IA Activa",
  paused: "Pausado",
  resolved: "Resuelto",
};

const STATUS_DOT: Record<ConversationStatus, string> = {
  ai_active: "bg-emerald-400",
  paused: "bg-amber-400",
  resolved: "bg-stone-400",
};

function formatTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60_000) return "ahora";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000)
    return date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

function getInitials(name: string | null, phone: string) {
  if (name) return name.charAt(0).toUpperCase();
  return phone.slice(-2);
}

function avatarColor(str: string) {
  const colors = [
    "bg-teal-500", "bg-violet-500", "bg-pink-500", "bg-orange-500",
    "bg-sky-500", "bg-rose-500", "bg-indigo-500", "bg-green-500",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function dedupeMessages(msgs: Message[]): Message[] {
  const seen = new Set<string>();
  return msgs.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

export default function DashboardPage() {
  const supabase = createClient();

  const [conversations, setConversations] = useState<ConvWithPreview[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadedMsgConvId, setLoadedMsgConvId] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [manualText, setManualText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [inAppAlert, setInAppAlert] = useState<{
    title: string;
    body: string;
    conversationId?: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedIdRef = useRef<string | null>(null);

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
  const loadingMsgs = Boolean(selectedId) && loadedMsgConvId !== selectedId;

  const markConversationRead = useCallback(async (convId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
    );
    await supabase.from("conversations").update({ unread_count: 0 }).eq("id", convId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const markConversationReadRef = useRef(markConversationRead);

  useEffect(() => {
    markConversationReadRef.current = markConversationRead;
  }, [markConversationRead]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const fetchConversations = useCallback(async () => {
    const { data } = await supabase
      .from("conversations")
      .select("*, messages(content, created_at, role)")
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (data) {
      const convs = (data as Array<Conversation & { messages?: Array<{ content: string; created_at: string }> }>).map((c) => {
        const sorted = [...(c.messages ?? [])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        return { ...c, messages: undefined, lastMessage: sorted[0]?.content ?? "" } as ConvWithPreview;
      });
      setConversations(convs);
    }
    setLoadingConvs(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMessages = useCallback(async (convId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
    } else {
      setMessages(dedupeMessages(data as Message[]));
      setLoadedMsgConvId(convId);
    }
    return data as Message[] | null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    const setupRealtime = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;

      await fetchConversations();

      const convChannel = supabase
        .channel("rt-conversations")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "conversations" },
          (payload) => {
            const updated = payload.new as Conversation;
            const viewingChat =
              selectedIdRef.current === updated.id &&
              document.visibilityState === "visible";

            setConversations((prev) =>
              prev.map((c) =>
                c.id === updated.id
                  ? {
                      ...c,
                      ...updated,
                      unread_count: viewingChat
                        ? 0
                        : (updated.unread_count ?? c.unread_count),
                      lastMessage: c.lastMessage,
                    }
                  : c
              )
            );

            if (viewingChat && (updated.unread_count ?? 0) > 0) {
              void markConversationReadRef.current(updated.id);
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "conversations" },
          () => fetchConversations()
        )
        .subscribe();

      const messageChannel = supabase
        .channel("rt-incoming-messages")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const msg = payload.new as Message;

            setConversations((prev) => {
              const conv = prev.find((c) => c.id === msg.conversation_id);
              if (!conv) return prev;

              const previewUpdate = {
                lastMessage: msg.content,
                last_message_at: msg.created_at,
              };

              if (msg.sender !== "customer") {
                return prev.map((c) =>
                  c.id === msg.conversation_id ? { ...c, ...previewUpdate } : c
                );
              }

              const viewingChat =
                selectedIdRef.current === msg.conversation_id &&
                document.visibilityState === "visible";

              if (viewingChat) {
                void markConversationReadRef.current(msg.conversation_id);
              } else {
                showCustomerMessageNotification({
                  customerName: conv.customer_name ?? conv.customer_phone,
                  customerPhone: conv.customer_phone,
                  content: msg.content,
                  conversationId: conv.id,
                });
              }

              return prev.map((c) => {
                if (c.id !== msg.conversation_id) return c;
                return { ...c, ...previewUpdate };
              });
            });

            if (selectedIdRef.current === msg.conversation_id) {
              setMessages((prev) =>
                dedupeMessages(prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])
              );
            }
          }
        )
        .subscribe();

      channels.push(convChannel, messageChannel);
    };

    void setupRealtime();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await supabase.realtime.setAuth(session?.access_token ?? "");
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [fetchConversations]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      void requestNotificationPermission();
    }
  }, []);

  useEffect(() => {
    document.title =
      totalUnread > 0
        ? `(${totalUnread}) ${WHATSAPP_DISPLAY_NAME}`
        : WHATSAPP_DISPLAY_NAME;
  }, [totalUnread]);

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id;
      setSelectedId(id);
      void markConversationRead(id);
    };
    window.addEventListener("dashboard-select-conversation", handler);
    return () => window.removeEventListener("dashboard-select-conversation", handler);
  }, [markConversationRead]);

  useEffect(() => {
    const onAlert = (e: Event) => {
      const detail = (e as CustomEvent<{
        title: string;
        body: string;
        conversationId?: string;
      }>).detail;
      setInAppAlert(detail);
      window.setTimeout(() => setInAppAlert(null), 6000);
    };

    window.addEventListener("dashboard-in-app-alert", onAlert);
    return () => window.removeEventListener("dashboard-in-app-alert", onAlert);
  }, []);

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;

    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", selectedId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Error fetching messages:", error);
        } else {
          setMessages(dedupeMessages(data as Message[]));
          setLoadedMsgConvId(selectedId);
        }
      });

    const ch = supabase
      .channel(`rt-messages-${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((prev) =>
            dedupeMessages(prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming])
          );
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleTogglePause = async () => {
    if (!selectedConv || updatingStatus) return;
    const next: ConversationStatus = selectedConv.status === "paused" ? "ai_active" : "paused";
    setUpdatingStatus(true);
    await fetch(`/api/admin/conversations/${selectedConv.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setConversations((prev) =>
      prev.map((c) => (c.id === selectedConv.id ? { ...c, status: next } : c))
    );
    setUpdatingStatus(false);
    if (next === "paused") setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSendManual = async () => {
    if (!selectedConv || !manualText.trim() || sendingMsg) return;
    setSendingMsg(true);
    const text = manualText.trim();
    setManualText("");

    const optimisticId = crypto.randomUUID();
    const optimisticMsg: Message = {
      id: optimisticId,
      conversation_id: selectedConv.id,
      role: "assistant",
      sender: "admin",
      content: text,
      media_url: null,
      whatsapp_message_id: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch("/api/admin/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selectedConv.customer_phone,
          message: text,
          conversationId: selectedConv.id,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        console.error("Send message failed:", data.error);
        return;
      }

      if (data.message) {
        const saved = data.message as Message;
        setMessages((prev) => {
          const withoutOptimistic = prev.filter((m) => m.id !== optimisticId);
          if (withoutOptimistic.some((m) => m.id === saved.id)) {
            return withoutOptimistic;
          }
          return [...withoutOptimistic, saved];
        });
      } else {
        await fetchMessages(selectedConv.id);
      }

      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConv.id
            ? { ...c, lastMessage: text, last_message_at: new Date().toISOString() }
            : c
        )
      );
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      console.error("Send message error:", err);
    } finally {
      setSendingMsg(false);
    }
  };

  const filteredConvs = conversations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.customer_name?.toLowerCase().includes(q) || c.customer_phone.includes(q);
  });

  const showMobileList = !selectedId;
  const showMobileChat = !!selectedId;

  return (
    <div className="h-full flex relative overflow-hidden min-h-0" style={{ background: "#ffffff" }}>
      {inAppAlert && (
        <button
          type="button"
          onClick={() => {
            if (inAppAlert.conversationId) {
              window.dispatchEvent(
                new CustomEvent("dashboard-select-conversation", {
                  detail: { id: inAppAlert.conversationId },
                })
              );
            }
            setInAppAlert(null);
          }}
          className="fixed top-14 md:top-16 inset-x-3 md:inset-x-auto md:right-4 z-50 md:max-w-sm md:w-[320px] text-left rounded-xl shadow-lg px-4 py-3 border border-[#d1f4ea] bg-white"
        >
          <p className="text-[#00a884] text-xs font-semibold mb-1">{inAppAlert.title}</p>
          <p className="text-[#111b21] text-sm leading-relaxed">{inAppAlert.body}</p>
          <p className="text-[#667781] text-[11px] mt-2">
            {inAppAlert.conversationId ? "Clic para abrir el chat" : "Alerta dentro del panel"}
          </p>
        </button>
      )}

      <aside
        className={`${showMobileList ? "flex" : "hidden md:flex"} w-full md:w-[360px] shrink-0 flex-col border-r border-[#e9edef] min-h-0 h-full bg-white`}
      >
        <div className="flex items-center justify-between px-3 sm:px-4 py-3 gap-2 bg-[#f0f2f5]">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <BusinessAvatar size="sm" />
            <div className="min-w-0">
              <p className="text-[#111b21] font-medium text-sm truncate">{WHATSAPP_DISPLAY_NAME}</p>
              <p className="text-[#667781] text-[11px] truncate">WhatsApp Business</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#667781] shrink-0">
            {totalUnread > 0 && (
              <span className="text-[10px] sm:text-xs bg-[#25d366] text-white px-1.5 sm:px-2 py-1 rounded-full font-semibold">
                {totalUnread} sin leer
              </span>
            )}
            <span className="hidden sm:inline text-xs bg-white text-[#667781] px-2 py-1 rounded-full">
              {conversations.filter((c) => c.status === "ai_active").length} IA
            </span>
            <span className="hidden sm:inline text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full">
              {conversations.filter((c) => c.status === "paused").length} pausadas
            </span>
          </div>
        </div>

        <div className="px-3 py-2 bg-white">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-[#f0f2f5]">
            <svg className="w-4 h-4 text-[#667781] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar conversación"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm text-[#111b21] placeholder-[#667781] focus:outline-none w-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex justify-center pt-12">
              <div className="w-5 h-5 border-2 border-[#e9edef] border-t-[#00a884] rounded-full animate-spin" />
            </div>
          ) : filteredConvs.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-[#667781] text-sm">Sin conversaciones</p>
            </div>
          ) : (
            filteredConvs.map((conv) => {
              const name = conv.customer_name ?? conv.customer_phone;
              const isSelected = selectedId === conv.id;
              const unread = conv.unread_count ?? 0;
              return (
                <button
                  key={conv.id}
                  onClick={() => {
                    setSelectedId(conv.id);
                    if (unread > 0) void markConversationRead(conv.id);
                  }}
                  className="w-full text-left flex items-center gap-3 px-4 py-3 transition-colors border-b border-[#f0f2f5]"
                  style={{ background: isSelected ? "#f0f2f5" : "transparent" }}
                  onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#f5f6f6"; }}
                  onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <div className={`w-12 h-12 rounded-full ${avatarColor(conv.customer_phone)} flex items-center justify-center text-white font-semibold text-base shrink-0`}>
                    {getInitials(conv.customer_name, conv.customer_phone)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-sm truncate ${unread > 0 ? "text-[#111b21] font-semibold" : "text-[#111b21] font-medium"}`}>
                        {name}
                      </span>
                      <span className={`text-xs shrink-0 ml-2 ${unread > 0 ? "text-[#25d366] font-semibold" : "text-[#667781]"}`}>
                        {conv.last_message_at ? formatTime(conv.last_message_at) : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs truncate leading-relaxed flex-1 ${unread > 0 ? "text-[#111b21] font-medium" : "text-[#667781]"}`}>
                        {conv.lastMessage || "Sin mensajes"}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {unread > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#25d366] text-white text-[11px] font-bold flex items-center justify-center">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                        <span className={`w-2 h-2 rounded-full ${STATUS_DOT[conv.status]}`} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="shrink-0 border-t border-[#e9edef] bg-[#f0f2f5] px-3 py-2.5 flex w-full justify-center">
          <PoweredByArga />
        </div>
      </aside>

      <main className={`${showMobileChat ? "flex w-full" : "hidden md:flex"} flex-1 flex-col min-w-0 min-h-0`}>
        {!selectedConv ? (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center wa-chat-bg">
            <div className="w-20 h-20 rounded-full bg-white shadow-sm flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-[#00a884]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-[#41525d] text-lg font-light mb-1">{WHATSAPP_DISPLAY_NAME}</h3>
            <p className="text-[#667781] text-sm text-center max-w-xs">
              Selecciona un chat para ver mensajes, pausar la IA y responder como asesor
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-2 sm:px-4 py-2 gap-2 shrink-0 bg-[#f0f2f5] border-b border-[#e9edef]">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="md:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-[#54656f] hover:bg-[#e9edef]"
                  aria-label="Volver a conversaciones"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full ${avatarColor(selectedConv.customer_phone)} flex items-center justify-center text-white font-semibold text-sm shrink-0`}>
                  {getInitials(selectedConv.customer_name, selectedConv.customer_phone)}
                </div>
                <div className="min-w-0">
                  <p className="text-[#111b21] text-sm font-medium leading-tight truncate">
                    {selectedConv.customer_name ?? "Cliente"}
                  </p>
                  <p className="text-[#667781] text-xs truncate">{selectedConv.customer_phone}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`hidden sm:inline text-xs px-2 py-1 rounded-full font-medium ${
                  selectedConv.status === "ai_active"
                    ? "bg-emerald-50 text-emerald-700"
                    : selectedConv.status === "paused"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-stone-100 text-stone-500"
                }`}>
                  {STATUS_LABEL[selectedConv.status]}
                </span>
                <button
                  onClick={handleTogglePause}
                  disabled={updatingStatus}
                  className={`text-[11px] sm:text-xs font-medium px-2 sm:px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap ${
                    selectedConv.status === "paused"
                      ? "bg-teal-600 hover:bg-teal-500 text-white"
                      : "bg-amber-600 hover:bg-amber-500 text-white"
                  }`}
                >
                  {updatingStatus
                    ? "..."
                    : selectedConv.status === "paused"
                    ? "▶ IA"
                    : "⏸ IA"}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 wa-chat-bg">
              {loadingMsgs ? (
                <div className="flex justify-center pt-12">
                  <div className="w-5 h-5 border-2 border-[#d1d7db] border-t-[#00a884] rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex justify-center pt-12">
                  <p className="text-[#667781] text-sm bg-white px-4 py-2 rounded-lg shadow-sm">Sin mensajes aún</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isCustomer = msg.sender === "customer";
                  const isAdmin = msg.sender === "admin";
                  const prevMsg = messages[i - 1];
                  const showDate =
                    !prevMsg ||
                    new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();
                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="flex justify-center my-3">
                          <span className="text-[#54656f] text-xs bg-white px-3 py-1 rounded-lg shadow-sm">
                            {new Date(msg.created_at).toLocaleDateString("es-MX", {
                              weekday: "long", day: "numeric", month: "long",
                            })}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${isCustomer ? "justify-start" : "justify-end"} mb-0.5`}>
                        <div
                          className="max-w-[88%] sm:max-w-[80%] md:max-w-[65%] rounded-lg px-3 py-2 text-sm relative shadow-sm"
                          style={{
                            background: isCustomer ? "#ffffff" : "#d9fdd3",
                            borderRadius: isCustomer ? "0px 7.5px 7.5px 7.5px" : "7.5px 0px 7.5px 7.5px",
                          }}
                        >
                          {!isCustomer && (
                            <p className="text-xs font-medium mb-0.5" style={{ color: isAdmin ? "#027eb5" : "#00a884" }}>
                              {isAdmin ? "Asesor" : "✦ ARGI"}
                            </p>
                          )}
                          {msg.media_url ? (
                            <div className="space-y-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={msg.media_url}
                                alt={msg.content.split("\n")[0] ?? "Lote"}
                                className="rounded-md max-w-full w-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                              {msg.content && (
                                <p className="text-[#111b21] leading-relaxed whitespace-pre-wrap text-xs">
                                  {msg.content}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-[#111b21] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          )}
                          <p className="text-[#667781] text-[11px] mt-1 text-right">
                            {new Date(msg.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {selectedConv.status === "paused" ? (
              <div
                className="px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3 shrink-0 bg-[#f0f2f5]"
                style={{
                  paddingBottom: showMobileChat
                    ? "max(0.75rem, env(safe-area-inset-bottom, 0px))"
                    : undefined,
                }}
              >
                <div className="flex-1 flex items-center gap-2 rounded-lg px-3 sm:px-4 py-2.5 min-w-0 bg-white">
                  <input
                    ref={inputRef}
                    type="text"
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendManual(); } }}
                    placeholder="Escribe un mensaje como asesor..."
                    className="flex-1 bg-transparent text-sm text-[#111b21] placeholder-[#667781] focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleSendManual}
                  disabled={!manualText.trim() || sendingMsg}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-40"
                  style={{ background: manualText.trim() ? "#00a884" : "#d1d7db" }}
                >
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </div>
            ) : (
              <div
                className="px-3 sm:px-4 py-3 flex items-center gap-3 shrink-0 bg-[#f0f2f5]"
                style={{
                  paddingBottom: showMobileChat
                    ? "max(0.75rem, env(safe-area-inset-bottom, 0px))"
                    : undefined,
                }}
              >
                <div className="flex-1 flex items-center justify-center rounded-lg px-3 sm:px-4 py-2.5 bg-white">
                  <p className="text-[#667781] text-xs sm:text-sm text-center">✦ ARGI está respondiendo automáticamente</p>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
