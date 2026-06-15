import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FLUX API Control Surface",
  description: "Local FLUX.2 API control surface for prompts, references, image tools, assets, and logs"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
