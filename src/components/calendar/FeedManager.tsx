import { useCallback, useState } from "react";

import {
  BsArrowRepeat,
  BsCalendar2Week,
  BsGoogle,
  BsMicrosoft,
  BsTrash,
} from "react-icons/bs";

import { DEFAULT_FEED_COLOR } from "@/lib/calendar-colors";
import { cn } from "@/lib/utils";

import { useCalendarStore } from "@/store/calendar";
import { useViewStore } from "@/store/calendar";

import { MiniCalendar } from "./MiniCalendar";

export function FeedManager() {
  const [syncingFeeds, setSyncingFeeds] = useState<Set<string>>(new Set());
  const { feeds, removeFeed, toggleFeed, syncFeed } = useCalendarStore();
  const { date: currentDate, setDate } = useViewStore();

  const handleRemoveFeed = useCallback(
    async (feedId: string) => {
      try {
        await removeFeed(feedId);
      } catch (error) {
        console.error("Failed to remove feed:", error);
      }
    },
    [removeFeed]
  );

  const handleSyncFeed = useCallback(
    async (feedId: string) => {
      if (syncingFeeds.has(feedId)) return;

      try {
        setSyncingFeeds((prev) => new Set(prev).add(feedId));
        await syncFeed(feedId);
      } finally {
        setSyncingFeeds((prev) => {
          const next = new Set(prev);
          next.delete(feedId);
          return next;
        });
      }
    },
    [syncFeed, syncingFeeds]
  );

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Sources first, mini-calendar pinned to the bottom — the list is what
          you actually reach for, and it's the part that needs to scroll. */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <h3 className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Calendars
        </h3>
        {feeds.map((feed) => {
          const color = feed.color || DEFAULT_FEED_COLOR;
          const isSyncing = syncingFeeds.has(feed.id);

          return (
            <div
              key={feed.id}
              className="group flex h-10 items-center gap-1 pl-1 pr-0.5 transition-colors duration-150 hover:bg-muted/50 md:h-8"
            >
              {/* The colour swatch is the toggle, as in Apple's source list —
                  a separate checkbox plus a colour dot said the same thing
                  twice. Whole label is the hit area. */}
              <button
                role="checkbox"
                aria-checked={feed.enabled}
                aria-label={`Show ${feed.name}`}
                onClick={() => toggleFeed(feed.id)}
                className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
              >
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 flex-none border-2 transition-colors duration-150"
                  style={{
                    borderColor: color,
                    backgroundColor: feed.enabled ? color : "transparent",
                  }}
                />
                <span
                  className={cn(
                    "calendar-name truncate text-[13px]",
                    feed.enabled ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {feed.name}
                </span>
              </button>

              {feed.type === "GOOGLE" && (
                <BsGoogle
                  className="h-3 w-3 flex-none text-muted-foreground"
                  title={feed.url}
                />
              )}
              {feed.type === "OUTLOOK" && (
                <BsMicrosoft
                  className="h-3 w-3 flex-none text-muted-foreground"
                  title={feed.url}
                />
              )}
              {/* No URL on hover: a calendar's iCal address is often its
                  secret link. */}
              {feed.type === "ICAL" && (
                <BsCalendar2Week
                  className="h-3 w-3 flex-none text-muted-foreground"
                  title="iCal subscription, read-only"
                />
              )}

              {/* Row actions stay out of the way on desktop until the row is
                  hovered or keyboard-focused; on touch screens they stay visible. */}
              <div
                className={cn(
                  "flex flex-none items-center opacity-100 transition-opacity duration-150 md:opacity-0",
                  "md:focus-within:opacity-100 md:group-hover:opacity-100",
                  isSyncing && "md:opacity-100"
                )}
              >
                <button
                  onClick={() => handleSyncFeed(feed.id)}
                  disabled={isSyncing}
                  aria-label={`Sync ${feed.name}`}
                  className="p-1.5 text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:opacity-50"
                >
                  <BsArrowRepeat
                    className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")}
                  />
                </button>
                <button
                  onClick={() => handleRemoveFeed(feed.id)}
                  aria-label={`Remove ${feed.name}`}
                  className="p-1.5 text-muted-foreground transition-colors duration-150 hover:text-destructive"
                >
                  <BsTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {feeds.length === 0 && (
          <p className="px-1 py-4 text-[13px] text-muted-foreground">
            No calendars added yet
          </p>
        )}
      </div>

      <div className="flex-none border-t border-border py-2">
        <MiniCalendar currentDate={currentDate} onDateClick={setDate} />
      </div>
    </div>
  );
}
