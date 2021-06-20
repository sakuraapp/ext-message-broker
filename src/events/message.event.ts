import { Broker } from '../brokers/broker.broker'
import {  Message, SourceInfo, TargetMode } from '../types'

export class MessageEvent<T = any> {
    public readonly type: string
    public readonly data: T
    public readonly source: SourceInfo

    private broker: Broker

    constructor(message: Message<T>, broker: Broker) {
        this.type = message.type
        this.data = message.data
        this.source = message.source

        this.broker = broker
    }

    reply<A>(event: string, data?: A) {
        let targetMode: TargetMode

        if (!this.source) {
            targetMode = 'background'
        }

        this.broker.dispatch<A>({
            type: event,
            data,
            target: this.source,
            targetMode,
        })
    }
}
