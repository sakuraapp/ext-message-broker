import { EventEmitter } from 'events'
import { Runtime } from 'webextension-polyfill-ts'
import { Message, SourceInfo } from '../types'

export interface Port extends Runtime.Port {
    disconnected?: boolean
    listeners?: {
        onMessage<T>(message: Message<T>): void
        onDisconnect(): void
    }
}

function isPortTarget(port: Port, target: SourceInfo) {
    return (
        target.tabId === port.sender.tab.id &&
        (target.frameId === null ||
            target.frameId === undefined ||
            target.frameId === port.sender.frameId)
    )    
}

export class PortManager extends EventEmitter {
    ports: Port[]

    add(port: Port) {
        port.disconnected = false
        port.listeners = {
            onMessage: (message) => {
                this.emit('message', message, port.sender)
            },
            onDisconnect: () => {
                port.disconnected = true

                this.remove(port)
            },
        }

        port.onMessage.addListener(port.listeners.onMessage)
        port.onDisconnect.addListener(port.listeners.onDisconnect)

        this.ports.push(port)        
    }

    remove(port: Port) {
        const index = this.ports.indexOf(port)

        if (index > -1) {
            this.ports.splice(index, 1)

            if (!port.disconnected) {
                port.disconnect()
            }
        }
    }

    findMultiByTarget(target: SourceInfo): Port[] {
        return this.ports.filter((port) => isPortTarget(port, target))
    }

    findByTarget(target: SourceInfo): Port {
        return this.ports.find((port) => isPortTarget(port, target))
    }

    dispatch<T>(message: Message<T>, target: SourceInfo) {
        if (target) {
            const port = this.findByTarget(target) // only ONE PORT per frame

            if (!port) {
                return console.warn(`Target ${JSON.stringify(target)} not found`)
            }

            port.postMessage(message)
        } else {
            this.broadcast<T>(message)
        }
    }

    broadcast<T>(message: Message<T>) {
        for (const port of this.ports) {
            if (!message.source || !isPortTarget(port, message.source)) {
                port.postMessage(message)
            }
        }
    }

    destroy() {
        for (const port of this.ports) {
            port.onMessage.removeListener(port.listeners.onMessage)
            port.onDisconnect.removeListener(port.listeners.onDisconnect)
            port.disconnect()
        }

        this.ports = null
    }
}
