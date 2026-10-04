"use client";

import { Avatar } from "@/components/Avatar";
import { t } from "@/lib/i18n/core";
import { signIn, signOut, useAccount } from "@/state/account";
import { showToast } from "@/state/ui";

/** Who is signed in, with the way out (and back in, once a session has ended). */
export function AccountCard() {
  const user = useAccount((s) => s.user);
  const expired = useAccount((s) => s.status === "expired");

  const signInAgain = () => {
    signIn().catch(() => showToast(t("Connect to the internet to sign in.")));
  };

  return (
    <div className="theme-card account-card">
      <span className="label-caps" style={{ color: "var(--accent-strong)" }}>{t("Account")}</span>
      <div className="account-person">
        <Avatar user={user} />
        <span className="account-names">
          <strong>{user?.name}</strong>
          <span className="muted">{user?.email}</span>
        </span>
      </div>
      <p className="muted card-text">
        {expired
          ? t("Your session ended. Sign in again to keep using your account.")
          : t("Signed in with Google. Your walks, goals and album are saved on this device.")}
      </p>
      <div className="theme-btn-row">
        {expired && <button type="button" className="btn btn-accent btn-sm" onClick={signInAgain}>{t("Sign in again")}</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>{t("Sign out")}</button>
      </div>
    </div>
  );
}
