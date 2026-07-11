// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/components/MessagePanel.tsx   (NEW file)
//
// Shared client component used on all three dashboards (student, teacher,
// admin). Renders a "Messages" button with unread badge. Clicking opens
// a modal panel with inbox + compose sections.
//
// Props:
//   messages     — all messages for this user (inbox), newest first
//   recipients   — list of people this user can message
//   unreadCount  — number of unread messages (drives the badge)
//   currentUserId — the logged-in user's profile id
//   classId      — optional default class context for sent messages
//   theme        — "warm" (student/teacher) or "dark" (admin)
//   canSendToAll — whether "Send to all students" option appears
//   allStudentsClassId — class_id for the "send to all" action
//
// Session 77: initial implementation.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import {
  sendMessage,
  sendMessageToAll,
  markMessageRead,
  markAllRead,
} from "@/lib/message-actions";

// ── Types ────────────────────────────────────────────────────────────────

export type MessageRow = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

export type Recipient = {
  id: string;
  name: string;
  role: "student" | "teacher" | "admin";
};

type Theme = "warm" | "dark";

// ── Color palettes ───────────────────────────────────────────────────────

const WARM = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  panelSoft: "#FFFDF7",
  accent: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
  danger: "#C04030",
  white: "#fff",
  overlay: "rgba(0,0,0,0.35)",
  badge: "#C04030",
  unreadBg: "#FFF8E7",
  sentBg: "#f0e8d8",
  buttonBg: "#D98A2B",
  buttonText: "#fff",
  inputBorder: "#C9A877",
  inputBg: "#fff",
};

const DARK = {
  bg: "#1a1025",
  panel: "rgba(255,255,255,0.06)",
  panelEdge: "rgba(255,255,255,0.12)",
  panelSoft: "rgba(255,255,255,0.03)",
  accent: "#a78bfa",
  text: "#e2e0e8",
  textDim: "rgba(255,255,255,0.55)",
  textFaint: "rgba(255,255,255,0.3)",
  danger: "#f87171",
  white: "#fff",
  overlay: "rgba(0,0,0,0.55)",
  badge: "#f87171",
  unreadBg: "rgba(167,139,250,0.08)",
  sentBg: "rgba(255,255,255,0.03)",
  buttonBg: "#7c3aed",
  buttonText: "#fff",
  inputBorder: "rgba(255,255,255,0.2)",
  inputBg: "rgba(255,255,255,0.06)",
};

function colors(t: Theme) {
  return t === "dark" ? DARK : WARM;
}

// ── Main component ───────────────────────────────────────────────────────

export default function MessagePanel({
  messages,
  recipients,
  unreadCount,
  currentUserId,
  classId,
  theme = "warm",
  canSendToAll = false,
  allStudentsClassId,
}: {
  messages: MessageRow[];
  recipients: Recipient[];
  unreadCount: number;
  currentUserId: string;
  classId?: string;
  theme?: Theme;
  canSendToAll?: boolean;
  allStudentsClassId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"inbox" | "compose">("inbox");
  const [pending, startTransition] = useTransition();
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState("");
  const [sendToAll, setSendToAll] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const c = colors(theme);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Mark all as read when opening inbox
  useEffect(() => {
    if (open && unreadCount > 0) {
      startTransition(() => {
        markAllRead();
      });
    }
  }, [open, unreadCount]);

  const inbox = messages.filter((m) => m.recipientId === currentUserId);
  const sent = messages.filter((m) => m.senderId === currentUserId);

  function handleSend() {
    if (sendToAll && !allStudentsClassId) return;
    if (!sendToAll && !selectedRecipient) return;
    if (!body.trim()) return;

    const fd = new FormData();
    fd.set("body", body.trim());

    if (sendToAll && allStudentsClassId) {
      fd.set("classId", allStudentsClassId);
      startTransition(async () => {
        const result = await sendMessageToAll(fd);
        if (result.error) {
          setSendResult(result.error);
        } else {
          setSendResult(`Sent to ${result.count} students`);
          setBody("");
          setSendToAll(false);
          setTimeout(() => setSendResult(null), 3000);
        }
      });
    } else {
      fd.set("recipientId", selectedRecipient);
      if (classId) fd.set("classId", classId);
      startTransition(async () => {
        const result = await sendMessage(fd);
        if (result.error) {
          setSendResult(result.error);
        } else {
          setSendResult("Message sent");
          setBody("");
          setSelectedRecipient("");
          setTimeout(() => setSendResult(null), 3000);
        }
      });
    }
  }

  // ── BUTTON (always visible) ────────────────────────────────────────

  const button = (
    <button
      onClick={() => {
        setOpen(true);
        setView("inbox");
        setSendResult(null);
      }}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: c.panel,
        border: `1px solid ${c.panelEdge}`,
        borderRadius: 8,
        padding: "7px 14px",
        fontSize: 13,
        fontWeight: 600,
        color: c.text,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      ✉ Messages
      {unreadCount > 0 && (
        <span style={{
          position: "absolute",
          top: -6,
          right: -6,
          background: c.badge,
          color: "#fff",
          fontSize: 10,
          fontWeight: 700,
          minWidth: 18,
          height: 18,
          borderRadius: 9,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 5px",
        }}>
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );

  if (!open) return button;

  // ── MODAL PANEL ────────────────────────────────────────────────────

  return (
    <>
      {button}

      {/* Overlay */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: c.overlay,
          zIndex: 9998,
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(460px, calc(100vw - 32px))",
          maxHeight: "min(600px, calc(100vh - 64px))",
          background: c.bg,
          border: `1px solid ${c.panelEdge}`,
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: `1px solid ${c.panelEdge}`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => setView("inbox")}
              style={{
                background: "none",
                border: "none",
                fontSize: 13,
                fontWeight: view === "inbox" ? 700 : 500,
                color: view === "inbox" ? c.accent : c.textDim,
                cursor: "pointer",
                padding: "2px 0",
                borderBottom: view === "inbox" ? `2px solid ${c.accent}` : "2px solid transparent",
                fontFamily: "inherit",
              }}
            >
              Inbox{inbox.length > 0 ? ` (${inbox.length})` : ""}
            </button>
            <button
              onClick={() => setView("compose")}
              style={{
                background: "none",
                border: "none",
                fontSize: 13,
                fontWeight: view === "compose" ? 700 : 500,
                color: view === "compose" ? c.accent : c.textDim,
                cursor: "pointer",
                padding: "2px 0",
                borderBottom: view === "compose" ? `2px solid ${c.accent}` : "2px solid transparent",
                fontFamily: "inherit",
              }}
            >
              Compose
            </button>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none",
              border: "none",
              fontSize: 18,
              color: c.textDim,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body — scrollable */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 18px",
        }}>
          {view === "inbox" ? (
            <>
              {inbox.length === 0 && sent.length === 0 ? (
                <p style={{ fontSize: 13, color: c.textDim, textAlign: "center", padding: "24px 0" }}>
                  No messages yet.
                </p>
              ) : (
                <>
                  {/* Received */}
                  {inbox.length > 0 && (
                    <div style={{ marginBottom: sent.length > 0 ? 20 : 0 }}>
                      <div style={{
                        fontSize: 10, letterSpacing: 2, fontWeight: 700,
                        color: c.textFaint, textTransform: "uppercase",
                        marginBottom: 8,
                      }}>
                        Received
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {inbox.map((m) => (
                          <div
                            key={m.id}
                            style={{
                              background: m.isRead ? c.panelSoft : c.unreadBg,
                              border: `1px solid ${c.panelEdge}`,
                              borderRadius: 10,
                              padding: "10px 12px",
                            }}
                          >
                            <div style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 4,
                            }}>
                              <span style={{
                                fontSize: 12, fontWeight: 700, color: c.accent,
                              }}>
                                {m.senderName}
                              </span>
                              <span style={{ fontSize: 10, color: c.textFaint }}>
                                {formatDate(m.createdAt)}
                              </span>
                            </div>
                            <p style={{
                              fontSize: 13, color: c.text, lineHeight: 1.5,
                              margin: 0, wordBreak: "break-word",
                            }}>
                              {m.body}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sent */}
                  {sent.length > 0 && (
                    <div>
                      <div style={{
                        fontSize: 10, letterSpacing: 2, fontWeight: 700,
                        color: c.textFaint, textTransform: "uppercase",
                        marginBottom: 8,
                      }}>
                        Sent
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {sent.map((m) => (
                          <div
                            key={m.id}
                            style={{
                              background: c.sentBg,
                              border: `1px solid ${c.panelEdge}`,
                              borderRadius: 10,
                              padding: "10px 12px",
                            }}
                          >
                            <div style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 4,
                            }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: c.textDim }}>
                                To: {m.recipientName}
                              </span>
                              <span style={{ fontSize: 10, color: c.textFaint }}>
                                {formatDate(m.createdAt)}
                              </span>
                            </div>
                            <p style={{
                              fontSize: 13, color: c.text, lineHeight: 1.5,
                              margin: 0, wordBreak: "break-word",
                            }}>
                              {m.body}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            /* ── COMPOSE VIEW ── */
            <div>
              {/* Recipient selector */}
              {canSendToAll && (
                <label style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 13, color: c.text, marginBottom: 12,
                  cursor: "pointer",
                }}>
                  <input
                    type="checkbox"
                    checked={sendToAll}
                    onChange={(e) => {
                      setSendToAll(e.target.checked);
                      if (e.target.checked) setSelectedRecipient("");
                    }}
                    style={{ accentColor: c.accent }}
                  />
                  Send to all students in this class
                </label>
              )}

              {!sendToAll && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{
                    fontSize: 11, letterSpacing: 1, fontWeight: 600,
                    color: c.textFaint, textTransform: "uppercase",
                    display: "block", marginBottom: 4,
                  }}>
                    To
                  </label>
                  <select
                    value={selectedRecipient}
                    onChange={(e) => setSelectedRecipient(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: 13,
                      borderRadius: 8,
                      border: `1px solid ${c.inputBorder}`,
                      background: c.inputBg,
                      color: c.text,
                      fontFamily: "inherit",
                    }}
                  >
                    <option value="">Select a recipient…</option>
                    {/* Group by role */}
                    {(() => {
                      const admins = recipients.filter((r) => r.role === "admin");
                      const teachers = recipients.filter((r) => r.role === "teacher");
                      const students = recipients.filter((r) => r.role === "student");
                      return (
                        <>
                          {admins.length > 0 && (
                            <optgroup label="Admin">
                              {admins.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </optgroup>
                          )}
                          {teachers.length > 0 && (
                            <optgroup label="Teacher">
                              {teachers.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </optgroup>
                          )}
                          {students.length > 0 && (
                            <optgroup label="Students">
                              {students.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      );
                    })()}
                  </select>
                </div>
              )}

              {/* Message body */}
              <div style={{ marginBottom: 12 }}>
                <label style={{
                  fontSize: 11, letterSpacing: 1, fontWeight: 600,
                  color: c.textFaint, textTransform: "uppercase",
                  display: "block", marginBottom: 4,
                }}>
                  Message
                </label>
                <textarea
                  value={body}
                  onChange={(e) => {
                    if (e.target.value.length <= 280) setBody(e.target.value);
                  }}
                  rows={4}
                  placeholder="Write a short message…"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: 13,
                    borderRadius: 8,
                    border: `1px solid ${c.inputBorder}`,
                    background: c.inputBg,
                    color: c.text,
                    fontFamily: "inherit",
                    resize: "vertical",
                    lineHeight: 1.5,
                    boxSizing: "border-box",
                  }}
                />
                <div style={{
                  fontSize: 10, color: body.length > 260 ? c.danger : c.textFaint,
                  textAlign: "right", marginTop: 2,
                }}>
                  {body.length}/280
                </div>
              </div>

              {/* Send button + result */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  onClick={handleSend}
                  disabled={pending || (!sendToAll && !selectedRecipient) || !body.trim()}
                  style={{
                    background: c.buttonBg,
                    color: c.buttonText,
                    border: "none",
                    borderRadius: 8,
                    padding: "7px 16px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: pending ? "wait" : "pointer",
                    opacity: (pending || (!sendToAll && !selectedRecipient) || !body.trim()) ? 0.5 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  {pending ? "Sending…" : "Send"}
                </button>
                {sendResult && (
                  <span style={{
                    fontSize: 12,
                    color: sendResult.startsWith("Message sent") || sendResult.startsWith("Sent to")
                      ? c.accent
                      : c.danger,
                    fontWeight: 600,
                  }}>
                    {sendResult}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
