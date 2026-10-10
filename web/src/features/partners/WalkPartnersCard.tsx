"use client";

import { useEffect, useState } from "react";
import { Trans } from "@/components/Trans";
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

/** Create or join a room for the people you're walking with, or go to the one you're in. */
export function WalkPartnersCard() {
  const code = useAppStore((s) => s.currentRoom);
  const [busy, setBusy] = useState(false);

  if (!roomsEnabled()) {
    return (
      <div className="theme-card">
        <p className="muted card-text">{t("Walk Partners needs a connection to the PhotoEYE server.")}</p>
      </div>
    );
  }

  const create = async () => {
    setBusy(true);
    const problem = await createRoom();
    setBusy(false);
    if (problem) showToast(problem);
  };

  return (
    <div className="theme-card">
      {code ? (
        <div>
          <p className="muted card-text">
            <Trans k="Room <strong>{code}</strong> is open for your walk partners." values={{ code }} />
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => navigate("share")}>
            {t("Manage Room")}
          </button>
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
          <YourRooms />
        </div>
      )}
    </div>
  );
}

/** Rooms you're in from any device, to go back to one. Only asked for when online. */
function YourRooms() {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  useEffect(() => {
    if (!navigator.onLine) return;
    let live = true;
    void roomsApi.list().then((res) => { if (live && res.ok) setRooms(res.data.rooms); });
    return () => { live = false; };
  }, []);
  if (!rooms.length) return null;

  const open = async (code: string) => {
    const problem = await joinRoom(code);
    if (problem) showToast(problem);
    else navigate("share");
  };

  return (
    <div className="your-rooms">
      <span className="label-caps">{t("Your rooms")}</span>
      {rooms.map((r) => (
        <button key={r.code} type="button" className="btn btn-ghost btn-sm your-room" onClick={() => void open(r.code)}>
          <strong>{r.code}</strong>
          <span className="muted">
            {r.theme ? `${r.theme} · ` : ""}{r.photoCount === 1 ? t("{n} photo", { n: 1 }) : t("{n} photos", { n: r.photoCount })}
            {r.isHost ? ` · ${t("Host")}` : ""}
          </span>
        </button>
      ))}
    </div>
  );
}
