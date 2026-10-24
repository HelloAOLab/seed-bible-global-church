// RUN THE FLOWS (test/e2e/flows.ts) against the deployed reader (E2E_BASE, default seed-reader.faithnet.io): one
// fresh browser context per flow, ✓/✗ with the observable result, then docs/e2e-results.json and .md — what the
// training manual's Test column reads. E2E_ONLY=R1,M2 runs some; E2E_SHOTS=1 keeps a screenshot per failure.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BASE,
  launch,
  newFlowContext,
  type FlowResult,
} from "../test/e2e/harness";
import { FLOWS } from "../test/e2e/flows";
import { writeManualTests } from "./manual-tests";

const here = fileURLToPath(new URL(".", import.meta.url));
const only = (process.env["E2E_ONLY"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const shots = process.env["E2E_SHOTS"] === "1";
const outDir = `${here}../docs/e2e`;
mkdirSync(outDir, { recursive: true });

const browser = await launch();
const results: FlowResult[] = [];
console.log(`flows against ${BASE}\n`);
for (const flow of FLOWS) {
  if (only.length && !only.includes(flow.id)) continue;
  const t0 = Date.now();
  if (flow.skip) {
    results.push({
      id: flow.id,
      section: flow.section,
      title: flow.title,
      checks: flow.checks,
      mark: "⏭️",
      note: flow.skip,
      ms: 0,
    });
    console.log(`⏭️ ${flow.id} ${flow.title} — ${flow.skip}`);
    continue;
  }
  const ctx = await newFlowContext(browser);
  try {
    const note =
      (await Promise.race([
        flow.run(ctx),
        new Promise<never>((_, rej) =>
          setTimeout(
            () =>
              rej(
                new Error(
                  `flow timed out (${Math.round((flow.timeoutMs ?? 120_000) / 1000)} s)`
                )
              ),
            flow.timeoutMs ?? 120_000
          )
        ),
      ])) ?? "ok";
    results.push({
      id: flow.id,
      section: flow.section,
      title: flow.title,
      checks: flow.checks,
      mark: "✅",
      note: String(note),
      ms: Date.now() - t0,
    });
    console.log(`✓ ${flow.id} ${flow.title} — ${note}`);
  } catch (e) {
    const err = e instanceof Error ? e.message.split("\n")[0]! : String(e);
    const extra = ctx.logs.length
      ? ` [${ctx.logs.slice(0, 2).join(" | ").slice(0, 160)}]`
      : "";
    results.push({
      id: flow.id,
      section: flow.section,
      title: flow.title,
      checks: flow.checks,
      mark: "❌",
      note: `${err}${extra}`,
      ms: Date.now() - t0,
    });
    console.log(`✗ ${flow.id} ${flow.title} — ${err}${extra}`);
    if (shots) {
      const dir = process.env["E2E_ARTIFACTS"] ?? outDir;
      mkdirSync(dir, { recursive: true });
      await ctx.page
        .screenshot({ path: `${dir}/${flow.id}.png` })
        .catch(() => undefined);
      const pane = await ctx.page
        .locator(".sb-app-pane")
        .first()
        .innerHTML()
        .catch(() => "");
      if (pane) writeFileSync(`${dir}/${flow.id}.pane.html`, pane);
    }
  } finally {
    await ctx.context.close().catch(() => undefined);
  }
}
await browser.close();

const when = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
writeFileSync(
  `${outDir}/results.json`,
  JSON.stringify({ base: BASE, when, results }, null, 2) + "\n"
);
const md = [
  `# Flow results — ${when} — ${BASE}`,
  "",
  "| Flow | Feature | Mark | What was checked | Result |",
  "| --- | --- | --- | --- | --- |",
  ...results.map(
    (r) =>
      `| ${r.id} | ${r.title} | ${r.mark} | ${r.checks} | ${r.note.replace(/\|/g, "\\|")} |`
  ),
  "",
].join("\n");
writeFileSync(`${outDir}/results.md`, md);
// A run of some flows (E2E_ONLY) updates only those flows' entries; the rest of the manual stays as it was.
const m = writeManualTests();
console.log(
  `training manual: ${m.tested} of ${m.rows} feature rows carry a flow result`
);
const failed = results.filter((r) => r.mark === "❌").length;
console.log(
  `\n${results.length - failed}/${results.length} flows passed; ${outDir}/results.md`
);
process.exit(failed ? 1 : 0);
