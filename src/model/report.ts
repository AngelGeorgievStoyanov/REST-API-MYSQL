import { SocialTargetType } from './social';

export interface ReportDto {
    id: number;
    targetType: SocialTargetType;
    targetId: number;
    reason: string | null;
    createdAt: string | null;
}

export interface CreatedReportRecord {
    id: number;
    createdAt: Date | null;
}