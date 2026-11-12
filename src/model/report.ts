import { type SocialTargetRef, type SocialTargetType } from './social';

/** Safe, type-specific read model of the content referenced by an admin report. */
export type AdminReportTargetRecord =
  | {
      type: 'tripGroup';
      id: number;
      title: string | null;
      destination: string | null;
    }
  | {
      type: 'trip';
      id: number;
      tripGroupId: number;
      dayNumber: number;
      title: string;
      description: string | null;
    }
  | {
      type: 'point';
      id: number;
      tripId: number;
      tripGroupId: number;
      name: string;
      description: string | null;
      lat: number;
      lng: number;
    }
  | {
      type: 'image';
      id: number;
      tripGroupId: number;
      tripId: number | null;
      pointId: number | null;
    }
  | {
      type: 'comment';
      id: number;
      comment: string;
      authorName: string;
      targetTypeId: number;
      targetId: number;
      parentCommentId: number | null;
    }
  | null;

/** Safe API representation of a reported target (never a raw database row). */
export type AdminReportTargetDto = Exclude<AdminReportTargetRecord, null> | null;

/** DTO of the administrative report queue (one `reports` row). */
export interface AdminReportDto {
  id: number;
  userId: string;
  targetType: ReportTargetType;
  targetId: number;
  target: AdminReportTargetDto;
  reason: string | null;
  createdAt: string | null;
}

export interface ReportDto {
  id: number;
  targetType: ReportTargetType;
  targetId: number;
  reason: string | null;
  createdAt: string | null;
}

export interface CreatedReportRecord {
  id: number;
  createdAt: Date | null;
}

export type ReportTargetType = SocialTargetType;

/** Pointer to the resource a report addresses. */
export type ReportTargetRef = SocialTargetRef;

/** One `reports` row: the columns the admin report queue exposes. */
export interface AdminReportRecord {
  id: number;
  userId: string;
  targetTypeId: number;
  targetId: number;
  reason: string | null;
  createdAt: Date | null;
}
