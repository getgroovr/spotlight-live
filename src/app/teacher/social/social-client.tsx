"use client";

// Client half of /teacher/social: the interactive moderation queues.
//
// Mirrors deck-client.tsx:
//   - useTransition for the in-flight state,
//   - useOptimistic so a card vanishes the instant you approve/reject it,
//   - the same { ok } | { ok, error } result union surfaced inline.
//
// Both Approve and Reject move an item out of 'pending', so either action
// optimistically removes the card. On failure, useOptimistic discards the
// optimistic state when the transition ends — the card reappears and the error
// shows in the banner. On success, revalidatePath re-renders the server
// component with the item already gone, so the removal sticks.

import { useOptimistic, useState, useTransition } from "react";
import {
  approveSubmission,
  rejectSubmission,
  approveComment,
  rejectComment,
  type GateResult,
} from "./actions";

type Student = {
  id: string;
  name: string | null;
  screen_name: string | null;
  email: string | null;
  photo_url: string | null;
};

type PendingSubmission = {
  id: string;
  round: number;
  media_url: string | null;
  description: string;
  created_at: string;
  student: Student | null;
};

type PendingComment = {
  id: string;
  round: number;
  body: string;
  created_at: string;
  submission_id: string;
  author: Student | null;
  on_description: string | null;
};

function studentName(s: Student | null): string {
  return s?.name || s?.screen_name || s?.email || "Unknown student";
}

function groupByRound<T extends { round: number }>(items: T[]): [number, T[]][] {
  const m = new Map<number, T[]>();
  for (const it of items) {
    const arr = m.get(it.round) ?? [];
    arr.push(it);
    m.set(it.round, arr);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

export function SocialClient({
  pendingSubmissions,
  pendingComments,
}: {
  pendingSubmissions: PendingSubmission[];
  pendingComments: PendingComment[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GateResult | null>(null);

  const [optSubs, removeSub] = useOptimistic(
    pendingSubmissions,
    (cur: PendingSubmission[], id: string) => cur.filter((s) => s.id !== id),
  );
  const [optCmts, removeCmt] = useOptimistic(
    pendingComments,
    (cur: PendingComment[], id: string) => cur.filter((c) => c.id !== id),
  );

  const actSub = (id: string, fn: (id: string) => Promise<GateResult>) => {
    setResult(null);
    startTransition(async () => {
      removeSub(id); // must be inside the transition — useOptimistic requires it
      setResult(await fn(id));
    });
  };
  const actCmt = (id: string, fn: (id: string) => Promise<GateResult>) => {
    setResult(null);
    startTransition(async () => {
      removeCmt(id);
      setResult(await fn(id));
    });
  };

  return (
    <>
      {result && !result.ok && (
        <p className="mb-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          {result.error}
        </p>
      )}

      {/* ── Pending photos ───────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">
          Pending photos{" "}
          <span className="text-sm font-normal text-white/40">({optSubs.length})</span>
        </h2>
        {optSubs.length === 0 ? (
          <p className="text-sm text-white/60">No photos waiting for review.</p>
        ) : (
          groupByRound(optSubs).map(([round, items]) => (
            <RoundBlock key={`sub-${round}`} round={round}>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {items.map((s) => (
                  <SubmissionCard
                    key={s.id}
                    sub={s}
                    pending={pending}
                    onApprove={() => actSub(s.id, approveSubmission)}
                    onReject={() => actSub(s.id, rejectSubmission)}
                  />
                ))}
              </ul>
            </RoundBlock>
          ))
        )}
      </section>

      {/* ── Pending comments ─────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Pending comments{" "}
          <span className="text-sm font-normal text-white/40">({optCmts.length})</span>
        </h2>
        {optCmts.length === 0 ? (
          <p className="text-sm text-white/60">No comments waiting for review.</p>
        ) : (
          groupByRound(optCmts).map(([round, items]) => (
            <RoundBlock key={`cmt-${round}`} round={round}>
              <ul className="space-y-3">
                {items.map((c) => (
                  <CommentCard
                    key={c.id}
                    cmt={c}
                    pending={pending}
                    onApprove={() => actCmt(c.id, approveComment)}
                    onReject={() => actCmt(c.id, rejectComment)}
                  />
                ))}
              </ul>
            </RoundBlock>
          ))
        )}
      </section>
    </>
  );
}

function RoundBlock({ round, children }: { round: number; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-xs uppercase tracking-wide text-white/40">Round {round}</p>
      {children}
    </div>
  );
}

function GateButtons({
  pending,
  onApprove,
  onReject,
}: {
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onApprove}
        disabled={pending}
        className="rounded-full bg-emerald-500/90 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        Approve
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={pending}
        className="rounded-full border border-red-400/40 px-4 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-400/10 disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}

function SubmissionCard({
  sub,
  pending,
  onApprove,
  onReject,
}: {
  sub: PendingSubmission;
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  // Storage for submission pics isn't wired yet (media_url is plain text). Show
  // the image only if it's already a full URL; otherwise a clear placeholder.
  const url = sub.media_url && /^https?:\/\//.test(sub.media_url) ? sub.media_url : null;
  return (
    <li className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="block aspect-[4/3] w-full object-cover" />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-white/10 text-xs text-white/40">
          (image pending storage)
        </div>
      )}
      <div className="space-y-2 p-3">
        <p className="text-sm font-semibold">{studentName(sub.student)}</p>
        <p className="text-sm leading-snug text-white/80">
          {sub.description || <span className="text-white/40">(no description)</span>}
        </p>
        <GateButtons pending={pending} onApprove={onApprove} onReject={onReject} />
      </div>
    </li>
  );
}

function CommentCard({
  cmt,
  pending,
  onApprove,
  onReject,
}: {
  cmt: PendingComment;
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <li className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-sm font-semibold">{studentName(cmt.author)}</p>
      {cmt.on_description && (
        <p className="mb-1 text-xs text-white/40">
          on a photo described as “{cmt.on_description}”
        </p>
      )}
      <p className="mb-2 text-sm leading-snug text-white/80">{cmt.body}</p>
      <GateButtons pending={pending} onApprove={onApprove} onReject={onReject} />
    </li>
  );
}
