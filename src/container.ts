import { prisma } from './clients/prisma';
import { CommentRepository } from './services/commentRepository';
import { CommentService } from './services/commentService';
import { FavoriteRepository } from './services/favoriteRepository';
import { FavoriteService } from './services/favoriteService';
import { LikeRepository } from './services/likeRepository';
import { LikeService } from './services/likeService';
import { PointRepository } from './services/pointRepository';
import { PointService } from './services/pointService';
import { ReportRepository } from './services/reportRepository';
import { ReportService } from './services/reportService';
import { SocialStateService } from './services/socialStateService';
import { SocialTargetRepository } from './services/socialTargetRepository';
import { TargetTypeRepository } from './services/targetTypeRepository';
import { TripRepository } from './services/tripRepository';
import { TripService } from './services/tripService';
import { gcsImageFileStorage } from './storage/imageFileStorage';

const targetTypeRepository = new TargetTypeRepository(prisma);
const socialTargetRepository = new SocialTargetRepository(prisma);

const commentRepository = new CommentRepository(prisma);
const likeRepository = new LikeRepository(prisma);
const favoriteRepository = new FavoriteRepository(prisma);
const reportRepository = new ReportRepository(prisma);

const socialStateService = new SocialStateService(
    targetTypeRepository,
    commentRepository,
    likeRepository,
    favoriteRepository,
);

const tripRepository = new TripRepository(prisma);
const tripService = new TripService(tripRepository, gcsImageFileStorage, socialStateService);

const pointRepository = new PointRepository(prisma);
const pointService = new PointService(pointRepository, gcsImageFileStorage, socialStateService);

const commentService = new CommentService(commentRepository, socialTargetRepository, targetTypeRepository);
const likeService = new LikeService(likeRepository, socialTargetRepository, targetTypeRepository, socialStateService);
const favoriteService = new FavoriteService(favoriteRepository, socialTargetRepository, socialStateService);
const reportService = new ReportService(reportRepository, socialTargetRepository, targetTypeRepository);

export { commentService, favoriteService, likeService, pointService, reportService, tripService };
