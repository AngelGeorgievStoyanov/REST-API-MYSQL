import { CreatedReportRecord, AdminReportRecord, AdminReportDto, ReportDto, ReportTargetType } from '../model/report';
import { toIsoString } from '../utils/utils';

export function toReportDto(
    report: CreatedReportRecord,
    targetType: ReportTargetType,
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

/** Minimal DTO of the administrative report queue; no internal columns leak. */
export function toAdminReportDto(report: AdminReportRecord, targetType: ReportTargetType): AdminReportDto {
    return {
        id: report.id,
        targetType,
        targetId: report.targetId,
        reason: report.reason,
        createdAt: toIsoString(report.createdAt),
    };
}