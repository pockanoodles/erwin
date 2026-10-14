import { brand, pageTitle } from "@/lib/brand";

const PAGE_NAMES: Record<string, string> = {
  "/calendar": "Calendar",
  "/tasks": "Tasks",
  "/focus": "Focus",
  "/progress": "Progress",
  "/courses": "Courses",
  "/goals": "Ladder",
  "/settings": "Settings",
  "/setup": "Setup",
  "/auth/signin": "Sign In",
  "/auth/signup": "Sign Up",
  "/auth/reset-password": "Reset Password",
};

export const getTitleFromPathname = (pathname: string) =>
  pathname in PAGE_NAMES ? pageTitle(PAGE_NAMES[pathname]) : brand.name;
