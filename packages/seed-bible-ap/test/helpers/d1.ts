// A D1 database over node:sqlite, with the app's own migrations applied — so a test runs the real SQL (Cloudflare's D1
// is SQLite) instead of a mock that agrees with itself. Only what the apps use: prepare/bind/all/first/run and batch.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

type Value = string | number | null;

class Statement {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private args: Value[] = []
  ) {}
  bind(...args: unknown[]) {
    return new Statement(
      this.db,
      this.sql,
      args.map((a) =>
        a === undefined
          ? null
          : typeof a === "boolean"
            ? Number(a)
            : (a as Value)
      )
    );
  }
  async all<T>() {
    return {
      results: this.db.prepare(this.sql).all(...this.args) as T[],
      success: true,
    };
  }
  async first<T>() {
    return (
      (this.db.prepare(this.sql).get(...this.args) as T | undefined) ?? null
    );
  }
  async run() {
    this.db.prepare(this.sql).run(...this.args);
    return { success: true };
  }
}

export function d1WithMigrations(migrationsDir: string): D1Database {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(migrationsDir)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(join(migrationsDir, f), "utf8"));
  return {
    prepare: (sql: string) => new Statement(db, sql),
    batch: async (stmts: Statement[]) => Promise.all(stmts.map((s) => s.run())),
    exec: async (sql: string) => (db.exec(sql), { count: 1, duration: 0 }),
  } as unknown as D1Database;
}
