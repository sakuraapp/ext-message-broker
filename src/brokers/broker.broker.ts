import { EventEmitter } from 'events'
import { Message, MiddlewareType, MiddlewarnFn } from '../types'

export type InternalEventType = string
export type InternalListener<T> = (event: T) => void

export interface BrokerOptions {
    namespace?: string
    usePort?: boolean
    allowExternal?: boolean
}

export abstract class Broker<A> extends EventEmitter {
    protected middleware: Record<MiddlewareType, MiddlewarnFn<unknown, A>[]> =     {
        [MiddlewareType.Inbound]: [],
        [MiddlewareType.Outbound]: [],
    }

    abstract dispatch<T>(message: Message<T, A>): void

    protected getInternalEvent(type: InternalEventType): string {
        return `_extbroker_${type}`
    }

    protected emitInternal<T>(type: InternalEventType, data?: T): void {
        this.emit(this.getInternalEvent(type), data)
    }

    onInternal<T>(type: InternalEventType, listener: InternalListener<T>): this {
        return super.on(this.getInternalEvent(type), listener)
    }

    use<T>(type: MiddlewareType, fn: MiddlewarnFn<T, A>) {
        this.middleware[type].push(fn)
    }

    protected runMiddleware<T>(
        type: MiddlewareType,
        message: Message<T, A>,
        callback: () => void,
        index = 0
    ) {
        const middleware = this.middleware[type]
        const fn = middleware[index]
    
        const next = () => {
            if (index === middleware.length - 1) {
                callback()
            } else {
                this.runMiddleware(type, message, callback, index + 1)
            }
        }

        fn(message, next)
    }
}
