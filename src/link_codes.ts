import { v4 as uuid } from 'uuid';


export type Association = {
  authToken: string
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
    const linkCode = uuid();
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

