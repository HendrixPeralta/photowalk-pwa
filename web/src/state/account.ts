// Who is signed in on this device, and what happens to the device's data
// when that changes.
//
// Sign-in is required, but PhotoEYE also has to open with no signal, out on
// a walk. So the signed-in person is remembered on the device: a launch with
// someone remembered opens straight away and checks the session in the
// background, and only a device with nobody remembered waits for the server
// before showing the sign-in screen. A session found to have ended doesn't
// throw anyone out mid-walk; it says so and offers to sign in again.
//
// The device's data belongs to whoever signed in on it. Signing out keeps it
// (for now it exists nowhere else), but when a different person signs in
// here it is wiped first, so no one ever sees someone else's walks or photos.

import { create } from "zustand";
import { accountsEnabled, endSession, fetchSession, startGoogleSignIn, type AccountUser } from "@/lib/authApi";
import { clearImages, takeSharedFiles } from "@/lib/db";
import { FIX_KEY } from "@/lib/geo";
import { t } from "@/lib/i18n/core";
import { reloadPage } from "@/lib/page";
import { STATE_KEY, useAppStore } from "./appStore";
import { defaultState } from "./defaults";
import { PRE_DEMO_KEY } from "./demo";
import { DECLINED_KEY, PRE_SEED_KEY } from "./seed";
import { showToast } from "./ui";

/** The signed-in person, remembered for launches with no signal. */
export const ACCOUNT_KEY = "photoeye:account";
/** The id of the person this device's data belongs to. Outlives sign-out. */
export const OWNER_KEY = "photoeye:owner";

/** Everything personal kept on the device. The language and unsent anonymous reviews stay. */
const PERSONAL_KEYS = [STATE_KEY, PRE_DEMO_KEY, PRE_SEED_KEY, DECLINED_KEY, FIX_KEY, ACCOUNT_KEY];

export interface AccountState {
  user: AccountUser | null;
  /** "expired": the server no longer knows this session; the app keeps working until a reload. */
  status: "signed-in" | "expired";
}

export const useAccount = create<AccountState>(() => ({ user: null, status: "signed-in" }));

/** What boot should show: the app, the sign-in screen, or the sign-in screen saying the server is out of reach. */
export type AccountGate = "app" | "sign-in" | "unreachable";

export async function resolveAccount(): Promise<AccountGate> {
  if (!accountsEnabled()) return "app";
  const remembered = rememberedUser();
  if (remembered) {
    useAccount.setState({ user: remembered, status: "signed-in" });
    void recheckSession(remembered);
    return "app";
  }
  const check = await fetchSession();
  if (check.kind === "none") return "sign-in";
  if (check.kind === "unreachable") return "unreachable";
  await claimDevice(check.user);
  return "app";
}

/** Starts Google sign-in, coming back to this screen. Rejects if it couldn't start. */
export function signIn(): Promise<void> {
  const here = new URL(window.location.href);
  here.searchParams.delete("error"); // left by a sign-in that failed
  return startGoogleSignIn(here.pathname + here.search);
}

/** Signs out and goes back to the sign-in screen. The device keeps its data. */
export async function signOut(): Promise<void> {
  // Offline, the server would never hear of it and the next launch online
  // would quietly sign back in.
  if (!navigator.onLine) {
    showToast(t("Connect to the internet to sign out."));
    return;
  }
  if (!(await endSession())) {
    showToast(t("Couldn't sign out. Try again."));
    return;
  }
  localStorage.removeItem(ACCOUNT_KEY);
  reloadPage();
}

/**
 * Removes everything personal from the device: saved data, set-aside
 * copies, the last location, photos, and the cached copies of avatars.
 */
export async function wipeLocalData(): Promise<void> {
  for (const key of PERSONAL_KEYS) localStorage.removeItem(key);
  useAppStore.setState(defaultState(), true);
  await Promise.allSettled([
    clearImages(),
    takeSharedFiles(),
    // The service worker's cache of other sites' files, where a Google avatar lands.
    typeof caches === "undefined" ? Promise.resolve() : caches.delete("cross-origin"),
  ]);
}

/* ---------- Internals ---------- */

function rememberedUser(): AccountUser | null {
  try {
    const user = JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? "null") as AccountUser | null;
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

/** Hands the device to this person: wipes someone else's data first, then remembers them. */
async function claimDevice(user: AccountUser): Promise<void> {
  const owner = localStorage.getItem(OWNER_KEY);
  // Data from before accounts existed has no owner and simply becomes theirs.
  if (owner && owner !== user.id) await wipeLocalData();
  localStorage.setItem(OWNER_KEY, user.id);
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(user));
  useAccount.setState({ user, status: "signed-in" });
}

async function recheckSession(remembered: AccountUser): Promise<void> {
  const check = await fetchSession();
  if (check.kind === "unreachable") return; // offline: carry on as we are
  if (check.kind === "user") {
    if (check.user.id === remembered.id) {
      // Picks up a new name or photo.
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(check.user));
      useAccount.setState({ user: check.user });
      return;
    }
    // Someone else signed in from another tab: start over as them.
    await claimDevice(check.user);
    reloadPage();
    return;
  }
  // The session ended (expired, or signed out in another tab). The next
  // launch shows the sign-in screen; this one keeps going.
  localStorage.removeItem(ACCOUNT_KEY);
  useAccount.setState({ status: "expired" });
  showToast(t("Your session ended. Sign in again."), 8000, {
    label: t("Sign in"),
    run: () => void signIn().catch(() => showToast(t("Connect to the internet to sign in."))),
  });
}
