// A photo handed to the Analysis screen from elsewhere (a walk's frame, an
// album reference). The Analysis screen takes it when it opens.

import type { Exif } from "@/lib/exif";
import { navigate } from "@/lib/nav";

export interface AnalysisRequest {
  imageId: string;
  exif: Exif | null;
}

let pending: AnalysisRequest | null = null;

export function openAnalysis(request: AnalysisRequest): void {
  pending = request;
  navigate("analyze");
}

/** The photo waiting to be analyzed, once. */
export function takeAnalysisRequest(): AnalysisRequest | null {
  const request = pending;
  pending = null;
  return request;
}
