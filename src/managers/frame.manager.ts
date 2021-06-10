import { browser } from 'webextension-polyfill-ts'
import { SourceInfo } from '../types'

// a frame path is an array of frames starting from the top-most parent frame to the target frame
// todo: optimize this

export type FramePath = Array<number>
export type FrameKey = string

export class FrameManager {
    paths = new Map<FrameKey, FramePath>()

    getFrameKey(frameInfo: SourceInfo): FrameKey {
        return `${frameInfo.tabId}.${frameInfo.frameId}`
    }
    
    async getPath(frameInfo: SourceInfo): Promise<FramePath> {
        const frameKey = this.getFrameKey(frameInfo)

        let frameId = frameInfo.frameId
        let path: FramePath
    
        if (path = this.paths.get(frameKey)) {
            return path
        }
    
        path = [frameId]
    
        while (frameId > 0) {
            try {
                const details = await browser.webNavigation.getFrame({
                    tabId: frameInfo.tabId,
                    frameId,
                })
    
                const { parentFrameId } = details
    
                path.push(parentFrameId)
    
                frameId = parentFrameId
            } catch(err) {
                console.log(err)
                return []
            }
        }
    
        path = path.reverse()
        this.paths.set(frameKey, path)
    
        return path
    }

    clear() {
        this.paths.clear()
    }
}
