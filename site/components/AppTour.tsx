"use client";

// The app, four screens of it. The tabs are the kit's segmented plates and
// the screenshot sits in corner brackets, the same frame the app puts around
// a dialog. Every image is example data from `npm run dev:local -- --seed demo`.
import { useState } from "react";
import type { Dict, ShotId } from "@/content/copy";
import { asset } from "@/app/_lib/base";

const ORDER: ShotId[] = ["today", "focus", "calendar", "tasks"];

export function AppTour({ t }: { t: Dict["app"] }) {
  const [active, setActive] = useState<ShotId>("today");
  const shot = t.shots[active];
  return (
    <div className="tour">
      <div className="tour__tabs" role="tablist" aria-label={t.eyebrow}>
        {ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={active === id}
            aria-controls="tour-panel"
            className="plate-tab"
            onClick={() => setActive(id)}
          >
            {t.shots[id].tab}
          </button>
        ))}
      </div>
      <figure id="tour-panel" role="tabpanel" aria-labelledby={`tab-${active}`} className="tour__frame">
        <div className="tour__shot">
          {ORDER.map((id) => (
            // All four load up front so switching never waits on the network;
            // the inactive ones are hidden, which keeps the frame from jumping.
            <img
              key={id}
              src={asset(`/shots/${id}.webp`)}
              alt={t.shots[id].alt}
              width={1440}
              height={900}
              hidden={id !== active}
              loading={id === "today" ? "eager" : "lazy"}
              decoding="async"
            />
          ))}
        </div>
        <figcaption className="tour__caption">
          <span>{shot.caption}</span>
          <span className="label">{t.note}</span>
        </figcaption>
      </figure>
    </div>
  );
}
