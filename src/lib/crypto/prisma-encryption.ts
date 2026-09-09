import { Prisma } from "@prisma/client";

import { decryptSecret, encryptSecret } from "./secret-box";

/**
 * Encrypts credential columns on the way into Postgres and decrypts them on
 * the way out, as a Prisma client extension.
 *
 * Deliberately transparent rather than a pair of helpers called at each site.
 * Erwin is a fork that periodically ports fixes from upstream, and the files
 * that touch tokens — the sync providers, the token manager, the OAuth
 * callbacks — are exactly the files those ports land in. Sprinkling
 * `encryptSecret()` through them would turn every future port into a merge
 * conflict. This way the divergence from upstream is two new files plus a
 * wrapper, and every existing call site reads `account.accessToken` and gets
 * a usable token, exactly as before.
 *
 * The trade-off is that these columns can no longer be searched by value.
 * Nothing does — verified before writing this: no `where` clause anywhere
 * filters on a credential — and it is inherent to encrypting with a random IV
 * rather than a property of this implementation.
 */

/**
 * `Account` is intentionally absent: nothing writes it. Sessions are JWTs and
 * there is no NextAuth database adapter, so its `access_token` /
 * `refresh_token` columns stay empty — the live integration tokens live in
 * `ConnectedAccount` and `TaskProvider` below.
 *
 * `User.passwordHash` is absent for a different reason: it is a bcrypt hash,
 * which needs no encryption, and encrypting it would break `compare()`.
 */
const ENCRYPTED_FIELDS: Record<string, readonly string[]> = {
  ConnectedAccount: ["accessToken", "refreshToken"],
  TaskProvider: ["accessToken", "refreshToken"],
  SystemSettings: [
    "googleClientSecret",
    "outlookClientSecret",
    "resendApiKey",
  ],
};

/** Operations whose `args` carry field values that need encrypting. */
const WRITE_DATA_KEYS: Record<string, readonly string[]> = {
  create: ["data"],
  createMany: ["data"],
  createManyAndReturn: ["data"],
  update: ["data"],
  updateMany: ["data"],
  upsert: ["create", "update"],
};

/**
 * Prisma accepts both `field: value` and `field: { set: value }` on update.
 * Both have to be handled, and anything else (`increment`, a raw expression)
 * is left alone — it would not be a credential.
 */
function mapFieldValue(
  value: unknown,
  transform: (input: string) => string
): unknown {
  if (typeof value === "string") return transform(value);
  if (
    value &&
    typeof value === "object" &&
    "set" in value &&
    typeof (value as { set: unknown }).set === "string"
  ) {
    return { set: transform((value as { set: string }).set) };
  }
  return value;
}

function transformRecord(
  record: unknown,
  fields: readonly string[],
  transform: (input: string) => string
): unknown {
  if (!record || typeof record !== "object") return record;
  if (Array.isArray(record)) {
    return record.map((entry) => transformRecord(entry, fields, transform));
  }

  const source = record as Record<string, unknown>;
  let changed = false;
  const result: Record<string, unknown> = { ...source };

  for (const field of fields) {
    if (!(field in source)) continue;
    const next = mapFieldValue(source[field], transform);
    if (next !== source[field]) {
      result[field] = next;
      changed = true;
    }
  }

  return changed ? result : record;
}

/**
 * Results come back in several shapes: one record, an array of them, `null`
 * from a `findUnique` that missed, or `{ count }` from a bulk write. Only the
 * first two carry field values, and `transformRecord` no-ops on the rest.
 */
function decryptResult(result: unknown, fields: readonly string[]): unknown {
  if (result === null || result === undefined) return result;
  if (typeof result !== "object") return result;
  return transformRecord(result, fields, decryptSecret);
}

export const credentialEncryption = Prisma.defineExtension({
  name: "credential-encryption",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const fields = ENCRYPTED_FIELDS[model];
        if (!fields) return query(args);

        const dataKeys = WRITE_DATA_KEYS[operation];
        let nextArgs = args;

        if (dataKeys && args && typeof args === "object") {
          const source = args as Record<string, unknown>;
          const patched: Record<string, unknown> = { ...source };
          let changed = false;

          for (const dataKey of dataKeys) {
            if (!(dataKey in source)) continue;
            const encrypted = transformRecord(
              source[dataKey],
              fields,
              encryptSecret
            );
            if (encrypted !== source[dataKey]) {
              patched[dataKey] = encrypted;
              changed = true;
            }
          }

          if (changed) nextArgs = patched as typeof args;
        }

        return decryptResult(await query(nextArgs), fields);
      },
    },
  },
});
