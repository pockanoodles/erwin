import type { ModuleManifest } from "@/modules/types";

const ladder: ModuleManifest = {
  id: "ladder",
  name: "Ladder",
  summary:
    "Goals for each two-month block, and the XP your finished work earns toward them.",
  defaultOn: true,
  page: {
    href: "/goals",
    keywords: [
      "goals",
      "bosses",
      "hex",
      "ladder",
      "stats",
      "xp",
      "level",
      "build",
    ],
  },
  sources: [],
  adds: [
    "Tasks that serve an important goal rank higher in Today and Focus",
    "A goal on each task, picked by hand or claimed by a rule",
    "The Ladder page, with goals, XP, levels and bosses",
  ],
  keeps:
    "Your goals, two-month blocks and Build. XP is worked out from finished tasks and never stored.",
  egress: [],
};

export default ladder;
