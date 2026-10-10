import { Sequelize } from "sequelize";
import * as mysql2 from "mysql2";

const mysqlDialectModule = {
  createConnection: mysql2.createConnection,
  createPool: mysql2.createPool,
  createPoolCluster: mysql2.createPoolCluster,
  escape: mysql2.escape,
  escapeId: mysql2.escapeId,
  format: mysql2.format,
  raw: mysql2.raw,
};

function createConnection(): Sequelize {
  const dialect = process.env["DB_DIALECT"] || "mysql";
  if (dialect === "sqlite") {
    if (process.env["NODE_ENV"] !== "test") {
      throw new Error("SQLite is only supported for automated tests. Set DB_DIALECT=mysql for the running system.");
    }
    return new Sequelize({
      dialect: "sqlite",
      storage: process.env["SQLITE_STORAGE"] || ":memory:",
      logging: false,
    });
  }
  if (dialect !== "mysql") {
    throw new Error("This system is configured for MySQL only. Set DB_DIALECT=mysql.");
  }

  return new Sequelize({
    database: process.env["DB_NAME"] || "arabian_d",
    username: process.env["DB_USER"] || "root",
    password: process.env["DB_PASSWORD"] || "",
    host: process.env["DB_HOST"] || "127.0.0.1",
    port: process.env["DB_PORT"] ? Number(process.env["DB_PORT"]) : 3306,
    dialect: "mysql",
    dialectModule: mysqlDialectModule,
    dialectOptions: { charset: "utf8mb4" },
    define: { charset: "utf8mb4", collate: "utf8mb4_unicode_ci" },
    logging: false,
  });
}

export const sequelize: Sequelize = createConnection();
