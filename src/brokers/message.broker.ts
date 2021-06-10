import { EventEmitter } from 'events'
import { browser, Runtime } from 'webextension-polyfill-ts'
import { MessageEvent } from '~/events/message.event'
import { FrameManager } from '~/managers/frame.manager'
import {
    Broker,
    BrokerOptions,
    Message,
    MessageListener,
    SourceInfo
} from '../types'

export declare interface MessageBroker {
    on<T>(event: string, listener: MessageListener<T>): this;
}

export class MessageBroker extends EventEmitter implements Broker {
    private readonly opts: BrokerOptions
    private readonly frameManager = new FrameManager()
    private readonly extensionId = browser.runtime.id

    constructor(opts: BrokerOptions = {}) {
        super()

        this.opts = opts
        this.onMessage = this.onMessage.bind(this)

        this.init()
    }

    init(): void {
        browser.runtime.onMessage.addListener(this.onMessage)
    }

    destroy(): void {
        browser.runtime.onMessage.removeListener(this.onMessage)
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
                case 'background': {
                    const event = new MessageEvent<T>(message, this)

                    this.emit(message.type, event)
                }
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

    private createMessage<T>(message: Message<T>): Message<T> {
        message.extensionId = this.extensionId
        message.namespace = this.opts.namespace

        return message
    }

    private isMessageValid<T>(message: Message<T>): boolean {
        if (message.namespace !== this.opts.namespace) {
            return false
        }

        if (message.extensionId !== this.extensionId) {
            return false
        }

        return true
    }

    async dispatch<T>(message: Message<T>): Promise<void> {
        message = this.createMessage(message)

        const { target } = message

        if (target) {
            let options
        
            if (target.frameId !== null && target.frameId !== undefined) {
                options = { frameId: target.frameId } 
            }

            await browser.tabs.sendMessage(target.tabId, message, options)
        } else {
            browser.runtime.sendMessage(message)
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
}
