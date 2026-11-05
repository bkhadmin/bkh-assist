import type { Metadata } from "next";
import { Geist_Mono, Inter, Noto_Sans_Thai } from "next/font/google";
import { prefsInitScript } from "@/components/app-shell/ui-prefs";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const notoThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "BKH Assist", template: "%s | BKH Assist" },
  description: "ระบบตรวจความครบถ้วนของการบันทึกข้อมูลใน HOSxP",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme / data-sidebar are set by the head script before paint, hence suppressHydrationWarning.
    <html
      lang="th"
      suppressHydrationWarning
      className={`${inter.variable} ${notoThai.variable} ${geistMono.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: prefsInitScript }} />
      </head>
      {/* AppShell lives in (app)/layout.tsx so /login renders without the sidebar. */}
      <body className="font-sans">{children}</body>
    </html>
  );
}
