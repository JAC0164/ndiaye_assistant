"use client"

type LogLevel = "error" | "warn" | "info" | "debug"

const isDev = process.env.NODE_ENV !== "production"

function log(level: LogLevel, message: string, ...args: unknown[]) {
  if (!isDev && level === "debug") return

  const prefix = `[Ndiaye ${level.toUpperCase()}]`

  switch (level) {
    case "error":
      console.error(prefix, message, ...args)
      break
    case "warn":
      console.warn(prefix, message, ...args)
      break
    case "info":
      console.log(prefix, message, ...args)
      break
    case "debug":
      console.debug(prefix, message, ...args)
      break
  }
}

export const clientLogger = {
  error: (message: string, ...args: unknown[]) => log("error", message, ...args),
  warn: (message: string, ...args: unknown[]) => log("warn", message, ...args),
  info: (message: string, ...args: unknown[]) => log("info", message, ...args),
  debug: (message: string, ...args: unknown[]) => log("debug", message, ...args),
}
