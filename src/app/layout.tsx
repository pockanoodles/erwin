import { Inter } from "next/font/google";

import { Providers } from "@/components/providers";
import { metadata as baseMetadata } from "./metadata";

/** Linear sets UI in Inter Variable. next/font's Inter is that family. */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata = baseMetadata;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body
        className={`${inter.className} flex h-full flex-col bg-background text-[15px] antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
