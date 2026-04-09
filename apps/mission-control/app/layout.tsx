import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Mission Control | Cortana",
  description:
    "Operational dashboard for Cortana agents, runs, and health signals.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const initialCollapsed = cookieStore.get("mc-sidebar-collapsed")?.value === "true";

  return (
    <html lang="en">
      <body className="min-h-screen overflow-x-hidden bg-muted/50 antialiased">
        <div className="flex min-h-screen">
          <Sidebar initialCollapsed={initialCollapsed} />
          <main className="min-w-0 w-full flex-1 px-4 pt-24 pb-6 sm:px-6 sm:pb-8 md:pt-8">
            <div className="mx-auto max-w-[90rem]">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
