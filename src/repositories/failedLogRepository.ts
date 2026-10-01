import { PrismaClient } from '@prisma/client';
import {
    MAX_FAILED_LOG_DATE_LENGTH,
    MAX_FAILED_LOG_EMAIL_LENGTH,
    MAX_FAILED_LOG_IP_LENGTH,
    MAX_FAILED_LOG_LOCATION_LENGTH,
    MAX_FAILED_LOG_STATE_LENGTH,
    MAX_FAILED_LOG_USER_AGENT_LENGTH,
} from '../constants/failedLogs';
import { FailedLogDto } from '../model/admin';

/** One failed authentication attempt, as accepted by the repository. */
export interface FailedLogRecord {
    date: string | null;
    email: string;
    ip: string;
    userAgent: string;
    countryCode: string | null;
    countryName: string | null;
    city: string | null;
    postal: string | null;
    latitude: number | null;
    longitude: number | null;
    state: string | null;
}

const failedLogSelect = {
    id: true,
    date: true,
    email: true,
    ip: true,
    userAgent: true,
    countryCode: true,
    countryName: true,
    city: true,
    postal: true,
    latitude: true,
    longitude: true,
    state: true,
};

export class FailedLogRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async create(record: FailedLogRecord): Promise<void> {
        await this.prisma.failedLog.create({
            data: {
                date: truncate(record.date, MAX_FAILED_LOG_DATE_LENGTH),
                email: truncate(record.email, MAX_FAILED_LOG_EMAIL_LENGTH) ?? '',
                ip: truncate(record.ip, MAX_FAILED_LOG_IP_LENGTH) ?? '',
                userAgent: truncate(record.userAgent, MAX_FAILED_LOG_USER_AGENT_LENGTH) ?? '',
                countryCode: truncate(record.countryCode, MAX_FAILED_LOG_LOCATION_LENGTH),
                countryName: truncate(record.countryName, MAX_FAILED_LOG_LOCATION_LENGTH),
                city: truncate(record.city, MAX_FAILED_LOG_LOCATION_LENGTH),
                postal: truncate(record.postal, MAX_FAILED_LOG_LOCATION_LENGTH),
                latitude: record.latitude,
                longitude: record.longitude,
                state: truncate(record.state, MAX_FAILED_LOG_STATE_LENGTH),
                createdAt: new Date(),
            },
            select: { id: true },
        });
    }

    /** Newest first; `id` breaks ties because `date` is a stored string. */
    async listPage(skip: number, take: number): Promise<FailedLogDto[]> {
        return this.prisma.failedLog.findMany({
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
            skip,
            take,
            select: failedLogSelect,
        });
    }

    async countAll(): Promise<number> {
        return this.prisma.failedLog.count();
    }

    async deleteByIds(ids: number[]): Promise<number> {
        const result = await this.prisma.failedLog.deleteMany({ where: { id: { in: ids } } });

        return result.count;
    }
}

function truncate(value: string | null, maxLength: number): string | null {
    if (value === null) return null;

    return value.length > maxLength ? value.substring(0, maxLength) : value;
}
