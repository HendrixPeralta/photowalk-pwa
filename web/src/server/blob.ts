// Where room photos are stored: a private Vercel Blob store. Private means a
// picture's address alone opens nothing; only this server can read it, and
// it hands a photo out only to members of its room.
//
// Behind a small interface, so tests and e2e use an in-memory store, and the
// rooms code never imports @vercel/blob itself.

import { del, get, put } from "@vercel/blob";
import { NotConfigured } from "./env";

export interface StoredBlob {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
}

export interface BlobStore {
  put(pathname: string, body: Blob, contentType: string): Promise<void>;
  /** Null when there is no such blob. */
  get(pathname: string): Promise<StoredBlob | null>;
  del(pathnames: readonly string[]): Promise<void>;
}

/**
 * The project's Blob store. On Vercel the SDK signs in with the deployment's
 * OIDC token and BLOB_STORE_ID, both set when the store is connected to the
 * project; elsewhere a BLOB_READ_WRITE_TOKEN does the same job.
 */
export function vercelBlobStore(): BlobStore {
  return {
    async put(pathname, body, contentType) {
      // Each photo has its own fresh pathname, so an existing one is a bug, not an update.
      await put(pathname, body, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
    },
    async get(pathname) {
      const found = await get(pathname, { access: "private" });
      if (!found || found.statusCode !== 200) return null;
      return { stream: found.stream, contentType: found.blob.contentType, size: found.blob.size };
    },
    async del(pathnames) {
      if (pathnames.length) await del([...pathnames]);
    },
  };
}

let store: BlobStore | null = null;

/** The real store, or NotConfigured (so the route answers 503) when none is connected. */
export function getBlobStore(): BlobStore {
  if (store) return store;
  if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) throw new NotConfigured(["BLOB_STORE_ID"]);
  store = vercelBlobStore();
  return store;
}

/** A store in memory, for tests and e2e. */
export function memoryBlobStore(): BlobStore & { readonly files: Map<string, { bytes: Uint8Array<ArrayBuffer>; contentType: string }> } {
  const files = new Map<string, { bytes: Uint8Array<ArrayBuffer>; contentType: string }>();
  return {
    files,
    async put(pathname, body, contentType) {
      if (files.has(pathname)) throw new Error(`Blob already exists: ${pathname}`);
      files.set(pathname, { bytes: new Uint8Array(await body.arrayBuffer()), contentType });
    },
    async get(pathname) {
      const file = files.get(pathname);
      if (!file) return null;
      return { stream: new Blob([file.bytes]).stream(), contentType: file.contentType, size: file.bytes.length };
    },
    async del(pathnames) {
      for (const pathname of pathnames) files.delete(pathname);
    },
  };
}
