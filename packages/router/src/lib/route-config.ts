import { RedirectRouteMeta, RouteConfig, RouteMeta } from './models';
import { ROUTE_META_TAGS_KEY } from './meta-tags';

export function toRouteConfig(routeMeta: RouteMeta | undefined): RouteConfig {
  if (!routeMeta) {
    return {};
  }

  if (isRedirectRouteMeta(routeMeta)) {
    return routeMeta;
  }

  const { meta, ...routeConfig } = routeMeta;

  if (Array.isArray(meta)) {
    routeConfig.data = { ...routeConfig.data, [ROUTE_META_TAGS_KEY]: meta };
  } else if (typeof meta === 'function') {
    routeConfig.resolve = {
      ...routeConfig.resolve,
      [ROUTE_META_TAGS_KEY]: meta,
    };
  }

  return routeConfig;
}

function isRedirectRouteMeta(
  routeMeta: RouteMeta
): routeMeta is RedirectRouteMeta {
  return !!routeMeta.redirectTo;
}
