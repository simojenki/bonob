import { randomUUID as uuid } from 'crypto';


export type Association = {
  serviceToken: string
  userId: string
  nickname: string  
}

export interface LinkCodes {
  mint(): string
  clear(): any
  count(): number
  has(linkCode: string): boolean
  associate(linkCode: string, association: Association): any
  associationFor(linkCode: string): Association | undefined
}

export class InMemoryLinkCodes implements LinkCodes {
  linkCodes: Record<string, Association | undefined>  = {}

  mint() {
    // Sonos S2 browser-auth link codes are capped at 32 characters; a UUID is
    // 36. Strip the dashes to get a spec-compliant 32-char hex code.
    const linkCode = uuid().replace(/-/g, "");
    this.linkCodes[linkCode] = undefined
    return linkCode
  }
  clear = () => { this.linkCodes = {} }
  count = () => Object.keys(this.linkCodes).length
  has = (linkCode: string) => Object.keys(this.linkCodes).includes(linkCode)
  associate = (linkCode: string, association: Association) => {
    if(this.has(linkCode)) 
      this.linkCodes[linkCode] = association;
    else
      throw `Invalid linkCode ${linkCode}`
  }
  associationFor = (linkCode: string) => {
    return this.linkCodes[linkCode]!;
  }
}

