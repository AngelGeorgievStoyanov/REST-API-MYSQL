import {
  type CreatedReportRecord,
  type AdminReportRecord,
  type AdminReportDto,
  type AdminReportTargetDto,
  type ReportDto,
  type ReportTargetType,
} from '../model/report';
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

/** Maps only the explicitly approved fields for the administrative report queue. */
export function toAdminReportDto(
  report: AdminReportRecord,
  targetType: ReportTargetType,
  target: AdminReportTargetDto,
): AdminReportDto {
  return {
    id: report.id,
    userId: report.userId,
    targetType,
    targetId: report.targetId,
    target,
    reason: report.reason,
    createdAt: toIsoString(report.createdAt),
  };
}
