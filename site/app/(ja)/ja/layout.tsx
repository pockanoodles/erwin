import { fontVars } from "../../_lib/fonts";
import { metadataFor, viewport } from "../../_lib/meta";
import "../../globals.css";

export const metadata = metadataFor("ja");
export { viewport };

export default function JaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" data-theme="dark" className={fontVars}>
      <body>{children}</body>
    </html>
  );
}
