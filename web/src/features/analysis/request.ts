// Opening a stored photo on the Analysis screen from anywhere else (a walk's
// frame, a room photo, an album reference).

import { navigate } from "@/lib/nav";
import { analyzeStored, type StoredPhoto } from "./session";

export function openAnalysis(photo: StoredPhoto): void {
  void analyzeStored(photo);
  navigate("analyze");
}
