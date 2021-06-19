import { EventEmitter } from 'events'
import { Runtime } from 'webextension-polyfill-ts'
import { PortManager } from '../managers/port.manager'
import { browser } from '../browser'
import { MessageEvent } from '../events/message.event'
import { FrameManager } from '../managers/frame.manager'
import {
    Broker,
    BrokerOptions,
    Message,
    MessageListener,
    SourceInfo
} from '../types'
import { DEFAULT_OPTIONS } from '../constants'

export declare interface MessageBroker {
    on<T>(event: string, listener: MessageListener<T>): this;
}

export class MessageBroker extends EventEmitter implements Broker {
    private readonly opts: BrokerOptions

    private frameManager = new FrameManager()
    private portManager: PortManager

    constructor(opts: BrokerOptions = {}) {
        super()

        this.opts = {
            ...DEFAULT_OPTIONS,
            ...opts,
        }

        this.onMessage = this.onMessage.bind(this)
        this.onConnect = this.onConnect.bind(this)

        this.init()
    }

    init(): void {
        if (this.opts.usePort) {
            this.portManager = new PortManager()
            this.portManager.on('message', this.onMessage)

            browser.runtime.onConnect.addListener(this.onConnect)
        } else {
            browser.runtime.onMessage.addListener(this.onMessage)
        }
    }

    destroy(): void {
        if (this.opts.usePort) {
            browser.runtime.onConnect.removeListener(this.onConnect)

            this.portManager.off('message', this.onMessage)
            this.portManager.destroy()
        } else {
            browser.runtime.onMessage.removeListener(this.onMessage)
        }
        
        this.frameManager.destroy()
    }

    private isNamespaceAllowed(input: string): boolean {
        return input === this.opts.namespace
    }    

    private onConnect(port: Runtime.Port) {
        if (this.isNamespaceAllowed(port.name)) {
            this.portManager.add(port)
        }
    }

    private onMessage<T>(message: Message<T>, sender: Runtime.MessageSender) {
        if (!this.isMessageValid<T>(message)) {
            return
        }

        const target: SourceInfo = {
            tabId: sender.tab.id,
            frameId: sender.frameId,
        }

        if (message.targetMode) {
            switch (message.targetMode) {
                case 'background':
                    this.emitMessage<T>(message)
                    break
                case 'host':
                    this.sendToHost<T>(
                        message.type,
                        message.data,
                        target,
                    )
                    break
                case 'parent':
                    this.sendToParent<T>(
                        message.type,
                        message.data,
                        target,
                    )
                    break
                case 'tab':
                    this.sendToTab<T>(
                        message.type,
                        message.data,
                        target,
                    )
                    break
                case 'broadcast':
                    this.emitMessage<T>(message)
                    this.broadcast(
                        message.type,
                        message.data,
                        target,
                    )
            }
        } else if (message.target) {
            this.send<T>(
                message.type,
                message.data,
                message.target,
                target,
            )
        }
    }

    private emitMessage<T>(message: Message<T>) {
        const event = new MessageEvent<T>(message, this)

        this.emit(message.type, event)
    }

    private createMessage<T>(message: Message<T>): Message<T> {
        message.namespace = this.opts.namespace

        return message
    }

    private isMessageValid<T>(message: Message<T>): boolean {
        return this.isNamespaceAllowed(message.namespace)
    }

    async dispatch<T>(message: Message<T>): Promise<void> {
        message = this.createMessage(message)

        const { target } = message

        // delete unnecessary props to reduce message size
        message.targetMode = null
        message.target = null

        delete message.targetMode
        delete message.target

        if (this.portManager) {
            this.portManager.dispatch(message, target)
        } else {
            if (target) {
                let options
            
                if (target.frameId !== null && target.frameId !== undefined) {
                    options = { frameId: target.frameId } 
                }

                await browser.tabs.sendMessage(target.tabId, message, options)
            } else {
                browser.runtime.sendMessage(message) // todo: prevent echo
            }
        }
    }

    send<T>(
        event: string,
        data?: T,
        target?: SourceInfo,
        source?: SourceInfo
    ): Promise<void> {
        const message: Message<T> = {
            type: event,
            data,
            target,
            source,
        }
    
        return this.dispatch(message)
    }

    // sends a message to the top-most parent
    sendToHost<T>(event: string, data: T, source: SourceInfo): Promise<void> {
        return this.send(
            event,
            data,
            {
                tabId: source.tabId,
                frameId: 0,
            },
            source
        )
    }
    
    // sends a message to the frame's direct parent
    async sendToParent<T>(event: string, data: T, source: SourceInfo) {
        const framePath = await this.frameManager.getPath(source)
    
        if (framePath.length - 2 < 0) {
            return
        }
    
        this.send(
            event,
            data,
            {
                tabId: source.tabId,
                frameId: framePath[framePath.length - 2],
            },
            source,
        )
    }

    // sends a message to all frames inside the sender's tab
    sendToTab<T>(event: string, data: T, source: SourceInfo) {
        this.send<T>(
            event,
            data,
            { tabId: source.tabId },
            source,
        )
    }

    broadcast<T>(event: string, data?: T, source?: SourceInfo) {
        this.send<T>(event, data, null, source)
    }
}
