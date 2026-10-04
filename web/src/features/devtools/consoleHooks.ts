// Console handles for demos and testing, kept from the old app:
//   photowalkDemo.seed({ seed: 7 }), .ensure(), .clear(), .active(), .status()
//   photowalkHistory.seed(), .undo(), .status()
//   photowalkPhotos.seed(), .ensure(), .clear(), .status()

import { clearStarterAlbum, maybeSeedStarterAlbum, seedStarterAlbum, STARTER_PHOTOS } from "@/features/album/references";
import { totalActivityHours } from "@/lib/stats";
import { formatHours } from "@/lib/util";
import { currentStreak } from "@/lib/walk";
import { getData } from "@/state/appStore";
import { clearDemoData, ensureDemoData, seedDemoData } from "@/state/demo";
import { DECLINED_KEY, seedStarterHistory, undoStarterHistory } from "@/state/seed";

export function installConsoleHooks(): void {
  const stats = () => {
    const d = getData();
    return {
      activeDays: Object.keys(d.activityLog).length,
      walks: d.profile.walksCompleted,
      streak: currentStreak(d.profile),
      totalHours: formatHours(totalActivityHours(d.activityLog)),
      rewards: d.rewards.length,
    };
  };

  Object.assign(window, {
    photowalkDemo: {
      seed: seedDemoData,
      ensure: ensureDemoData,
      clear: clearDemoData,
      active: () => Boolean(getData().demoMode),
      status: () => ({ ...(getData().demoMode ?? { seed: null }), ...stats() }),
    },
    photowalkHistory: {
      seed: seedStarterHistory,
      undo: undoStarterHistory,
      status: () => ({ ...(getData().seededHistory ?? { seed: null }), declined: Boolean(localStorage.getItem(DECLINED_KEY)), ...stats() }),
    },
    photowalkPhotos: {
      seed: seedStarterAlbum,
      ensure: maybeSeedStarterAlbum,
      clear: clearStarterAlbum,
      status: () => {
        const d = getData();
        return {
          ...(d.seededAlbum ?? { count: 0, seededAt: null }),
          bundled: STARTER_PHOTOS.length,
          inAlbum: d.album.filter((item) => item.seeded).length,
          albumTotal: d.album.length,
        };
      },
    },
  });
}
