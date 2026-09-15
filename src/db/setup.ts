import * as dotenv from 'dotenv';
import { setupDatabase } from './setupDatabase';

dotenv.config();

setupDatabase().catch(error => {
    console.error('Database setup failed:', error);
    process.exitCode = 1;
});