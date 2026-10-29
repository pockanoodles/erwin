import { isReadOnlyFeedType } from "@/lib/feed-types";

describe("isReadOnlyFeedType", () => {
  it("refuses changes to iCal subscriptions", () => {
    expect(isReadOnlyFeedType("ICAL")).toBe(true);
  });

  // A deny-list: the module-owned LOCAL feeds (Work's shifts) keep their writes,
  // which upstream's allow-list of GOOGLE/OUTLOOK/CALDAV would have taken away.
  it.each(["GOOGLE", "OUTLOOK", "CALDAV", "LOCAL"])("leaves %s writable", (type) => {
    expect(isReadOnlyFeedType(type)).toBe(false);
  });

  it("leaves a feed with no type writable", () => {
    expect(isReadOnlyFeedType(null)).toBe(false);
    expect(isReadOnlyFeedType(undefined)).toBe(false);
  });
});
