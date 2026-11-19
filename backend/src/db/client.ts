import { createClient, type Client, type InArgs, type ResultSet, type Transaction } from "@libsql/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { fileURLToPath } from "node:url";

/**
 * Database access layer over libSQL.
 *
 * - Production (Vercel): TURSO_DATABASE_URL=libsql://<db>.turso.io + TURSO_AUTH_TOKEN
 * - Local dev / Docker:  TURSO_DATABASE_URL=file:/path/to/pastebin.db (default: repo-root pastebin.db)
 *
 * The API mirrors the old bun:sqlite shape (`db.query(sql).get/all/run`) but every
 * call is async. Queries issued inside `db.transaction(async () => …)` are routed to
 * that transaction automatically via AsyncLocalStorage.
 */

type Executor = Pick<Client, "execute"> | Transaction;
type Arg = InArgs extends (infer U)[] ? U : never;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface Statement<T, A extends unknown[]> {
  get(...args: A): Promise<T | null>;
  all(...args: A): Promise<T[]>;
  run(...args: A): Promise<RunResult>;
}

function defaultUrl(): string {
  const path = fileURLToPath(new URL("../../../pastebin.db", import.meta.url));
  return `file:${path}`;
}

function toObjects<T>(rs: ResultSet): T[] {
  return rs.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    rs.columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj as T;
  });
}

export class Db {
  private readonly txStore = new AsyncLocalStorage<Transaction>();
  private ready: Promise<void>;

  constructor(readonly client: Client, isLocalFile: boolean) {
    // Local SQLite files get the same pragmas the bun:sqlite setup used. Remote Turso
    // databases are reached over HTTP where per-connection pragmas don't persist, so FK
    // enforcement (needed for ON DELETE CASCADE) is checked at cutover: see CLAUDE.md.
    this.ready = isLocalFile
      ? client
          .executeMultiple(
            [
              "PRAGMA journal_mode=WAL;",
              "PRAGMA synchronous=NORMAL;",
              "PRAGMA busy_timeout=5000;",
              "PRAGMA foreign_keys=ON;",
              "PRAGMA cache_size=-64000;",
            ].join("\n")
          )
          .then(() => undefined)
      : Promise.resolve();
  }

  private async executor(): Promise<Executor> {
    const tx = this.txStore.getStore();
    if (tx) return tx;
    await this.ready;
    return this.client;
  }

  private async execute(sql: string, args: unknown[]): Promise<ResultSet> {
    const ex = await this.executor();
    return ex.execute({ sql, args: args as Arg[] });
  }

  query<T = Record<string, unknown>, A extends unknown[] = unknown[]>(sql: string): Statement<T, A> {
    return {
      get: async (...args: A) => {
        const rows = toObjects<T>(await this.execute(sql, args));
        return rows[0] ?? null;
      },
      all: async (...args: A) => toObjects<T>(await this.execute(sql, args)),
      run: async (...args: A) => {
        const rs = await this.execute(sql, args);
        return {
          changes: rs.rowsAffected,
          lastInsertRowid: rs.lastInsertRowid === undefined ? 0 : Number(rs.lastInsertRowid),
        };
      },
    };
  }

  /** Alias kept for readability at call sites that only write. */
  prepare<T = Record<string, unknown>, A extends unknown[] = unknown[]>(sql: string): Statement<T, A> {
    return this.query<T, A>(sql);
  }

  /** Run a multi-statement SQL script (migrations). Not transaction-aware. */
  async exec(sql: string): Promise<void> {
    await this.ready;
    await this.client.executeMultiple(sql);
  }

  /**
   * Run `fn` inside a write transaction. All `db.query(...)` calls made (and awaited)
   * within `fn` use the transaction. Commits on success, rolls back on throw.
   */
  async transaction<R>(fn: () => Promise<R>): Promise<R> {
    if (this.txStore.getStore()) return fn(); // already inside a transaction: join it
    await this.ready;
    const tx = await this.client.transaction("write");
    try {
      const result = await this.txStore.run(tx, fn);
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback();
      throw err;
    } finally {
      tx.close();
    }
  }

  close(): void {
    this.client.close();
  }
}

export function createDb(url: string, authToken?: string): Db {
  const client = createClient({ url, authToken });
  return new Db(client, url.startsWith("file:"));
}

function resolveUrl(): string {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  // Backwards compat with the Docker deployment, which sets DB_PATH=/data/pastebin.db
  if (process.env.DB_PATH) return `file:${process.env.DB_PATH}`;
  return defaultUrl();
}

export const db = createDb(resolveUrl(), process.env.TURSO_AUTH_TOKEN || undefined);
