import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "PhotoEYE",
  description: "Plan photo walks, learn composition, and organize your reference library.",
  icons: { icon: { url: "/icons/icon.svg", type: "image/svg+xml" } },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "PhotoEYE" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111318",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
