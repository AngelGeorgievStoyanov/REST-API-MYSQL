/** Connection limit of the standalone schema bootstrap in `src/db/setupDatabase.ts`. */
export const DB_CONNECTION_LIMIT = 10;

/** Valid TCP port range of the MySQL server. */
export const MIN_TCP_PORT = 1;
export const MAX_TCP_PORT = 65535;

/** Port a MySQL connection falls back to when neither `MYSQL_PORT` nor `MYSQOL_PORT` is set. */
export const DEFAULT_MYSQL_PORT = 3306;
