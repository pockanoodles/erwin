import type { Metadata } from "next";
import { fontVars } from "./_lib/fonts";
import "./globals.css";

// Without its own title the tab showed the bare URL.
export const metadata: Metadata = { title: "404 · Sigwald" };

// Exported as 404.html; the Worker serves it for any unknown /sigwald path.
export default function NotFound() {
  return (
    <html lang="en" data-theme="dark" className={fontVars}>
      <body>
        <main className="lost">
          <p className="label">404</p>
          <h1 className="hero__statement">This page does not exist.</h1>
          <a href="/sigwald/" className="plate plate--lg">
            Back to Sigwald
          </a>
        </main>
      </body>
    </html>
  );
}
