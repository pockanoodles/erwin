import { brand, pageTitle } from "@/lib/brand";

import { MODULES } from "@/modules";

const PAGE_NAMES: Record<string, string> = {
  "/calendar": "Calendar",
  "/tasks": "Tasks",
  "/focus": "Focus",
  "/modules": "Modules",
  "/settings": "Settings",
  "/setup": "Setup",
  "/auth/signin": "Sign In",
  "/auth/signup": "Sign Up",
  "/auth/reset-password": "Reset Password",
  // A module's page keeps its name whether or not it's on.
  ...Object.fromEntries(
    MODULES.flatMap((m) => (m.page ? [[m.page.href, m.name]] : []))
  ),
};

export const getTitleFromPathname = (pathname: string) =>
  pathname in PAGE_NAMES ? pageTitle(PAGE_NAMES[pathname]) : brand.name;
