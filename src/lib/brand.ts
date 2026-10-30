/**
 * The product's identity, in one place. Rename the product here and every
 * title, email, menu and heading follows. This file must stay free of imports:
 * the desktop build copies it into the Electron shell (scripts/desktop/sync-brand.mjs).
 *
 * What does not follow, because tools read it before any code runs: the
 * Electron builder config, package names, the store manifests in packaging/,
 * the Dockerfile, and the persisted identifiers (database name, storage keys)
 * that existing installs already hold.
 */
export const brand = {
  name: "Sigwald",
  /** Lowercase, safe in filenames and storage keys. */
  slug: "sigwald",
  description:
    "Your calendar, your tasks and the modules you choose, and the one thing to do next.",
  siteUrl: "https://kaitosoeno.com/sigwald",
  repoUrl: "https://github.com/pockanoodles/sigwald",
  issuesUrl: "https://github.com/pockanoodles/sigwald/issues",
  privacyUrl: "https://kaitosoeno.com/sigwald/privacy/",
  supportEmail: "soenokaito1@gmail.com",
} as const;

/** "Settings | Sigwald" for a page, plain "Sigwald" for none. */
export function pageTitle(page?: string): string {
  return page ? `${page} | ${brand.name}` : brand.name;
}
