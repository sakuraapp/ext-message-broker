import { MessageEvent } from './events/message.event'

export interface SourceInfo {
    tabId: number
    frameId?: number
    webviewId?: number
}

export type TargetMode<T = void> = 'parent' | 'host' | 'tab' | 'background' | 'broadcast' | T

export interface Message<T = any, A = void> {
    type: string
    data?: T
    source?: SourceInfo
    target?: SourceInfo
    targetMode?: TargetMode<A>
    namespace?: string
    time?: number
}

export type MessageListener<T> = (event: MessageEvent<T>) => void

export enum MiddlewareType {
    Inbound = 'inbound',
    Outbound = 'outbound',
}

export type MiddlewarnFn<T, A> = (
    message: Message<T, A>,
    next: () => void
) => void
