"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";
/** Anyone with a name and maybe a photo: the signed-in account, or a room member. */
export interface AvatarPerson {
  name: string;
  image: string | null;
  email?: string;
}

/** The person's Google photo, else the first letter of their name, else a plain figure. */
export function Avatar({ user }: { user: AvatarPerson | null | undefined }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (user?.image && broken !== user.image) {
    return (
      <span className="profile-avatar" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- Google's photo URL, already sized */}
        <img src={user.image} alt="" referrerPolicy="no-referrer" onError={() => setBroken(user.image)} />
      </span>
    );
  }
  const initial = (user?.name || user?.email || "").trim().charAt(0).toUpperCase();
  return (
    <span className="profile-avatar" aria-hidden="true">
      {initial ? <span className="profile-initial">{initial}</span> : <Icon name="user" />}
    </span>
  );
}
