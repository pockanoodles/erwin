import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";

import type { OAuthAppKind, OAuthProvider } from "./apps";

/** How long a started sign-in waits for its callback. */
export const OAUTH_REQUEST_TTL_MS = 10 * 60 * 1000;

export interface StartedOAuth {
  state: string;
  codeChallenge: string;
}

export interface PendingOAuth {
  provider: OAuthProvider;
  app: OAuthAppKind;
  codeVerifier: string;
  redirectUri: string;
  userId: string;
}

function base64url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

/**
 * Records a sign-in that is about to leave for Google or Microsoft.
 *
 * `state` ties the callback to the user who started it. In the desktop app
 * that is how the callback knows who it is for, since it arrives in the system
 * browser, which has no Sigwald session; on a server the session has to match
 * it too (claimCallback). Either way a callback Sigwald didn't start is
 * refused. The PKCE verifier stays here and only its hash travels, so an
 * intercepted code is useless on its own.
 */
export async function startOAuth(
  pending: PendingOAuth
): Promise<StartedOAuth> {
  const state = base64url(crypto.randomBytes(32));
  const codeVerifier = pending.codeVerifier;
  const codeChallenge = base64url(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );
  await prisma.oAuthRequest.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - OAUTH_REQUEST_TTL_MS) } },
  });
  await prisma.oAuthRequest.create({ data: { state, ...pending } });
  return { state, codeChallenge };
}

/** A fresh PKCE verifier (43 characters, the shortest RFC 7636 allows). */
export function newCodeVerifier(): string {
  return base64url(crypto.randomBytes(32));
}

/**
 * Claims the sign-in a callback belongs to. Each one is claimed once: a
 * replayed or late callback finds nothing.
 */
export async function claimOAuth(
  state: string | null,
  provider: OAuthProvider
): Promise<PendingOAuth | null> {
  if (!state) return null;
  const row = await prisma.oAuthRequest.findUnique({ where: { state } });
  if (!row) return null;
  // Whoever deletes it owns it, so two racing callbacks can't both proceed.
  const { count } = await prisma.oAuthRequest.deleteMany({ where: { state } });
  if (count !== 1) return null;
  if (row.provider !== provider) return null;
  if (Date.now() - row.createdAt.getTime() > OAUTH_REQUEST_TTL_MS) return null;
  return {
    provider: row.provider as OAuthProvider,
    app: row.app as OAuthAppKind,
    codeVerifier: row.codeVerifier,
    redirectUri: row.redirectUri,
    userId: row.userId,
  };
}
