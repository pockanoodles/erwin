import { compare } from "bcryptjs";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { isPublicSignupEnabled } from "./public-signup";

const LOG_SOURCE = "CredentialsProvider";

/**
 * Authenticates a user with email and password
 * @param email User's email
 * @param password User's password
 * @returns User object if authentication is successful, null otherwise
 */
export async function authenticateUser(email: string, password: string) {
  try {
    // Find the user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // If user doesn't exist, return null
    if (!user) {
      logger.warn(
        "Authentication failed: User not found",
        { email },
        LOG_SOURCE
      );
      return null;
    }

    // A user with no hash has no password sign-in (OAuth only, or never set)
    if (!user.passwordHash) {
      logger.warn(
        "Authentication failed: User has no password set",
        { email },
        LOG_SOURCE
      );
      return null;
    }

    // Compare the provided password with the stored hash
    const passwordMatch = await compare(password, user.passwordHash);

    if (!passwordMatch) {
      logger.warn(
        "Authentication failed: Invalid password",
        { email },
        LOG_SOURCE
      );
      return null;
    }

    logger.info(
      "User authenticated successfully",
      { userId: user.id },
      LOG_SOURCE
    );

    // Return the user without the hash — this value feeds the JWT callback
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  } catch (error) {
    logger.error(
      "Error authenticating user",
      {
        error: error instanceof Error ? error.message : "Unknown error",
        email,
      },
      LOG_SOURCE
    );
    return null;
  }
}

/**
 * Checks if public signup is enabled
 * @returns Whether public signup is enabled
 */
export async function canSignUp() {
  return await isPublicSignupEnabled();
}
