import {
  type CreatedReportRecord,
  type AdminReportRecord,
  type AdminReportDto,
  type AdminReportTargetDto,
  type AdminReportTargetRecord,
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

/** Explicitly maps the repository target read model to the public admin DTO. */
export function toAdminReportTargetDto(
  target: Exclude<AdminReportTargetRecord, null> | null,
): AdminReportTargetDto {
  if (!target) return null;

  switch (target.type) {
    case 'tripGroup':
      return {
        type: target.type,
        id: target.id,
        title: target.title,
        destination: target.destination,
      };
    case 'trip':
      return {
        type: target.type,
        id: target.id,
        tripGroupId: target.tripGroupId,
        dayNumber: target.dayNumber,
        title: target.title,
        description: target.description,
      };
    case 'point':
      return {
        type: target.type,
        id: target.id,
        tripId: target.tripId,
        tripGroupId: target.tripGroupId,
        name: target.name,
        description: target.description,
        lat: target.lat,
        lng: target.lng,
      };
    case 'image':
      return {
        type: target.type,
        id: target.id,
        tripGroupId: target.tripGroupId,
        tripId: target.tripId,
        pointId: target.pointId,
      };
    case 'comment':
      return {
        type: target.type,
        id: target.id,
        comment: target.comment,
        authorName: target.authorName,
        targetTypeId: target.targetTypeId,
        targetId: target.targetId,
        parentCommentId: target.parentCommentId,
      };
  }
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
