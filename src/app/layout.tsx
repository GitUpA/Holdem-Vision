import type { Metadata } from "next";
import Link from "next/link";
import { Show, UserButton, SignInButton, SignUpButton } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "HoldemVision",
  description: "See what you can't see at the table",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap" rel="stylesheet" />
      </head>
      <body
        className="antialiased font-sans"
      >
        <ConvexClientProvider>
          <header className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--card)]">
            <div className="flex items-center gap-6">
              <Link href="/" className="text-lg font-bold tracking-tight text-[var(--foreground)] hover:text-[var(--gold)] transition-colors">
                HoldemVision
              </Link>
              <nav className="flex items-center gap-1">
                <Link
                  href="/vision"
                  className="text-sm px-3 py-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                >
                  Play
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <Show when="signed-out">
                <SignInButton />
                <SignUpButton />
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </div>
          </header>
          <main>{children}</main>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
