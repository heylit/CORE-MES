import type { FiyatsizKalite, KgFiyatiEkleGovdesi, KgFiyatiSatiri } from '#paylasilan/sozlesme/satin-alma.ts';

export type KgFiyatiGirdisi = KgFiyatiEkleGovdesi['satirlar'][number];
type ParaBirimi = KgFiyatiGirdisi['paraBirimi'];
// Sözleşmedeki para birimleriyle aynı (değer ithali zod'u istemciye sokar); tip eşleşmezse derleme kırılır.
export const PARA_BIRIMLERI = ['TRY', 'USD', 'EUR', 'GBP'] as const satisfies readonly ParaBirimi[];
// `atlanan`: kalitesi yazılı ama kg fiyatı boş satır (şablonda doldurulmamış); hata değildir, gönderilmez.
export interface YapistirmaSonucu { satirlar: KgFiyatiGirdisi[]; hatalar: string[]; atlanan: number }
// Sunucu bir istekte en çok bu kadar satır alır (kgFiyatiEkleGovdesi); istemci paylasilandan değer ithal etmez.
export const EN_COK_SATIR = 500;

// Şablon (1351): yapıştırmayla aynı sütun sırası; son iki sütun yalnız bilgidir, okunmaz.
export const SABLON_BASLIKLARI = [
  'Kalite', 'Form', 'Kg fiyatı', 'Para birimi', 'Geçerlilik', 'Açıklama', 'Talaş fiyatı', 'İşlem katsayısı', 'Aracı katsayısı',
  'Güncel kg fiyatı (bilgi)', 'Güncel geçerlilik (bilgi)',
] as const;

const PARA = new Set<string>(PARA_BIRIMLERI);
// Excel'den ya da CSV'den gelen sayı: ondalık virgül ya da nokta; binlik ayırıcı yok (prototip CSV kuralı).
export function ondalikOku(m: string): string | null {
  const d = m.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(d) && !/^0*(\.0*)?$/.test(d) ? d : null;
}
// 1352 a: katsayı çarpandır; sıfırdan büyük, en çok 100, en çok 4 ondalık (sunucu yeniden denetler).
export function katsayiOku(m: string): string | null {
  const d = ondalikOku(m);
  return d !== null && /^\d{1,3}(\.\d{1,4})?$/.test(d) && Number(d) <= 100 ? d : null;
}
// YYYY-AA-GG ya da GG.AA.YYYY; boşsa bugün.
export function tarihOku(m: string, bugun: string): string | null {
  const t = m.trim();
  if (t === '') return bugun;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const n = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  return n ? `${n[3]}-${n[2]!.padStart(2, '0')}-${n[1]!.padStart(2, '0')}` : null;
}

// Dışa aktarma her hücreyi tırnaklar ("a";"b"), Excel'de kaydedilen dosya tırnaksız gelir; ikisi de okunur. Formül korumasının
// eklediği baştaki ' kaldırılır.
function hucreler(satir: string, ayirici: string): string[] {
  const l: string[] = [];
  let h = '';
  let tirnak = false;
  for (let i = 0; i < satir.length; i += 1) {
    const c = satir[i]!;
    if (tirnak) {
      if (c === '"' && satir[i + 1] === '"') { h += '"'; i += 1; } else if (c === '"') tirnak = false; else h += c;
    } else if (c === '"' && h.trim() === '') { h = ''; tirnak = true; } else if (c === ayirici) { l.push(h); h = ''; } else h += c;
  }
  l.push(h);
  return l.map((x) => x.trim().replace(/^'(?=[=+\-@])/, ''));
}

// Satır: kalite; form; kg fiyatı; para birimi; geçerlilik; açıklama; talaş fiyatı (214 a; boşsa bilinmiyor); işlem katsayısı; aracı
// katsayısı (1352 a; boşsa bilinmiyor). Ayırıcı noktalı virgül ya da sekme (Excel'den kopya).
// Form boşsa fiyat kalitenin bütün formlarınadır; para birimi boşsa TRY. Başlık satırı ("kalite" ile başlayan) atlanır.
// Kg fiyatı boş satır atlanır (şablonun doldurulmamış satırı); talaş fiyatı yazılıysa kg fiyatı da gerekir.
// Hatalı satır gönderilmez; hata satır numarasıyla döner.
export function yapistirilaniOku(metin: string, bugun: string): YapistirmaSonucu {
  const satirlar: KgFiyatiGirdisi[] = [];
  const hatalar: string[] = [];
  let atlanan = 0;
  metin.replace(/^﻿/, '').split(/\r?\n/).forEach((ham, i) => {
    const [kalite = '', form = '', fiyat = '', para = '', gecerlilik = '', aciklama = '', talas = '', islem = '', araci = ''] = hucreler(ham, ham.includes('\t') ? '\t' : ';');
    if ((kalite === '' && fiyat === '' && talas === '') || (i === 0 && /^kalite/i.test(kalite))) return;
    const no = i + 1;
    if (kalite !== '' && fiyat === '' && talas === '') { atlanan += 1; return; }
    const kgFiyati = ondalikOku(fiyat);
    const paraBirimi = (para === '' ? 'TRY' : para.toUpperCase());
    const tarih = tarihOku(gecerlilik, bugun);
    const talasKgFiyati = talas === '' ? null : ondalikOku(talas);
    const islemKatsayisi = islem === '' ? null : katsayiOku(islem);
    const araciKatsayisi = araci === '' ? null : katsayiOku(araci);
    if (kalite === '') hatalar.push(`${no}. satır: kalite boş.`);
    else if (kgFiyati === null) hatalar.push(`${no}. satır: kg fiyatı sıfırdan büyük sayı olmalı ("${fiyat}").`);
    else if (!PARA.has(paraBirimi)) hatalar.push(`${no}. satır: para birimi TRY, USD, EUR ya da GBP olmalı ("${para}").`);
    else if (tarih === null) hatalar.push(`${no}. satır: geçerlilik YYYY-AA-GG ya da GG.AA.YYYY olmalı ("${gecerlilik}").`);
    else if (talas !== '' && talasKgFiyati === null) hatalar.push(`${no}. satır: talaş fiyatı sıfırdan büyük sayı olmalı ya da boş kalmalı ("${talas}").`);
    else if (islem !== '' && islemKatsayisi === null) hatalar.push(`${no}. satır: işlem katsayısı 0 ile 100 arasında, en çok 4 ondalıklı olmalı ya da boş kalmalı ("${islem}").`);
    else if (araci !== '' && araciKatsayisi === null) hatalar.push(`${no}. satır: aracı katsayısı 0 ile 100 arasında, en çok 4 ondalıklı olmalı ya da boş kalmalı ("${araci}").`);
    else {
      satirlar.push({
        kaliteKodu: kalite, form: form === '' ? null : form, kgFiyati, talasKgFiyati, paraBirimi: paraBirimi as ParaBirimi, gecerlilik: tarih, aciklama, islemKatsayisi, araciKatsayisi,
      });
    }
  });
  if (satirlar.length > EN_COK_SATIR) hatalar.push(`Bir kayıtta en çok ${EN_COK_SATIR} fiyat girilir; dosyada ${satirlar.length} dolu satır var, bölüp yükleyin.`);
  return { satirlar, hatalar, atlanan };
}

// Şablon satırları: fiyatı olan her kalite + form güncel para birimi, güncel katsayıları ve bilgi sütunlarıyla, fiyatı olmayanlar TRY
// ile; kg fiyatı boş gelir, doldurulan satır yeni giriş olur (katsayı değiştirilmezse güncel değer taşınır), boş kalan atlanır. Liste boşsa tek örnek satır (uydurma kod) yazılır.
type SablonHucresi = string | number | null;
export function sablonSatirlari(fiyatlar: readonly KgFiyatiSatiri[], fiyatsizlar: readonly FiyatsizKalite[]): SablonHucresi[][] {
  const sayi = (d: string | null) => (d === null ? null : Number(d));
  const gun = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`;
  const l: SablonHucresi[][] = [
    ...fiyatlar.map((f) => [f.kaliteKodu, f.form ?? '', null, f.paraBirimi, null, null, null, sayi(f.islemKatsayisi), sayi(f.araciKatsayisi), Number(f.kgFiyati), gun(f.gecerlilik)]),
    ...fiyatsizlar.map((f) => [f.kaliteKodu, f.form ?? '', null, 'TRY', null, null, null, null, null, null, null]),
  ];
  return l.length > 0 ? l : [['ORNEK-KALITE', 'cubuk', null, 'TRY', null, null, null, null, null, null, null]];
}
