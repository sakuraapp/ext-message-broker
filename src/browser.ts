import { Browser } from 'webextension-polyfill-ts'

let browser: Browser

try {
    browser = require('webextension-polyfill-ts').browser
} catch (err) {
    browser = chrome as unknown as Browser // this is a bad idea
}

export { browser }