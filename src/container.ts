import { prisma } from './clients/prisma';
import { authConfig } from './config/auth';
import { AuthUserRepository } from './repositories/authUserRepository';
import { CommentRepository } from './repositories/commentRepository';
import { EmailVerificationTokenRepository } from './repositories/emailVerificationTokenRepository';
import { FavoriteRepository } from './repositories/favoriteRepository';
import { LikeRepository } from './repositories/likeRepository';
import { PasswordResetTokenRepository } from './repositories/passwordResetTokenRepository';
import { PointRepository } from './repositories/pointRepository';
import { RefreshTokenRepository } from './repositories/refreshTokenRepository';
import { ReportRepository } from './repositories/reportRepository';
import { RouteNotFoundLogsRepository } from './repositories/routeNotFoundLogsRepository';
import { SocialTargetRepository } from './repositories/socialTargetRepository';
import { TargetTypeRepository } from './repositories/targetTypeRepository';
import { TripRepository } from './repositories/tripRepository';
import { AuthMailer } from './services/authMailer';
import { AuthService } from './services/authService';
import { CommentService } from './services/commentService';
import { FavoriteService } from './services/favoriteService';
import { LikeService } from './services/likeService';
import { PointService } from './services/pointService';
import { ReportService } from './services/reportService';
import { RouteNotFoundLogsService } from './services/routeNotFoundLogsService';
import { SocialStateService } from './services/socialStateService';
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

const authUserRepository = new AuthUserRepository(prisma);
const emailVerificationTokenRepository = new EmailVerificationTokenRepository(prisma);
const passwordResetTokenRepository = new PasswordResetTokenRepository(prisma);
const refreshTokenRepository = new RefreshTokenRepository(prisma);
const authMailer = new AuthMailer(authConfig);

const authService = new AuthService(
    authUserRepository,
    emailVerificationTokenRepository,
    passwordResetTokenRepository,
    refreshTokenRepository,
    authMailer,
    authConfig,
);

const routeNotFoundLogsRepository = new RouteNotFoundLogsRepository(prisma);
const routeNotFoundLogsService = new RouteNotFoundLogsService(routeNotFoundLogsRepository);

export {
    authService,
    commentService,
    favoriteService,
    likeService,
    pointService,
    reportService,
    routeNotFoundLogsService,
    tripService,
};
