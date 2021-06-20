import { Broker } from '../brokers/broker.broker'
import {  Message, SourceInfo, TargetMode } from '../types'

export class MessageEvent<T = any, A = void> {
    public readonly type: string
    public readonly data: T
    public readonly source: SourceInfo

    private broker: Broker<A>

    constructor(message: Message<T, A>, broker: Broker<A>) {
        this.type = message.type
        this.data = message.data
        this.source = message.source

        this.broker = broker
    }

    reply<B>(event: string, data?: B) {
        let targetMode: TargetMode<A>

        if (!this.source) {
            targetMode = 'background'
        }

        this.broker.dispatch<B>({
            type: event,
            data,
            target: this.source,
            targetMode,
        })
    }
}
