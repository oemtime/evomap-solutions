/**
 * 日志工具
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  /** 最低日志级别 */
  minLevel: LogLevel;
  /** 是否包含时间戳 */
  timestamp: boolean;
  /** 自定义输出函数 */
  output?: (message: string) => void;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

export class Logger {
  private options: LoggerOptions;

  constructor(options: Partial<LoggerOptions> = {}) {
    this.options = {
      minLevel: options.minLevel || 'info',
      timestamp: options.timestamp ?? true,
      output: options.output || console.log
    };
  }

  /**
   * 记录调试日志
   */
  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  /**
   * 记录信息日志
   */
  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  /**
   * 记录警告日志
   */
  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  /**
   * 记录错误日志
   */
  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  /**
   * 通用日志方法
   */
  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.options.minLevel]) {
      return;
    }

    const timestamp = this.options.timestamp ? `[${new Date().toISOString()}] ` : '';
    const levelStr = `[${level.toUpperCase()}]`;
    const formattedMessage = `${timestamp}${levelStr} ${message}`;
    
    if (args.length > 0) {
      this.options.output?.(`${formattedMessage} ${args.map(a => JSON.stringify(a)).join(' ')}`);
    } else {
      this.options.output?.(formattedMessage);
    }
  }

  /**
   * 设置最低日志级别
   */
  setLevel(level: LogLevel): void {
    this.options.minLevel = level;
  }

  /**
   * 创建子日志器
   */
  child(prefix: string): Logger {
    const childOutput = (message: string) => {
      this.options.output?.(`[${prefix}] ${message}`);
    };
    
    return new Logger({
      ...this.options,
      output: childOutput
    });
  }
}

export default Logger;
