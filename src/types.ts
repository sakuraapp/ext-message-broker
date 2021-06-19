import { MessageEvent } from './events/message.event'

export interface SourceInfo {
    tabId: number
    frameId?: number
}

export type TargetMode = 'parent' | 'host' | 'tab' | 'background' | 'broadcast'

export interface Message<T = any> {
    type: string
    data?: T
    source?: SourceInfo
    target?: SourceInfo
    targetMode?: TargetMode
    namespace?: string
}

export interface Broker {
    dispatch<T>(message: Message<T>): void
}

export interface BrokerOptions {
    namespace?: string
    usePort?: boolean
}

export type MessageListener<T> = (event: MessageEvent<T>) => void
