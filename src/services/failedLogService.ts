import { MAX_FAILED_LOG_DELETE_IDS } from '../constants/failedLogs';
import { FailedLogDto } from '../model/admin';
import { FailedLogRecord, FailedLogRepository } from '../repositories/failedLogRepository';
import { parseIdList } from '../utils/validation';

export class FailedLogService {
    constructor(private readonly repository: FailedLogRepository) { }

    /** One failed authentication attempt; the caller decides whether a failure is fatal. */
    async record(record: FailedLogRecord): Promise<void> {
        await this.repository.create(record);
    }

    async listAll(): Promise<FailedLogDto[]> {
        return this.repository.listAll();
    }

    async deleteByIds(body: unknown): Promise<number> {
        const ids = parseIdList(body, 'ids', 1).slice(0, MAX_FAILED_LOG_DELETE_IDS);

        return this.repository.deleteByIds(ids);
    }
}
