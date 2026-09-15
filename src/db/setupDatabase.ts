import * as mysql from 'mysql';
import {
    comments,
    createuser,
    database,
    flush,
    grantuser,
    logFailed,
    points,
    routeNotFoundLogs,
    trips,
    usedb,
    users,
    verify,
} from './createMySQL';

export async function setupDatabase(): Promise<void> {
    const pool = mysql.createPool({
        connectionLimit: 10,
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQOL_PORT),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
    });

    await new Promise<void>((resolve, reject) => {
        pool.getConnection(async (err, connection) => {
            if (err) {
                console.error('Error getting database connection:', err);
                reject(err);
                return;
            }

            console.log("Connected!");

            const queries = [
                { sql: createuser, message: "USER hack_trip created" },
                { sql: grantuser, message: "GRANT USER hack_trip" },
                { sql: flush, message: "FLUSH PRIVILEGES hack_trip" },
                { sql: database, message: "DATA BASE hack_trip created" },
                { sql: usedb, message: "USE DATA BASE hack_trip" },
                { sql: users, message: "Table USERS created!" },
                { sql: trips, message: "Table TRIPS created!" },
                { sql: points, message: "Table POINTS created!" },
                { sql: comments, message: "Table COMMENTS created!" },
                { sql: verify, message: "Table VERIFY created!" },
                { sql: logFailed, message: "Table FAILED LOGS created!" },
                { sql: routeNotFoundLogs, message: "Table ROUTE NOT FOUND LOGS created!" },
            ];

            try {
                for (const query of queries) {
                    await new Promise<void>((queryResolve, queryReject) => {
                        connection.query(query.sql, (queryError, result) => {
                            if (queryError) {
                                console.error(`Error executing query: ${query.sql}`, queryError);
                                queryReject(queryError);
                            } else {
                                console.log(query.message);
                                queryResolve();
                            }
                        });
                    });
                }
                resolve();
            } catch (error) {
                console.error('Error executing queries:', error);
                reject(error);
            } finally {
                connection.release();
            }
        });
    }).finally(() => new Promise<void>((resolve, reject) => {
        pool.end(error => error ? reject(error) : resolve());
    }));
}