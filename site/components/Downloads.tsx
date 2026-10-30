"use client";

// Every channel, grouped by system, with the visitor's own system marked by
// the rust index. A live channel gets a box to act on: commands copy (one line
// per step, joined with && on the clipboard), pages open. A channel that is not
// serving the app yet shows only its name and "soon".
import { useEffect, useState } from "react";
import { channels, type ChannelGroup } from "@/content/channels";
import type { Dict } from "@/content/copy";
import { CopyButton } from "./CopyButton";

const GROUPS: ChannelGroup[] = ["mac", "windows", "linux", "server"];

/** Lets a long command or URL wrap after a slash or # instead of mid-word. */
function breakable(text: string) {
  return text.split(/(?<=[/#])/).map((part, i) => (
    <span key={i}>
      {part}
      <wbr />
    </span>
  ));
}

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
                    <span className="channel__name">{c.name}</span>
                    <span className={c.live ? "status status--live" : "status"}>{c.live ? t.live : t.soon}</span>
                  </div>
                  {c.live && c.command ? (
                    <div className="channel__cmd">
                      <code id={`cmd-${c.id}`}>
                        {c.command.map((line) => (
                          <span key={line}>{breakable(line)}</span>
                        ))}
                      </code>
                      <CopyButton text={c.command.join(" && ")} label={t.copy} done={t.copied} targetId={`cmd-${c.id}`} />
                    </div>
                  ) : null}
                  {c.live && c.href ? (
                    <div className="channel__cmd">
                      <code>
                        <span>{breakable(c.href.replace(/^https:\/\//, ""))}</span>
                      </code>
                      <a href={c.href} className="copy">
                        {t.open}
                      </a>
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
