/** Dynamic config keys the Trips slice reads from the runtime cache. */
export const GROUP_SELECT_TYPE = 'group_type';
export const TRANSPORT_SELECT_TYPE = 'transport';
export const CURRENCY_SELECT_TYPE = 'currency';
export const VISUAL_SERVICE = 'visual';
export const IMAGE_BASE_URL_KEY = 'image_base_url';
/** Public base URL of the background bucket, seeded under the `visual` service. */
export const BACKGROUND_IMAGES_BASE_URL_KEY = 'background_images_base_url';

/** `GET /trips/top` returns at most this many trip groups, ranked by likes. */
export const TOP_TRIPS_LIMIT = 5;

/** `trips.countPeoples` is NOT NULL in the live schema while the API has no people count. */
export const DEFAULT_COUNT_PEOPLES = 1;

export const TRIP_SORTS = ['newest', 'oldest'] as const;

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Length limits mirror the live column sizes in prisma/schema.prisma. */
export const MAX_TITLE_LENGTH = 60; // trips.title VARCHAR(60)
export const MAX_DESCRIPTION_LENGTH = 2000; // trips.description VARCHAR(2000)
export const MAX_POINT_NAME_LENGTH = 100; // points.name VARCHAR(100)
export const MAX_POINT_DESCRIPTION_LENGTH = 1050; // points.description VARCHAR(1050)
export const MAX_IMAGE_PATH_LENGTH = 1000; // images.filePath VARCHAR(1000)
export const MAX_SELECT_VALUE_LENGTH = 45; // trips.typeOfPeople / trips.transport VARCHAR(45)
export const MAX_SEARCH_LENGTH = 200;

export const MODERATOR_ROLES = ['admin', 'manager'];
