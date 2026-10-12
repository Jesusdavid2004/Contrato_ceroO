export interface LogContext {
  [key: string]: unknown;
}

export class Logger {
  private format(level: string, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...(context || {}),
    });
  }

  public info(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'test') {
      console.log(this.format('INFO', message, context));
    }
  }

  public warn(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(this.format('WARN', message, context));
    }
  }

  public error(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'test') {
      console.error(this.format('ERROR', message, context));
    }
  }

  public debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(this.format('DEBUG', message, context));
    }
  }
}

export const logger = new Logger();
