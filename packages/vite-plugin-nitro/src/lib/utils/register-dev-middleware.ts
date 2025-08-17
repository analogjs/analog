import type { ViteDevServer } from 'vite';
import type { EventHandler } from 'h3';
import { createEvent } from 'h3';
import { globSync } from 'tinyglobby';
import { IncomingMessage, ServerResponse } from 'node:http';

interface MiddlewareModule {
  default?: EventHandler | ((...args: unknown[]) => unknown);
  [key: string]: unknown;
}

interface ValidatedHandler {
  handler: EventHandler;
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Validates if a handler is a valid H3 event handler
 */
function validateHandler(handler: unknown, filePath: string): ValidatedHandler {
  // Check if handler exists
  if (!handler) {
    return {
      handler: handler as EventHandler,
      isValid: false,
      errorMessage: `No default export found in ${filePath}`,
    };
  }

  // Check if it's a function
  if (typeof handler !== 'function') {
    return {
      handler: handler as EventHandler,
      isValid: false,
      errorMessage: `Default export is not a function in ${filePath} (type: ${typeof handler})`,
    };
  }

  // Check for H3 event handler signature
  // H3 handlers should have __is_handler__ property or be callable with event parameter
  const isH3Handler = !!(handler as { __is_handler__?: boolean })
    .__is_handler__;
  const hasValidSignature =
    (handler as (...args: unknown[]) => unknown).length <= 1; // H3 handlers take 0 or 1 parameter (event)

  if (!isH3Handler && !hasValidSignature) {
    return {
      handler: handler as EventHandler,
      isValid: false,
      errorMessage: `Default export does not appear to be an H3 event handler in ${filePath}. Expected eventHandler() wrapper.`,
    };
  }

  return {
    handler: handler as EventHandler,
    isValid: true,
  };
}

/**
 * Safely loads and validates a middleware module
 */
async function loadMiddlewareModule(
  viteServer: ViteDevServer,
  filePath: string,
): Promise<ValidatedHandler> {
  try {
    // Clear module cache to ensure fresh loading (Vite 5+ compatibility)
    try {
      const moduleGraph =
        viteServer.environments?.ssr?.moduleGraph || viteServer.moduleGraph;
      const ssrModule = moduleGraph?.getModuleById(filePath);
      if (ssrModule) {
        moduleGraph.invalidateModule(ssrModule);
      }
    } catch (cacheError) {
      // Fallback: module cache clearing failed, continue without it
      console.debug(
        `[analog-nitro] Could not clear module cache for ${filePath}:`,
        cacheError,
      );
    }

    // Load the module
    const module: MiddlewareModule = await viteServer.ssrLoadModule(filePath);

    // Validate the handler
    return validateHandler(module.default, filePath);
  } catch (loadError) {
    return {
      handler: null as unknown as EventHandler,
      isValid: false,
      errorMessage: `Failed to load middleware from ${filePath}: ${loadError instanceof Error ? loadError.message : String(loadError)}`,
    };
  }
}

/**
 * Creates a safe middleware wrapper that handles errors gracefully
 */
function createSafeMiddleware(filePath: string, viteServer: ViteDevServer) {
  return async (req: unknown, res: unknown, next: () => void) => {
    try {
      const { handler, isValid, errorMessage } = await loadMiddlewareModule(
        viteServer,
        filePath,
      );

      if (!isValid) {
        // Log warning but don't fail the request
        console.warn(`[analog-nitro] ${errorMessage}`);
        next();
        return;
      }

      // Execute the middleware handler
      const event = createEvent(req as IncomingMessage, res as ServerResponse);
      const result = await handler(event);

      // If handler doesn't handle the request, pass to next middleware
      if (result === undefined || result === null) {
        next();
      }
      // If handler returns a response, it's handled
    } catch (executionError) {
      console.error(
        `[analog-nitro] Error executing middleware ${filePath}:`,
        executionError,
      );
      // Continue to next middleware instead of failing the request
      next();
    }
  };
}

export async function registerDevServerMiddleware(
  root: string,
  sourceRoot: string,
  viteServer: ViteDevServer,
) {
  const middlewarePattern = `${root}/${sourceRoot}/server/middleware/**/*.ts`;
  const middlewareFiles = globSync([middlewarePattern]);

  if (middlewareFiles.length === 0) {
    console.log(
      `[analog-nitro] No middleware files found matching pattern: ${middlewarePattern}`,
    );
    return;
  }

  console.log(
    `[analog-nitro] Registering ${middlewareFiles.length} middleware files`,
  );

  middlewareFiles.forEach((file) => {
    try {
      // Create safe middleware wrapper
      const safeMiddleware = createSafeMiddleware(file, viteServer);

      // Register with Vite's middleware stack
      viteServer.middlewares.use(safeMiddleware);

      console.log(`[analog-nitro] Registered middleware: ${file}`);
    } catch (registrationError) {
      console.error(
        `[analog-nitro] Failed to register middleware ${file}:`,
        registrationError,
      );
      // Continue with other middleware files
    }
  });

  console.log(`[analog-nitro] Middleware registration complete`);
}
