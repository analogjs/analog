import type { ViteDevServer } from 'vite';
import type { EventHandler } from 'h3';
import { createEvent } from 'h3';
import { globSync } from 'tinyglobby';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve, isAbsolute } from 'node:path';

/**
 * @fileoverview Nitro middleware registration utilities for Vite dev server
 *
 * This module handles the registration and loading of H3 middleware files during development.
 * It implements robust error handling and race condition prevention to avoid conflicts
 * with other Vite plugins that may be reading/writing files during SSR startup.
 *
 * CRITICAL PITFALLS & LESSONS LEARNED:
 *
 * 1. **SSR Module Loading Race Conditions**:
 *    - viteServer.ssrLoadModule() can fail if other plugins are simultaneously
 *      performing file operations (especially writeFileSync operations)
 *    - Always use sequential processing (for...of) instead of parallel (forEach)
 *    - Implement caching to prevent redundant ssrLoadModule calls
 *    - Add small delays before ssrLoadModule to allow module resolution to stabilize
 *
 * 2. **Module Graph Invalidation**:
 *    - Always clear Vite's module cache before loading to ensure fresh content
 *    - Handle both Vite 4.x and 5.x module graph APIs gracefully
 *    - Module invalidation can fail silently - always wrap in try/catch
 *
 * 3. **Path Resolution Strategies**:
 *    - ssrLoadModule requires absolute paths for reliable loading
 *    - Implement fallback strategies: absolute → relative → virtual (/@fs)
 *    - Different path formats may work in different environments
 *
 * 4. **Error Handling Philosophy**:
 *    - Never fail the entire dev server due to middleware loading issues
 *    - Log detailed debugging information for troubleshooting
 *    - Always provide fallback behavior (skip invalid middleware)
 *
 * 5. **Performance Optimizations**:
 *    - Cache loaded middleware to avoid repeated parsing
 *    - Track registered middleware to prevent duplicates
 *    - Use sequential processing to avoid race conditions
 *
 * ## FUTURE ENHANCEMENT OPPORTUNITIES
 *
 * ### 1. **Advanced Caching Strategies**
 * - **Intelligent Cache Invalidation**: Monitor file modification times for automatic cache refresh
 * - **Persistent Caching**: Store middleware cache across dev server restarts
 * - **Memory Usage Optimization**: Implement LRU cache for large middleware sets
 *
 * ### 2. **Enhanced Error Recovery**
 * - **Middleware Health Checks**: Periodic validation of loaded middleware
 * - **Graceful Degradation**: Continue serving with partial middleware in case of failures
 * - **Hot Middleware Reload**: Support for updating middleware without server restart
 *
 * ### 3. **Developer Experience**
 * - **Middleware Registry API**: Programmatic middleware registration for plugins
 * - **Visual Debugging**: Dev tools extension for middleware inspection
 * - **Performance Profiling**: Track middleware loading and execution times
 *
 * ### 4. **Production Optimizations**
 * - **Bundle Analysis**: Analyze middleware dependencies for optimal bundling
 * - **Tree Shaking**: Remove unused middleware exports in production builds
 * - **Code Splitting**: Support for lazy-loaded middleware in production
 *
 * ### 5. **Framework Integration**
 * - **Multi-Framework Support**: Extend beyond H3 to Express, Fastify, etc.
 * - **Serverless Optimization**: Specialized handling for edge runtime environments
 * - **Container Integration**: Docker-optimized middleware loading strategies
 *
 * @author AnalogJS Team
 * @since 1.0.0
 */

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
 *
 * H3 event handlers must be functions that:
 * - Have the __is_handler__ property (set by eventHandler() wrapper), OR
 * - Take 0 or 1 parameters (event object)
 *
 * @param handler - The potential event handler to validate
 * @param filePath - File path for error reporting
 * @returns Validation result with handler and validity status
 *
 * @example
 * ```typescript
 * const result = validateHandler(someFunction, '/path/to/middleware.ts');
 * if (result.isValid) {
 *   // Safe to use result.handler
 * } else {
 *   console.error(result.errorMessage);
 * }
 * ```
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
 * Cache for loaded middleware modules to avoid repeated loading
 *
 * PERFORMANCE OPTIMIZATION: Prevents redundant viteServer.ssrLoadModule() calls
 * which can be expensive and may trigger race conditions with other plugins.
 *
 * Key: File path (string)
 * Value: ValidatedHandler result
 */
const middlewareCache = new Map<string, ValidatedHandler>();

/**
 * Safely loads and validates a middleware module using Vite's SSR loader
 *
 * This function implements multiple strategies to reliably load middleware modules
 * while avoiding race conditions with other Vite plugins. It uses caching to
 * prevent redundant loads and implements fallback path resolution strategies.
 *
 * RACE CONDITION MITIGATION:
 * - Checks cache first to avoid redundant ssrLoadModule calls
 * - Clears Vite's module cache to ensure fresh loading
 * - Adds 50ms delay before ssrLoadModule to allow module resolution to stabilize
 * - Uses multiple fallback path strategies if primary loading fails
 *
 * PATH RESOLUTION STRATEGY:
 * 1. Try absolute path (most reliable)
 * 2. Try original relative path (compatibility)
 * 3. Try virtual /@fs path (Vite-specific fallback)
 *
 * @param viteServer - Vite development server instance
 * @param filePath - Path to the middleware file to load
 * @returns Promise resolving to validated handler result
 *
 * @example
 * ```typescript
 * const result = await loadMiddlewareModule(viteServer, 'src/middleware/auth.ts');
 * if (result.isValid) {
 *   // Use result.handler safely
 * } else {
 *   console.warn(`Failed to load: ${result.errorMessage}`);
 * }
 * ```
 */
async function loadMiddlewareModule(
  viteServer: ViteDevServer,
  filePath: string,
): Promise<ValidatedHandler> {
  // Check cache first for development performance
  if (middlewareCache.has(filePath)) {
    const cached = middlewareCache.get(filePath);
    if (cached) {
      console.debug(`[analog-nitro] Using cached middleware for ${filePath}`);
      return cached;
    }
  }

  try {
    console.debug(`[analog-nitro] Loading middleware module: ${filePath}`);

    // Ensure we have an absolute path for SSR loading
    const absolutePath = isAbsolute(filePath)
      ? filePath
      : resolve(process.cwd(), filePath);
    console.debug(`[analog-nitro] Resolved absolute path: ${absolutePath}`);

    // Clear module cache to ensure fresh loading (Vite 5+ compatibility)
    try {
      const moduleGraph =
        viteServer.environments?.ssr?.moduleGraph || viteServer.moduleGraph;
      const ssrModule = moduleGraph?.getModuleById(absolutePath);
      if (ssrModule) {
        moduleGraph.invalidateModule(ssrModule);
      }
    } catch (cacheError) {
      // Fallback: module cache clearing failed, continue without it
      console.debug(
        `[analog-nitro] Could not clear module cache for ${absolutePath}:`,
        cacheError,
      );
    }

    // CRITICAL: Add delay to prevent race conditions with other plugins
    // During dev server startup, multiple plugins may be reading/writing files
    // simultaneously. This delay allows module resolution to stabilize.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Load the module with multiple fallback strategies
    let module: MiddlewareModule;
    try {
      // First try with absolute path
      module = await viteServer.ssrLoadModule(absolutePath);
    } catch (absoluteError) {
      const absoluteMsg =
        absoluteError instanceof Error
          ? absoluteError.message
          : String(absoluteError);
      console.debug(
        `[analog-nitro] SSR load failed with absolute path: ${absoluteMsg}`,
      );
      try {
        // Try with the original relative path
        module = await viteServer.ssrLoadModule(filePath);
      } catch (relativeError) {
        const relativeMsg =
          relativeError instanceof Error
            ? relativeError.message
            : String(relativeError);
        console.debug(
          `[analog-nitro] SSR load failed with relative path: ${relativeMsg}`,
        );
        // Final fallback: try transforming to virtual module path
        const virtualPath = `/@fs${absolutePath}`;
        console.debug(`[analog-nitro] Trying virtual path: ${virtualPath}`);
        module = await viteServer.ssrLoadModule(virtualPath);
      }
    }

    console.debug(`[analog-nitro] Module loaded for ${filePath}:`, {
      hasDefault: !!module.default,
      defaultType: typeof module.default,
      moduleKeys: Object.keys(module),
    });

    // Validate the handler
    const result = validateHandler(module.default, filePath);

    // Cache successful loads
    if (result.isValid) {
      middlewareCache.set(filePath, result);
    }

    return result;
  } catch (loadError) {
    console.error(
      `[analog-nitro] Failed to load middleware from ${filePath}:`,
      loadError,
    );
    return {
      handler: null as unknown as EventHandler,
      isValid: false,
      errorMessage: `Failed to load middleware from ${filePath}: ${loadError instanceof Error ? loadError.message : String(loadError)}`,
    };
  }
}

/**
 * Creates a safe middleware wrapper that handles errors gracefully
 *
 * This wrapper ensures that middleware errors don't crash the entire dev server.
 * It implements lazy loading (loads middleware on first request) and provides
 * comprehensive error handling with fallback behavior.
 *
 * ERROR HANDLING STRATEGY:
 * - If middleware loading fails, log warning and continue to next middleware
 * - If middleware execution fails, log error and continue to next middleware
 * - Never crash the dev server due to middleware issues
 *
 * @param filePath - Path to the middleware file
 * @param viteServer - Vite development server instance
 * @returns Express-compatible middleware function
 *
 * @example
 * ```typescript
 * const safeMiddleware = createSafeMiddleware('src/middleware/auth.ts', viteServer);
 * app.use(safeMiddleware); // Won't crash even if middleware fails
 * ```
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

/**
 * Track registered middleware to prevent duplicates
 *
 * DUPLICATE PREVENTION: Ensures each middleware file is only registered once
 * during the dev server session, preventing duplicate execution and potential
 * performance issues.
 */
const registeredMiddleware = new Set<string>();

/**
 * Clear middleware caches - useful for development reloads
 *
 * This function resets both the middleware cache and registration tracking.
 * Should be called when the dev server is restarted or when you want to
 * force re-loading of all middleware.
 *
 * USE CASES:
 * - Dev server restart
 * - Middleware hot-reload scenarios
 * - Testing/debugging middleware loading
 *
 * @example
 * ```typescript
 * // Before restarting dev server
 * clearMiddlewareCaches();
 * ```
 */
export function clearMiddlewareCaches() {
  middlewareCache.clear();
  registeredMiddleware.clear();
  console.debug('[analog-nitro] Middleware caches cleared');
}

/**
 * Register all middleware files found in the server/middleware directory
 *
 * This is the main entry point for middleware registration. It scans for middleware
 * files using glob patterns, loads and validates each one, and registers them with
 * the Vite dev server.
 *
 * SEQUENTIAL PROCESSING: Uses for...of loop instead of forEach to ensure
 * middleware files are processed sequentially, preventing race conditions
 * during SSR module loading.
 *
 * ROBUST ERROR HANDLING: Individual middleware failures don't stop the process.
 * Invalid middleware files are skipped with warnings, allowing the dev server
 * to continue functioning.
 *
 * @param root - Project root directory (absolute path)
 * @param sourceRoot - Source root directory (relative to root, e.g., 'src')
 * @param viteServer - Vite development server instance
 *
 * @example
 * ```typescript
 * // In your Vite plugin's configureServer hook
 * await registerDevServerMiddleware(
 *   '/path/to/project',
 *   'src',
 *   viteServer
 * );
 * ```
 *
 * @throws Never throws - all errors are caught and logged
 */
export async function registerDevServerMiddleware(
  root: string,
  sourceRoot: string,
  viteServer: ViteDevServer,
) {
  const middlewarePattern = `${root}/${sourceRoot}/server/middleware/**/*.ts`;
  const middlewareFiles = globSync([middlewarePattern]);

  console.debug(
    `[analog-nitro] Scanning for middleware with pattern: ${middlewarePattern}`,
  );
  console.debug(`[analog-nitro] Found middleware files:`, middlewareFiles);

  if (middlewareFiles.length === 0) {
    console.log(
      `[analog-nitro] No middleware files found matching pattern: ${middlewarePattern}`,
    );
    return;
  }

  console.log(
    `[analog-nitro] Registering ${middlewareFiles.length} middleware files`,
  );

  // CRITICAL: Process middleware files sequentially to avoid race conditions
  // Using for...of instead of forEach ensures that viteServer.ssrLoadModule()
  // calls don't overlap, which can cause module loading conflicts.
  for (const file of middlewareFiles) {
    try {
      // Skip if already registered
      if (registeredMiddleware.has(file)) {
        console.debug(`[analog-nitro] Middleware already registered: ${file}`);
        continue;
      }

      // Pre-load and validate the middleware module
      const { isValid, errorMessage } = await loadMiddlewareModule(
        viteServer,
        file,
      );

      if (!isValid) {
        console.warn(
          `[analog-nitro] Skipping invalid middleware ${file}: ${errorMessage}`,
        );
        continue;
      }

      // Create safe middleware wrapper
      const safeMiddleware = createSafeMiddleware(file, viteServer);

      // Register with Vite's middleware stack
      viteServer.middlewares.use(safeMiddleware);
      registeredMiddleware.add(file);

      console.log(`[analog-nitro] Registered middleware: ${file}`);
    } catch (registrationError) {
      console.error(
        `[analog-nitro] Failed to register middleware ${file}:`,
        registrationError,
      );
      // Continue with other middleware files
    }
  }

  console.log(`[analog-nitro] Middleware registration complete`);
}
