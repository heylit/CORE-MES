// 3476-2: hammaddede açıklama ve ad kalıbının yer tutucuları. Kartın kendi alanları (kalite, form, ölçü...) ve ailelerin
// seçenekleri (durum, ut, ambalaj...); seçenekler kartta `opts` altında durduğu için türün alan listesinde yoktur.
export const HAMMADDE_KART_JETONLARI: readonly (readonly [string, string])[] = [
  ['kalite', 'Kalite'], ['form', 'Form'], ['olcu', 'Ölçü'], ['std', 'Standart'], ['tol', 'Tolerans'], ['sertifika', 'Sertifika'],
];

export function hammaddeJetonlari(aileler: Readonly<Record<string, { opts: readonly { k: string; ad: string }[] }>>): [string, string][] {
  const m = new Map<string, string>(HAMMADDE_KART_JETONLARI.map(([k, ad]) => [k, ad]));
  Object.values(aileler).forEach((f) => f.opts.forEach((o) => { if (!m.has(o.k)) m.set(o.k, o.ad); }));
  return [...m];
}
