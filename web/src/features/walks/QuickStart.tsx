"use client";

import { useState } from "react";
import { FabMenu, type FabOption } from "@/components/FabMenu";
import type { IconName } from "@/components/icons/sprite";
import { createRoom } from "@/features/partners/rooms";
import { JoinRoomModal } from "@/features/partners/WalkPartnersCard";
import { t } from "@/lib/i18n/core";
import { navigate } from "@/lib/nav";
import { roomsEnabled } from "@/lib/roomsApi";
import { modeTitle } from "@/lib/walk";
import type { WalkMode } from "@/state/types";
import { openModal, showToast } from "@/state/ui";
import { launchWalk, setMode } from "./actions";

// Challenge first: it's the one with the most to it.
const MODES: { mode: WalkMode; icon: IconName }[] = [
  { mode: "guided", icon: "timer" },
  { mode: "casual", icon: "lens" },
];

/**
 * The floating + button, shown while no walk is open. Tapping it offers a room
 * for your walk partners (make or join one), then the two walk modes; picking
 * one opens that walk's brief.
 */
export function QuickStart() {
  const [busy, setBusy] = useState(false);

  function start(mode: WalkMode, close: () => void) {
    close();
    setMode(mode);
    launchWalk();
  }

  async function room(close: () => void) {
    if (busy) return;
    setBusy(true);
    const problem = await createRoom();
    setBusy(false);
    if (problem) { showToast(problem); return; }
    close();
    navigate("share");
  }

  const options: FabOption[] = [
    ...(roomsEnabled()
      ? [
          { key: "create-room", icon: "share" as const, label: t("Create Room"), disabled: busy, onSelect: (close: () => void) => void room(close) },
          { key: "join-room", icon: "user" as const, label: t("Join Room"), onSelect: (close: () => void) => { close(); openModal(<JoinRoomModal />); } },
        ]
      : []),
    ...MODES.map(({ mode, icon }) => ({ key: mode, icon, label: modeTitle(mode), onSelect: (close: () => void) => start(mode, close) })),
  ];

  return <FabMenu label={t("Start Photo Walk")} options={options} />;
}
