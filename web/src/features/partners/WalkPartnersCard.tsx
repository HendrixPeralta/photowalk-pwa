"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { t } from "@/lib/i18n/core";
import { navigate } from "@/lib/nav";
import type { RoomSummary } from "@/lib/rooms/protocol";
import { roomsApi, roomsEnabled } from "@/lib/roomsApi";
import { useAppStore } from "@/state/appStore";
import { closeModal, openModal, showToast } from "@/state/ui";
import { createRoom, joinRoom } from "./rooms";

export function JoinRoomModal() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const attempt = async () => {
    if (busy) return;
    setBusy(true);
    const problem = await joinRoom(code);
    setBusy(false);
    if (problem) setError(problem);
    else {
      closeModal();
      navigate("share");
    }
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

/** Create a room or join one, without leaving the list of rooms you're in. */
function AddRoomModal() {
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    const problem = await createRoom();
    setBusy(false);
    if (problem) showToast(problem);
    else closeModal();
  };
  return (
    <>
      <h3>{t("Add a room")}</h3>
      <div className="theme-actions theme-actions-row">
        <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void create()}>{t("Create Room")}</button>
        <button type="button" className="btn btn-primary" onClick={() => openModal(<JoinRoomModal />, { floating: true })}>{t("Join Room")}</button>
      </div>
    </>
  );
}

/** Every room you're in, from any device: tap a code to copy it, or go in. The + makes or joins another. */
export function WalkPartnersCard() {
  const current = useAppStore((s) => s.currentRoom);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const enabled = roomsEnabled();

  // Only asked for when online. Asked again when the room on this device changes.
  useEffect(() => {
    if (!enabled || !navigator.onLine) return;
    let live = true;
    void roomsApi.list().then((res) => { if (live && res.ok) setRooms(res.data.rooms); });
    return () => { live = false; };
  }, [enabled, current]);

  if (!enabled) {
    return (
      <div className="theme-card">
        <p className="muted card-text">{t("Walk Partners needs a connection to the PhotoEYE server.")}</p>
      </div>
    );
  }

  // The room on this device shows even before the list arrives, or offline.
  const shown: Array<RoomSummary | { code: string }> =
    current && !rooms.some((r) => r.code === current) ? [{ code: current }, ...rooms] : rooms;

  const create = async () => {
    setBusy(true);
    const problem = await createRoom();
    setBusy(false);
    if (problem) showToast(problem);
  };

  const enter = async (code: string) => {
    if (code !== current) {
      const problem = await joinRoom(code);
      if (problem) { showToast(problem); return; }
    }
    navigate("share");
  };

  return (
    <div className="theme-card">
      <div className="your-rooms-head">
        <span className="label-caps">{t("Active rooms")}</span>
        <button
          type="button"
          className="rooms-add"
          aria-label={t("Add a room")}
          onClick={() => openModal(<AddRoomModal />, { floating: true })}
        >
          <Icon name="plus" />
        </button>
      </div>
      {shown.length ? (
        <div className="your-rooms">
          {shown.map((r) => (
            <div key={r.code} className="your-room">
              <button
                type="button"
                className="room-code-card"
                aria-label={t("Copy room code {code}", { code: r.code })}
                title={t("Tap to copy")}
                onClick={() => copyCode(r.code)}
              >
                {r.code}
              </button>
              <button type="button" className="room-enter" onClick={() => void enter(r.code)}>{t("Enter room")}</button>
              <span className="your-room-meta muted">
                {"photoCount" in r && (
                  <>
                    {r.photoCount === 1 ? t("{n} photo", { n: 1 }) : t("{n} photos", { n: r.photoCount })}
                    {r.isHost ? ` · ${t("Host")}` : ""}
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <p className="muted card-text">
            {t("Share photos and notes with the friends you walked with. Anyone signed in can join with the room code.")}
          </p>
          <div className="theme-btn-row">
            <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void create()}>{t("Create Room")}</button>
            <button type="button" className="btn btn-primary" onClick={() => openModal(<JoinRoomModal />)}>{t("Join Room")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function copyCode(code: string) {
  const fallback = () => showToast(t("Code: {code}", { code }));
  if (!navigator.clipboard?.writeText) { fallback(); return; }
  navigator.clipboard.writeText(code).then(() => showToast(t("Room code {code} copied.", { code })), fallback);
}
