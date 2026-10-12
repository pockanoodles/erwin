import { fontVars } from "../_lib/fonts";
import { metadataFor, viewport } from "../_lib/meta";
import "../globals.css";

export const metadata = metadataFor("en");
export { viewport };

export default function EnLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" className={fontVars}>
      <body>{children}</body>
    </html>
  );
}
