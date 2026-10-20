import type { KgFiyatiEkleGovdesi } from '#paylasilan/sozlesme/satin-alma.ts';

export type KgFiyatiGirdisi = KgFiyatiEkleGovdesi['satirlar'][number];
type ParaBirimi = KgFiyatiGirdisi['paraBirimi'];
// Sözleşmedeki para birimleriyle aynı (değer ithali zod'u istemciye sokar); tip eşleşmezse derleme kırılır.
export const PARA_BIRIMLERI = ['TRY', 'USD', 'EUR', 'GBP'] as const satisfies readonly ParaBirimi[];
export interface YapistirmaSonucu { satirlar: KgFiyatiGirdisi[]; hatalar: string[] }

const PARA = new Set<string>(PARA_BIRIMLERI);
// Excel'den ya da CSV'den gelen sayı: ondalık virgül ya da nokta; binlik ayırıcı yok (prototip CSV kuralı).
export function ondalikOku(m: string): string | null {
  const d = m.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(d) && !/^0*(\.0*)?$/.test(d) ? d : null;
}
// YYYY-AA-GG ya da GG.AA.YYYY; boşsa bugün.
export function tarihOku(m: string, bugun: string): string | null {
  const t = m.trim();
  if (t === '') return bugun;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const n = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  return n ? `${n[3]}-${n[2]!.padStart(2, '0')}-${n[1]!.padStart(2, '0')}` : null;
}

// Satır: kalite; form; kg fiyatı; para birimi; geçerlilik; açıklama; talaş fiyatı (214 a; boşsa bilinmiyor). Ayırıcı noktalı virgül ya da sekme (Excel'den kopya).
// Form boşsa fiyat kalitenin bütün formlarınadır; para birimi boşsa TRY. Başlık satırı ("kalite" ile başlayan) atlanır.
// Hatalı satır gönderilmez; hata satır numarasıyla döner.
export function yapistirilaniOku(metin: string, bugun: string): YapistirmaSonucu {
  const satirlar: KgFiyatiGirdisi[] = [];
  const hatalar: string[] = [];
  metin.replace(/^﻿/, '').split(/\r?\n/).forEach((ham, i) => {
    if (ham.trim() === '' || (i === 0 && /^\s*kalite/i.test(ham))) return;
    const [kalite = '', form = '', fiyat = '', para = '', gecerlilik = '', aciklama = '', talas = ''] = ham.split(ham.includes('\t') ? '\t' : ';').map((h) => h.trim());
    const no = i + 1;
    const kgFiyati = ondalikOku(fiyat);
    const paraBirimi = (para === '' ? 'TRY' : para.toUpperCase());
    const tarih = tarihOku(gecerlilik, bugun);
    const talasKgFiyati = talas === '' ? null : ondalikOku(talas);
    if (kalite === '') hatalar.push(`${no}. satır: kalite boş.`);
    else if (kgFiyati === null) hatalar.push(`${no}. satır: kg fiyatı sıfırdan büyük sayı olmalı ("${fiyat}").`);
    else if (!PARA.has(paraBirimi)) hatalar.push(`${no}. satır: para birimi TRY, USD, EUR ya da GBP olmalı ("${para}").`);
    else if (tarih === null) hatalar.push(`${no}. satır: geçerlilik YYYY-AA-GG ya da GG.AA.YYYY olmalı ("${gecerlilik}").`);
    else if (talas !== '' && talasKgFiyati === null) hatalar.push(`${no}. satır: talaş fiyatı sıfırdan büyük sayı olmalı ya da boş kalmalı ("${talas}").`);
    else satirlar.push({ kaliteKodu: kalite, form: form === '' ? null : form, kgFiyati, talasKgFiyati, paraBirimi: paraBirimi as ParaBirimi, gecerlilik: tarih, aciklama });
  });
  return { satirlar, hatalar };
}
