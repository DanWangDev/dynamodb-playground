/**
 * Structured logger for exercise scripts.
 * Provides consistent, readable output without the weight of a logging framework.
 */

export type LogLevel = "info" | "success" | "warn" | "error" | "step" | "concept";

const LEVEL_PREFIX: Record<LogLevel, string> = {
  info: "  ℹ",
  success: "  ✅",
  warn: "  ⚠️",
  error: "  ❌",
  step: "  📍",
  concept: "  💡",
};

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
}

function formatTimestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function createEntry(
  level: LogLevel,
  module: string,
  message: string,
  data?: unknown,
): LogEntry {
  return {
    timestamp: formatTimestamp(),
    level,
    module,
    message,
    data,
  };
}

export function createLogger(module: string) {
  function log(level: LogLevel, message: string, data?: unknown): void {
    const prefix = LEVEL_PREFIX[level];
    const tag = `[${module}]`;

    console.log(`${prefix} ${tag} ${message}`);

    if (data !== undefined) {
      console.log(`     ${JSON.stringify(data, null, 2)}`);
    }
  }

  return {
    info: (msg: string, data?: unknown) => log("info", msg, data),
    success: (msg: string, data?: unknown) => log("success", msg, data),
    warn: (msg: string, data?: unknown) => log("warn", msg, data),
    error: (msg: string, data?: unknown) => log("error", msg, data),
    step: (msg: string) => log("step", msg),
    concept: (msg: string) => log("concept", msg),

    /** Print a section header in the exercise output */
    section: (title: string): void => {
      const line = "═".repeat(60);
      console.log(`\n${line}`);
      console.log(`  ${title}`);
      console.log(`${line}\n`);
    },

    /** Print the entry structure for debugging */
    createEntry,
  };
}

export type Logger = ReturnType<typeof createLogger>;
