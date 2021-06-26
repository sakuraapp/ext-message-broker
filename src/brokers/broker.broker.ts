import { EventEmitter } from 'events'
import { Message } from '../types'

export type InternalEventType = string
export type InternalListener<T> = (event: T) => void

export interface BrokerOptions {
    namespace?: string
    usePort?: boolean
    allowExternal?: boolean
}

export abstract class Broker<A> extends EventEmitter {
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
}
