import { prisma } from '../clients/prisma';

/**
 * Deletes the trips a suite created, together with their children. The id list is
 * validated first: a filter built from an unset id would silently match every row.
 */
export async function cleanupTrips(tripGroupIds: number[]): Promise<void> {
    const ids = tripGroupIds.filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return;

    await prisma.image.deleteMany({
        where: { OR: [{ trip: { tripGroupId: { in: ids } } }, { point: { trip: { tripGroupId: { in: ids } } } }] },
    });
    await prisma.point.deleteMany({ where: { trip: { tripGroupId: { in: ids } } } });
    await prisma.trip.deleteMany({ where: { tripGroupId: { in: ids } } });
    await prisma.favorite.deleteMany({ where: { tripGroupId: { in: ids } } });
    await prisma.tripGroup.deleteMany({ where: { id: { in: ids } } });
}
