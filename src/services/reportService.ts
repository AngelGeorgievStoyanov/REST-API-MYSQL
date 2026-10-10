import { type TripActor } from '../model/trip';
import { ApiError } from '../utils/apiError';
import { type AdminReportDto, type ReportDto } from '../model/report';
import { toAdminReportDto, toReportDto } from '../mappers/reportMapper';
import { parseReportBody, parseReportTargetBody, isReportTargetType } from '../utils/social';
import { type ReportRepository } from '../repositories/reportRepository';
import { type SocialTargetRepository } from '../repositories/socialTargetRepository';
import { type TargetTypeRepository } from '../repositories/targetTypeRepository';
import { type AdminPage } from '../model/admin';
import { toAdminPageDto } from '../mappers/adminMapper';
import { parseAdminPagination } from '../utils/adminPagination';
import { parsePositiveId } from '../utils/validation';


export class ReportService {
    constructor(
        private readonly repository: ReportRepository,
        private readonly targets: SocialTargetRepository,
        private readonly targetTypes: TargetTypeRepository,
    ) { }

    /** Reports are write-only from the public API: they are never read back. */
    async create(actor: TripActor, body: unknown): Promise<ReportDto> {
        const target = parseReportTargetBody(body);
        await this.targets.requireReportContext(target);

        const { reason } = parseReportBody(body);
        const typeId = await this.targetTypes.requireIdByRowName(target.targetType);

        const created = await this.repository.create({
            userId: actor.id,
            targetTypeId: typeId,
            targetId: target.targetId,
            reason,
        });
        if (!created) throw ApiError.conflict('You have already reported this resource.');

        return toReportDto(created, target.targetType, target.targetId, reason);
    }

    /**
     * Administrative report queue: reports persisted through `POST /reports`,
     * newest first. Role authorization happens on the route; listing never
     * mutates, resolves or hides the reported content.
     */
    async list(query: unknown): Promise<AdminPage<AdminReportDto>> {
        const pagination = parseAdminPagination(query);
        const [rows, total, names] = await Promise.all([
            this.repository.listPage(pagination.skip, pagination.pageSize),
            this.repository.countAll(),
            this.targetTypes.loadAllNames(),
        ]);

        const items = rows.map((row) => {
            const targetType = names.get(row.targetTypeId);
            if (!targetType || !isReportTargetType(targetType)) {
                throw ApiError.internal('The target type of this report is unknown.');
            }
            return toAdminReportDto(row, targetType);
        });

        return toAdminPageDto(items, total, pagination.page, pagination.pageSize);
    }

    /** Removes one report record only; the reported content stays untouched. */
    async remove(rawReportId: string): Promise<void> {
        const removed = await this.repository.delete(parsePositiveId(rawReportId, 'Report id'));
        if (!removed) throw ApiError.notFound('Report not found.');
    }

    /**
     * Withdrawal by the report's author: the ownership comes exclusively from the
     * authenticated actor, so a known id can never remove another user's report.
     * The delete itself reuses the same repository operation as the admin removal.
     */
    async removeOwned(actor: TripActor, rawReportId: string): Promise<void> {
        const reportId = parsePositiveId(rawReportId, 'Report id');
        const report = await this.repository.findOwner(reportId);
        if (!report) throw ApiError.notFound('Report not found.');

        if (report.userId !== actor.id) {
            throw ApiError.forbidden('Only the report author can delete this report.');
        }

        const removed = await this.repository.delete(reportId);
        if (!removed) throw ApiError.notFound('Report not found.');
    }
}
