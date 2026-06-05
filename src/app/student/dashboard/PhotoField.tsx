// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/PhotoField.tsx — client photo field with preview.
//
// A labeled <input type="file"> that shows a live preview the moment a file is
// chosen, so the student can SEE the photo while they describe it and confirm
// they grabbed the right one. Re-picking via the native "Choose File" replaces
// it; optional fields also get a "Remove" link.
//
// The native input is kept IN the layout (not display:none) on purpose: a
// hidden `required` file input throws "An invalid form control is not
// focusable" and silently blocks submit in some browsers. Keeping it visible
// avoids that entirely. The input still carries `name`, so it posts to the
// saveProfile server action exactly as before — this component adds preview
// only, no form-state changes.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useRef, useState } from "react";

const C = {
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textFaint: "#9A815E",
};
const F = "'Outfit',sans-serif";

export default function PhotoField({
  name,
  label,
  helper,
  required = false,
  previewSize = 140,
}: {
  name: string;
  label: string;
  helper?: string;
  required?: boolean;
  previewSize?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    if (preview) URL.revokeObjectURL(preview);
    if (file) {
      setPreview(URL.createObjectURL(file));
      setFileName(file.name);
    } else {
      setPreview(null);
      setFileName(null);
    }
  }

  function remove() {
    if (inputRef.current) inputRef.current.value = "";
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFileName(null);
  }

  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
        {label}
        {helper && (
          <span style={{ color: C.textFaint, fontWeight: 400 }}> — {helper}</span>
        )}
      </label>

      <input
        ref={inputRef}
        name={name}
        type="file"
        accept="image/*"
        required={required}
        onChange={onChange}
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
          fontFamily: F, fontSize: 14, background: "#FFFDF7", color: C.text,
          border: `1px solid ${C.panelEdge}`, borderRadius: 10, outline: "none" }}
      />

      {preview && (
        <div style={{ display: "flex", gap: 12, alignItems: "center",
          background: C.panel, border: `1px solid ${C.panelEdge}`,
          borderRadius: 12, padding: 10, marginTop: 10 }}>
          <img
            src={preview}
            alt="Your selected photo"
            style={{ width: previewSize, height: previewSize, objectFit: "cover",
              borderRadius: 10, border: `2px solid ${C.light}`, flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4,
              wordBreak: "break-word", marginBottom: 6 }}>
              {fileName}
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                  fontFamily: F, fontSize: 13, fontWeight: 700, color: C.light }}
              >
                Replace
              </button>
              {!required && (
                <button
                  type="button"
                  onClick={remove}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                    fontFamily: F, fontSize: 13, color: C.textFaint }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
