import { MAX_FAILED_LOG_DELETE_IDS } from '../constants/failedLogs';
import { AdminPage, FailedLogDto } from '../model/admin';
import { FailedLogRecord, FailedLogRepository } from '../repositories/failedLogRepository';
import { adminPage, parseAdminPagination } from '../utils/adminPagination';
import { parseIdList } from '../utils/validation';

export class FailedLogService {
    constructor(private readonly repository: FailedLogRepository) { }

    /** One failed authentication attempt; the caller decides whether a failure is fatal. */
    async record(record: FailedLogRecord): Promise<void> {
        await this.repository.create(record);
    }

    async listAll(query: unknown): Promise<AdminPage<FailedLogDto>> {
        const pagination = parseAdminPagination(query);
        const [items, total] = await Promise.all([
            this.repository.listPage(pagination.skip, pagination.pageSize),
            this.repository.countAll(),
        ]);

        return adminPage(items, total, pagination.page, pagination.pageSize);
    }

    async deleteByIds(body: unknown): Promise<number> {
        const ids = parseIdList(body, 'ids', 1).slice(0, MAX_FAILED_LOG_DELETE_IDS);

        return this.repository.deleteByIds(ids);
    }
}
