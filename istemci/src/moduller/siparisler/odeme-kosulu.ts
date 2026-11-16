// Teklifin ödeme koşulu seçimle kurulur ve metin olarak saklanır (sürümde, teklif formunda ve siparişte aynı metin).
// Metin seçimden yazılır; önceki sürümün metni bu biçimdeyse seçime geri çözülür, değilse "Diğer" olarak elle kalır.
export type OdemeTuru = '' | 'simdi-pesin' | 'termin-pesin' | 'termin-vade' | 'simdi-vade' | 'diger';
export type VadeBirimi = 'gun' | 'ay';

export interface OdemeSecimi {
  tur: OdemeTuru;
  sure: string;
  birim: VadeBirimi;
  metin: string;
}

export const ODEME_TURLERI: ReadonlyArray<{ deger: Exclude<OdemeTuru, ''>; baslik: string }> = [
  { deger: 'simdi-pesin', baslik: 'Şimdi peşin' },
  { deger: 'termin-pesin', baslik: 'Terminde peşin' },
  { deger: 'termin-vade', baslik: 'Terminde vade' },
  { deger: 'simdi-vade', baslik: 'Şimdiden vade' },
  { deger: 'diger', baslik: 'Diğer (elle yazılır)' },
];
export const VADE_BIRIMLERI: ReadonlyArray<{ deger: VadeBirimi; baslik: string }> = [
  { deger: 'gun', baslik: 'gün' },
  { deger: 'ay', baslik: 'ay' },
];

export const vadeli = (t: OdemeTuru): boolean => t === 'termin-vade' || t === 'simdi-vade';

const BIRIM_METNI: Record<VadeBirimi, string> = { gun: 'gün', ay: 'ay' };
const SABIT: Partial<Record<OdemeTuru, string>> = { 'simdi-pesin': 'Şimdi peşin', 'termin-pesin': 'Terminde peşin' };
const VADE_ONEKI: Partial<Record<OdemeTuru, string>> = { 'termin-vade': 'Terminden itibaren', 'simdi-vade': 'Şimdiden itibaren' };

// Seçimden saklanacak metin; boş seçimde null.
export function odemeMetni(s: OdemeSecimi): string | null {
  if (s.tur === '') return null;
  if (s.tur === 'diger') return s.metin.trim() === '' ? null : s.metin.trim();
  const sabit = SABIT[s.tur];
  if (sabit !== undefined) return sabit;
  return `${VADE_ONEKI[s.tur] ?? ''} ${s.sure.trim()} ${BIRIM_METNI[s.birim]} vadeli`;
}

// Saklanan metinden seçim: bu modülün yazdığı biçim çözülür, başka metin "Diğer" olur.
export function odemeSecimi(metin: string | null): OdemeSecimi {
  const bos: OdemeSecimi = { tur: '', sure: '30', birim: 'gun', metin: '' };
  if (metin === null || metin.trim() === '') return bos;
  for (const [tur, m] of Object.entries(SABIT)) if (m === metin) return { ...bos, tur: tur as OdemeTuru };
  for (const [tur, onek] of Object.entries(VADE_ONEKI)) {
    const e = new RegExp(`^${onek} (\\d{1,3}) (gün|ay) vadeli$`).exec(metin);
    if (e) return { ...bos, tur: tur as OdemeTuru, sure: e[1] ?? '30', birim: e[2] === 'ay' ? 'ay' : 'gun' };
  }
  return { ...bos, tur: 'diger', metin };
}

// Vadeli seçimde süre 1-999 tam sayı; ileti alanın altında.
export function odemeHatasi(s: OdemeSecimi): string | null {
  if (!vadeli(s.tur)) return null;
  return /^[1-9]\d{0,2}$/.test(s.sure.trim()) ? null : 'Vade süresi 1 ile 999 arasında tam sayı olmalı.';
}
