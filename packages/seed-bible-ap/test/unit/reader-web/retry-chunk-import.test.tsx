// A LAZY CHUNK THAT FAILED ONCE (test-plan A3.7, the old retryChunkImport.test.ts case names): the failed URL is
// read from the browser's message, re-imported once under a cache-busting query; a stylesheet whose load failed
// is replaced once until it fails again.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  failedChunkUrl,
  reloadFailedStylesheets,
  retryChunkImport,
} from "../../../apps/reader-web/src/sw/retryChunkImport";

const CHUNK = "https://seed-reader.faithnet.io/assets/TipTapEditor-abc123.js";

describe("failedChunkUrl", () => {
  it("reads the URL from Chrome's and Firefox's messages", () => {
    expect(
      failedChunkUrl(
        new TypeError(`Failed to fetch dynamically imported module: ${CHUNK}`)
      )
    ).toBe(CHUNK);
    expect(
      failedChunkUrl(
        new TypeError(`error loading dynamically imported module: ${CHUNK}`)
      )
    ).toBe(CHUNK);
  });

  it("returns null when the message has no URL (Safari)", () => {
    expect(
      failedChunkUrl(new TypeError("Importing a module script failed."))
    ).toBeNull();
  });
});

describe("retryChunkImport", () => {
  it("returns the module when the plain import works", async () => {
    const importUrl = vi.fn();
    await expect(
      retryChunkImport(() => Promise.resolve("module"), importUrl)
    ).resolves.toBe("module");
    expect(importUrl).not.toHaveBeenCalled();
  });

  it("re-imports the failed chunk under a cache-busting URL, once", async () => {
    const importUrl = vi.fn((url: string) => Promise.resolve(`loaded ${url}`));
    const result = await retryChunkImport(
      () =>
        Promise.reject(
          new TypeError(`Failed to fetch dynamically imported module: ${CHUNK}`)
        ),
      importUrl
    );
    expect(importUrl).toHaveBeenCalledTimes(1);
    const url = new URL(importUrl.mock.calls[0]![0]);
    expect(`${url.origin}${url.pathname}`).toBe(CHUNK);
    expect(url.searchParams.get("retry")).toMatch(/^\d+$/);
    expect(result).toBe(`loaded ${url.href}`);
  });

  it("rethrows when there's no chunk URL to retry", async () => {
    const error = new TypeError("Importing a module script failed.");
    await expect(
      retryChunkImport(() => Promise.reject(error), vi.fn())
    ).rejects.toBe(error);
  });

  it("rejects when the cache-busted import fails too", async () => {
    const offline = new TypeError("still offline");
    await expect(
      retryChunkImport(
        () =>
          Promise.reject(
            new TypeError(
              `Failed to fetch dynamically imported module: ${CHUNK}`
            )
          ),
        () => Promise.reject(offline)
      )
    ).rejects.toBe(offline);
  });
});

describe("reloadFailedStylesheets", () => {
  afterEach(() => {
    document.head
      .querySelectorAll("link[data-test]")
      .forEach((link) => link.remove());
  });

  function addStylesheet(href: string): HTMLLinkElement {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.test = "";
    document.head.appendChild(link);
    return link;
  }
  const linkHrefs = () =>
    Array.from(
      document.head.querySelectorAll<HTMLLinkElement>("link[data-test]")
    )
      .map((l) => l.href)
      .sort();

  it("replaces only stylesheets that failed to load", () => {
    const failed = addStylesheet(
      "https://seed-reader.faithnet.io/assets/a.css"
    );
    const loaded = addStylesheet(
      "https://seed-reader.faithnet.io/assets/b.css"
    );
    failed.dispatchEvent(new Event("error"));
    loaded.dispatchEvent(new Event("load"));
    reloadFailedStylesheets();
    expect(failed.isConnected).toBe(false);
    expect(loaded.isConnected).toBe(true);
    expect(linkHrefs()).toEqual([
      "https://seed-reader.faithnet.io/assets/a.css",
      "https://seed-reader.faithnet.io/assets/b.css",
    ]);
  });

  it("replaces a failed stylesheet only once until it fails again", () => {
    const failed = addStylesheet(
      "https://seed-reader.faithnet.io/assets/a.css"
    );
    failed.dispatchEvent(new Event("error"));
    reloadFailedStylesheets();
    const fresh = document.head.querySelector("link[data-test]")!;
    reloadFailedStylesheets();
    expect(fresh.isConnected).toBe(true);
  });
});
