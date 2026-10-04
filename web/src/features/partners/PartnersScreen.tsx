"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { useImageUrl } from "@/components/useImageUrl";
import { openAnalysis } from "@/features/analysis/request";
import { themeById } from "@/lib/content/themes";
import { t } from "@/lib/i18n/core";
import { navigate } from "@/lib/nav";
import { qrPathData } from "@/lib/qr";
import { formatTime } from "@/lib/util";
import { currentStreak } from "@/lib/walk";
import { useAppStore } from "@/state/appStore";
import type { Room, RoomPhoto } from "@/state/types";
import { closeModal, openModal, showToast } from "@/state/ui";
import {
  critiqueTags, detailOf, exportRoomSheet, exposureOf, formatSpan, partnersLabel, pickPair, shutterOf,
} from "./debrief";
import { useShareInbox } from "./inbox";
import { addComment, copyInvite, inviteUrl, leaveRoom, postNote, uploadToRoom } from "./rooms";

/** The group review for the room you're in: shots side by side, notes, uploads and the invite. */
export function PartnersScreen() {
  const room = useAppStore((s) => (s.currentRoom ? s.rooms[s.currentRoom] ?? null : null));

  return (
    <section className="view" data-view="share">
      <SharedNotice inRoom={Boolean(room)} />
      {room ? <RoomView room={room} /> : (
        <div className="empty-state">
          <p>{t("No active room yet. Create or join one with your walk partners from the Live Walk tab.")}</p>
          <button type="button" className="btn btn-accent" onClick={() => navigate("hud")}>{t("Go to Live Walk")}</button>
        </div>
      )}
    </section>
  );
}

/** Photos from the share sheet, waiting for Upload. Shown with or without a room. */
function SharedNotice({ inRoom }: { inRoom: boolean }) {
  const n = useShareInbox((s) => s.files.length);
  if (!n) return null;
  const text = inRoom
    ? (n === 1 ? t("1 photo ready to share. Press Upload to post them.") : t("{n} photos ready to share. Press Upload to post them.", { n }))
    : (n === 1
      ? t("1 photo ready to share. Create or join a room from the Live Walk tab to post them.")
      : t("{n} photos ready to share. Create or join a room from the Live Walk tab to post them.", { n }));
  return <p className="banner shared-notice">{text}</p>;
}

function RoomView({ room }: { room: Room }) {
  const lastWalk = useAppStore((s) => s.lastWalk);
  const customThemes = useAppStore((s) => s.customThemes);
  const photos = room.photos;
  const span = photos.length >= 2 ? photos[photos.length - 1].ts - photos[0].ts : null;
  // The theme the room was made under, or that of the walk just finished.
  const theme = room.theme || (lastWalk && themeById(lastWalk.themeId, customThemes)?.title) || "";
  const [exporting, setExporting] = useState(false);

  return (
    <div>
      <div className="debrief-head">
        <span className="debrief-head-left">
          <span className="solar-dot" />
          <span className="label-caps">{t("Group Review · Room {code}", { code: room.code })}</span>
        </span>
        <span className="debrief-privacy">{t("Private")}</span>
      </div>
      <h2 className="debrief-title">{room.code}</h2>
      <p className="debrief-sub">{room.theme ? t("Theme: {theme}", { theme: room.theme }) : t("No theme set")}</p>

      <div className="debrief-meta">
        <div>
          <span className="label-caps">{t("Duration")}</span>
          <strong title={span !== null ? t("Span between the first and last shot shared here") : undefined}>
            {span !== null ? formatSpan(span) : "--"}
          </strong>
        </div>
        <div className="debrief-meta-accent">
          <span className="label-caps">{t("Photos")}</span>
          <strong>
            {photos.length ? (photos.length === 1 ? t("{n} photo", { n: 1 }) : t("{n} photos", { n: photos.length })) : t("none yet")}
          </strong>
        </div>
        <div className="debrief-meta-cyan">
          <span className="label-caps">{t("Partners")}</span>
          <strong>{partnersLabel(photos)}</strong>
        </div>
      </div>

      {theme && (
        <div className="theme-card">
          <span className="label-caps">{t("The Challenge")}</span>
          <h3>{theme}</h3>
          <p className="muted card-text">
            {lastWalk?.challengeCount
              ? t("{done} of {total} mini-challenges done on this walk.", { done: lastWalk.challengesDone, total: lastWalk.challengeCount })
              : t("Compare what each of you did with the same brief.")}
          </p>
        </div>
      )}

      <SideBySide photos={photos} />
      <FeedbackNotes room={room} />
      <Momentum notes={room.critique?.length ?? 0} />

      <h2 className="section-title">{t("Share your shots")}</h2>
      <ShareForm />
      {!photos.length && <p className="empty-state-sm">{t("No shots shared yet.")}</p>}
      <div className="album-grid">
        {photos.slice().reverse().map((p) => <RoomThumb key={p.id} code={room.code} photo={p} />)}
      </div>

      <Invite code={room.code} />

      <div className="action-stack">
        <button
          type="button"
          className="btn btn-accent btn-block"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try { await exportRoomSheet(room); } finally { setExporting(false); }
          }}
        >
          <Icon name="download" />
          {t("Download Side-by-Side Sheet")}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => {
            navigate("settings");
            showToast(t("Set a reminder here and your next walk is on the calendar."));
          }}
        >
          <Icon name="repeat" />
          {t("Schedule Next Walk")}
        </button>
        <div className="theme-btn-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={copyInvite}>{t("Copy Invite")}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={leaveRoom}>{t("Leave Room")}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Side by side ---------- */

function SideBySide({ photos }: { photos: RoomPhoto[] }) {
  const [mode, setMode] = useState<"dual" | "wipe">("dual");
  const pair = pickPair(photos);
  const enough = pair.length === 2;

  return (
    <>
      <h2 className="section-title">{t("Side-by-side study")}</h2>
      <div className="split-toolbar">
        <button type="button" className={`chip-btn${mode === "dual" ? " active" : ""}`} aria-pressed={mode === "dual"} onClick={() => setMode("dual")}>
          {t("Side by Side")}
        </button>
        <button type="button" className={`chip-btn${mode === "wipe" ? " active" : ""}`} aria-pressed={mode === "wipe"} onClick={() => setMode("wipe")}>
          {t("Slider")}
        </button>
        <span className="split-synced">{t("With camera settings")}</span>
      </div>
      {!enough && <div className="empty-state-sm">{t("Share at least two shots to line them up side by side.")}</div>}
      {enough && mode === "dual" && (
        <div className="split-grid">{pair.map((p) => <SplitPane key={p.id} photo={p} />)}</div>
      )}
      {enough && mode === "wipe" && <Wipe left={pair[0]} right={pair[1]} />}
    </>
  );
}

function SplitPane({ photo }: { photo: RoomPhoto }) {
  const url = useImageUrl(photo.imageId);
  return (
    <div className="split-pane">
      <div className="split-pane-photo">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimize */}
        <img src={url ?? undefined} alt={t("Shared by {name}", { name: photo.name })} />
        <span className="split-pane-who">@{photo.name}</span>
      </div>
      <div className="split-pane-exif">
        <span className="split-pane-exif-row"><span>{exposureOf(photo)}</span><b>{shutterOf(photo)}</b></span>
        <span className="split-pane-exif-row"><span>{detailOf(photo) || formatTime(photo.ts)}</span></span>
      </div>
    </div>
  );
}

/** One shot over the other, revealed by dragging the handle. */
function Wipe({ left, right }: { left: RoomPhoto; right: RoomPhoto }) {
  const [fraction, setFraction] = useState(0.5);
  const dragging = useRef(false);
  const top = useImageUrl(left.imageId);
  const bottom = useImageUrl(right.imageId);
  const pct = Math.max(0, Math.min(1, fraction)) * 100;

  const move = (el: HTMLElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    if (rect.width) setFraction((clientX - rect.left) / rect.width);
  };

  return (
    <div>
      <div
        className="wipe-frame"
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          move(e.currentTarget, e.clientX);
        }}
        onPointerMove={(e) => { if (dragging.current) move(e.currentTarget, e.clientX); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimize */}
        <img src={bottom ?? undefined} alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimize */}
        <img src={top ?? undefined} className="wipe-top" alt="" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }} />
        <div className="wipe-handle" style={{ left: `${pct}%` }} />
      </div>
      <div className="wipe-caption">
        <span>← @{left.name}</span>
        <span>{t("Drag to compare")}</span>
        <span>@{right.name} →</span>
      </div>
    </div>
  );
}

/* ---------- Feedback ---------- */

function FeedbackNotes({ room }: { room: Room }) {
  const me = useAppStore((s) => s.profile.displayName);
  const [text, setText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const notes = room.critique ?? [];

  const send = () => {
    if (!postNote(text, tags)) return;
    setText("");
    setTags([]);
  };

  return (
    <>
      <div className="critique-head">
        <span className="critique-head-left">
          <Icon name="chat" />
          <strong>{t("Feedback Notes")}</strong>
        </span>
        <span className="critique-motto">{t("No likes, just notes")}</span>
      </div>
      <div className="critique-tags">
        {critiqueTags().map((tag) => {
          const on = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              className={`critique-tag${on ? " active" : ""}`}
              aria-pressed={on}
              onClick={() => setTags((prev) => (on ? prev.filter((x) => x !== tag) : [...prev, tag]))}
            >
              {tag}
            </button>
          );
        })}
      </div>
      <div className="critique-list">
        {notes.map((n, i) => (
          <div key={i} className={`critique-note${n.name === me ? " critique-note-mine" : ""}`}>
            <div className="critique-note-head">
              <span className="critique-note-who">{t("{name} · note at {time}", { name: n.name, time: formatTime(n.ts) })}</span>
              {n.spec && <span className="critique-note-spec">{n.spec}</span>}
            </div>
            <p>{n.text}</p>
          </div>
        ))}
      </div>
      {!notes.length && <p className="empty-state-sm">{t("No notes yet. Start with what you were trying to capture.")}</p>}
      <div className="critique-form">
        <input
          type="text"
          className="text-input"
          placeholder={t("Add a note or ask a question…")}
          maxLength={400}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
        />
        <button type="button" className="btn btn-accent" aria-label={t("Post note")} onClick={send}>
          <Icon name="send" />
        </button>
      </div>
    </>
  );
}

function Momentum({ notes }: { notes: number }) {
  const streak = useAppStore((s) => currentStreak(s.profile));
  return (
    <div className="momentum-card">
      <span className="momentum-flame"><Icon name="flame" /></span>
      <span className="momentum-body">
        <span className="label-caps">{t("Your Streak")}</span>
        <strong>{t("{n}-day streak", { n: streak })}</strong>
      </span>
      <span className="momentum-badge">+{notes}<br />{t("NOTES")}</span>
    </div>
  );
}

/* ---------- Sharing ---------- */

function ShareForm() {
  const savedName = useAppStore((s) => s.profile.displayName);
  const inbox = useShareInbox((s) => s.files);
  const [name, setName] = useState(savedName);
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async () => {
    setBusy(true);
    try {
      // Photos from the share sheet go first; picking files replaces them.
      if (await uploadToRoom(inbox.length ? inbox : picked, name, note)) {
        setNote("");
        setPicked([]);
        if (fileRef.current) fileRef.current.value = "";
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="theme-card">
      <input type="text" className="text-input" placeholder={t("Your name")} aria-label={t("Your name")} value={name} onChange={(e) => setName(e.target.value)} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="text-input"
        aria-label={t("Choose photos")}
        onChange={(e) => {
          setPicked(Array.from(e.target.files ?? []));
          useShareInbox.setState({ files: [] });
        }}
      />
      <input type="text" className="text-input" placeholder={t("Note (optional)")} aria-label={t("Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} />
      <button type="button" className="btn btn-accent btn-block" disabled={busy} onClick={upload}>{t("Upload")}</button>
    </div>
  );
}

function RoomThumb({ code, photo }: { code: string; photo: RoomPhoto }) {
  const url = useImageUrl(photo.imageId);
  return (
    <button
      type="button"
      className="room-thumb"
      style={url ? { backgroundImage: `url("${url}")` } : undefined}
      onClick={() => openModal(<RoomPhotoModal code={code} photoId={photo.id} />)}
    >
      <span className="room-thumb-name">{photo.name}</span>
    </button>
  );
}

/** One shared shot: who posted it, their note, the comments, and Analyze. */
function RoomPhotoModal({ code, photoId }: { code: string; photoId: string }) {
  const photo = useAppStore((s) => s.rooms[code]?.photos.find((p) => p.id === photoId));
  const savedName = useAppStore((s) => s.profile.displayName);
  const url = useImageUrl(photo?.imageId);
  const [name, setName] = useState(savedName);
  const [text, setText] = useState("");
  if (!photo) return null;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimize */}
      {url && <img className="detail-image" src={url} alt={t("Shared by {name}", { name: photo.name })} />}
      <div className="detail-meta">
        <span className="chip">{photo.name}</span>
        <span className="chip chip-muted">{formatTime(photo.ts)}</span>
      </div>
      {photo.note && <p className="muted">{photo.note}</p>}
      {url && (
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => {
            closeModal();
            openAnalysis({ imageId: photo.imageId, exif: photo.exif });
          }}
        >
          {t("Analyze this shot")}
        </button>
      )}
      <div className="comment-list">
        {photo.comments.length
          ? photo.comments.map((c, i) => <p key={i} className="comment"><strong>{c.name}</strong> {c.text}</p>)
          : <p className="muted">{t("No comments yet. Be the first!")}</p>}
      </div>
      <form
        className="comment-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (addComment(code, photo.id, name, text)) setText("");
        }}
      >
        <input type="text" placeholder={t("Your name")} aria-label={t("Your name")} maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
        <input type="text" placeholder={t("Add a comment")} aria-label={t("Add a comment")} maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn-accent">{t("Post")}</button>
      </form>
    </>
  );
}

/** A QR code and link that open this room. Black on white: scanners need the contrast. */
function Invite({ code }: { code: string }) {
  const link = inviteUrl(code);
  let qr: { dim: number; path: string } | null = null;
  try {
    qr = qrPathData(link, { moduleSize: 4, quiet: 3 });
  } catch {
    // Only for an absurdly long address; the code and link still work.
  }
  return (
    <div className="theme-card invite-card" style={{ marginTop: 12 }}>
      <h4 className="subsection-title" style={{ marginTop: 0 }}>{t("Invite your walk partners")}</h4>
      <div className="room-qr">
        {qr && (
          <svg viewBox={`0 0 ${qr.dim} ${qr.dim}`} width={qr.dim} height={qr.dim} role="img" aria-label={t("QR code for the room invite link")}>
            <rect width={qr.dim} height={qr.dim} fill="#ffffff" />
            <path d={qr.path} fill="#000000" />
          </svg>
        )}
      </div>
      <p className="muted invite-hint">{t("Scan this, or send the link:")}</p>
      <p className="invite-link">{link}</p>
    </div>
  );
}
