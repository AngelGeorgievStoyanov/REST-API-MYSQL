import {
    MAX_EMAIL_LENGTH,
    MAX_NAME_LENGTH,
    MAX_PASSWORD_LENGTH,
    MAX_USER_ID_LENGTH,
    MIN_PASSWORD_LENGTH,
} from '../auth';
import { MAX_FAILED_LOG_DELETE_IDS, MAX_FAILED_LOG_EMAIL_LENGTH } from '../failedLogs';
import {
    DEFAULT_COMMENT_PAGE_SIZE,
    MAX_COMMENT_LENGTH,
    MAX_COMMENT_PAGE_SIZE,
    MAX_REPORT_REASON_LENGTH,
} from '../social';
import {
    DEFAULT_LIMIT,
    DEFAULT_PAGE,
    MAX_DESCRIPTION_LENGTH,
    MAX_LIMIT,
    MAX_POINT_DESCRIPTION_LENGTH,
    MAX_POINT_NAME_LENGTH,
    MAX_SEARCH_LENGTH,
    MAX_SELECT_VALUE_LENGTH,
    MAX_TITLE_LENGTH,
} from '../trip';

/**
 * Every request-facing boundary of the API, in one place.
 *
 * A limit that a database column already fixes is imported from the slice
 * constants (which mirror `prisma/schema.prisma`); a limit the schema does not
 * fix is defined here as an application decision.
 */

/** Widest value of a Prisma `Int` (32-bit signed), the type of every resource id. */
const INT_MAX = 2147483647;

/**
 * Longest accepted opaque token. It is not a column width: the value is hashed
 * before it is stored, so the bound only keeps obviously oversized input out.
 */
const MAX_OPAQUE_TOKEN_LENGTH = 200;

/** Login and re-authentication compare the value instead of applying the policy. */
const MAX_PASSWORD_INPUT_LENGTH = 200;

/** Days in one trip. `trips.dayNumber` is a plain INT, so this is a policy cap. */
const MAX_TRIP_DAYS = 500;

/** Ids in one reorder request: the complete child list of one trip or day. */
const MAX_REORDER_ITEMS = 500;

/** Page numbers are `(page - 1) * limit` offsets in SQL, so they stay modest. */
const MAX_PAGE = 10000;

export const VALIDATION_LIMITS = {
    id: {
        min: 1,
        max: INT_MAX,
        /** `users.id` is the only string id: a UUID in VARCHAR(36). */
        uuidLength: MAX_USER_ID_LENGTH,
    },
    pagination: {
        page: { min: 1, max: MAX_PAGE, fallback: DEFAULT_PAGE },
        tripLimit: { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT },
        commentLimit: { min: 1, max: MAX_COMMENT_PAGE_SIZE, fallback: DEFAULT_COMMENT_PAGE_SIZE },
    },
    arrays: {
        reorder: { min: 0, max: MAX_REORDER_ITEMS },
        failedLogIds: { min: 1, max: MAX_FAILED_LOG_DELETE_IDS },
    },
    auth: {
        email: { min: 1, max: MAX_EMAIL_LENGTH },
        name: { min: 1, max: MAX_NAME_LENGTH },
        password: { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH },
        passwordInput: { min: 1, max: MAX_PASSWORD_INPUT_LENGTH },
        token: { min: 1, max: MAX_OPAQUE_TOKEN_LENGTH },
    },
    trip: {
        title: { min: 1, max: MAX_TITLE_LENGTH },
        description: { max: MAX_DESCRIPTION_LENGTH },
        selectValue: { min: 1, max: MAX_SELECT_VALUE_LENGTH },
        search: { min: 1, max: MAX_SEARCH_LENGTH },
        dayNumber: { min: 1, max: MAX_TRIP_DAYS },
    },
    point: {
        name: { min: 1, max: MAX_POINT_NAME_LENGTH },
        description: { max: MAX_POINT_DESCRIPTION_LENGTH },
        lat: { min: -90, max: 90 },
        lng: { min: -180, max: 180 },
    },
    comment: {
        comment: { min: 1, max: MAX_COMMENT_LENGTH },
    },
    report: {
        reason: { max: MAX_REPORT_REASON_LENGTH },
    },
    admin: {
        /** `failedlogs.email` VARCHAR(45) — only used to keep log filters bounded. */
        logEmail: { max: MAX_FAILED_LOG_EMAIL_LENGTH },
    },
    /**
     * Structural boundaries of the schema helpers themselves, not domain limits:
     * they describe how a value must arrive, not how large it may be.
     */
    input: {
        /** A number sent as text must be non-empty before it can be coerced. */
        minTextLength: 1,
        /** Failures echoed back in one validation message. */
        maxReportedIssues: 3,
    },
} as const;
