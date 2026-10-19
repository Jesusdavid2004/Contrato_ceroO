export interface LogContext {
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'jwtsecret',
  'jwt_secret',
  'secret',
  'creditcard',
  'credit_card',
  'cardnumber',
  'card_number',
  'apikey',
  'api_key',
  'anthropicapikey',
  'anthropic_api_key',
  'originaltext',
  'original_text',
  'clausetext',
  'clause_text',
  'contracttext',
  'contract_text',
]);

export class Logger {
  public sanitize(obj: unknown, depth = 0): unknown {
    if (depth > 6) return '[MaxDepth]';
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.sanitize(item, depth + 1));

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      const strippedKey = normalizedKey.replace(/[-_]/g, '');

      if (SENSITIVE_KEYS.has(normalizedKey) || SENSITIVE_KEYS.has(strippedKey)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value, depth + 1);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private format(level: string, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const cleanContext = context ? this.sanitize(context) : {};
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...(cleanContext as Record<string, unknown>),
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
