import { afterEach, describe, expect, it } from "vitest";

import {
  __resetDevAuthWarning,
  devAuthUser,
  isDevAuthBypassEnabled,
} from "./dev-auth";
import { checkUsageLimits, incrementUsage } from "./usage";

const reset = () => {
  delete process.env.DXGEN_DEV_NO_AUTH;
  delete process.env.NODE_ENV;
  __resetDevAuthWarning();
};

afterEach(reset);

describe("dev auth bypass", () => {
  it("stays off unless explicitly enabled", () => {
    reset();
    expect(isDevAuthBypassEnabled()).toBe(false);
    expect(devAuthUser()).toBeNull();

    process.env.DXGEN_DEV_NO_AUTH = "true";
    expect(isDevAuthBypassEnabled()).toBe(false);
  });

  it("refuses to run in production", () => {
    reset();
    process.env.DXGEN_DEV_NO_AUTH = "1";
    process.env.NODE_ENV = "production";
    expect(() => isDevAuthBypassEnabled()).toThrow(/NODE_ENV=production/);
    expect(() => devAuthUser()).toThrow(/NODE_ENV=production/);
  });

  it("returns a stable user so the Pinecone namespace does not move", () => {
    reset();
    process.env.DXGEN_DEV_NO_AUTH = "1";
    const first = devAuthUser();
    const second = devAuthUser();
    expect(first?.id).toBeTruthy();
    expect(first?.id).toBe(second?.id);
  });
});

describe("usage gates under the bypass", () => {
  it("allows generation without touching Supabase", async () => {
    reset();
    process.env.DXGEN_DEV_NO_AUTH = "1";

    // No SUPABASE_URL is set, so any real RPC call would throw instead.
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    const status = await checkUsageLimits("any-user");
    expect(status.can_generate).toBe(true);

    const result = await incrementUsage("any-user");
    expect(result.success).toBe(true);
    expect(result.limit_reached).toBe(false);
  });
});
