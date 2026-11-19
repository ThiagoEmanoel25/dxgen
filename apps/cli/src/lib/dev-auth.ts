import type { User } from "@supabase/supabase-js";

/**
 * Local development bypass for the Supabase auth and usage gates.
 *
 * The hosted Supabase project owns the `check_allowlist`,
 * `check_and_reset_monthly_usage` and `increment_doc_usage` routines, and none
 * of them are versioned in this repository. Running `dxgen generate` against an
 * empty local database is therefore impossible without standing in for them.
 *
 * Enabled only by an explicit opt-in and never in production.
 */

/** Stable so the derived Pinecone namespace stays the same between runs. */
const DEV_USER_ID = "00000000-0000-4000-8000-000000000001";

const DEV_USER = {
  id: DEV_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "dev@localhost",
  app_metadata: {},
  user_metadata: { user_name: "dev" },
  created_at: "1970-01-01T00:00:00.000Z",
} as User;

let warned = false;

export function isDevAuthBypassEnabled(): boolean {
  if (process.env.DXGEN_DEV_NO_AUTH !== "1") return false;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DXGEN_DEV_NO_AUTH cannot be combined with NODE_ENV=production",
    );
  }

  if (!warned) {
    warned = true;
    process.stderr.write(
      "⚠️  DXGEN_DEV_NO_AUTH=1 — authentication and usage limits are bypassed (local development only)\n",
    );
  }

  return true;
}

/** The stand-in user, or null when the bypass is off. */
export function devAuthUser(): User | null {
  return isDevAuthBypassEnabled() ? DEV_USER : null;
}

export function __resetDevAuthWarning(): void {
  warned = false;
}
