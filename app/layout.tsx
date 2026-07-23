import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tower Drop — Stack It Sky High",
  description: "Drop swinging blocks and build the tallest tower.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
