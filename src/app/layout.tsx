import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["500", "600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Nexora Enterprise — Product, Sales & Financial Management",
  description:
    "US-ready Enterprise Product, Inventory, CRM, Sales, Invoicing, Customer Ledger, Accounting, Multi-Branch & AI Business Management Software.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="min-h-screen antialiased selection:bg-[#C5F04A]/40 selection:text-[#111317]">
        {children}
      </body>
    </html>
  );
}
