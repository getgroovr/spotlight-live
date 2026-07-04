// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/student/dashboard/ResubmitEntryForm.tsx   (REPLACES)
//
// B23 (#47): Client component for resubmitting a rejected entry.
//
// Shows an inline form on the student dashboard when an entry has
// status='rejected'. The student can upload a new photo and write a
// new description, then hit "Resubmit." The form calls resubmitEntry
// in play/actions.ts, which updates the entry in place and resets
// status to 'pending'.
//
// The form starts collapsed behind an "Edit and resubmit" button so
// it doesn't overwhelm the card layout. Once expanded, it shows the
// file picker, textarea, and submit button.
//
// B28 (#48): on success, call router.refresh() so the parent dashboard
//   re-fetches server data and the card re-renders with the NEW media_url
//   (status flips from 'rejected' → 'pending', red border → orange,
//   new photo replaces old).
//
// B74 (session 72): after picking a file, show a thumbnail PREVIEW
//   that REPLACES the native "Choose File / No file chosen" strip.
//   The native input is hidden; a styled label/button proxies the
//   click. Once a file is selected, the strip is replaced by the
//   thumbnail plus a small filename caption + a "Change photo" link.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { resubmitEntry } from "@/app/play/actions";

const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  panelSoft: "#FFFDF7",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
  danger: "#C04030",
  dangerBg: "#FCEAE8",
  liveGreen: "#7A9F5C",
};
const F = "'Outfit',sans-serif";

export default function ResubmitEntryForm({
  entryId,
  currentDescription,
  roundNumber,
}: {
  entryId: string;
  currentDescription: string | null;
  roundNumber: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [description, setDescription] = useState(currentDescription || "");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // B74: cleanup blob URL when component unmounts or file changes.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewName(null);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setPreviewName(file.name);
  }

  function handleSubmit() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fd.set("entry_id", entryId);
    fd.set("entry_description", description);

    // Guard: require a file
    if (!previewUrl) {
      setFeedback("Please choose a new photo before resubmitting.");
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const result = await resubmitEntry(null, fd);
      if (!result.ok) {
        setFeedback(result.error || "Something went wrong.");
      } else {
        setSuccess(true);
        router.refresh();
      }
    });
  }

  if (success) {
    return (
      <div style={{
        background: "#E2EFD9",
        border: `1px solid ${C.liveGreen}`,
        borderRadius: 8, padding: "10px 14px",
        fontSize: 13, color: "#3D5A1F", fontWeight: 600,
        marginTop: 10,
      }}>
        Resubmitted! Refreshing…
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          fontFamily: F,
          fontSize: 12,
          fontWeight: 700,
          padding: "7px 16px",
          borderRadius: 8,
          border: `1px solid ${C.light}`,
          background: C.light,
          color: "#fff",
          cursor: "pointer",
          marginTop: 8,
        }}
      >
        Edit and resubmit →
      </button>
    );
  }

  return (
    <div style={{
      marginTop: 10,
      background: C.panelSoft,
      border: `1px solid ${C.panelEdge}`,
      borderRadius: 10, padding: 14,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color: C.text,
        marginBottom: 10, letterSpacing: 0.5,
      }}>
        Resubmit for Round {roundNumber}
      </div>

      <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
        {/* B74: Photo upload — thumbnail preview REPLACES the filename strip. */}
        <div style={{ marginBottom: 12 }}>
          <label style={{
            fontSize: 11, fontWeight: 600, color: C.textDim,
            textTransform: "uppercase", letterSpacing: 1,
            display: "block", marginBottom: 6,
          }}>
            New photo
          </label>

          {/* Hidden native input — reachable via ref */}
          <input
            ref={fileInputRef}
            type="file"
            name="entry_photo"
            accept="image/*"
            required
            onChange={handleFileChange}
            style={{
              position: "absolute",
              width: 1, height: 1, padding: 0, margin: -1,
              overflow: "hidden", clip: "rect(0,0,0,0)",
              whiteSpace: "nowrap", border: 0,
            }}
          />

          {previewUrl ? (
            // ── Preview mode: thumbnail replaces the filename strip ──
            <div style={{
              display: "flex", gap: 12, alignItems: "flex-start",
              background: "#fff",
              border: `1px solid ${C.panelEdge}`,
              borderRadius: 8, padding: 10,
            }}>
              <img
                src={previewUrl}
                alt="New photo preview"
                style={{
                  width: 84, height: 84,
                  objectFit: "cover",
                  borderRadius: 6,
                  border: `1px solid ${C.panelEdge}`,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                <div style={{
                  fontSize: 12, color: C.text, fontWeight: 600,
                  wordBreak: "break-all", lineHeight: 1.4,
                  marginBottom: 6,
                }}>
                  {previewName}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    fontFamily: F, fontSize: 11, fontWeight: 600,
                    color: C.light, background: "transparent",
                    border: "none", padding: 0, cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Change photo
                </button>
              </div>
            </div>
          ) : (
            // ── Empty mode: styled "Choose photo" button ──
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                fontFamily: F, fontSize: 13, fontWeight: 600,
                padding: "10px 16px", borderRadius: 8,
                border: `1px dashed ${C.panelEdge}`,
                background: "#fff", color: C.textDim,
                cursor: "pointer", width: "100%",
                textAlign: "center",
              }}
            >
              + Choose photo
            </button>
          )}
        </div>

        {/* Description */}
        <div style={{ marginBottom: 12 }}>
          <label style={{
            fontSize: 11, fontWeight: 600, color: C.textDim,
            textTransform: "uppercase", letterSpacing: 1,
            display: "block", marginBottom: 4,
          }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your photo…"
            rows={2}
            style={{
              fontFamily: F, fontSize: 13,
              padding: "8px 10px", borderRadius: 6,
              border: `1px solid ${C.panelEdge}`,
              resize: "vertical", width: "100%",
              boxSizing: "border-box", lineHeight: 1.5,
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            style={{
              fontFamily: F, fontSize: 12, fontWeight: 700,
              padding: "7px 18px", borderRadius: 6,
              border: `1px solid ${C.light}`,
              background: C.light, color: "#fff",
              cursor: isPending ? "default" : "pointer",
              opacity: isPending ? 0.5 : 1,
            }}
          >
            {isPending ? "Submitting…" : "Resubmit"}
          </button>
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              setFeedback(null);
              if (previewUrl) URL.revokeObjectURL(previewUrl);
              setPreviewUrl(null);
              setPreviewName(null);
            }}
            disabled={isPending}
            style={{
              fontFamily: F, fontSize: 12,
              padding: "7px 14px", borderRadius: 6,
              border: `1px solid ${C.panelEdge}`,
              background: "transparent", color: C.textDim,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>

        {feedback && (
          <p style={{
            fontSize: 12, color: C.danger, margin: "8px 0 0",
            lineHeight: 1.4,
          }}>
            {feedback}
          </p>
        )}
      </form>
    </div>
  );
}
