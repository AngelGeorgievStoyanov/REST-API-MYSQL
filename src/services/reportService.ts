import { SocialTargetType } from '../model/social';
import { TripActor } from '../model/trip';
import { ApiError } from '../utils/apiError';
import { parseReportBody, parseSocialTargetBody } from '../utils/social';
import { toIsoString } from '../utils/utils';
import { ReportRepository } from '../repositories/reportRepository';
import { SocialTargetRepository } from '../repositories/socialTargetRepository';
import { TargetTypeRepository } from '../repositories/targetTypeRepository';

export interface ReportDto {
    id: number;
    targetType: SocialTargetType;
    targetId: number;
    reason: string | null;
    createdAt: string | null;
}

export class ReportService {
    constructor(
        private readonly repository: ReportRepository,
        private readonly targets: SocialTargetRepository,
        private readonly targetTypes: TargetTypeRepository,
    ) { }

    /** Reports are write-only from the public API: they are never read back. */
    async create(actor: TripActor, body: unknown): Promise<ReportDto> {
        const target = parseSocialTargetBody(body);
        await this.targets.requireContext(target);

        const { reason } = parseReportBody(body);
        const typeId = await this.targetTypes.requireId(target.targetType);

        const created = await this.repository.create({
            userId: actor.id,
            targetTypeId: typeId,
            targetId: target.targetId,
            reason,
        });
        if (!created) throw ApiError.conflict('You have already reported this resource.');

        return {
            id: created.id,
            targetType: target.targetType,
            targetId: target.targetId,
            reason,
            createdAt: toIsoString(created.createdAt),
        };
    }
}
