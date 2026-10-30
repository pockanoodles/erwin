-- Sigwald's own Google and Microsoft sign-in apps. Every account connected
-- before this signed in through a custom app, which a null oauthApp means.
ALTER TABLE "ConnectedAccount" ADD COLUMN "oauthApp" TEXT;

-- Sign-ins in flight, claimed by their callback through `state`.
CREATE TABLE "OAuthRequest" (
    "state" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthRequest_pkey" PRIMARY KEY ("state")
);

CREATE INDEX "OAuthRequest_createdAt_idx" ON "OAuthRequest"("createdAt");
