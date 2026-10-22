// THE MANUAL'S TEST COLUMN — written from the last flow run (docs/e2e/results.json) into docs/training-manual.md.
// Every feature table gets a **Test** column before "Why not yet · when": ✅ or ❌ with the flow id, the date and
// what the flow did; ⬜ where no flow drives that row yet. §16 gets the full list of flows, including the ones that
// test a section written as prose. Run by `pnpm e2e` after the flows; `pnpm manual:tests` re-writes from the file.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FLOWS } from "../test/e2e/flows";
import type { FlowResult } from "../test/e2e/harness";

const here = fileURLToPath(new URL(".", import.meta.url));
const MANUAL = `${here}../docs/training-manual.md`;
const RESULTS = `${here}../docs/e2e/results.json`;

export function writeManualTests(): { rows: number; tested: number } {
  const { when, base, results } = JSON.parse(readFileSync(RESULTS, "utf8")) as {
    when: string;
    base: string;
    results: FlowResult[];
  };
  const day = when.slice(0, 10);
  const byRow = new Map<string, FlowResult[]>();
  for (const f of FLOWS) {
    const r = results.find((x) => x.id === f.id);
    if (!r) continue;
    for (const row of f.rows ?? [])
      byRow.set(row, [...(byRow.get(row) ?? []), r]);
  }
  const esc = (t: string) =>
    t.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
  const cellFor = (feature: string): string => {
    const rs = byRow.get(feature);
    if (!rs?.length) return "⬜ no flow yet";
    const mark = rs.some((r) => r.mark === "❌") ? "❌" : "✅";
    return `${mark} ${day} — ${rs
      .map(
        (r) =>
          `**${r.id}** ${esc(r.checks)}${r.mark === "❌" ? ` · **failed:** ${esc(r.note).slice(0, 160)}` : ""}`
      )
      .join("; ")}`;
  };

  const lines = readFileSync(MANUAL, "utf8").split("\n");
  let inTable = false;
  let testCol = -1;
  let rows = 0;
  let tested = 0;
  const cells = (l: string) =>
    l.slice(1, l.lastIndexOf("|")).split(/(?<!\\)\|/);
  const join = (c: string[]) => `|${c.join("|")}|`;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (!l.startsWith("|")) {
      inTable = false;
      continue;
    }
    const c = cells(l);
    const head = c.map((x) => x.trim());
    if (!inTable && head[0] === "Feature" && head[1] === "Mark") {
      inTable = true;
      testCol = head.indexOf("Test");
      if (testCol < 0) {
        testCol = head.findIndex((h) => /^Why not yet/.test(h));
        if (testCol < 0) testCol = head.length;
        c.splice(testCol, 0, " Test ");
        lines[i] = join(c);
        const sep = cells(lines[i + 1]!);
        sep.splice(testCol, 0, " --- ");
        lines[i + 1] = join(sep);
      }
      i++;
      continue;
    }
    if (!inTable) continue;
    const feature = head[0]!;
    const value = ` ${cellFor(feature)} `;
    if (
      c.length > testCol &&
      head.length ===
        cells(lines.find((x, j) => j < i && x.startsWith("| Feature")) ?? "")
          .length
    )
      c[testCol] = value;
    else c.splice(testCol, 0, value);
    lines[i] = join(c);
    rows++;
    if (byRow.has(feature)) tested++;
  }

  // §16: every flow, including those for sections written as prose.
  const start = lines.findIndex((l) => l.startsWith("### Flow tests"));
  const block = [
    "### Flow tests",
    "",
    `Every feature flow is driven in a real browser by Playwright (\`pnpm e2e\`, flows in \`test/e2e/flows.ts\`) against ${base}. Last run ${when}: ${results.filter((r) => r.mark === "✅").length} of ${results.length} passed. The **Test** column in each table above comes from this run.`,
    "",
    "| Flow | Section | Feature | Mark | What the flow does | What it saw |",
    "| --- | --- | --- | --- | --- | --- |",
    ...results.map(
      (r) =>
        `| ${r.id} | ${esc(r.section)} | ${esc(r.title)} | ${r.mark} | ${esc(r.checks)} | ${esc(r.note).slice(0, 200)} |`
    ),
    "",
  ];
  if (start >= 0) {
    let end = start + 1;
    while (end < lines.length && !/^#{2,3} /.test(lines[end]!)) end++;
    lines.splice(start, end - start, ...block);
  } else {
    const at = lines.findIndex((l) =>
      l.startsWith("### What the app never does")
    );
    lines.splice(at >= 0 ? at : lines.length, 0, ...block);
  }
  writeFileSync(MANUAL, lines.join("\n"));
  // Realign the tables the way the repo's pre-commit hook would.
  spawnSync(`${here}../../../node_modules/.bin/prettier`, ["--write", MANUAL], {
    stdio: "ignore",
  });
  return { rows, tested };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = writeManualTests();
  console.log(
    `training manual: ${out.tested} of ${out.rows} feature rows carry a flow result`
  );
}
