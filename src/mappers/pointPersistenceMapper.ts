import { PointRecord } from '../model/trip';
import { toNumberOrNull } from '../utils/utils';

interface PointPersistenceInput {
    id: number;
    name: string;
    description: string | null;
    lat: string | null;
    lng: string | null;
    images: { id: number; filePath: string }[];
}

/** Converts the persisted point columns into the application read shape. */
export function toPointRecord(row: PointPersistenceInput): PointRecord {
    return {
        id: row.id,
        title: row.name,
        description: row.description,
        latitude: toNumberOrNull(row.lat),
        longitude: toNumberOrNull(row.lng),
        images: row.images.map((image) => ({ id: image.id, filePath: image.filePath })),
    };
}