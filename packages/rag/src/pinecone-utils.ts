import crypto from "node:crypto";

import { Pinecone } from "@pinecone-database/pinecone";

import type { PineconeConfig, SyncContext } from "./types.js";

const DEFAULT_NAMESPACE_PREFIX = "dxgen";

export const buildNamespace = (
  pinecone: PineconeConfig,
  context: SyncContext,
) => {
  if (pinecone.namespace) return pinecone.namespace;
  const readableUser = context.userId
    .replace(/[^a-z0-9-_]/gi, "-")
    .toLowerCase()
    .slice(0, 24);
  const identityHash = crypto
    .createHash("sha256")
    .update(`${context.userId}\0${context.projectId}`)
    .digest("hex")
    .slice(0, 32);
  return `${DEFAULT_NAMESPACE_PREFIX}-${readableUser}-${identityHash}`;
};

export const ensurePineconeClient = (pinecone: PineconeConfig) => {
  const apiKey = pinecone.apiKey ?? process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error("PINECONE_API_KEY is required to interact with Pinecone");
  }

  return new Pinecone({
    apiKey,
    controllerHostUrl: pinecone.controllerHostUrl,
  });
};

export const getIndexForContext = (
  pinecone: PineconeConfig,
  context: SyncContext,
) => {
  const client = ensurePineconeClient(pinecone);
  const namespace = buildNamespace(pinecone, context);
  const baseIndex = client.index(pinecone.index, pinecone.indexHostUrl);
  const index =
    namespace && namespace.length > 0
      ? baseIndex.namespace(namespace)
      : baseIndex;
  return { client, namespace, index };
};
