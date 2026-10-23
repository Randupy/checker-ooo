import { getDocumentProxy } from 'unpdf';
import type { Contact } from '../src/shared/model';
import { cleanContacts } from '../src/shared/contacts';

export function registryEmailContacts(text: string): Contact[] {
  const contacts: Contact[] = [];
  // The dedicated registry section belongs to this business. Other mail addresses
  // in an extract may belong to a registrar, signatory or another organization.
  for (const section of text.matchAll(/(?:сведения\s+об\s+адресе\s+электронной\s+почты|registered e-?mail)[:\s]*([\s\S]{0,400})/gi)) {
    const value = section[1].replace(/\s*@\s*/g, '@');
    for (const email of value.match(/[A-Z0-9.!#$%&'*+\/=^_`{|}~-]+@[A-Z0-9.-]+\.[A-ZА-Я]{2,63}/gi) ?? []) contacts.push({ kind: 'email', value: email });
  }
  return cleanContacts(contacts);
}

export async function extractRegistryContacts(bytes: Uint8Array, cancelled = () => false): Promise<Contact[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { useSystemFonts: false, disableFontFace: true });
  const pages: string[] = [];
  try {
    // The registered email section is near the beginning; don't scan founders' or
    // other persons' sections across hundreds of pages in a large extract.
    for (let index = 1; index <= Math.min(pdf.numPages, 8); index++) {
      if (cancelled()) throw new Error('Сбор отменён.');
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => 'str' in item ? item.str : '').join(' '));
      page.cleanup();
    }
    return registryEmailContacts(pages.join('\n'));
  } finally { await pdf.loadingTask.destroy(); }
}
