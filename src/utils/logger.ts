type Level = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configuredLevel = (Bun.env.LOG_LEVEL as Level | undefined) ?? "info";
const minLevelWeight = LEVEL_WEIGHT[configuredLevel] ?? LEVEL_WEIGHT.info;
const isProd = Bun.env.NODE_ENV === "production";

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

function write(level: Level, msg: string, context: Record<string, unknown>) {
  if (LEVEL_WEIGHT[level] < minLevelWeight) return;

  const { err, ...rest } = context;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...rest,
    ...(err !== undefined ? { err: serializeError(err) } : {}),
  };

  const line = isProd
    ? JSON.stringify(entry)
    : `${entry.ts} ${level.toUpperCase().padEnd(5)} ${
        rest.source ? `[${rest.source}] ` : ""
      }${msg}${Object.keys(rest).length ? " " + JSON.stringify(rest) : ""}${
        err ? "\n" + (err instanceof Error ? err.stack : String(err)) : ""
      }`;

  const sink =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  sink(line);
}

export interface Logger {
  debug(msg: string, context?: Record<string, unknown>): void;
  info(msg: string, context?: Record<string, unknown>): void;
  warn(msg: string, context?: Record<string, unknown>): void;
  error(msg: string, context?: Record<string, unknown>): void;
  // Returns a new Logger with `bindings` merged into every call it makes —
  // set the subsystem/source once instead of repeating it at every log site.
  child(bindings: Record<string, unknown>): Logger;
}

function makeLogger(bindings: Record<string, unknown> = {}): Logger {
  return {
    debug: (msg, context) => write("debug", msg, { ...bindings, ...context }),
    info: (msg, context) => write("info", msg, { ...bindings, ...context }),
    warn: (msg, context) => write("warn", msg, { ...bindings, ...context }),
    error: (msg, context) => write("error", msg, { ...bindings, ...context }),
    child: (extra) => makeLogger({ ...bindings, ...extra }),
  };
}

export const logger = makeLogger();
