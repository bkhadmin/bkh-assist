import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BKH Assist",
  description: "ตรวจความครบถ้วนของการบันทึก HOSxP",
};

// No next/font/google: the hospital server may build without internet access.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
