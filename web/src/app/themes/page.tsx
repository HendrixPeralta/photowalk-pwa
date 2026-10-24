import { Suspense } from "react";
import { MyThemesScreen } from "@/features/themes/MyThemesScreen";

// The screen reads ?edit= from the address, which only exists in the browser.
export default function ThemesPage() {
  return (
    <Suspense>
      <MyThemesScreen />
    </Suspense>
  );
}
