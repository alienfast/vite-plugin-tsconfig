import { Logger } from 'vite'

export interface ProcessHandler {
  event: string
  handler: (...args: any[]) => void
}

/**
 * Manages process event handlers for emergency cleanup
 */
export class ProcessHandlerManager {
  private handlers: ProcessHandler[] = []
  private registered = false

  constructor(private log: Logger) {}

  /**
   * Register emergency cleanup handlers for process events
   */
  public registerEmergencyCleanup(cleanupFn: (reason: string) => void): void {
    if (this.registered) {
      return
    }

    this.registered = true

    const exitHandler = (signal: string) => {
      cleanupFn(`Process ${signal}`)
      // Let Node.js handle termination naturally - don't call process.exit()
    }

    const sigintHandler = () => exitHandler('SIGINT')
    const sigtermHandler = () => exitHandler('SIGTERM')
    const exitExitHandler = () => cleanupFn('Process exit')
    const uncaughtExceptionHandler = (error: Error) => {
      this.log.error(`Uncaught exception: ${error}`)
      cleanupFn('Uncaught exception')
      // Let Node.js handle termination naturally - don't call process.exit()
    }
    const unhandledRejectionHandler = (reason: any) => {
      this.log.error(`Unhandled rejection: ${reason}`)
      cleanupFn('Unhandled rejection')
      // Let Node.js handle termination naturally - don't call process.exit()
    }

    process.on('SIGINT', sigintHandler)
    process.on('SIGTERM', sigtermHandler)
    process.on('exit', exitExitHandler)
    process.on('uncaughtException', uncaughtExceptionHandler)
    process.on('unhandledRejection', unhandledRejectionHandler)

    // Track handlers for cleanup
    this.handlers = [
      { event: 'SIGINT', handler: sigintHandler },
      { event: 'SIGTERM', handler: sigtermHandler },
      { event: 'exit', handler: exitExitHandler },
      { event: 'uncaughtException', handler: uncaughtExceptionHandler },
      { event: 'unhandledRejection', handler: unhandledRejectionHandler },
    ]
  }

  /**
   * Cleanup process handlers to prevent memory leaks
   */
  public cleanup(): void {
    if (this.handlers.length > 0) {
      this.log.info('Cleaning up process event handlers')
      for (const { event, handler } of this.handlers) {
        process.removeListener(event, handler)
      }
      this.handlers = []
      this.registered = false
    }
  }

  /**
   * Check if handlers are currently registered
   */
  public isRegistered(): boolean {
    return this.registered
  }
}
