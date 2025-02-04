import { DOMParser, XMLSerializer, Node } from '@xmldom/xmldom';

export function takeWithRepeats<T>(things:T[], count: number) {
  const result = [];
  for(let i = 0; i < count; i++) {
    result.push(things[i % things.length])
  }
  return result;
}

function xmlRemoveWhitespaceNodes(node: Node) {
  let child = node.firstChild;
  while (child) {
      const nextSibling = child.nextSibling;
      if (child.nodeType === 3 && !child.nodeValue?.trim()) {
          // Remove empty text nodes
          node.removeChild(child);
      } else {
          // Recursively process child nodes
          xmlRemoveWhitespaceNodes(child);
      }
      child = nextSibling;
  }
}

export function xmlTidy(xml: string | Node) {
  const xmlToString = new XMLSerializer().serializeToString

  const xmlString = xml instanceof Node ? xmlToString(xml as any) : xml
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml') as unknown as Node;
  xmlRemoveWhitespaceNodes(doc);
  return xmlToString(doc as any);
}

