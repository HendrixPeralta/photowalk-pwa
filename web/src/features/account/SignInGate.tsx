"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons/Icon";
import { IconSprite } from "@/components/icons/IconSprite";
import { t } from "@/lib/i18n/core";
import { reloadPage } from "@/lib/page";
import { signIn } from "@/state/account";

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

/**
 * In place of the app when nobody is signed in on this device. Google is the
 * only way in. A failed sign-in comes back here with ?error=... in the URL.
 */
export function SignInGate({ unreachable }: { unreachable: boolean }) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(() => new URLSearchParams(window.location.search).has("error"));

  const start = () => {
    setBusy(true);
    setFailed(false);
    // On success the browser leaves for Google, so only failure comes back.
    signIn().catch(() => {
      setBusy(false);
      setFailed(true);
    });
  };

  let problem: string | null = null;
  if (!online) problem = t("Connect to the internet to sign in.");
  else if (unreachable) problem = t("Couldn't reach PhotoEYE. Check your connection and try again.");
  else if (failed) problem = t("Sign-in didn't finish. Try again.");

  return (
    <div className="app-shell signin-gate">
      <IconSprite />
      <main className="signin-body">
        <span className="brand-mark signin-mark">
          <Icon name="shutter" className="brand-icon" />
        </span>
        <h1 className="signin-title">PhotoEYE</h1>
        <p className="signin-tagline">{t("Plan photo walks, learn composition, and keep a reference library.")}</p>

        {unreachable && online ? (
          <button type="button" className="btn btn-accent signin-btn" onClick={reloadPage}>{t("Try again")}</button>
        ) : (
          <button type="button" className="btn signin-btn signin-google" disabled={!online || busy} onClick={start}>
            <GoogleMark />
            <span>{busy ? t("Opening Google…") : t("Continue with Google")}</span>
          </button>
        )}
        <p className="signin-problem" role="status">{problem}</p>
        <p className="hint signin-note">
          {t("PhotoEYE uses your Google name, email address and profile photo for your account.")}
        </p>
      </main>
    </div>
  );
}

/** Google's "G", which its sign-in buttons are expected to carry. */
function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
