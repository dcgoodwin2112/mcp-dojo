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

const description =
  "A practice space for the Model Context Protocol — explore MCP servers hands-on and watch every exchange. Event log, timeline, replay.";

export const metadata: Metadata = {
  metadataBase: new URL("https://mcpdojo.dev"),
  title: "MCP Dojo",
  description,
  openGraph: {
    title: "MCP Dojo",
    description,
    url: "https://mcpdojo.dev",
    siteName: "MCP Dojo",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "MCP Dojo",
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
