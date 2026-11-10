import { type PrismaClient } from '@prisma/client';
import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { type AdminReportTargetDto, type ReportTargetRef } from '../model/report';
import { type SocialTargetContext, type SocialTargetType } from '../model/social';
import { ApiError } from '../utils/apiError';
import { type TargetTypeRepository } from './targetTypeRepository';

function adminTargetKey(targetType: SocialTargetType, targetId: number): string {
  return `${targetType}:${targetId}`;
}

/**
 * Resolves polymorphic social targets to the trip group and its owner, which
 * is what authorization needs. Admin report summaries are resolved separately
 * in batches below and expose only explicitly selected display fields.
 */
export class SocialTargetRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly targetTypes: TargetTypeRepository,
  ) {}

  async requireContext(target: {
    targetType: 'comment' | SocialTargetType;
    targetId: number;
  }): Promise<SocialTargetContext> {
    const context = await this.findContext(target);
    if (!context) throw ApiError.notFound('The target resource does not exist.');

    return context;
  }

  async findContext(target: {
    targetType: SocialTargetType;
    targetId: number;
  }): Promise<SocialTargetContext | null> {
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
        if (!day?.tripGroupId) return null;

        return {
          ...target,
          tripGroupId: day.tripGroupId,
          tripGroupOwnerId: day.tripGroup.ownerId,
        };
      }
      case SOCIAL_TARGET_TYPE.POINT: {
        const point = await this.prisma.point.findUnique({
          where: { id: target.targetId },
          select: {
            trip: { select: { tripGroupId: true, tripGroup: { select: { ownerId: true } } } },
          },
        });
        if (!point) return null;

        const tripGroupId = point.trip.tripGroupId;

        return {
          ...target,
          tripGroupId,
          tripGroupOwnerId: point.trip.tripGroup.ownerId,
        };
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

        const day = image.trip ?? image.point?.trip ?? null;
        if (!day?.tripGroupId) return null;

        return {
          ...target,
          tripGroupId: day.tripGroupId,
          tripGroupOwnerId: day.tripGroup.ownerId,
        };
      }
      case SOCIAL_TARGET_TYPE.COMMENT: {
        const comment = await this.prisma.comment.findUnique({
          where: { id: target.targetId },
          select: { targetTypeId: true, targetId: true },
        });
        if (!comment) return null;
        const rootType = (await this.targetTypes.loadNames()).get(comment.targetTypeId);
        if (!rootType || rootType === SOCIAL_TARGET_TYPE.COMMENT) return null;
        const root = await this.findContext({ targetType: rootType, targetId: comment.targetId });
        if (!root) return null;
        return {
          ...target,
          tripGroupId: root.tripGroupId,
          tripGroupOwnerId: root.tripGroupOwnerId,
        };
      }
    }
  }

  /**
   * Loads display-safe summaries for all report targets in a page with a
   * bounded number of database queries (one per target type), not N+1 reads.
   */
  async findAdminTargets(
    targets: ReportTargetRef[],
  ): Promise<Map<string, AdminReportTargetDto>> {
    const idsFor = (targetType: SocialTargetType): number[] =>
      targets.filter((target) => target.targetType === targetType).map((target) => target.targetId);

    const [groups, days, points, images, comments] = await Promise.all([
      this.prisma.tripGroup.findMany({
        where: { id: { in: idsFor(SOCIAL_TARGET_TYPE.TRIP_GROUP) } },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          trips: {
            orderBy: [{ dayNumber: 'asc' }, { id: 'asc' }],
            take: 1,
            select: { title: true, destination: true },
          },
        },
      }),
      this.prisma.trip.findMany({
        where: { id: { in: idsFor(SOCIAL_TARGET_TYPE.DAY) } },
        select: { id: true, tripGroupId: true, dayNumber: true, title: true, description: true },
      }),
      this.prisma.point.findMany({
        where: { id: { in: idsFor(SOCIAL_TARGET_TYPE.POINT) } },
        select: {
          id: true,
          tripId: true,
          name: true,
          description: true,
          lat: true,
          lng: true,
          trip: { select: { tripGroupId: true } },
        },
      }),
      this.prisma.image.findMany({
        where: { id: { in: idsFor(SOCIAL_TARGET_TYPE.IMAGE) } },
        select: {
          id: true,
          tripId: true,
          pointId: true,
          trip: { select: { tripGroupId: true } },
          point: { select: { trip: { select: { tripGroupId: true } } } },
        },
      }),
      this.prisma.comment.findMany({
        where: { id: { in: idsFor(SOCIAL_TARGET_TYPE.COMMENT) } },
        select: {
          id: true,
          comment: true,
          nameAuthor: true,
          targetTypeId: true,
          targetId: true,
          parentCommentId: true,
        },
      }),
    ]);

    const result = new Map<string, AdminReportTargetDto>();

    for (const group of groups) {
      result.set(adminTargetKey(SOCIAL_TARGET_TYPE.TRIP_GROUP, group.id), {
        type: 'tripGroup',
        id: group.id,
        title: group.trips[0]?.title ?? null,
        destination: group.trips[0]?.destination ?? null,
      });
    }

    for (const day of days) {
      result.set(adminTargetKey(SOCIAL_TARGET_TYPE.DAY, day.id), {
        type: 'trip',
        id: day.id,
        tripGroupId: day.tripGroupId,
        dayNumber: day.dayNumber,
        title: day.title,
        description: day.description,
      });
    }

    for (const point of points) {
      result.set(adminTargetKey(SOCIAL_TARGET_TYPE.POINT, point.id), {
        type: 'point',
        id: point.id,
        tripId: point.tripId,
        tripGroupId: point.trip.tripGroupId,
        name: point.name,
        description: point.description,
        lat: point.lat,
        lng: point.lng,
      });
    }

    for (const image of images) {
      const tripGroupId = image.trip?.tripGroupId ?? image.point?.trip.tripGroupId;
      if (tripGroupId === undefined || tripGroupId === null) continue;

      result.set(adminTargetKey(SOCIAL_TARGET_TYPE.IMAGE, image.id), {
        type: 'image',
        id: image.id,
        tripGroupId,
        tripId: image.tripId,
        pointId: image.pointId,
      });
    }

    for (const comment of comments) {
      result.set(adminTargetKey(SOCIAL_TARGET_TYPE.COMMENT, comment.id), {
        type: 'comment',
        id: comment.id,
        comment: comment.comment,
        authorName: comment.nameAuthor,
        targetTypeId: comment.targetTypeId,
        targetId: comment.targetId,
        parentCommentId: comment.parentCommentId,
      });
    }

    return result;
  }
}
