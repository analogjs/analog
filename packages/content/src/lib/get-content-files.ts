// Keep the plugin placeholders at module scope so library bundlers do not
// inline the empty objects into the getters before Vite replaces them.
let ANALOG_CONTENT_FILE_LIST = {};
let ANALOG_CONTENT_ROUTE_FILES = {};

/**
 * Returns the list of content files by filename with ?analog-content-list=true.
 * We use the query param to transform the return into an array of
 * just front matter attributes.
 *
 * @returns
 */
export const getContentFilesList = () => {
  return ANALOG_CONTENT_FILE_LIST as Record<string, Record<string, any>>;
};

/**
 * Returns the lazy loaded content files for lookups.
 *
 * @returns
 */
export const getContentFiles = () => {
  return ANALOG_CONTENT_ROUTE_FILES;
};
