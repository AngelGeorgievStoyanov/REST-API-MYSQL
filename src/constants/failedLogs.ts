/**
 * Widths of the live `failedlogs` VARCHAR columns. Recorded login attempts are
 * fitted to them, so they are not free to change with the API contract.
 */
export const MAX_FAILED_LOG_DATE_LENGTH = 45;
export const MAX_FAILED_LOG_EMAIL_LENGTH = 45;
export const MAX_FAILED_LOG_IP_LENGTH = 45;
export const MAX_FAILED_LOG_USER_AGENT_LENGTH = 145;
export const MAX_FAILED_LOG_LOCATION_LENGTH = 145;
export const MAX_FAILED_LOG_STATE_LENGTH = 45;

/** Upper bound of one failed-log delete request. */
export const MAX_FAILED_LOG_DELETE_IDS = 200;
