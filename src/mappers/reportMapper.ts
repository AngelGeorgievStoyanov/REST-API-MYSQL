import { CreatedReportRecord, ReportDto } from '../model/report';
import { SocialTargetType } from '../model/social';
import { toIsoString } from '../utils/utils';

export function toReportDto(
    report: CreatedReportRecord,
    targetType: SocialTargetType,
    targetId: number,
    reason: string | null,
): ReportDto {
    return {
        id: report.id,
        targetType,
        targetId,
        reason,
        createdAt: toIsoString(report.createdAt),
    };
}