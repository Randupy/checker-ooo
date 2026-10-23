export function validInn(value: string): boolean {
  if (!/^\d{10}$|^\d{12}$/.test(value) || /^0+$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = (weights: number[]) => weights.reduce((sum, weight, i) => sum + weight * digits[i], 0) % 11 % 10;
  return value.length === 10
    ? check([2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[9]
    : check([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[10]
      && check([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[11];
}

export function validOgrn(value: string): boolean {
  if (!/^\d{13}$|^\d{15}$/.test(value) || /^0+$/.test(value)) return false;
  const mod = value.length === 13 ? 11n : 13n;
  return Number(BigInt(value.slice(0, -1)) % mod % 10n) === Number(value.at(-1));
}

export function parseQuery(input: string): { query: string; byId: boolean } {
  const query = input.trim().replace(/\s+/g, ' ');
  if (query.length < 2) throw new Error('Введите минимум 2 символа названия, ИНН или ОГРН.');
  if (query.length > 250) throw new Error('Запрос должен быть короче 250 символов.');
  if (/^\d[\d\s-]*$/.test(query)) {
    const id = query.replace(/[\s-]/g, '');
    if ((id.length === 10 || id.length === 12) && validInn(id)) return { query: id, byId: true };
    if ((id.length === 13 || id.length === 15) && validOgrn(id)) return { query: id, byId: true };
    throw new Error('Проверьте номер: ИНН содержит 10 или 12 цифр, ОГРН — 13, ОГРНИП — 15. Контрольная цифра должна совпадать.');
  }
  return { query, byId: false };
}
