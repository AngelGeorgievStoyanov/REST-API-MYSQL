import { type SocialTargetRef, type SocialTargetType } from './social';

/** DTO of the administrative report queue (one `reports` row). */
export interface AdminReportDto {
    id: number;
    targetType: ReportTargetType;
    targetId: number;
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
    targetTypeId: number;
    targetId: number;
    reason: string | null;
    createdAt: Date | null;
}
