import { Runtime } from 'webextension-polyfill-ts'
import { browser } from '../browser'
import { DEFAULT_WEB_OPTIONS, WEB_MESSAGE_TYPE } from '../constants'
import { MessageEvent } from '../events/message.event'
import {
    Message,
    MessageListener,
    SourceInfo,
    TargetMode
} from '../types'
import { Broker, BrokerOptions } from './broker.broker'

export type BrowserMessage<T> = globalThis.MessageEvent<T>

export enum BrokerMode {
    Direct = 'direct',
    External = 'external',
}

export interface WebMessage<T, A> {
    type: typeof WEB_MESSAGE_TYPE
    data: Message<T, A>
    bridged?: boolean
    extensionId: string
}

export interface WebBrokerOptions extends BrokerOptions {
    mode?: BrokerMode
    targetOrigin: string
    sourceOrigin?: string // to verify messages ? maybe set this to a default value
    extensionId?: string
}

function getMode(opts: WebBrokerOptions): BrokerMode {
    switch (opts.mode) {
        case BrokerMode.External:
            return opts.mode
            break
        case BrokerMode.Direct:
            if (opts.usePort) {
                return opts.mode
            }
            break
    }

    return browser.extension
        ? BrokerMode.Direct
        : BrokerMode.External
}

export declare interface WebBroker {
    on<T>(event: string, listener: MessageListener<T>): this;
}

export class WebBroker<A = void> extends Broker<A> {
    private opts: WebBrokerOptions
    private mode: BrokerMode
    
    private port: Runtime.Port

    private get useWebMessages(): boolean {
        return this.opts.allowExternal || this.mode === BrokerMode.External
    }

    constructor(opts: Partial<WebBrokerOptions> = {}) {
        super()

        this.opts = {
            ...DEFAULT_WEB_OPTIONS,
            ...opts,
        }

        if (!browser.runtime || !browser.runtime.connect) {
            this.opts.usePort = false
        }

        this.mode = getMode(this.opts)

        this.dispatchBrokerMessage = this.dispatchBrokerMessage.bind(this)
        this.onWebMessage = this.onWebMessage.bind(this)
        this.onMessage = this.onMessage.bind(this)
        this.onDisconnect = this.onDisconnect.bind(this)

        if (!this.opts.extensionId) {
            throw new Error('No extensionId provided.')
        }

        this.init()
    }

    init(): void {
        if (this.useWebMessages) {
            window.addEventListener('message', this.onWebMessage)
        }

        if (this.mode === BrokerMode.Direct) {
            if (this.opts.usePort) {
                this.connect()
            } else {
                browser.runtime.onMessage.addListener(this.onMessage)
            }
        }
    }

    connect(): void {
        this.port = browser.runtime.connect(this.opts.extensionId, { name: this.opts.namespace })

        this.port.onMessage.addListener(this.onMessage)
        this.port.onDisconnect.addListener(this.onDisconnect)
    }

    destroy(): void {
        if (this.useWebMessages) {
            window.removeEventListener('message', this.onWebMessage)
        }

        if (this.mode === BrokerMode.Direct) {
            if (this.port) {
                this.port.disconnect()
            } else {
                browser.runtime.onMessage.removeListener(this.onMessage)
            }
        }
    }

    private onDisconnect(): void {
        this.emitInternal('disconnect')
    }

    private onWebMessage<T>(e: BrowserMessage<WebMessage<T, A>>) {
        const { sourceOrigin } = this.opts
        const msg = e.data

        if (e.source != window) {
            return
        }

        if (sourceOrigin && e.origin !== sourceOrigin) {
            return
        }

        if (msg.type === WEB_MESSAGE_TYPE) {
            if (msg.extensionId !== this.opts.extensionId) {
                return
            }
            
            const message = e.data.data

            if (this.mode === BrokerMode.Direct) {
                if (msg.bridged) {
                    return
                }

                if (!this.isMessageValid<T>(message)) {
                    return
                }

                this.dispatchBrokerMessage<T>(message)
            } else {
                this.onMessage<T>(message)
            }
        }
    }

    private onMessage<T>(message: Message<T, A>) {
        if (!this.isMessageValid(message)) {
            return
        }

        const event = new MessageEvent<T, A>(message, this)

        this.emit(message.type, event)
    }

    private createMessage<T>(message: Message<T, A>): Message<T, A> {
        message.namespace = this.opts.namespace

        if (!message.time) {
            message.time = new Date().getTime()
        }

        return message
    }

    private isMessageValid<T>(message: Message<T, A>): boolean {
        if (message.namespace !== this.opts.namespace) {
            return false
        }

        return true
    }

    dispatchWebMessage<T>(message: Message<T, A>) {
        const msg: WebMessage<T, A> = {
            type: WEB_MESSAGE_TYPE,
            data: message,
            bridged: this.mode === BrokerMode.Direct,
            extensionId: this.opts.extensionId,
        }

        window.postMessage(msg, this.opts.targetOrigin)
    }

    private dispatchBrokerMessage<T>(message: Message<T, A>) {
        if (this.port) {
            this.port.postMessage(message)
        } else {
            browser.runtime.sendMessage(message)
        }
    }

    dispatch<T>(message: Message<T, A>) {
        message = this.createMessage(message)
        
        if (this.mode === BrokerMode.Direct) {
            this.dispatchBrokerMessage<T>(message)
        } else {
            this.dispatchWebMessage<T>(message)
        }
    }

    send<T>(
        event: string,
        data?: T,
        targetMode: TargetMode<A> = 'background',
        time?: number
    ) {
        const message: Message<T, A> = {
            type: event,
            data,
            targetMode,
            time,
        }

        this.dispatch<T>(message)
    }

    sendToHost<T>(event: string, data?: T) {
        return this.send<T>(event, data, 'host')
    }

    sendToParent<T>(event: string, data?: T) {
        return this.send<T>(event, data, 'parent')
    }

    sendToTab<T>(event: string, data?: T) {
        return this.send<T>(event, data, 'tab')
    }

    sendToBackground<T>(event: string, data?: T) {
        return this.send<T>(event, data, 'background')
    }

    sendToTarget<T>(event: string, data: T, target: SourceInfo) {
        return this.dispatch<T>({
            type: event,
            data,
            target,
        })
    }

    broadcast<T>(event: string, data: T) {
        return this.send(event, data, 'broadcast')
    }
}
