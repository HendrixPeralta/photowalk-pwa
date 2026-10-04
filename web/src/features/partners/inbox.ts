// Photos handed to PhotoEYE by the phone's share sheet, waiting to be posted
// to a room. Never saved: they live in the share target's inbox until taken.

import { create } from "zustand";

export const useShareInbox = create<{ files: File[] }>(() => ({ files: [] }));
