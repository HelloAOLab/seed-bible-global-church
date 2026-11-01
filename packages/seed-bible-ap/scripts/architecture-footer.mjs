// Stamps one footer on every page under apps/reader-web/public/architecture/ so any page reaches every other.
// Idempotent: the block sits between markers and is replaced on each run; a page's old plain <footer> is removed once.
// Run before building the web bundle:  node scripts/architecture-footer.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/reader-web/public/architecture"
);
const START = "<!-- arch-sitemap:start -->";
const END = "<!-- arch-sitemap:end -->";

const read = (p) => readFileSync(p, "utf8");
const titleOf = (html, dir) =>
  (/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? dir).trim();

// Section order is the reading order; a page not named here still appears, under "More".
const SECTIONS = [
  ["The architecture", ["", "information", "agentic", "ux", "ontology"]],
  [
    "The Scripture agent’s ask",
    [
      "harness",
      "ask-evaluation",
      "writings",
      "ask-writings-design",
      "ask-writings-test-report",
      "ask-writings-harness",
      "ask-writings-v2",
      "ask-writings-next",
      "ask-writings-brief",
      "ask-writings-v3-spec",
      "trained-models",
    ],
  ],
];
const LABEL = { "": "Overview" };

const dirs = readdirSync(root, { withFileTypes: true })
  .filter(
    (d) => d.isDirectory() && existsSync(join(root, d.name, "index.html"))
  )
  .map((d) => d.name);
const pages = {
  "": {
    href: "/architecture/",
    title: titleOf(read(join(root, "index.html")), "Architecture"),
  },
};
for (const d of dirs)
  pages[d] = {
    href: `/architecture/${d}/`,
    title: titleOf(read(join(root, d, "index.html")), d),
  };

const named = new Set(SECTIONS.flatMap(([, ids]) => ids));
const more = Object.keys(pages)
  .filter((k) => !named.has(k))
  .sort();
const sections = [...SECTIONS, ...(more.length ? [["More", more]] : [])]
  .map(([h, ids]) => [h, ids.filter((k) => pages[k])])
  .filter(([, ids]) => ids.length);

const block = (current) => `${START}
    <footer>
      <div class="wrap">
        <nav class="sitemap" aria-label="All architecture pages">
${sections
  .map(
    ([h, ids]) => `          <div><h2>${h}</h2><ul>
${ids.map((k) => `            <li>${k === current ? `<span aria-current="page">${LABEL[k] ?? pages[k].title}</span>` : `<a href="${pages[k].href}">${LABEL[k] ?? pages[k].title}</a>`}</li>`).join("\n")}
          </ul></div>`
  )
  .join("\n")}
          <div><h2>Reader</h2><ul><li><a href="/">Open the reader</a></li></ul></div>
        </nav>
        <p class="credit">Built on the agenticprimitives substrate · faithnet estate · <a href="/">seed-reader.faithnet.io</a></p>
      </div>
    </footer>
    ${END}`;

let n = 0;
for (const key of Object.keys(pages)) {
  const file = join(root, key, "index.html");
  let html = read(file);
  const next = block(key);
  if (html.includes(START))
    html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), next);
  else {
    html = html.replace(/\s*<footer>[\s\S]*?<\/footer>/, ""); // the old plain footer, once
    html = html.replace(/\s*<\/body>/, `\n\n    ${next}\n  </body>`);
  }
  writeFileSync(file, html);
  n++;
}
console.log(`footer stamped on ${n} pages`);
