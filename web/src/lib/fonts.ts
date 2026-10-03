import { Hanken_Grotesk, JetBrains_Mono, Space_Grotesk } from "next/font/google";

// Self-hosted by next/font. The CSS variables feed the --font-* tokens in
// globals.css. Canvas code (the export sheets) must read the generated family
// names from here, because next/font renames each family with a hash.

export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-hanken-grotesk",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const fontVariables = [spaceGrotesk.variable, hankenGrotesk.variable, jetbrainsMono.variable].join(" ");
