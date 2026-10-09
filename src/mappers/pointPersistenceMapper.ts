import { PointRecord } from '../model/trip';
import { toNumberOrNull } from '../utils/utils';

interface PointPersistenceInput {
    id: number;
    name: string;
    description: string | null;
    lat: string | null;
    lng: string | null;
    pointNumber: number;
    tripId: number;
    createdAt: Date | null;
    updatedAt: Date | null;
    images: { id: number; filePath: string }[];
}

/** Converts the persisted point columns into the application read shape. */
export function toPointRecord(row: PointPersistenceInput): PointRecord {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        lat: toNumberOrNull(row.lat),
        lng: toNumberOrNull(row.lng),
        pointNumber: row.pointNumber,
        tripId: row.tripId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        images: row.images.map((image) => ({ id: image.id, filePath: image.filePath })),
    };
}