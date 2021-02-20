import { v4 as uuid } from 'uuid';

export interface LinkCodes {
  mint(): string
  clear(): any
  count(): Number
}

export class InMemoryLinkCodes implements LinkCodes {
  linkCodes: Record<string, string>  = {}

  mint() {
    const linkCode = uuid();
    this.linkCodes[linkCode] = ""
    return linkCode
  }
  clear = () => { this.linkCodes = {} }
  count = () => Object.keys(this.linkCodes).length
}

