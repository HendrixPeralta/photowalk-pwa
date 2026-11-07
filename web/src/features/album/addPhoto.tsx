import { SaveTagsModal } from "@/features/analysis/PhotoPanes";
import { analyzeFile, useAnalysis } from "@/features/analysis/session";
import { navigate } from "@/lib/nav";
import { openModal } from "@/state/ui";

/** Opens a picked photo in Analysis and asks for tags, ready to save to the Reference Album. */
export async function addPhotoToAlbum(file: File): Promise<void> {
  await analyzeFile(file);
  // A photo that couldn't be opened has already said so; leave the screen as it is.
  if (!useAnalysis.getState().frame) return;
  navigate("analyze");
  openModal(<SaveTagsModal updating={false} />);
}
