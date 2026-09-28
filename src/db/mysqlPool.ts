import { Pool, PoolConfig, createPool } from 'mysql';

export const MYSQL_POOL_CONNECTION_LIMIT = 10;

export type DbPool = Pool;

/** Read at call time, after dotenv.config(). */
export type DbEnvSource = Record<string, string | undefined>;

/**
 * `MYSQOL_PORT` is the historical .env spelling; `MYSQL_PORT` wins when both are set.
 */
export function getDbConnectionOptions(env: DbEnvSource = process.env): PoolConfig {
    const rawPort = (env.MYSQL_PORT || env.MYSQOL_PORT || '').trim();
    const port = rawPort === '' ? undefined : Number(rawPort);

    if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
        throw new Error(`Invalid MySQL port "${rawPort}".`);
    }

    return {
        connectionLimit: MYSQL_POOL_CONNECTION_LIMIT,
        host: env.MYSQL_HOST,
        port,
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD,
    };
}

let runtimePool: DbPool | null = null;

export function initMySqlPool(): DbPool {
    if (runtimePool) return runtimePool;

    const options = getDbConnectionOptions();
    runtimePool = createPool(options);

    // Do not log credentials.
    console.log(
        `[db] MySQL pool created (host=${options.host ?? 'localhost'} port=${options.port ?? 3306} ` +
            `user=${options.user ?? ''} connectionLimit=${options.connectionLimit})`,
    );

    return runtimePool;
}

export function getMySqlPool(): DbPool {
    return runtimePool ?? initMySqlPool();
}

export function closeMySqlPool(): Promise<void> {
    if (!runtimePool) return Promise.resolve();

    const poolToClose = runtimePool;
    runtimePool = null;

    return new Promise<void>((resolve, reject) => {
        poolToClose.end((error) => (error ? reject(error) : resolve()));
    });
}

export function runQuery<T = any[]>(
    db: DbPool,
    sql: string,
    params: unknown[] = [],
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        db.query(sql, params, (error, results) => {
            if (error) reject(error);
            else resolve(results as T);
        });
    });
}
