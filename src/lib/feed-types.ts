/**
 * Feeds whose events can't be changed in Erwin. An iCal subscription mirrors a
 * document someone else publishes, so an edit made here would be undone by the
 * next sync. The calendar store and the event routes both ask this, so the
 * rule lives in one place.
 *
 * A deny-list on purpose: every other type, including the LOCAL feeds modules
 * own, keeps the writes it has always had.
 */
const READ_ONLY_FEED_TYPES = new Set(["ICAL"]);

export function isReadOnlyFeedType(type: string | null | undefined): boolean {
  return type != null && READ_ONLY_FEED_TYPES.has(type);
}
