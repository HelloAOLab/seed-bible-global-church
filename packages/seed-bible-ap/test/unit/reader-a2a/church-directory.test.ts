// ap-church spec 203: churches come from the `.church` names, and a church's sites from its own church.describe.
import { beforeEach, describe, expect, it } from "vitest";
import {
  churchDirectory,
  clearDirectoryCache,
  describeChurch,
} from "../../../apps/reader-a2a/src/skills/church";

const NAMES = "https://names.test";
const CALVARY = "0x863bd39e938ac593c8d67a11f2f6c12d824b2526";
const OTHER = "0x1111111111111111111111111111111111111111";

const nameView = (name: string, agent: string, over: object = {}) => ({
  status: "registered",
  name,
  agent,
  declared: { agentType: "church" },
  typeCheck: { ok: true },
  records: [
    { key: "displayName", value: name.split(".")[0] },
    { key: "a2aEndpoint", value: `https://${name.split(".")[0]}.test/a2a` },
  ],
  ...over,
});

const describeAnswer = (
  agent: string,
  sites: unknown[],
  groups?: unknown[]
) => ({
  jsonrpc: "2.0",
  id: 1,
  result: {
    role: "ROLE_AGENT",
    parts: [
      { text: "Calvary meets in three places." },
      {
        data: {
          skill: "church.describe",
          protocol: "church.describe/1",
          church: { agent, displayName: "Calvary Bible Church" },
          sites,
          ...(groups ? { groups } : {}),
        },
      },
    ],
  },
});

/** The network: the naming service and the church endpoints. Everything else is the code under test. */
function net(routes: Record<string, unknown>) {
  const asked: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    if (!(url in routes)) return new Response("not here", { status: 404 });
    const v = routes[url];
    return v instanceof Response ? v : Response.json(v);
  }) as typeof fetch;
  return { f, asked };
}

const ENV = { NAMES_URL: NAMES };

describe("the church directory", () => {
  beforeEach(() => clearDirectoryCache());

  it("lists the .church names that are churches, by display name, and drops the rest", async () => {
    const { f } = net({
      [`${NAMES}/api/root/church?page=1`]: {
        pages: 1,
        names: [
          { name: "zion.church" },
          { name: "calvary-bible-co.church" },
          { name: "mistyped.church" },
        ],
      },
      [`${NAMES}/api/name/zion.church`]: nameView("zion.church", OTHER, {
        records: [{ key: "displayName", value: "Zion" }],
      }),
      [`${NAMES}/api/name/calvary-bible-co.church`]: nameView(
        "calvary-bible-co.church",
        CALVARY.toUpperCase().replace("0X", "0x"),
        {
          records: [
            { key: "displayName", value: "Calvary Bible Church" },
            { key: "a2aEndpoint", value: "https://calvary.test/a2a" },
          ],
        }
      ),
      [`${NAMES}/api/name/mistyped.church`]: nameView(
        "mistyped.church",
        OTHER,
        {
          typeCheck: { ok: false },
        }
      ),
    });
    const list = await churchDirectory(ENV, f);
    expect(list).toEqual([
      {
        agent: CALVARY,
        name: "calvary-bible-co.church",
        displayName: "Calvary Bible Church",
        describable: true,
      },
      {
        agent: OTHER,
        name: "zion.church",
        displayName: "Zion",
        describable: false,
      },
    ]);
  });

  it("says so when the naming service cannot be reached", async () => {
    const { f } = net({});
    await expect(churchDirectory(ENV, f)).rejects.toThrow(/answered 404/);
  });
});

describe("describing a church", () => {
  const calvary = {
    [`${NAMES}/api/name/calvary-bible-co.church`]: nameView(
      "calvary-bible-co.church",
      CALVARY
    ),
    "https://calvary-bible-co.test/.well-known/agent-card.json": {
      supportedInterfaces: [
        {
          protocolBinding: "JSONRPC",
          url: "https://edge.test/api/a2a/calvary",
        },
      ],
    },
  };

  it("asks the church at its card's endpoint and returns its sites", async () => {
    const { f, asked } = net({
      ...calvary,
      "https://edge.test/api/a2a/calvary": describeAnswer(CALVARY, [
        { id: "campus_erie", name: "Erie", timezone: "America/Denver" },
        { id: "campus_boulder", name: "Boulder" },
        { name: "no id" },
      ]),
    });
    const d = await describeChurch(ENV, "Calvary-Bible-Co.church", f);
    expect(d.church).toMatchObject({
      agent: CALVARY,
      name: "calvary-bible-co.church",
      displayName: "Calvary Bible Church",
    });
    expect(d.sites.map((s) => s.id)).toEqual(["campus_erie", "campus_boulder"]);
    expect(asked).toContain("https://edge.test/api/a2a/calvary");
  });

  it("returns the groups the church lists, with nothing about people (spec 204)", async () => {
    const { f } = net({
      ...calvary,
      "https://edge.test/api/a2a/calvary": describeAnswer(
        CALVARY,
        [{ id: "campus_erie", name: "Erie" }],
        [
          {
            id: "group_mens",
            name: "Men’s Group",
            kind: "men",
            schedule: "Thursdays 6:30 AM",
            site: "campus_erie",
            leader: "Tom",
            members: ["Bob"],
          },
          { id: "group_quilt", name: "Quilters", kind: "craft", site: "gone" },
          { name: "no id" },
          { id: "group_mens", name: "Listed twice" },
        ]
      ),
    });
    const d = await describeChurch(ENV, "calvary-bible-co.church", f);
    expect(d.groups).toEqual([
      {
        id: "group_mens",
        name: "Men’s Group",
        kind: "men",
        schedule: "Thursdays 6:30 AM",
        site: "campus_erie",
      },
      { id: "group_quilt", name: "Quilters", kind: "other" },
    ]);
  });

  it("a church that lists no groups has none", async () => {
    const { f } = net({
      ...calvary,
      "https://edge.test/api/a2a/calvary": describeAnswer(CALVARY, []),
    });
    const d = await describeChurch(ENV, "calvary-bible-co.church", f);
    expect(d.groups).toEqual([]);
  });

  it("refuses an answer that speaks for another agent", async () => {
    const { f } = net({
      ...calvary,
      "https://edge.test/api/a2a/calvary": describeAnswer(OTHER, []),
    });
    await expect(
      describeChurch(ENV, "calvary-bible-co.church", f)
    ).rejects.toThrow(/answered for another agent/);
  });

  it("says plainly when the church does not describe itself", async () => {
    const { f } = net({
      ...calvary,
      "https://edge.test/api/a2a/calvary": {
        jsonrpc: "2.0",
        id: 1,
        error: { message: "unknown skill" },
      },
    });
    await expect(
      describeChurch(ENV, "calvary-bible-co.church", f)
    ).rejects.toThrow(/did not describe itself \(unknown skill\)/);
  });

  it("refuses a name that is not a church", async () => {
    const { f } = net({
      [`${NAMES}/api/name/shop.church`]: nameView("shop.church", OTHER, {
        declared: { agentType: "org" },
      }),
    });
    await expect(describeChurch(ENV, "shop.church", f)).rejects.toThrow(
      /not a church on FaithNet/
    );
    await expect(describeChurch(ENV, "calvary.org", f)).rejects.toThrow(
      /say a .church name/
    );
  });
});
