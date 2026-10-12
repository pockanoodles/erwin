"use client";

// Every channel, grouped by system, with the visitor's own system marked by
// the rust index. Commands copy; pages link. A channel that is not serving the
// app yet says so in brackets instead of linking to an empty page.
import { useEffect, useState } from "react";
import { channels, type ChannelGroup } from "@/content/channels";
import type { Dict } from "@/content/copy";
import { CopyButton } from "./CopyButton";

const GROUPS: ChannelGroup[] = ["mac", "windows", "linux", "server"];

export function detectGroup(): ChannelGroup | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|Android/i.test(ua)) return null;
  if (/Mac/i.test(ua)) return "mac";
  if (/Win/i.test(ua)) return "windows";
  if (/Linux|X11/i.test(ua)) return "linux";
  return null;
}

export function Downloads({ t }: { t: Dict["install"] }) {
  const [mine, setMine] = useState<ChannelGroup | null>(null);
  useEffect(() => setMine(detectGroup()), []);

  return (
    <div className="downloads">
      {GROUPS.map((group) => (
        <section key={group} className="downloads__group" data-mine={mine === group || undefined} aria-labelledby={`dl-${group}`}>
          <h3 id={`dl-${group}`} className="downloads__os">
            {mine === group ? <span className="index" aria-hidden /> : null}
            {t.groups[group]}
          </h3>
          <ul>
            {channels
              .filter((c) => c.group === group)
              .map((c) => (
                <li key={c.id} className="channel">
                  <div className="channel__head">
                    {c.href && c.live ? (
                      <a href={c.href} className="channel__name">
                        {c.name}
                      </a>
                    ) : (
                      <span className="channel__name">{c.name}</span>
                    )}
                    <span className={c.live ? "status status--live" : "status"}>{c.live ? t.live : t.soon}</span>
                  </div>
                  {c.command ? (
                    <div className="channel__cmd">
                      <code id={`cmd-${c.id}`}>{c.command}</code>
                      <CopyButton text={c.command} label={t.copy} done={t.copied} targetId={`cmd-${c.id}`} />
                    </div>
                  ) : null}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
