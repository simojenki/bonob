import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { Result, ok, err } from 'neverthrow';

const SILENT_ERROR_HANDLER = (level: 'error' | 'warning' | 'fatalError', msg: string) => {
  if (level === 'fatalError') throw new Error(msg);
};

export function parseXml(xml: string): Result<ReturnType<DOMParser['parseFromString']>, Error> {
  try {
    return ok(new DOMParser({ errorHandler: SILENT_ERROR_HANDLER }).parseFromString(xml, 'text/xml'));
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export function extractXsdFromWsdl(wsdlContent: string): Result<string, Error> {
  const doc = new DOMParser().parseFromString(wsdlContent, 'text/xml');
  const schemaEl = doc.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'schema').item(0);
  if (!schemaEl) return err(new Error('No xsd found in wsdl'));

  // Inherit namespace declarations from the WSDL root that are missing from the schema element,
  // so the extracted XSD is self-contained (the schema uses prefixes like tns: that are only
  // declared on ancestor elements). Skip the schema element's own prefix — the serializer
  // outputs that automatically from the element's tag, and adding it explicitly causes duplicates.
  const rootAttrs = doc.documentElement?.attributes;
  for (let i = 0; i < (rootAttrs?.length ?? 0); i++) {
    const attr = rootAttrs?.item(i);
    if (attr?.name.startsWith('xmlns:')) {
      const prefix = attr.name.slice(6);
      if (prefix !== schemaEl.prefix && !schemaEl.getAttribute(attr.name)) {
        schemaEl.setAttribute(attr.name, attr.value);
      }
    }
  }

  return ok(new XMLSerializer().serializeToString(schemaEl as any));
}
