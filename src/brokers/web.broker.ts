import { EventEmitter } from 'events'
import { DEFAULT_WEB_OPTIONS, WebMessageType } from '../constants'
import { MessageEvent } from '../events/message.event'
import {
    Broker,
    BrokerOptions,
    Message,
    MessageListener,
    SourceInfo,
    TargetMode
} from '../types'

export type BrowserMessage<T> = globalThis.MessageEvent<T>

export enum BrokerMode {
    ContentScript,
    External
}

export interface WebMessage<T> {
    type: typeof WebMessageType
    data: Message<T>
    bridged?: boolean
}

export interface WebBrokerOptions extends BrokerOptions {
    allowExternal: boolean
    targetOrigin: string
    sourceOrigin?: string // to verify messages ? maybe set this to a default value
    extensionId?: string
}

export declare interface WebBroker {
    on<T>(event: string, listener: MessageListener<T>): this;
}

export class WebBroker extends EventEmitter implements Broker {
    private opts: WebBrokerOptions
    private mode: BrokerMode

    private get useWebMessages(): boolean {
        return this.opts.allowExternal || this.mode === BrokerMode.External
    }

    constructor(opts: Partial<WebBrokerOptions> = {}) {
        super()

        this.opts = {
            ...DEFAULT_WEB_OPTIONS,
            ...opts,
        }

        this.mode = chrome.extension
            ? BrokerMode.ContentScript
            : BrokerMode.External

        this.onWebMessage = this.onWebMessage.bind(this)
        this.onMessage = this.onMessage.bind(this)

        if (!this.opts.extensionId && this.mode === BrokerMode.External) {
            throw new Error('No extensionId provided in external mode.')
        }

        this.init()
    }

    init(): void {
        if (this.useWebMessages) {
            window.addEventListener('message', this.onWebMessage)
        }

        if (this.mode === BrokerMode.ContentScript) {
            chrome.runtime.onMessage.addListener(this.onMessage)
        }
    }

    destroy(): void {
        if (this.useWebMessages) {
            window.removeEventListener('message', this.onWebMessage)
        }

        if (this.mode === BrokerMode.ContentScript) {
            chrome.runtime.onMessage.removeListener(this.onMessage)
        }
    }

    private onWebMessage<T>(e: BrowserMessage<WebMessage<T>>) {
        const { sourceOrigin } = this.opts
        const msg = e.data

        if (e.source != window) {
            return
        }

        if (sourceOrigin && e.origin !== sourceOrigin) {
            return
        }

        if (msg.type === WebMessageType) {
            const message = e.data.data

            if (this.mode === BrokerMode.ContentScript) {
                if (msg.bridged) {
                    return
                }

                if (!this.isMessageValid<T>(message)) {
                    return
                }

                chrome.runtime.sendMessage(this.createMessage<T>(message))
            } else {
                this.onMessage<T>(message)
            }
        }
    }

    private onMessage<T>(message: Message<T>) {
        if (!this.isMessageValid(message)) {
            return
        }

        const event = new MessageEvent(message, this)

        this.emit(message.type, event)
    }

    private createMessage<T>(message: Message<T>): Message<T> {
        message.extensionId = this.opts.extensionId
        message.namespace = this.opts.namespace

        return message
    }

    private isMessageValid<T>(message: Message<T>): boolean {
        if (message.namespace !== this.opts.namespace) {
            return false
        }

        if (message.extensionId !== this.opts.extensionId) {
            return false
        }

        return true
    }

    dispatchWebMessage<T>(message: Message<T>) {
        const msg: WebMessage<T> = {
            type: WebMessageType,
            data: message,
            bridged: this.mode === BrokerMode.ContentScript,
        }

        window.postMessage(msg, this.opts.targetOrigin)
    }

    dispatch<T>(message: Message<T>) {
        message = this.createMessage(message)
        
        if (this.mode === BrokerMode.ContentScript) {
            chrome.runtime.sendMessage(message)
        } else {
            this.dispatchWebMessage<T>(message)
        }
    }

    send<T>(
        event: string,
        data?: T,
        targetMode: TargetMode = 'background'
    ) {
        const message: Message<T> = {
            type: event,
            data,
            targetMode,
        }

        this.dispatch<T>(message)
    }

    sendToHost<T>(event: string, data?: T) {
        return this.send<T>(event, data, 'host')
    }

    sendToParent<T>(event: string, data?: T) {
        return this.send<T>(event, data, 'parent')
    }

    sendToTarget<T>(event: string, data: T, target: SourceInfo) {
        return this.dispatch<T>({
            type: event,
            data,
            target,
        })
    }
}
