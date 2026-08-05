import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The knowledge loop — AI knowledge operations",
  description:
    "Measures the loop between knowledge consumption and knowledge curation from RightAnswers report exports.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
