import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "4Ward Web Design",
  description: "Websites, local SEO, and branding for New Mexico businesses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
