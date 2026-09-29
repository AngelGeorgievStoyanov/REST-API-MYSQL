import { prisma } from './clients/prisma';
import { TripRepository } from './services/tripRepository';
import { TripService } from './services/tripService';

const tripRepository = new TripRepository(prisma);
const tripService = new TripService(tripRepository);

export { tripService };
