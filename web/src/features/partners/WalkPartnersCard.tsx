"use client";

import { useState } from "react";
import { Trans } from "@/components/Trans";
import { t } from "@/lib/i18n/core";
import { navigate } from "@/lib/nav";
import { useAppStore } from "@/state/appStore";
import { closeModal, openModal } from "@/state/ui";
import { createRoom, joinRoom } from "./rooms";

function JoinRoomModal() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const attempt = () => {
    const problem = joinRoom(code);
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
        onKeyDown={(e) => { if (e.key === "Enter") attempt(); }}
      />
      <button type="button" className="btn btn-primary btn-block" onClick={attempt}>{t("Join")}</button>
      <p className="error-text" role="alert">{error}</p>
    </>
  );
}

/** Create or join a room for the people you're walking with, or go to the one you're in. */
export function WalkPartnersCard() {
  const code = useAppStore((s) => (s.currentRoom && s.rooms[s.currentRoom] ? s.currentRoom : null));

  return (
    <div className="theme-card">
      <h4 className="subsection-title" style={{ marginTop: 0 }}>{t("Walk Partners")}</h4>
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
            {t("Share photos and notes with the friends you walked with. For now this is a demo: rooms only connect tabs open in this same browser.")}
          </p>
          <div className="theme-btn-row">
            <button type="button" className="btn btn-accent" onClick={() => createRoom()}>{t("Create Room")}</button>
            <button type="button" className="btn btn-primary" onClick={() => openModal(<JoinRoomModal />)}>{t("Join Room")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
