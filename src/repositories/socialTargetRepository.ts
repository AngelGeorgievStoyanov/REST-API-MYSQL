import { PrismaClient } from '@prisma/client';
import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { ReportTargetRef } from '../model/report';
import { SocialTargetContext, SocialTargetRef } from '../model/social';
import { ApiError } from '../utils/apiError';
import { TargetTypeRepository } from './targetTypeRepository';

/**
 * Resolves a polymorphic `(targetTypeId, targetId)` pair to the resource it points
 * at: a tripGroup / trips (day) / points / images row plus the trip group and its
 * owner, which is what authorization needs.
 */
export class SocialTargetRepository {
    constructor(
        private readonly prisma: PrismaClient,
        private readonly targetTypes: TargetTypeRepository,
    ) { }

    /** Target that has to exist; a missing target is a 404 for the client. */
    async requireContext(target: SocialTargetRef): Promise<SocialTargetContext> {
        const context = await this.findContext(target);
        if (!context) throw ApiError.notFound('The target resource does not exist.');

        return context;
    }

    /**
     * Existence check of a report target. A reported comment resolves to the
     * resource the comment itself points at, so reports on comments carry the
     * same ownership context as the reported content.
     */
    async requireReportContext(target: ReportTargetRef): Promise<SocialTargetContext> {
        if (target.targetType !== 'comment') {
            return this.requireContext({ targetType: target.targetType, targetId: target.targetId });
        }

        const comment = await this.prisma.comment.findUnique({
            where: { id: target.targetId },
            select: { targetTypeId: true, targetId: true },
        });
        if (!comment) throw ApiError.notFound('The target resource does not exist.');

        const targetType = (await this.targetTypes.loadNames()).get(comment.targetTypeId);
        if (!targetType) throw ApiError.internal('The target type of this comment is unknown.');

        return this.requireContext({ targetType, targetId: comment.targetId });
    }

    async findContext(target: SocialTargetRef): Promise<SocialTargetContext | null> {
        switch (target.targetType) {
            case SOCIAL_TARGET_TYPE.TRIP_GROUP: {
                const group = await this.prisma.tripGroup.findUnique({
                    where: { id: target.targetId },
                    select: { ownerId: true },
                });
                if (!group) return null;

                return { ...target, tripGroupId: target.targetId, tripGroupOwnerId: group.ownerId };
            }
            case SOCIAL_TARGET_TYPE.DAY: {
                const day = await this.prisma.trip.findUnique({
                    where: { id: target.targetId },
                    select: { tripGroupId: true, tripGroup: { select: { ownerId: true } } },
                });
                if (!day || day.tripGroupId === null) return null;

                return { ...target, tripGroupId: day.tripGroupId, tripGroupOwnerId: day.tripGroup?.ownerId ?? null };
            }
            case SOCIAL_TARGET_TYPE.POINT: {
                const point = await this.prisma.point.findUnique({
                    where: { id: target.targetId },
                    select: { trip: { select: { tripGroupId: true, tripGroup: { select: { ownerId: true } } } } },
                });
                const tripGroupId = point?.trip?.tripGroupId ?? null;
                if (tripGroupId === null) return null;

                return { ...target, tripGroupId, tripGroupOwnerId: point?.trip?.tripGroup?.ownerId ?? null };
            }
            case SOCIAL_TARGET_TYPE.IMAGE: {
                const image = await this.prisma.image.findUnique({
                    where: { id: target.targetId },
                    select: {
                        trip: { select: { tripGroupId: true, tripGroup: { select: { ownerId: true } } } },
                        point: {
                            select: {
                                trip: { select: { tripGroupId: true, tripGroup: { select: { ownerId: true } } } },
                            },
                        },
                    },
                });
                if (!image) return null;

                // An image hangs off a day row or off a point; either way the trip
                // group is the authorization context, and it may be absent.
                const day = image.trip ?? image.point?.trip ?? null;
                return {
                    ...target,
                    tripGroupId: day?.tripGroupId ?? null,
                    tripGroupOwnerId: day?.tripGroup?.ownerId ?? null,
                };
            }
        }
    }
}
