import { NextRequest, NextResponse } from "next/server";

import { GaxiosError } from "gaxios";
import type { calendar_v3 } from "googleapis";
import { v4 as uuidv4 } from "uuid";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { createAllDayDate, newDate, newDateFromYMD } from "@/lib/date-utils";
import { createGoogleOAuthClient } from "@/lib/google";
import { getGoogleCalendarClient } from "@/lib/google-calendar";
import { oauthApp } from "@/lib/oauth/apps";
import { finishOAuth } from "@/lib/oauth/finish";
import { claimOAuth } from "@/lib/oauth/requests";
import { prisma } from "@/lib/prisma";
import { TokenManager } from "@/lib/token-manager";

const LOG_SOURCE = "GoogleCalendarAPI";

// Helper function to process recurrence rules
function processRecurrenceRule(
  recurrence: string[] | null | undefined,
  startDate?: Date
): string | undefined {
  if (!recurrence || recurrence.length === 0) return undefined;

  // Find the RRULE (should be the first one starting with RRULE:)
  const rrule = recurrence.find((r) => r.startsWith("RRULE:"));
  if (!rrule) return undefined;

  // For yearly rules, ensure both BYMONTH and BYMONTHDAY are present
  if (rrule.includes("FREQ=YEARLY") && startDate) {
    const hasMonth = rrule.includes("BYMONTH=");
    const hasMonthDay = rrule.includes("BYMONTHDAY=");

    if (!hasMonth || !hasMonthDay) {
      // Start with the base rule
      let parts = rrule.split(";");

      // Remove any existing incomplete parts we'll replace
      parts = parts.filter(
        (part) =>
          !part.startsWith("BYMONTH=") && !part.startsWith("BYMONTHDAY=")
      );

      // Add the complete month and day
      parts.push(`BYMONTH=${startDate.getMonth() + 1}`);
      parts.push(`BYMONTHDAY=${startDate.getDate()}`);

      return parts.join(";");
    }
  }

  return rrule;
}

async function fetchAllEvents(
  calendarClient: calendar_v3.Calendar,
  params: calendar_v3.Params$Resource$Events$List
): Promise<calendar_v3.Schema$Event[]> {
  const items: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined = undefined;
  do {
    const res = await calendarClient.events.list({ ...params, pageToken });
    items.push(...(res.data.items || []));
    pageToken = res.data.nextPageToken as string | undefined;
  } while (pageToken);
  return items;
}

// Handle Google OAuth callback and account connection. The user comes from the
// sign-in's `state`, not the session: in the desktop app this request arrives
// in the system browser, which isn't signed in to Sigwald.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const pending = await claimOAuth(url.searchParams.get("state"), "GOOGLE");
  if (!pending) {
    return finishOAuth("GOOGLE", {
      ok: false,
      code: "google-auth-expired",
      failure: "This sign-in link expired or was already used.",
    });
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return finishOAuth("GOOGLE", {
      ok: false,
      code: "google-auth-declined",
      failure: "Google didn't give Sigwald access.",
    });
  }

  try {
    const app = await oauthApp("GOOGLE", pending.app);
    if (!app) throw new Error(`The ${pending.app} Google app isn't set up`);
    const oauth2Client = await createGoogleOAuthClient(app);
    const { userId } = pending;

    // Exchange code for tokens, on the exact redirect the sign-in left with
    const { tokens } = await oauth2Client.getToken({
      code,
      codeVerifier: pending.codeVerifier,
      redirect_uri: pending.redirectUri,
    });
    oauth2Client.setCredentials(tokens);

    const { google } = await import("googleapis");

    // Get user info to get email
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    if (!userInfo.data.email) {
      return finishOAuth("GOOGLE", {
        ok: false,
        code: "google-no-email",
        failure: "Google didn't share the account's email address.",
      });
    }

    // Store tokens
    const tokenManager = TokenManager.getInstance();
    const accountId = await tokenManager.storeTokens(
      "GOOGLE",
      userInfo.data.email,
      {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        // expiry_date from google-auth-library is an absolute epoch-ms
        // timestamp, not a duration. Adding Date.now() pushed expiry decades
        // out, so the token never refreshed and later calls 401'd silently.
        expiresAt: newDate(tokens.expiry_date || Date.now() + 3600 * 1000),
      },
      userId,
      app.kind
    );

    // Get list of calendars
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const calendarList = await calendar.calendarList.list();

    // Store calendars
    if (calendarList.data.items) {
      for (const cal of calendarList.data.items) {
        if (cal.id && cal.summary) {
          // Check if calendar feed already exists
          const existingFeed = await prisma.calendarFeed.findFirst({
            where: {
              type: "GOOGLE",
              url: cal.id,
              accountId,
              userId,
            },
          });

          // Only create if it doesn't exist
          if (!existingFeed) {
            await prisma.calendarFeed.create({
              data: {
                id: uuidv4(),
                name: cal.summary,
                url: cal.id,
                type: "GOOGLE",
                color: cal.backgroundColor ?? undefined,
                accountId,
                userId,
              },
            });
          }
        }
      }
    }

    return finishOAuth("GOOGLE", { ok: true });
  } catch (error) {
    console.error("Google Calendar OAuth error:", error);
    return finishOAuth("GOOGLE", {
      ok: false,
      code: "google-auth-failed",
      failure: "Sigwald couldn't finish signing in to Google.",
    });
  }
}

// Add a Google Calendar to sync
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { accountId, calendarId, name, color } = await request.json();

    if (!accountId || !calendarId) {
      return NextResponse.json(
        { error: "Account ID and Calendar ID are required" },
        { status: 400 }
      );
    }

    // Check if account belongs to the current user
    const account = await prisma.connectedAccount.findUnique({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Check if calendar already exists
    const existingFeed = await prisma.calendarFeed.findFirst({
      where: {
        type: "GOOGLE",
        url: calendarId,
        accountId,
        userId,
      },
    });

    if (existingFeed) {
      return NextResponse.json(existingFeed);
    }

    // Create calendar client
    const calendar = await getGoogleCalendarClient(accountId, userId);

    // Verify access to the calendar
    try {
      await calendar.calendars.get({
        calendarId,
      });
    } catch (error) {
      console.error("Failed to access calendar:", error);
      return NextResponse.json(
        { error: "Failed to access calendar" },
        { status: 403 }
      );
    }

    // Create calendar feed
    const feed = await prisma.calendarFeed.create({
      data: {
        id: uuidv4(),
        name,
        url: calendarId,
        type: "GOOGLE",
        color,
        accountId,
        userId,
      },
    });

    // Initial sync of calendar events (fetch all pages)
    const events = await fetchAllEvents(calendar, {
      calendarId,
      timeMin: newDateFromYMD(newDate().getFullYear(), 0, 1).toISOString(),
      timeMax: newDateFromYMD(newDate().getFullYear() + 1, 0, 1).toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    // Store events in database
    if (events.length > 0) {
      // Prefetch master events (so we don't perform network calls inside DB transaction)
      const masterEvents = new Map<string, calendar_v3.Schema$Event>();
      for (const event of events) {
        const recId = event.recurringEventId;
        if (recId && typeof recId === "string" && !masterEvents.has(recId)) {
          try {
            const masterEvent = await calendar.events.get({
              calendarId,
              eventId: recId,
            });
            masterEvents.set(recId, masterEvent.data);
          } catch (error) {
            console.error("Failed to fetch master event:", error);
          }
        }
      }

      await prisma.$transaction(async (tx) => {
        // Master events are prefetched before starting the transaction (to avoid network calls inside transaction)
        // `masterEvents` is available from the outer scope


        // Create or update master events
        for (const [eventId, masterEventData] of masterEvents) {
          const existingMaster = await tx.calendarEvent.findFirst({
            where: {
              feedId: feed.id,
              externalEventId: eventId,
              isMaster: true,
            },
          });

          const isAllDay = masterEventData.start
            ? !masterEventData.start.dateTime
            : false;

          const masterEventRecord = {
            feedId: feed.id,
            externalEventId: eventId,
            title: masterEventData.summary || "Untitled Event",
            description: masterEventData.description || "",
            start: isAllDay
              ? createAllDayDate(masterEventData.start?.date || "")
              : newDate(
                  masterEventData.start?.dateTime ||
                    masterEventData.start?.date ||
                    ""
                ),
            end: isAllDay
              ? createAllDayDate(masterEventData.end?.date || "")
              : newDate(
                  masterEventData.end?.dateTime ||
                    masterEventData.end?.date ||
                    ""
                ),
            location: masterEventData.location,
            isRecurring: true,
            isMaster: true,
            recurrenceRule: processRecurrenceRule(
              masterEventData.recurrence,
              newDate(
                masterEventData.start?.dateTime ||
                  masterEventData.start?.date ||
                  ""
              )
            ),
            recurringEventId: masterEventData.recurringEventId,
            allDay: isAllDay,
            status: masterEventData.status,
            sequence: masterEventData.sequence,
            created: masterEventData.created
              ? newDate(masterEventData.created)
              : undefined,
            lastModified: masterEventData.updated
              ? newDate(masterEventData.updated)
              : undefined,
            organizer: masterEventData.organizer
              ? {
                  name: masterEventData.organizer.displayName,
                  email: masterEventData.organizer.email,
                }
              : undefined,
            attendees: masterEventData.attendees?.map(
              (a: calendar_v3.Schema$EventAttendee) => ({
                name: a.displayName,
                email: a.email,
                status: a.responseStatus,
              })
            ),
          };

          if (existingMaster) {
            await tx.calendarEvent.update({
              where: { id: existingMaster.id },
              data: masterEventRecord,
            });
          } else {
            await tx.calendarEvent.create({
              data: masterEventRecord,
            });
          }
        }

        // Create or update instances
        for (const event of events) {
          const masterEvent = event.recurringEventId
            ? await tx.calendarEvent.findFirst({
                where: {
                  feedId: feed.id,
                  externalEventId: event.recurringEventId,
                  isMaster: true,
                },
              })
            : null;

          const isAllDay = event.start ? !event.start.dateTime : false;

          const eventRecord = {
            feedId: feed.id,
            externalEventId: event.id,
            title: event.summary || "Untitled Event",
            description: event.description || "",
            start: isAllDay
              ? createAllDayDate(event.start?.date || "")
              : newDate(event.start?.dateTime || event.start?.date || ""),
            end: isAllDay
              ? createAllDayDate(event.end?.date || "")
              : newDate(event.end?.dateTime || event.end?.date || ""),
            location: event.location,
            isRecurring: !!event.recurringEventId,
            isMaster: false,
            masterEventId: masterEvent?.id,
            recurringEventId: event.recurringEventId,
            recurrenceRule: masterEvent
              ? undefined
              : processRecurrenceRule(
                  event.recurrence,
                  event.start
                    ? newDate(event.start?.dateTime || event.start?.date || "")
                    : undefined
                ),
            allDay: isAllDay,
            status: event.status,
            sequence: event.sequence,
            created: event.created ? newDate(event.created) : undefined,
            lastModified: event.updated ? newDate(event.updated) : undefined,
            organizer: event.organizer
              ? {
                  name: event.organizer.displayName,
                  email: event.organizer.email,
                }
              : undefined,
            attendees: event.attendees?.map((a) => ({
              name: a.displayName,
              email: a.email,
              status: a.responseStatus,
            })),
          };

          const existingEvent = await tx.calendarEvent.findFirst({
            where: {
              feedId: feed.id,
              externalEventId: event.id,
            },
          });

          if (existingEvent) {
            await tx.calendarEvent.update({
              where: { id: existingEvent.id },
              data: eventRecord,
            });
          } else {
            await tx.calendarEvent.create({
              data: eventRecord,
            });
          }
        }
      }, {timeout: 30000});
    }

    return NextResponse.json(feed);
  } catch (error) {
    console.error("Failed to add calendar:", error);
    return NextResponse.json(
      { error: "Failed to add calendar" },
      { status: 500 }
    );
  }
}

// Sync specific calendar
export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { feedId } = await request.json();

    if (!feedId) {
      return NextResponse.json(
        { error: "Feed ID is required" },
        { status: 400 }
      );
    }

    // Get the feed and ensure it belongs to the current user
    const feed = await prisma.calendarFeed.findUnique({
      where: {
        id: feedId,
        userId,
      },
      include: { account: true },
    });

    if (!feed || !feed.accountId || !feed.url) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    // Create calendar client using account ID
    const googleCalendarClient = await getGoogleCalendarClient(
      feed.accountId,
      userId
    );
    console.log("Fetching events from Google Calendar:", feed.url);

    // Fetch all events with pagination
    const events = await fetchAllEvents(googleCalendarClient, {
      calendarId: feed.url,
      timeMin: newDateFromYMD(newDate().getFullYear(), 0, 1).toISOString(),
      timeMax: newDateFromYMD(newDate().getFullYear() + 1, 0, 1).toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    console.log(`Found ${events.length} events in Google Calendar`);

    // Pre-fetch all master events for recurring events
    const recurringEvents = events.filter(
      (event) =>
        event.recurringEventId && typeof event.recurringEventId === "string"
    );
    const masterEvents = new Map<string, string[]>();

    for (const event of recurringEvents) {
      const eventId = event.recurringEventId;
      if (
        eventId &&
        !masterEvents.has(eventId) &&
        typeof eventId === "string" &&
        feed.url
      ) {
        try {
          const masterEvent = await googleCalendarClient.events.get({
            calendarId: feed.url as string,
            eventId,
          });
          console.log("Master event", masterEvent.data.id);

          const recurrence = masterEvent.data?.recurrence;
          if (Array.isArray(recurrence)) {
            masterEvents.set(eventId, recurrence);
          }
        } catch (error) {
          console.error("Failed to fetch master event:", error);
        }
      }
    }

    // Now perform database operations in transaction
    await prisma.$transaction(async (tx) => {
      console.log("Deleting existing events");
      await tx.calendarEvent.deleteMany({
        where: { feedId },
      });
    });

    // Create new events
    await prisma.$transaction(async (tx) => {
      console.log("Creating ${events.length} events");
      for (const event of events) {
        console.log("Processing event:", event.id);
        
        // Skip events without start time
        if (!event.start?.dateTime && !event.start?.date) continue;

        // Get recurrence rule from pre-fetched master events
        if (event.recurringEventId) {
          event.recurrence = masterEvents.get(event.recurringEventId);
        }

        const isAllDay = event.start ? !event.start.dateTime : false;

        await tx.calendarEvent.create({
          data: {
            id: event.id || undefined,
            feedId: feed.id,
            externalEventId: event.id,
            title: event.summary || "Untitled Event",
            description: event.description || "",
            start: isAllDay
              ? createAllDayDate(event.start.date || "")
              : newDate(event.start.dateTime || event.start.date || ""),
            end: isAllDay
              ? createAllDayDate(event.end?.date || "")
              : newDate(event.end?.dateTime || event.end?.date || ""),
            location: event.location,
            isRecurring: !!event.recurringEventId || !!event.recurrence,
            recurringEventId: event.recurringEventId,
            recurrenceRule: processRecurrenceRule(
              event.recurrence,
              event.start
                ? newDate(event.start?.dateTime || event.start?.date || "")
                : undefined
            ),
            allDay: isAllDay,
            status: event.status,
            sequence: event.sequence,
            created: event.created ? newDate(event.created) : undefined,
            lastModified: event.updated ? newDate(event.updated) : undefined,
            organizer: event.organizer
              ? {
                  name: event.organizer.displayName,
                  email: event.organizer.email,
                }
              : undefined,
            attendees: event.attendees?.map(
              (a: calendar_v3.Schema$EventAttendee) => ({
                name: a.displayName,
                email: a.email,
                status: a.responseStatus,
              })
            ),
          },
        });
      }

      // Update feed sync status
      await tx.calendarFeed.update({
        where: { id: feedId, userId },
        data: {
          lastSync: newDate(),
          error: null,
        },
      });
    }, {timeout: 30000});

    console.log("Successfully synced calendar:", feedId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Failed to sync Google calendar:", error);

    // Check if it's an auth error
    if (error instanceof GaxiosError && Number(error.code) === 401) {
      return NextResponse.json(
        { error: "Authentication failed. Please try signing in again." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to sync calendar" },
      { status: 500 }
    );
  }
}
