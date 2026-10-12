import { fontVars } from "./_lib/fonts";
import "./globals.css";

// Exported as 404.html; the Worker serves it for any unknown /erwin path.
export default function NotFound() {
  return (
    <html lang="en" data-theme="dark" className={fontVars}>
      <body>
        <main className="lost">
          <p className="label">404</p>
          <h1 className="hero__statement">This page does not exist.</h1>
          <a href="/erwin/" className="plate plate--lg">
            Back to Erwin
          </a>
        </main>
      </body>
    </html>
  );
}
