// Protocol fixtures, not live verification and never production search results.
export const registryRow = {
  i: '7707083893', o: '1027700132195', p: '773601001', n: 'ТЕСТОВАЯ ОРГАНИЗАЦИЯ ФНС',
  c: 'ООО Тест ФНС', a: 'г Москва, тестовый адрес', g: 'ДИРЕКТОР: Тестов Тест Тестович',
  r: '20.06.1991', k: 'ul', t: 'document_test_token_001', cnt: '2',
};

export function minimalPdf(): string {
  const content = 'BT /F1 16 Tf 50 750 Td (FNS extract test document) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return pdf + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}
