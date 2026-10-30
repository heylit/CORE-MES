import type { AlanGovdesi } from '#paylasilan/sozlesme/markalama.ts';
import { AZAMI_YAZI_DERINLIGI_MM, AZAMI_YAZI_YUKSEKLIGI_MM, YAZI_TIPI_ADLARI } from './adlar.ts';

// Girilen metin sayıya çevrilir; ondalık ayırıcı virgül ya da nokta olabilir. Boş ya da sayı olmayan metin boştur.
export function sayi(metin: string): number | null {
  const s = Number(metin.trim().replace(',', '.'));
  return metin.trim() === '' || !Number.isFinite(s) ? null : s;
}

// Değerin kutuda yazılışı; ondalık ayırıcı virgüldür.
export const olcuMetni = (deger: number | null): string => (deger === null ? '' : String(deger).replace('.', ','));

const olcuHatasi = (ad: string, deger: number | null, azami: number): string | null => {
  if (deger === null) return null;
  if (deger <= 0) return `${ad} 0'dan büyük olmalı.`;
  if (deger > azami) return `${ad} en çok ${azami} mm olabilir.`;
  return null;
};

// Sunucu aynı kuralları ayrıca denetler; burada hata kayıt denenmeden, alanın adıyla gösterilir.
export function alanFormuHatasi(a: AlanGovdesi): string | null {
  if (a.ad.trim() === '') return 'Marka adı boş.';
  if (a.icerik === 'sabit' && (a.sabitMetin ?? '').trim() === '') return 'Sabit metin boş.';
  const yukseklik = olcuHatasi('Yazı yüksekliği', a.yaziYuksekligiMm, AZAMI_YAZI_YUKSEKLIGI_MM);
  if (yukseklik !== null) return yukseklik;
  const derinlik = olcuHatasi('Yazı derinliği', a.yaziDerinligiMm, AZAMI_YAZI_DERINLIGI_MM);
  if (derinlik !== null) return derinlik;
  if (a.yer !== null && (a.yer.enMm <= 0 || a.yer.boyMm <= 0)) return 'Yerin eni ve boyu 0\'dan büyük olmalı.';
  if (a.yer !== null && Math.abs(a.yer.aciDerece) >= 360) return 'Açı -360 ile 360 arasında olmalı.';
  return null;
}

export interface TaslakDenetimi {
  yeni: boolean;
  opNo: string;
  baslangicSirasi: string;
  alanlar: readonly AlanGovdesi[];
}

export function taslakHatasi(t: TaslakDenetimi): string | null {
  if (t.yeni) {
    const op = sayi(t.opNo);
    if (op === null) return 'Rota operasyon no girilmeli.';
    if (!Number.isInteger(op) || op <= 0) return 'Rota operasyon no 0\'dan büyük tam sayı olmalı.';
  }
  const baslangic = sayi(t.baslangicSirasi);
  if (baslangic === null || !Number.isInteger(baslangic) || baslangic < 1) return 'Başlangıç sırası 1 ya da daha büyük tam sayı olmalı.';
  for (const [i, a] of t.alanlar.entries()) {
    const hata = alanFormuHatasi(a);
    if (hata !== null) return `${i + 1}. marka (${a.ad.trim() || 'adsız'}): ${hata}`;
  }
  return null;
}

// Operatörün okuyacağı yazı ölçüleri; girilmeyen ölçü yazılmaz.
export function yaziOlculeri(a: Pick<AlanGovdesi, 'yaziYuksekligiMm' | 'yaziDerinligiMm' | 'yaziTipi'>): string[] {
  return [
    a.yaziYuksekligiMm === null ? null : `Yükseklik ${olcuMetni(a.yaziYuksekligiMm)} mm`,
    a.yaziDerinligiMm === null ? null : `Derinlik ${olcuMetni(a.yaziDerinligiMm)} mm`,
    a.yaziTipi === null ? null : YAZI_TIPI_ADLARI[a.yaziTipi],
  ].filter((x): x is string => x !== null);
}
