import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://voxcut.app"),
  applicationName: "Voxcut",
  authors: [{ name: "Hiten Sharma", url: "https://github.com/Hiten1896" }],
  creator: "Hiten Sharma",
  title: {
    default: "Voxcut",
    template: "%s | Voxcut",
  },
  description: "Secure AI-powered editor for repurposing raw video into cleaner, faster, publish-ready clips.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/@tabler/icons-webfont/3.31.0/tabler-icons.min.css"
        />
      </head>
      <body className="min-h-full bg-slate-950 text-slate-50">{children}</body>
    </html>
  );
}