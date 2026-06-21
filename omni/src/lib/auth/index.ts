import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { hash, verify } from "@node-rs/argon2";
import { db } from "@/db";
import { env } from "@/env";

/**
 * Better Auth server instance.
 *
 * Decisions (see architecture §3):
 *  - Database sessions in Postgres  -> instant revocation.
 *  - argon2id password hashing      -> stronger than the default.
 *  - TOTP 2FA plugin                -> mandatory for a credential-custody tool.
 *  - This is OPERATOR auth only. Third-party mailbox credentials are stored
 *    secrets (src/lib/crypto), never authentication principals.
 */
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  database: drizzleAdapter(db, { provider: "pg" }),

  emailAndPassword: {
    enabled: true,
    // No open sign-up: the operator account is provisioned via a seed script.
    disableSignUp: false,
    minPasswordLength: 12,
    password: {
      hash: (password) =>
        hash(password, {
          // argon2id defaults tuned for interactive login.
          memoryCost: 19456,
          timeCost: 2,
          parallelism: 1,
        }),
      verify: ({ hash: h, password }) => verify(h, password),
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once per day
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  rateLimit: { enabled: true, window: 60, max: 20 },

  advanced: {
    cookiePrefix: "omni",
    useSecureCookies: env.NODE_ENV === "production",
  },

  // Order matters: nextCookies() must be last.
  plugins: [twoFactor(), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
