import { Runtime } from 'webextension-polyfill-ts'
import { PortManager } from '../managers/port.manager'
import { browser } from '../browser'
import { MessageEvent } from '../events/message.event'
import { FrameManager } from '../managers/frame.manager'
import {
    Message,
    MessageListener,
    MiddlewareType,
    SourceInfo,
    TargetMode
} from '../types'
import { DEFAULT_OPTIONS } from '../constants'
import { Broker, BrokerOptions } from './broker.broker'

export type TargetModeHandler<T, A> = (message: Message<T, A>) => void | Promise<void>

export declare interface MessageBroker {
    on<T>(event: string, listener: MessageListener<T>): this;
}

export class MessageBroker<A = void> extends Broker<A> {
    private readonly opts: BrokerOptions

    private frameManager = new FrameManager()
    private portManager: PortManager
    private targetModes: Map<TargetMode<A>, TargetModeHandler<unknown, A>> = new Map()

    constructor(opts: BrokerOptions = {}) {
        super()

        this.opts = {
            ...DEFAULT_OPTIONS,
            ...opts,
        }

        this.onMessage = this.onMessage.bind(this)
        this.onConnect = this.onConnect.bind(this)

        this.addTargetModes()
        this.init()
    }

    init(): void {
        if (this.opts.usePort) {
            this.portManager = new PortManager()
            this.portManager.on('message', this.onMessage)

            browser.runtime.onConnect.addListener(this.onConnect)

            if (this.opts.allowExternal) {
                browser.runtime.onConnectExternal.addListener(this.onConnect)
            }
        } else {
            browser.runtime.onMessage.addListener(this.onMessage)

            if (this.opts.allowExternal) {
                browser.runtime.onMessageExternal.addListener(this.onMessage)
            }
        }
    }

    destroy(): void {
        if (this.opts.usePort) {
            browser.runtime.onConnect.removeListener(this.onConnect)

            if (this.opts.allowExternal) {
                browser.runtime.onConnectExternal.removeListener(this.onConnect)
            }

            this.portManager.off('message', this.onMessage)
            this.portManager.destroy()
        } else {
            browser.runtime.onMessage.removeListener(this.onMessage)

            if (this.opts.allowExternal) {
                browser.runtime.onMessageExternal.removeListener(this.onMessage)
            }
        }
        
        this.frameManager.destroy()
    }

    addTargetMode<T>(mode: TargetMode<A>, handler: TargetModeHandler<T, A>) {
        this.targetModes.set(mode, handler)
    }

    protected addTargetModes() {
        this.addTargetMode('background', (message) => {
            this.emitMessage(message)
        })

        this.addTargetMode('host', (message) => {
            return this.sendToHost(
                message.type,
                message.data,
                message.source,
            )
        })
        
        this.addTargetMode('parent', (message) => {
            return this.sendToParent(
                message.type,
                message.data,
                message.source,
            )
        })
        
        this.addTargetMode('tab', (message) => {
            return this.sendToTab(
                message.type,
                message.data,
                message.source,
            )
        })
        
        this.addTargetMode('broadcast', (message) => {
            this.emitMessage(message)
            
            return this.broadcast(
                message.type,
                message.data,
                message.source,
            )
        })
    }

    private isNamespaceAllowed(input: string): boolean {
        if (this.opts.namespace === undefined || this.opts.namespace === null) {
            return input === undefined || input === null || input.length === 0
        }
        
        return input === this.opts.namespace
    }    

    private onConnect(port: Runtime.Port) {
        if (this.isNamespaceAllowed(port.name)) {
            this.portManager.add(port)
        }
    }

    protected emitInbound<T>(message: Message<T, A>) {
        this.emitInternal(`inbound:${message.type}`, message)
    }

    // allows listening to a message that isn't necessarily meant for the background
    onInbound<T>(type: string, listener: (message: Message<T, A>) => void) {
        this.onInternal<Message<T, A>>(`inbound:${type}`, listener)
    }

    private onMessage<T>(message: Message<T, A>, sender: Runtime.MessageSender) {
        if (!this.isMessageValid<T>(message)) {
            return
        }

        message.source = {
            tabId: sender.tab.id,
            frameId: sender.frameId,
        }

        this.runMiddleware(MiddlewareType.Inbound, message, () => {
            this.emitInbound<T>(message)

            const { targetMode, target } = message

            if (targetMode) {
                const handler = this.targetModes.get(targetMode)

                if (handler) {
                    handler(message)
                } else {
                    console.warn(`Unknown targetMode: ${targetMode}`)
                }
            } else if (target) {
                this.send<T>(
                    message.type,
                    message.data,
                    target,
                    message.source,
                )
            }
        })
    }

    private emitMessage<T>(message: Message<T, A>) {
        const event = new MessageEvent<T, A>(message, this)

        this.emit(message.type, event)
    }

    private createMessage<T>(message: Message<T, A>): Message<T, A> {
        message.namespace = this.opts.namespace

        return message
    }

    private isMessageValid<T>(message: Message<T, A>): boolean {
        return this.isNamespaceAllowed(message.namespace)
    }

    dispatch<T>(message: Message<T, A>): Promise<void> {
        return new Promise((resolve, reject) => {
            message = this.createMessage(message)

            this.runMiddleware(MiddlewareType.Outbound, message, () => {
                const { target } = message

                // delete unnecessary props to reduce message size
                message.targetMode = null
                message.target = null

                delete message.targetMode
                delete message.target

                if (this.portManager) {
                    this.portManager.dispatch<T, A>(message, target)
                } else {
                    if (target) {
                        let options
                    
                        if (target.frameId !== null && target.frameId !== undefined) {
                            options = { frameId: target.frameId } 
                        }

                        browser.tabs.sendMessage(target.tabId, message, options)
                            .then(() => resolve())
                            .catch(reject)
                    } else {
                        browser.runtime.sendMessage(message) // todo: prevent echo
                            .then(() => resolve)
                            .catch(reject)
                    }
                }
            })
        })
    }

    send<T>(
        event: string,
        data?: T,
        target?: SourceInfo,
        source?: SourceInfo
    ): Promise<void> {
        const message: Message<T, A> = {
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
    
        await this.send(
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
        return this.send<T>(
            event,
            data,
            { tabId: source.tabId },
            source,
        )
    }

    broadcast<T>(event: string, data?: T, source?: SourceInfo) {
        return this.send<T>(event, data, null, source)
    }
}
