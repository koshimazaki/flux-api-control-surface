import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BFL API Dashboard",
  description: "Local FLUX.2 API dashboard for prompts, batches, assets, and logs"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
