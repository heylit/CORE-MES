/* Parti kolundaki rota dışı adım (kart #199, B8). Sunucu iş emri paketine `tmi.tur` (rework, tamir, ek) ve varsa `tmi.ekAciklama` yazar;
   rota adımında ikisi de yoktur ve ekranda etiket çıkmaz. */
export interface AdimTuruPaketi { tmi?: { tur?: string; ekAciklama?: string } | null }

export const ADIM_TURU_ETIKETI: Readonly<Record<string, string>> = { rework: 'Rework', tamir: 'Tamir', ek: 'Ek adım' };

export function adimTuru(p: AdimTuruPaketi | null | undefined): { etiket: string; aciklama: string | null } | null {
  const tur = p?.tmi?.tur;
  const etiket = typeof tur === 'string' && Object.hasOwn(ADIM_TURU_ETIKETI, tur) ? ADIM_TURU_ETIKETI[tur] : undefined;
  if (etiket === undefined) return null;
  const aciklama = typeof p?.tmi?.ekAciklama === 'string' && p.tmi.ekAciklama.trim() !== '' ? p.tmi.ekAciklama.trim() : null;
  return { etiket, aciklama };
}
