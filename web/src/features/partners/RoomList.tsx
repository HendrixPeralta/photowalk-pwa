"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n/core";
import { LIMITS, type RoomSummary } from "@/lib/rooms/protocol";
import { roomsApi, roomsEnabled } from "@/lib/roomsApi";
import { closeModal, openModal } from "@/state/ui";
import { roomErrorMessage } from "./roomErrors";
import { createRoom, joinRoom, roomLabel } from "./rooms";
import { openRoom } from "./roomStore";

/** The Rooms tab with no room open: start one, join one, or go back to one of yours. */
export function RoomList() {
  if (!roomsEnabled()) {
    return <p className="empty-state-sm">{t("Rooms need a connection to the PhotoEYE server.")}</p>;
  }

  return (
    <div>
      <div className="theme-card">
        <p className="muted card-text">
          {t("Share photos and notes with the friends you walked with. Anyone signed in can join with the room code.")}
        </p>
        <div className="theme-btn-row">
          <button type="button" className="btn btn-accent" onClick={() => openModal(<CreateRoomModal />)}>{t("Create Room")}</button>
          <button type="button" className="btn btn-primary" onClick={() => openModal(<JoinRoomModal />)}>{t("Join Room")}</button>
        </div>
      </div>
      <YourRooms />
    </div>
  );
}

function CreateRoomModal() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    const problem = await createRoom(name);
    setBusy(false);
    if (problem) setError(problem);
    else closeModal();
  };

  return (
    <>
      <h3>{t("Create a Room")}</h3>
      <input
        type="text"
        className="text-input"
        placeholder={t("Room name (optional)")}
        aria-label={t("Room name (optional)")}
        maxLength={LIMITS.roomName}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void create(); }}
      />
      <button type="button" className="btn btn-accent btn-block" disabled={busy} onClick={() => void create()}>{t("Create")}</button>
      <p className="error-text" role="alert">{error}</p>
    </>
  );
}

function JoinRoomModal() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const attempt = async () => {
    if (busy) return;
    setBusy(true);
    const problem = await joinRoom(code);
    setBusy(false);
    if (problem) setError(problem);
    else closeModal();
  };

  return (
    <>
      <h3>{t("Join a Room")}</h3>
      <input
        type="text"
        className="text-input"
        placeholder={t("Room code")}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void attempt(); }}
      />
      <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void attempt()}>{t("Join")}</button>
      <p className="error-text" role="alert">{error}</p>
    </>
  );
}

/** Rooms you're in from any device. Asked for each time the list shows, so names and counts are fresh. */
function YourRooms() {
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void roomsApi.list().then((res) => {
      if (!live) return;
      if (res.ok) setRooms(res.data.rooms);
      else setError(roomErrorMessage(res.error));
    });
    return () => { live = false; };
  }, []);

  return (
    <>
      <h2 className="section-title">{t("Your rooms")}</h2>
      {error ? <p className="empty-state-sm">{error}</p>
        : !rooms ? <p className="empty-state-sm">{t("Loading your rooms…")}</p>
        : !rooms.length ? <p className="empty-state-sm">{t("No rooms yet. Create one or join with a code.")}</p>
        : (
          <div className="your-rooms">
            {rooms.map((r) => (
              <button key={r.code} type="button" className="btn btn-ghost your-room" onClick={() => openRoom(r.code)}>
                <strong>{roomLabel(r)}</strong>
                <span className="muted">
                  {r.name ? `${r.code} · ` : ""}
                  {r.photoCount === 1 ? t("{n} photo", { n: 1 }) : t("{n} photos", { n: r.photoCount })}
                  {r.isHost ? ` · ${t("Host")}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}
    </>
  );
}
