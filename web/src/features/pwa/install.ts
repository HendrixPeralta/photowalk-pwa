// The Install button: shown once the browser says PhotoEYE can be installed.

import { create } from "zustand";
import { t } from "@/lib/i18n/core";
import { showToast } from "@/state/ui";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const useInstallPrompt = create<{ event: InstallPromptEvent | null }>(() => ({ event: null }));

let listening = false;

/** Call as early as possible: the browser offers the prompt once. */
export function listenForInstall(): void {
  if (listening) return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    useInstallPrompt.setState({ event: e as InstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => {
    useInstallPrompt.setState({ event: null });
    showToast(t("PhotoEYE installed to your device."));
  });
}

export async function install(): Promise<void> {
  const event = useInstallPrompt.getState().event;
  if (!event) return;
  await event.prompt();
  await event.userChoice;
  // The prompt can only be used once.
  useInstallPrompt.setState({ event: null });
}
