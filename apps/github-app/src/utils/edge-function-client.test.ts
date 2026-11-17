import { afterEach, describe, expect, it } from "vitest";

import {
  callRAGPipeline,
  shouldUseEdgeFunctions,
} from "./edge-function-client";

const originalEnvironment = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  GITHUB_APP_SERVICE_TOKEN: process.env.GITHUB_APP_SERVICE_TOKEN,
};

afterEach(() => {
  if (originalEnvironment.SUPABASE_URL === undefined) {
    delete process.env.SUPABASE_URL;
  } else {
    process.env.SUPABASE_URL = originalEnvironment.SUPABASE_URL;
  }
  if (originalEnvironment.GITHUB_APP_SERVICE_TOKEN === undefined) {
    delete process.env.GITHUB_APP_SERVICE_TOKEN;
  } else {
    process.env.GITHUB_APP_SERVICE_TOKEN =
      originalEnvironment.GITHUB_APP_SERVICE_TOKEN;
  }
});

describe("Edge Function configuration", () => {
  it("allows direct mode when Edge Function credentials are absent", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.GITHUB_APP_SERVICE_TOKEN;

    expect(shouldUseEdgeFunctions()).toBe(false);
    await expect(
      callRAGPipeline({} as Parameters<typeof callRAGPipeline>[0]),
    ).rejects.toThrow("Missing required environment variables");
  });
});
