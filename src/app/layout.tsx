import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ShellGate } from "@/components/ShellGate";
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
  title: "ClassPrep",
  description: "Teacher productivity platform for creating assessments.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#f5f8f6] text-[#1f2d27]">
        <ShellGate>{children}</ShellGate>
      </body>
    </html>
  );
}
