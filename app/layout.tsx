import type { Metadata, Viewport } from "next";
import Providers from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NuvioLink", template: "%s | NuvioLink" },
  description: "View and manage the watchlists of every profile on your Nuvio account.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#07080c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
