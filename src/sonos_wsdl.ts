import { XMLSerializer } from '@xmldom/xmldom';
import { select1 } from 'xpath';
import { validateXML } from 'xmllint-wasm';
import { Logger } from 'winston';
import logger from './logger';
import { extractXsdFromWsdl, parseXml } from './xml_utils';
import { err, ok } from 'neverthrow';

export class SonosWSDL {
  public readonly wsdl: string;
  public readonly xsd: string;

  constructor(wsdl: string) {
    this.wsdl = wsdl;
    this.xsd = extractXsdFromWsdl(wsdl)._unsafeUnwrap();
  }

  async validateSmapiMessage(body: string, log: Logger = logger): Promise<void> {
    const schema = [{ fileName: 'sonos.xsd', contents: this.xsd }];
    await parseXml(body)
      .map(doc => select1('/*[local-name()="Envelope"]/*[local-name()="Body"]/*[1]', doc as any) as Node | null)
      .andThen(smapiMessage => smapiMessage
        ? ok(new XMLSerializer().serializeToString(smapiMessage as any))
        : err(new Error('No SMAPI message found in SOAP Body')))
      .asyncMap(xmlToValidate => validateXML({ 
        xml: [{ fileName: 'message.xml', contents: xmlToValidate }], 
        schema 
      }))
      .match(
        result => {
          if (!result.valid) {
            const messages = result.errors.map(e => e.message).join('; ');
            log.warn(`SMAPI validation failed — ${messages}:\n${body}`);
          }
        },
        (e) => log.error(`SMAPI validation error — ${e.message}:\n${body}`)
      );
  }
}
