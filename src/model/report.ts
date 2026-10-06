import { REPORT_TARGET_TYPE_VALUES } from '../constants/social';

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

/** Target types a report can address, including the report-only `comment`. */
export type ReportTargetType = (typeof REPORT_TARGET_TYPE_VALUES)[number];

/** Pointer to the resource a report addresses. */
export interface ReportTargetRef {
    targetType: ReportTargetType;
    targetId: number;
}

/** One `reports` row: the columns the admin report queue exposes. */
export interface AdminReportRecord {
    id: number;
    targetTypeId: number;
    targetId: number;
    reason: string | null;
    createdAt: Date | null;
}