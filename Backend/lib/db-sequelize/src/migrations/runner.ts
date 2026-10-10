import { Umzug, SequelizeStorage } from "umzug";
import { sequelize } from "../connection";
import type { QueryInterface } from "sequelize";

export interface MigrationContext {
  queryInterface: QueryInterface;
  sequelize: typeof sequelize;
}

export type MigrationFn = (ctx: MigrationContext) => Promise<void>;

export interface MigrationDefinition {
  name: string;
  up: MigrationFn;
  down: MigrationFn;
}

const migrations: MigrationDefinition[] = [];

/** Registers a migration. Migrations run once, in registration order, tracked in the SequelizeMeta table. */
export function defineMigration(def: MigrationDefinition): void {
  migrations.push(def);
}

export async function runMigrations(): Promise<{ executed: string[] }> {
  const umzug = new Umzug({
    migrations: migrations.map((m) => ({
      name: m.name,
      up: async () => m.up({ queryInterface: sequelize.getQueryInterface(), sequelize }),
      down: async () => m.down({ queryInterface: sequelize.getQueryInterface(), sequelize }),
    })),
    context: { queryInterface: sequelize.getQueryInterface(), sequelize },
    storage: new SequelizeStorage({ sequelize, tableName: "SequelizeMeta" }),
    logger: undefined,
  });

  const pending = await umzug.pending();
  const result = await umzug.up();
  return { executed: result.map((r) => r.name) };
}
