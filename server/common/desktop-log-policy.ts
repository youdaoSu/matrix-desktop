import type { LogLevel } from '@nestjs/common';

// The platform HTTP interceptor logs whole successful response objects at
// info in production, independently of LOG_RESPONSE_BODY. Desktop polls can
// contain large private histories. Keep warnings/errors, not payload traces.
// This configures Nest logging and the public OpenTelemetry sampler, never request/auth/DB
// behavior, and leaves the hosted application's policy unchanged.
export function prepareDesktopLogEnvironment(env: NodeJS.ProcessEnv): boolean {
  if (env.MATRIX_DESKTOP !== '1') return false;
  env.LOGGER_LEVEL = 'warn';
  env.LOG_REQUEST_BODY = 'false';
  env.LOG_RESPONSE_BODY = 'false';
  // The production SDK exports every SQL span directly to stdout, outside
  // Nest's levels. Disable desktop diagnostic spans before SDK startup while
  // retaining warning/error logs and normal callback/context propagation.
  env.OTEL_TRACES_SAMPLER = 'always_off';
  return true;
}

export function applyDesktopLogLevels(desktop: boolean, override: (levels: LogLevel[]) => void): void {
  if (desktop) override(['warn', 'error', 'fatal']);
}
