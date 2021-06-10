# ext-message-broker

Easier communication for chrome extensions, while also allowing finer controls like frame-based communciation and namespacing.

## Setup

### Installation
Install the dependency
```
npm install ext-message-broker
```

You **must** create a message broker in your background script.
```ts
import { MessageBroker } from 'ext-message-broker'

const broker = new MessageBroker()
```

### Content Script
```ts
import { WebBroker } from  'ext-message-broker'

const broker = new WebBroker({
    allowExternal: false // set to true if you want to allow access from an external site
})
```

### External Site
```ts
import { WebBroker } from  'ext-message-broker'

const broker = new WebBroker({
    extensionId: 'your browser extension id', // this is required
})
```

## Usage

### Background
```ts
import { MessageBroker } from 'ext-message-broker'

const broker = new MessageBroker()

broker.on('hello-world', (e) => {
    console.log(e.data)

    e.reply('hello-there', { name: 'general-kenobi' })
})

broker.send('test', { data: 123 })
```
### Content Script / External Site
```ts
import { WebBroker } from 'ext-message-broker'

const broker = new WebBroker()

broker.on('hello-there', (e) => {
    console.log(e.data)
})

broker.send('hello-world', { name: 'general-grievous' })

broker.sendToParent('hello', 123) // sends to the frame's parent

broker.sendToHost('hello', 123)

// sendToHost is an equivalent of this:
broker.sendToTarget('hello', 123, {
    tabId: 1234, // put a tab id here
    frameId: 0, // top most frame
})
```