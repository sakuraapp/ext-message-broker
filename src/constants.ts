import { WebBrokerOptions } from './brokers/web.broker'
import { BrokerOptions } from './types'

export const WebMessageType = 'message-broker'

export const DEFAULT_OPTIONS: BrokerOptions = {
    namespace: 'default',
}

export const DEFAULT_WEB_OPTIONS: WebBrokerOptions = {
    ...DEFAULT_OPTIONS,
    allowExternal: false,
    targetOrigin: location ? location.href : null,
    extensionId: chrome.runtime.id,
}
