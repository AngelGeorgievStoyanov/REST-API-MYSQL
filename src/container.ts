import { prisma } from './clients/prisma';
import { authConfig } from './config/auth';
import { AuthMailer } from './services/authMailer';
import { AuthService } from './services/authService';
import { AuthUserRepository } from './services/authUserRepository';
import { CommentRepository } from './services/commentRepository';
import { CommentService } from './services/commentService';
import { EmailVerificationTokenRepository } from './services/emailVerificationTokenRepository';
import { FavoriteRepository } from './services/favoriteRepository';
import { FavoriteService } from './services/favoriteService';
import { LikeRepository } from './services/likeRepository';
import { LikeService } from './services/likeService';
import { PasswordResetTokenRepository } from './services/passwordResetTokenRepository';
import { PointRepository } from './services/pointRepository';
import { PointService } from './services/pointService';
import { RefreshTokenRepository } from './services/refreshTokenRepository';
import { ReportRepository } from './services/reportRepository';
import { ReportService } from './services/reportService';
import { RouteNotFoundLogsRepository } from './services/routeNotFoundLogsRepository';
import { RouteNotFoundLogsService } from './services/routeNotFoundLogsService';
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
