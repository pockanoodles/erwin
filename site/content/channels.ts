// Every place Sigwald ships, in the order a visitor scans for their own system.
// `live` flips to true when a channel actually serves the app. Until then the
// page shows only its name and "soon", with nothing to copy or open, so no one
// runs a command that fails.
// Commands and ids must match packaging/ (the release runbook lives there).
// The Mac App Store and the Microsoft Store come later, if people ask for them.

export type ChannelGroup = "mac" | "windows" | "linux" | "server";

export interface Channel {
  id: string;
  group: ChannelGroup;
  name: string;
  /** A command to copy, one line per step, for channels you install from a terminal. */
  command?: string[];
  /** Where the channel lives, for channels you install from a page. */
  href?: string;
  live: boolean;
}

const RELEASES = "https://github.com/pockanoodles/sigwald/releases/latest";

export const channels: Channel[] = [
  { id: "brew", group: "mac", name: "Homebrew", command: ["brew install --cask pockanoodles/tap/sigwald"], live: false },
  { id: "dmg", group: "mac", name: "Disk image (Apple silicon and Intel)", href: RELEASES, live: false },
  { id: "winget", group: "windows", name: "winget", command: ["winget install KaitoSoeno.Sigwald"], live: false },
  { id: "exe", group: "windows", name: "Installer (.exe)", href: RELEASES, live: false },
  { id: "snap", group: "linux", name: "Snap Store", command: ["sudo snap install sigwald"], live: false },
  { id: "aur", group: "linux", name: "AUR", command: ["yay -S sigwald-bin"], live: false },
  { id: "appimage", group: "linux", name: "AppImage, .deb, .rpm", href: RELEASES, live: false },
  { id: "docker", group: "server", name: "Docker Compose", href: "https://github.com/pockanoodles/sigwald#self-host", live: true },
  { id: "source", group: "server", name: "From source", command: ["git clone https://github.com/pockanoodles/sigwald", "cd sigwald", "npm install", "npm run dev:local"], live: true },
];

export const RELEASES_URL = RELEASES;
export const REPO_URL = "https://github.com/pockanoodles/sigwald";
export const PORTFOLIO_URL = "https://kaitosoeno.com/portfolio";
