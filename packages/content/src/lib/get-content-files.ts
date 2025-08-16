/**
 * Returns the list of content files by filename with ?analog-content-list=true.
 * We use the query param to transform the return into an array of
 * just front matter attributes.
 *
 * @returns
 */
export const getContentFilesList = () => {
  const ANALOG_CONTENT_FILE_LIST = {};

  return ANALOG_CONTENT_FILE_LIST as Record<string, Record<string, any>>;
};

/**
 * Returns the lazy loaded content files for lookups.
 *
 * @returns
 */
export const getContentFiles = () => {
  const ANALOG_CONTENT_ROUTE_FILES = {};

  return ANALOG_CONTENT_ROUTE_FILES;
};

export const getAgxFiles = () => {
  const ANALOG_AGX_FILES = {};

  return ANALOG_AGX_FILES;
};
