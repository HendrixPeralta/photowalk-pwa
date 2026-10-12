"use client";

import { t } from "@/lib/i18n/core";
import { qrPathData } from "@/lib/qr";
import { showToast } from "@/state/ui";
import { inviteUrl } from "./rooms";

/** A QR code and link that open this room. Black on white: scanners need the contrast. */
export function InviteModal({ code }: { code: string }) {
  const link = inviteUrl(code);
  let qr: { dim: number; path: string } | null = null;
  try {
    qr = qrPathData(link, { moduleSize: 4, quiet: 3 });
  } catch {
    // Only for an absurdly long address; the code and link still work.
  }
  return (
    <div className="invite-card">
      <h3>{t("Invite your walk partners")}</h3>
      {qr && (
        <button
          type="button"
          className="room-qr"
          aria-label={t("Copy the QR code")}
          title={t("Tap to copy")}
          onClick={() => copyQr(qr, link)}
        >
          <svg viewBox={`0 0 ${qr.dim} ${qr.dim}`} width={qr.dim} height={qr.dim} role="img" aria-label={t("QR code for the room invite link")}>
            <rect width={qr.dim} height={qr.dim} fill="#ffffff" />
            <path d={qr.path} fill="#000000" />
          </svg>
        </button>
      )}
      <p className="muted invite-hint">{t("Scan this, or send the link:")}</p>
      <p className="invite-link">{link}</p>
    </div>
  );
}

/** The QR as a PNG on the clipboard. Where images can't be copied, the link goes instead. */
function copyQr(qr: { dim: number; path: string }, link: string) {
  const copyLink = () => {
    if (!navigator.clipboard?.writeText) { showToast(link); return; }
    navigator.clipboard.writeText(link).then(() => showToast(t("Invite link copied to clipboard.")), () => showToast(link));
  };
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) { copyLink(); return; }
  // Handing ClipboardItem a promise keeps the write inside the tap, which Safari insists on.
  const png = qrPng(qr);
  navigator.clipboard.write([new ClipboardItem({ "image/png": png })])
    .then(() => showToast(t("QR code copied.")), copyLink);
}

function qrPng(qr: { dim: number; path: string }): Promise<Blob> {
  // Scaled up so the pasted image stays sharp.
  const scale = 4;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = qr.dim * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("no canvas"));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#000000";
  ctx.fill(new Path2D(qr.path));
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/png"));
}
