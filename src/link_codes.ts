import { randomUUID as uuid } from 'crypto';


export type Association = {
  readonly serviceToken: string
  readonly userId: string
  readonly nickname: string  
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
  // eslint-disable-next-line functional/prefer-readonly-type
  linkCodes: Record<string, Association | undefined>  = {}

  mint() {
    // Sonos S2 browser-auth link codes are capped at 32 characters; a UUID is
    // 36. Strip the dashes to get a spec-compliant 32-char hex code.
    const linkCode = uuid().replace(/-/g, "");
    this.linkCodes[linkCode] = undefined
    return linkCode
  }
  readonly clear = () => { this.linkCodes = {} }
  readonly count = () => Object.keys(this.linkCodes).length
  readonly has = (linkCode: string) => Object.keys(this.linkCodes).includes(linkCode)
  readonly associate = (linkCode: string, association: Association) => {
    if(this.has(linkCode)) 
      this.linkCodes[linkCode] = association;
    else
      throw `Invalid linkCode ${linkCode}`
  }
  readonly associationFor = (linkCode: string) => {
    return this.linkCodes[linkCode]!;
  }
}

