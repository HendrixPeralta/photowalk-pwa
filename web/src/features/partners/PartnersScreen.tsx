"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/icons/Icon";
import { openAnalysis } from "@/features/analysis/request";
import { t } from "@/lib/i18n/core";
import { navigate } from "@/lib/nav";
import { LIMITS, type RoomPhoto, type RoomSnapshot } from "@/lib/rooms/protocol";
import { formatDate, formatTime } from "@/lib/util";
import { useAccount } from "@/state/account";
import { useAppStore } from "@/state/appStore";
import { closeModal, openModal } from "@/state/ui";
import { personName, settingsOf } from "./debrief";
import { useShareInbox } from "./inbox";
import { InviteModal } from "./InviteModal";
import { ensureRoomImage, roomImageId, useRoomPhotoUrl } from "./roomImages";
import { addComment, deletePhoto, leaveRoom, removeMember, uploadToRoom } from "./rooms";
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
    ? (n === 1 ? t("1 photo ready to share. Press + to post them.") : t("{n} photos ready to share. Press + to post them.", { n }))
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
  const me = useAccount((s) => s.user?.id);
  const isHost = room.hostId === me;
  const photos = room.photos;
  const [progress, setProgress] = useState<Progress | null>(null);

  return (
    <div>
      <div className="debrief-title-row">
        <h2 className="debrief-title">{room.code}</h2>
        <People room={room} isHost={isHost} />
        <div className="room-actions">
          <span
            className="room-photo-count"
            role="img"
            aria-label={photos.length === 1 ? t("{n} photo", { n: 1 }) : t("{n} photos", { n: photos.length })}
          >
            {photos.length}
            <Icon name="camera" />
          </span>
          <AddPhotos onProgress={setProgress} />
          <button
            type="button"
            className="room-qr-btn"
            aria-label={t("Invite your walk partners")}
            title={t("Show the invite QR code")}
            onClick={() => openModal(<InviteModal code={room.code} />)}
          >
            <Icon name="qr" />
          </button>
        </div>
      </div>
      {progress && (
        <p className="banner room-upload-progress" role="status">
          {progress.total > 1
            ? t("Uploading {done} of {total}…", { done: Math.min(progress.done + 1, progress.total), total: progress.total })
            : t("Uploading…")}
        </p>
      )}

      <PhotoGrid room={room} />

      <div className="action-stack">
        {!isHost && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void leaveRoom()}>{t("Leave Room")}</button>
        )}
        <p className="hint room-expiry">
          {t("Rooms close 30 days after the last activity.")} {t("This one closes on {date} unless someone posts.", { date: formatDate(room.expiresAt) })}
        </p>
      </div>
    </div>
  );
}

/* ---------- Photos ---------- */

/** Every shot shared here, newest first, with who took it, the lens, the aperture and the shutter speed. */
function PhotoGrid({ room }: { room: RoomSnapshot }) {
  const photos = [...room.photos].reverse();
  return (
    <>
      <h2 className="section-title">{t("Shared photos")}</h2>
      {photos.length ? (
        <div className="split-grid">{photos.map((p) => <SplitPane key={p.id} room={room} photo={p} />)}</div>
      ) : (
        <div className="empty-state-sm">{t("No photos yet. Press + to share some.")}</div>
      )}
    </>
  );
}

function SplitPane({ room, photo }: { room: RoomSnapshot; photo: RoomPhoto }) {
  const url = useRoomPhotoUrl(photo.id);
  const name = personName(room, photo.userId);
  const settings = settingsOf(photo);
  return (
    <div className="split-pane">
      {/* Tap a shot for its comments, Analyze, and taking it down. */}
      <button type="button" className="split-pane-photo" onClick={() => openModal(<RoomPhotoModal photoId={photo.id} />, { floating: true })}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimize */}
        <img src={url ?? undefined} alt={t("Shared by {name}", { name })} />
        <span className="split-pane-who" title={name}><Avatar user={room.people[photo.userId]} /></span>
      </button>
      <div className="split-pane-exif">
        {settings ? <b>{settings}</b> : <span>{t("no camera data")}</span>}
      </div>
    </div>
  );
}

/* ---------- Sharing ---------- */

/** The + beside the QR: posts what the share sheet sent, or opens the photo picker and posts what's picked. */
function AddPhotos({ onProgress }: { onProgress: (p: Progress | null) => void }) {
  const inbox = useShareInbox((s) => s.files);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (files: readonly File[]) => {
    setBusy(true);
    onProgress({ done: 0, total: files.length });
    try {
      await uploadToRoom(files, "", (done, total) => onProgress({ done, total }));
    } finally {
      setBusy(false);
      onProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label={t("Choose photos")}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (!files.length) return;
          // Picking files replaces whatever the share sheet sent.
          useShareInbox.setState({ files: [] });
          void upload(files);
        }}
      />
      <button
        type="button"
        className="room-qr-btn room-add-btn"
        aria-label={inbox.length ? t("Post the shared photos") : t("Share photos")}
        title={inbox.length ? t("Post the shared photos") : t("Share photos")}
        disabled={busy}
        onClick={() => (inbox.length ? void upload(inbox) : fileRef.current?.click())}
      >
        <Icon name="plus" />
        {inbox.length > 0 && <span className="room-add-count">{inbox.length}</span>}
      </button>
    </>
  );
}

type Progress = { done: number; total: number };

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

/** Who is in the room, as small profile bubbles. Tap one for their name; the host can take them out. */
function People({ room, isHost }: { room: RoomSnapshot; isHost: boolean }) {
  const shown = room.members.slice(0, MAX_BUBBLES);
  const more = room.members.length - shown.length;
  return (
    <div className="room-people" role="group" aria-label={t("People")}>
      {shown.map((id) => {
        const name = personName(room, id);
        return (
          <button
            key={id}
            type="button"
            className="room-person"
            aria-label={id === room.hostId ? t("{name} (host)", { name }) : name}
            title={name}
            onClick={() => openModal(<PersonModal userId={id} isHost={isHost} />)}
          >
            <Avatar user={room.people[id]} />
          </button>
        );
      })}
      {more > 0 && <span className="room-people-more">+{more}</span>}
    </div>
  );
}

const MAX_BUBBLES = 4;

function PersonModal({ userId, isHost }: { userId: string; isHost: boolean }) {
  const room = useCurrentRoom();
  if (!room || !room.members.includes(userId)) return <p className="muted">{t("They're no longer in this room.")}</p>;
  const name = personName(room, userId);
  return (
    <>
      <div className="room-person-card">
        <Avatar user={room.people[userId]} />
        <h3>{name}</h3>
        {userId === room.hostId && <span className="chip chip-muted">{t("Host")}</span>}
      </div>
      {isHost && userId !== room.hostId && (
        <button type="button" className="btn btn-danger" onClick={() => openModal(<RemoveMemberModal name={name} userId={userId} />)}>
          {t("Remove from room")}
        </button>
      )}
    </>
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
