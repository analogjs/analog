/**
 * Returns the list of content files by filename with ?analog-content-list=true.
 * We use the query param to transform the return into an array of
 * just front matter attributes.
 *
 * @returns
 */
export const ANALOG_CONTENT_FILE_LIST = {};

export const getContentFilesList = () => {
  return ANALOG_CONTENT_FILE_LIST as Record<string, Record<string, any>>;
};

/**
 * Returns the lazy loaded content files for lookups.
 *
 * @returns
 */
export const ANALOG_CONTENT_ROUTE_FILES = {};

export const getContentFiles = (): Record<string, () => Promise<string>> => {
  return ANALOG_CONTENT_ROUTE_FILES as Record<string, () => Promise<string>>;
};
