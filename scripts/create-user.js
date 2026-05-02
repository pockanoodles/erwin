#!/usr/bin/env node

const passwordHasher = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: ["error"],
});

/**
 * Creates a local credentials user and linked credentials account.
 * The password hash is stored in Account.id_token for compatibility
 * with src/lib/auth/credentials-provider.ts.
 */
async function main() {
  const [, , rawEmail, rawPassword] = process.argv;

  if (!rawEmail || !rawPassword) {
    console.error("Usage: node scripts/create-user.js <email> <password>");
    process.exit(1);
  }

  const email = rawEmail.trim().toLowerCase();
  const password = rawPassword;

  if (!email.includes("@")) {
    console.error("Invalid email format.");
    process.exit(1);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    console.error(`User already exists for email: ${email}`);
    process.exit(1);
  }

  const hashedPassword = await passwordHasher.hash(password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email,
      },
    });

    await tx.account.create({
      data: {
        userId: createdUser.id,
        type: "credentials",
        provider: "credentials",
        providerAccountId: email,
        id_token: hashedPassword,
      },
    });

    return createdUser;
  });

  console.log("User created successfully.");
  console.log(`User ID: ${user.id}`);
  console.log(`Email: ${user.email}`);
}

main()
  .catch((error) => {
    console.error("Failed to create user:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
