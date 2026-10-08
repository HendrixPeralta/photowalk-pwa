"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/icons/Icon";
import { openAnalysis } from "@/features/analysis/request";
import { themeById } from "@/lib/content/themes";
import { t } from "@/lib/i18n/core";
import { navigate } from "@/lib/nav";
import { qrPathData } from "@/lib/qr";
import { CRITIQUE_TAGS, LIMITS, type CritiqueTag, type RoomPhoto, type RoomSnapshot } from "@/lib/rooms/protocol";
import { formatDate, formatTime } from "@/lib/util";
import { currentStreak } from "@/lib/walk";
import { useAccount } from "@/state/account";
import { useAppStore } from "@/state/appStore";
import { closeModal, openModal, showToast } from "@/state/ui";
import {
  critiqueTagLabel, detailOf, exportRoomSheet, exposureOf, formatSpan, partnersLabel, personName, pickPair, shutterOf,
} from "./debrief";
import { useShareInbox } from "./inbox";
import { ensureRoomImage, roomImageId, useRoomPhotoUrl } from "./roomImages";
import { addComment, closeRoom, copyInvite, deletePhoto, inviteUrl, leaveRoom, postNote, removeMember, uploadToRoom } from "./rooms";
import { nudgeRoomSync, startRoomSync, useCurrentRoom, useRoom } from "./roomStore";

/** The group review for the room you're in: shots side by side, notes, uploads and the invite. */
export function PartnersScreen() {
  const code = useAppStore((s) => s.currentRoom);
  const room = useCurrentRoom();

  // Fresh while on screen; nothing is asked while Partners isn't showing.
  useEffect(() => (code ? startRoomSync() : undefined), [code]);

  return (
    <section className="view" data-view="share">
      <SharedNotice inRoom={Boolean(code)} />
      {code && <SyncNotice />}
      {room ? <RoomView room={room} /> : code ? (
        <p className="empty-state-sm">{t("Opening room {code}…", { code })}</p>
      ) : (
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

/** Offline (showing the room as last seen), or updates paused after a quiet spell. */
function SyncNotice() {
  const offline = useRoom((s) => s.offline);
  const paused = useRoom((s) => s.paused);
  const syncedAt = useRoom((s) => s.syncedAt);
  if (offline) {
    return (
      <p className="banner room-sync-notice">
        {syncedAt ? t("Offline. Showing the room as of {time}.", { time: formatTime(syncedAt) }) : t("Offline. Connect to see the room.")}
      </p>
    );
  }
  if (!paused) return null;
  return (
    <p className="banner room-sync-notice">
      {t("Updates paused.")}
      <button type="button" className="btn btn-ghost btn-sm" onClick={nudgeRoomSync}>{t("Refresh")}</button>
    </p>
  );
}

function RoomView({ room }: { room: RoomSnapshot }) {
  const lastWalk = useAppStore((s) => s.lastWalk);
  const customThemes = useAppStore((s) => s.customThemes);
  const me = useAccount((s) => s.user?.id);
  const isHost = room.hostId === me;
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
          <strong>{partnersLabel(room)}</strong>
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

      <SideBySide room={room} />
      <FeedbackNotes room={room} />
      <Momentum notes={room.notes.length} />

      <h2 className="section-title">{t("Share your shots")}</h2>
      <ShareForm />
      {!photos.length && <p className="empty-state-sm">{t("No shots shared yet.")}</p>}
      <div className="album-grid">
        {photos.slice().reverse().map((p) => <RoomThumb key={p.id} room={room} photo={p} />)}
      </div>

      <People room={room} isHost={isHost} />
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
          {isHost ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openModal(<CloseRoomModal code={room.code} />)}>
              {t("Close Room")}
            </button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void leaveRoom()}>{t("Leave Room")}</button>
          )}
        </div>
        <p className="hint room-expiry">
          {t("Rooms close 30 days after the last activity.")} {t("This one closes on {date} unless someone posts.", { date: formatDate(room.expiresAt) })}
        </p>
      </div>
    </div>
  );
}

/* ---------- Side by side ---------- */

function SideBySide({ room }: { room: RoomSnapshot }) {
  const [mode, setMode] = useState<"dual" | "wipe">("dual");
  const pair = pickPair(room.photos);
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
        <div className="split-grid">{pair.map((p) => <SplitPane key={p.id} room={room} photo={p} />)}</div>
      )}
      {enough && mode === "wipe" && <Wipe room={room} left={pair[0]} right={pair[1]} />}
    </>
  );
}

function SplitPane({ room, photo }: { room: RoomSnapshot; photo: RoomPhoto }) {
  const url = useRoomPhotoUrl(photo.id);
  const name = personName(room, photo.userId);
  return (
    <div className="split-pane">
      <div className="split-pane-photo">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimize */}
        <img src={url ?? undefined} alt={t("Shared by {name}", { name })} />
        <span className="split-pane-who">@{name}</span>
      </div>
      <div className="split-pane-exif">
        <span className="split-pane-exif-row"><span>{exposureOf(photo)}</span><b>{shutterOf(photo)}</b></span>
        <span className="split-pane-exif-row"><span>{detailOf(photo) || formatTime(photo.ts)}</span></span>
      </div>
    </div>
  );
}

/** One shot over the other, revealed by dragging the handle. */
function Wipe({ room, left, right }: { room: RoomSnapshot; left: RoomPhoto; right: RoomPhoto }) {
  const [fraction, setFraction] = useState(0.5);
  const dragging = useRef(false);
  const top = useRoomPhotoUrl(left.id);
  const bottom = useRoomPhotoUrl(right.id);
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
        <span>← @{personName(room, left.userId)}</span>
        <span>{t("Drag to compare")}</span>
        <span>@{personName(room, right.userId)} →</span>
      </div>
    </div>
  );
}

/* ---------- Feedback ---------- */

function FeedbackNotes({ room }: { room: RoomSnapshot }) {
  const me = useAccount((s) => s.user?.id);
  const [text, setText] = useState("");
  const [tags, setTags] = useState<CritiqueTag[]>([]);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await postNote(text, tags))) return;
      setText("");
      setTags([]);
    } finally {
      setBusy(false);
    }
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
        {CRITIQUE_TAGS.map((tag) => {
          const on = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              className={`critique-tag${on ? " active" : ""}`}
              aria-pressed={on}
              onClick={() => setTags((prev) => (on ? prev.filter((x) => x !== tag) : [...prev, tag]))}
            >
              {critiqueTagLabel(tag)}
            </button>
          );
        })}
      </div>
      <div className="critique-list">
        {room.notes.map((n) => (
          <div key={n.id} className={`critique-note${n.userId === me ? " critique-note-mine" : ""}`}>
            <div className="critique-note-head">
              <span className="critique-note-who">{t("{name} · note at {time}", { name: personName(room, n.userId), time: formatTime(n.ts) })}</span>
              {n.tags.length > 0 && <span className="critique-note-spec">{n.tags.map(critiqueTagLabel).join(" ")}</span>}
            </div>
            <p>{n.text}</p>
          </div>
        ))}
      </div>
      {!room.notes.length && <p className="empty-state-sm">{t("No notes yet. Start with what you were trying to capture.")}</p>}
      <div className="critique-form">
        <input
          type="text"
          className="text-input"
          placeholder={t("Add a note or ask a question…")}
          maxLength={LIMITS.noteText}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
        />
        <button type="button" className="btn btn-accent" aria-label={t("Post note")} disabled={busy} onClick={() => void send()}>
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
  const inbox = useShareInbox((s) => s.files);
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<File[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async () => {
    setProgress({ done: 0, total: 0 });
    try {
      // Photos from the share sheet go first; picking files replaces them.
      if (await uploadToRoom(inbox.length ? inbox : picked, note, (done, total) => setProgress({ done, total }))) {
        setNote("");
        setPicked([]);
        if (fileRef.current) fileRef.current.value = "";
      }
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="theme-card">
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
      <input
        type="text"
        className="text-input"
        placeholder={t("Note (optional)")}
        aria-label={t("Note (optional)")}
        maxLength={LIMITS.photoNote}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="button" className="btn btn-accent btn-block" disabled={progress !== null} onClick={() => void upload()}>
        {progress && progress.total > 1
          ? t("Uploading {done} of {total}…", { done: Math.min(progress.done + 1, progress.total), total: progress.total })
          : progress ? t("Uploading…") : t("Upload")}
      </button>
    </div>
  );
}

function RoomThumb({ room, photo }: { room: RoomSnapshot; photo: RoomPhoto }) {
  const url = useRoomPhotoUrl(photo.id);
  return (
    <button
      type="button"
      className="room-thumb"
      style={url ? { backgroundImage: `url("${url}")` } : undefined}
      onClick={() => openModal(<RoomPhotoModal photoId={photo.id} />)}
    >
      <span className="room-thumb-name">{personName(room, photo.userId)}</span>
    </button>
  );
}

/** One shared shot: who posted it, their note, the comments, Analyze, and taking it down. */
function RoomPhotoModal({ photoId }: { photoId: string }) {
  const room = useCurrentRoom();
  const me = useAccount((s) => s.user?.id);
  const photo = room?.photos.find((p) => p.id === photoId);
  const url = useRoomPhotoUrl(photo?.id);
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  if (!room || !photo) return <p className="muted">{t("This photo was taken down.")}</p>;
  const name = personName(room, photo.userId);
  const mayDelete = photo.userId === me || room.hostId === me;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimize */}
      {url && <img className="detail-image" src={url} alt={t("Shared by {name}", { name })} />}
      <div className="detail-meta">
        <span className="chip">{name}</span>
        <span className="chip chip-muted">{formatTime(photo.ts)}</span>
      </div>
      {photo.note && <p className="muted">{photo.note}</p>}
      {url && (
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={async () => {
            await ensureRoomImage(photo.id);
            closeModal();
            openAnalysis({ imageId: roomImageId(photo.id), exif: photo.exif });
          }}
        >
          {t("Analyze this shot")}
        </button>
      )}
      <div className="comment-list">
        {photo.comments.length
          ? photo.comments.map((c) => <p key={c.id} className="comment"><strong>{personName(room, c.userId)}</strong> {c.text}</p>)
          : <p className="muted">{t("No comments yet. Be the first!")}</p>}
      </div>
      <form
        className="comment-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await addComment(photo.id, text)) setText("");
        }}
      >
        <input type="text" placeholder={t("Add a comment")} aria-label={t("Add a comment")} maxLength={LIMITS.commentText} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn-accent">{t("Post")}</button>
      </form>
      {mayDelete && (confirming ? (
        <div className="theme-actions">
          <button
            type="button"
            className="btn btn-danger-solid"
            onClick={async () => { if (await deletePhoto(photo.id)) closeModal(); }}
          >
            {t("Delete for everyone")}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setConfirming(false)}>{t("Keep it")}</button>
        </div>
      ) : (
        <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>{t("Take down this photo")}</button>
      ))}
    </>
  );
}

/* ---------- People ---------- */

/** Who is in the room. The host can take someone out. */
function People({ room, isHost }: { room: RoomSnapshot; isHost: boolean }) {
  return (
    <div className="theme-card room-people">
      <h4 className="subsection-title" style={{ marginTop: 0 }}>
        {t("People")} <span className="muted">{room.members.length}</span>
      </h4>
      <ul className="room-people-list">
        {room.members.map((id) => {
          const person = room.people[id];
          return (
            <li key={id} className="room-person">
              <Avatar user={person} />
              <span className="room-person-name">{personName(room, id)}</span>
              {id === room.hostId && <span className="chip chip-muted">{t("Host")}</span>}
              {isHost && id !== room.hostId && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => openModal(<RemoveMemberModal name={personName(room, id)} userId={id} />)}
                >
                  {t("Remove from room")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RemoveMemberModal({ name, userId }: { name: string; userId: string }) {
  return (
    <>
      <h3>{t("Remove {name} from the room?", { name })}</h3>
      <p className="muted">{t("They won't be able to rejoin. Their photos and notes stay.")}</p>
      <div className="theme-actions">
        <button type="button" className="btn btn-danger-solid" onClick={() => { closeModal(); void removeMember(userId); }}>
          {t("Remove from room")}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={closeModal}>{t("Cancel")}</button>
      </div>
    </>
  );
}

function CloseRoomModal({ code }: { code: string }) {
  return (
    <>
      <h3>{t("Close room {code}?", { code })}</h3>
      <p className="muted">{t("Everyone loses access and the room's photos are deleted. This can't be undone.")}</p>
      <div className="theme-actions">
        <button type="button" className="btn btn-danger-solid" onClick={() => { closeModal(); void closeRoom(); }}>
          {t("Close Room")}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={closeModal}>{t("Cancel")}</button>
      </div>
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
