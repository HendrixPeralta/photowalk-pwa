"use client";

import { useEffect } from "react";
import { ComingSoon } from "@/components/ComingSoon";
import { launchIfRequested } from "@/features/walks/actions";

/** Live Walk. Starts the walk the Live tab asked for once the screen is showing. */
export function LiveScreen() {
  useEffect(() => {
    launchIfRequested();
  }, []);

  return <ComingSoon view="hud" />;
}
