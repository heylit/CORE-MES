import qrcode from 'qrcode-generator';
import { adresAraliktaMi, adresCoz, type AgAraligi } from '#paylasilan/ag-araligi.ts';
import { KOD_ONEKI } from '#paylasilan/kod-sozlugu.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import type { KatalogTuru } from '#paylasilan/sozlesme/malzemeler.ts';
import type { RefakatKartiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EN_COK_ADET, QR_KENAR_MODUL, SATIR_ARALIGI, type KayitTuru, type OnizlemeOgesi, type Sablon, type SablonTuru, type SablonOgesi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { YAZICI_AGI_DEGISKENI } from './ag.ts';

// Saf kurallar: yerleşim (mm -> satır ve QR matrisi), sınır denetimi ve yazıcıya giden metnin arındırılması.
// Kural numaraları KURAL-TEST.md'deki testlere bağlıdır.

export type AlanDegerleri = Readonly<Record<string, string | null>>;

// EM-1: öğe etiketin dışına taşmaz; taşan şablon basılmaz.
export function sablonHatalari(s: Sablon): string[] {
  const hatalar: string[] = [];
  if (s.genislik <= 0 || s.yukseklik <= 0) hatalar.push('Etiket ölçüsü sıfırdan büyük olmalı.');
  s.ogeler.forEach((o, i) => {
    const [gen, yuk] = o.tur === 'qr' ? [o.boyut, o.boyut] : [o.genislik, o.yukseklik];
    if (o.x + gen > s.genislik + 1e-9 || o.y + yuk > s.yukseklik + 1e-9) hatalar.push(`${i + 1}. öğe etiketin dışına taşıyor.`);
    if (o.tur === 'metin' && o.yaziMm > o.yukseklik + 1e-9) hatalar.push(`${i + 1}. öğenin yazısı kutusundan büyük.`);
  });
  return hatalar;
}

// EM-2: milimetre yazıcı noktasına en yakın tam noktaya yuvarlanır (203 dpi'de 1 mm = 8 nokta).
export const noktaya = (mm: number, dpi: number): number => Math.round((mm * dpi) / 25.4);

// EM-3: yazıcının yerleşik yazı tipinde Türkçe harf olmayabilir; sadeleştirme harfi en yakın ASCII harfe çevirir.
const SADE: Record<string, string> = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };
export const sadelestir = (metin: string): string => metin.replace(/[çÇğĞıİöÖşŞüÜ]/g, (h) => SADE[h] ?? h);

// Satır sonu ve denetim karakteri yazıcı komutunu böler; etikete giden her metinden önce atılır.
export const tekSatir = (metin: string): string => metin.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();

// Metin satırlara sözcük sınırından bölünür; sığmayan son satır "..." ile kesilir. Harf genişliği yazının yüksekliğine oranla tahmindir.
export const HARF_ORANI = 0.6;
export function satirlaraBol(metin: string, genislikMm: number, yukseklikMm: number, yaziMm: number): string[] {
  const enCokHarf = Math.max(1, Math.floor(genislikMm / (yaziMm * HARF_ORANI)));
  const enCokSatir = Math.max(1, Math.floor(yukseklikMm / (yaziMm * SATIR_ARALIGI)));
  const satirlar: string[] = [];
  let satir = '';
  for (const sozcuk of metin.split(/\s+/).filter(Boolean)) {
    let kalan = sozcuk;
    while (kalan.length > 0) {
      const aday = satir === '' ? kalan : `${satir} ${kalan}`;
      if (aday.length <= enCokHarf) { satir = aday; kalan = ''; continue; }
      if (satir !== '') { satirlar.push(satir); satir = ''; continue; }
      satirlar.push(kalan.slice(0, enCokHarf));
      kalan = kalan.slice(enCokHarf);
    }
  }
  if (satir !== '') satirlar.push(satir);
  if (satirlar.length <= enCokSatir) return satirlar;
  const kesik = satirlar.slice(0, enCokSatir);
  const son = kesik[enCokSatir - 1] ?? '';
  kesik[enCokSatir - 1] = `${son.slice(0, Math.max(0, enCokHarf - 3))}...`;
  return kesik;
}
// QR bugünkü etiketlerle aynı düzeltme düzeyindedir (M); kenarda iki modül boşluk kalır.
export function qrMatrisi(veri: string): boolean[][] {
  const q = qrcode(0, 'M');
  q.addData(veri);
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => q.isDark(y, x)));
}

// EM-4: değeri olmayan alan basılmaz (null sıfıra ya da "yok"a çevrilmez); sabit metin "=" ile başlar.
export function alanDegeri(alan: string, veri: AlanDegerleri): string | null {
  if (alan.startsWith('=')) return alan.slice(1);
  const deger = veri[alan];
  return deger === undefined || deger === null || deger.trim() === '' ? null : deger;
}

export function yerlesim(s: Sablon, veri: AlanDegerleri, sade: boolean): OnizlemeOgesi[] {
  const ogeler: OnizlemeOgesi[] = [];
  for (const o of s.ogeler) {
    const oge = ogeYerlesimi(o, veri, sade);
    if (oge !== null) ogeler.push(oge);
  }
  return ogeler;
}

function ogeYerlesimi(o: SablonOgesi, veri: AlanDegerleri, sade: boolean): OnizlemeOgesi | null {
  if (o.tur === 'kutu') return { ...o };
  const ham = alanDegeri(o.alan, veri);
  if (ham === null) return null;
  // QR içeriği kimliktir ve ASCII'dir; sadeleştirme yalnız okunan yazıya uygulanır.
  if (o.tur === 'qr') { const v = tekSatir(ham); return { tur: 'qr', x: o.x, y: o.y, boyut: o.boyut, veri: v, kareler: qrMatrisi(v) }; }
  const metin = tekSatir(sade ? sadelestir(ham) : ham);
  return { tur: 'metin', x: o.x, y: o.y, genislik: o.genislik, yaziMm: o.yaziMm, kalin: o.kalin, satirlar: satirlaraBol(metin, o.genislik, o.yukseklik, o.yaziMm) };
}

// Koyu modüller satır satır birleşik dikdörtgenlere çevrilir; iki dil de QR'ı yazıcının QR komutuyla değil, kutu komutuyla basar.
// Böylece basılan QR önizlemeyle aynı matristir ve yazıcı modeline göre değişen QR komutuna bağlı kalınmaz.
export interface Dikdortgen { x: number; y: number; genislik: number; yukseklik: number }
export function qrDikdortgenleri(kareler: boolean[][], x: number, y: number, modul: number): Dikdortgen[] {
  const sonuc: Dikdortgen[] = [];
  kareler.forEach((satir, sy) => {
    let bas = -1;
    for (let sx = 0; sx <= satir.length; sx++) {
      const koyu = satir[sx] === true;
      if (koyu && bas < 0) bas = sx;
      if (!koyu && bas >= 0) {
        sonuc.push({ x: x + (bas + QR_KENAR_MODUL) * modul, y: y + (sy + QR_KENAR_MODUL) * modul, genislik: (sx - bas) * modul, yukseklik: modul });
        bas = -1;
      }
    }
  });
  return sonuc;
}

// Modül genişliği tam noktadır; QR kutusuna (kenar boşluğu dahil) sığan en büyük değer, en az 1.
export const qrModulNoktasi = (boyutNokta: number, modulSayisi: number): number =>
  Math.max(1, Math.floor(boyutNokta / (modulSayisi + 2 * QR_KENAR_MODUL)));

// EM-8: ağ yazıcısının adresi tek IP'dir (ad çözülmez) ve doğrudan baskı aralığının içindedir; aralık tanımlı değilse ağ yazıcısı kaydedilmez.
// Dosya ile basan yazıcı adres taşımaz.
export function yaziciAdresHatasi(baglanti: 'ag' | 'dosya', adres: string | null, araliklar: readonly AgAraligi[] | null): string | null {
  if (baglanti === 'dosya') return adres === null || adres === '' ? null : 'Dosya ile basan yazıcıya adres yazılmaz.';
  if (adres === null || adres === '') return 'Ağ yazıcısının IP adresi zorunlu.';
  if (adresCoz(adres) === null) return 'Adres tek bir IP adresi olmalı (örnek 10.0.5.20).';
  if (araliklar === null) return `Doğrudan baskı aralığı tanımlı değil (${YAZICI_AGI_DEGISKENI}); ağ yazıcısı kaydedilemez.`;
  if (!adresAraliktaMi(adres, araliklar)) return 'Adres doğrudan baskı aralığının dışında.';
  return null;
}

// EM-9: doğrudan baskı ancak ayar açık ve aralık tanımlıyken açıktır; neden metni adres ya da değer taşımaz.
export function dogrudanBaskiDurumu(ayarAcik: boolean, araliklar: readonly AgAraligi[] | null): { acik: boolean; neden: string | null } {
  if (!ayarAcik) return { acik: false, neden: 'Sistem Ayarları\'nda "Etiket yazıcısına doğrudan baskı" kapalı.' };
  if (araliklar === null) return { acik: false, neden: `Sunucuda ${YAZICI_AGI_DEGISKENI} tanımlı değil.` };
  return { acik: true, neden: null };
}

// EM-10: gönderimden hemen önce her koşul yeniden sınanır (aralık ya da ayar sonradan değişmiş olabilir).
// Doğrudan basılan etiket ya deneme etiketidir ya da şablon türüyle aynı türden gerçek kayıttır (EM-11).
export function baskiEngeli(
  y: { baglanti: 'ag' | 'dosya'; adres: string | null; aktif: boolean },
  durum: { acik: boolean; neden: string | null },
  araliklar: readonly AgAraligi[] | null,
  sablonTuru: string,
  kayitTuru: KayitTuru | null = null,
): string | null {
  if (!y.aktif) return 'Yazıcı pasif.';
  if (y.baglanti !== 'ag' || y.adres === null) return 'Bu yazıcı dosya ile basar; komut dosyasını indirin.';
  if (!durum.acik) return durum.neden;
  if (araliklar === null || !adresAraliktaMi(y.adres, araliklar)) return 'Adres doğrudan baskı aralığının dışında.';
  return kayitUyumHatasi(sablonTuru, kayitTuru);
}

// EM-14: komut dosyası yalnız kullanımdaki dosya yazıcısı için iner; ağ yazıcısı sunucudan basar.
export function indirmeEngeli(y: { baglanti: 'ag' | 'dosya'; aktif: boolean }, sablonTuru: string, kayitTuru: KayitTuru | null = null): string | null {
  if (!y.aktif) return 'Yazıcı pasif.';
  if (y.baglanti !== 'dosya') return 'Bu yazıcı ağdan basar; Yazıcıya gönder ile basın.';
  return kayitUyumHatasi(sablonTuru, kayitTuru);
}

// EM-11: örnek değerli etiket yalnız deneme şablonundan basılır; gerçek kayıt yalnız kendi türündeki şablonla.
export function kayitUyumHatasi(sablonTuru: string, kayitTuru: KayitTuru | null): string | null {
  if (kayitTuru === null) return sablonTuru === 'deneme' ? null : 'Örnek değerli etiket yalnız yazıcı denemesinde basılır; kayıt seçin.';
  return sablonTuru === kayitSablonTuru(kayitTuru) ? null : 'Şablon seçilen kayıtların türünde değil.';
}

// EM-19: mal kabul seçimi o kabulden açılan lotların etiketidir: lot şablonuyla basılır, deftere lot olarak yazılır (270 a).
// Refakat partisi refakat şablonuyla basılır, deftere emrin refakat kartı olarak yazılır (kart #127).
export function kayitSablonTuru(kayitTuru: KayitTuru): SablonTuru {
  if (kayitTuru === 'mal-kabul') return 'lot';
  return kayitTuru === 'refakat-partisi' ? 'refakat' : kayitTuru;
}

// EM-12: bir baskıda kayıt sayısı x adet en çok EN_COK_ADET etikettir (yanlışlıkla rulo bitirilmesin).
export function toplamEtiketHatasi(kayitSayisi: number, adet: number): string | null {
  return kayitSayisi * adet > EN_COK_ADET ? `Bir baskıda en çok ${EN_COK_ADET} etiket basılır (${kayitSayisi} kayıt x ${adet} adet).` : null;
}

// EM-13: konum etiketi stoktaki konum kodunu basar ve QR'ı kod sözlüğündeki konum önekiyle kurar (94 a).
// Ad ve yer stoktan gelmez; boş alan basılmaz (EM-4).
export function konumDegerleri(kod: string): AlanDegerleri {
  return { qr: `${KOD_ONEKI.konum}:${kod}`, kod, ad: null, yer: null };
}

const birlestir = (parcalar: readonly (string | null | false)[]): string | null => {
  const dolu = parcalar.filter((p): p is string => typeof p === 'string' && p !== '');
  return dolu.length === 0 ? null : dolu.join(' · ');
};
// Sunucunun ondalık metni ("12.5000") etikette Türkçe yazılır ("12,5"); sondaki sıfırlar atılır.
const miktarYazisi = (m: string): string => m.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '').replace('.', ',');

// Stok ekranındaki adlarla aynı (stok/gorunum.ts MALZEME_TURU); ortak sözlük çekirdek isteği.
const MALZEME_TURU_ADLARI: Record<KatalogTuru, string> = {
  hammadde: 'Hammadde', yarimamul: 'Yarı mamul', mamul: 'Mamul', sarf: 'Sarf', demirbas: 'Demirbaş', hizmet: 'Hizmet', ticari_mal: 'Ticari mal',
};

// EM-15: lot etiketi stokun lot etiketiyle aynı satırları basar (stok/LotEtiketi.tsx), malzeme türü adı dahil (271 a).
export function lotDegerleri(e: {
  lotNo: string; malzemeId: number; malzemeAd: string | null; malzemeKod: string | null; malzemeTuru: KatalogTuru | null; tedarikciPartiNo: string | null; dokumNo: string | null;
  sertifikaNo: string | null; giris: string; miktar: string | null; birim: string | null; belgeNo: string | null;
}): AlanDegerleri {
  const [yil, ay, gun] = tesisGunu(new Date(e.giris)).split('-');
  return {
    qr: `${KOD_ONEKI.lot}:${e.lotNo}`,
    lotNo: e.lotNo,
    malzeme: birlestir([e.malzemeAd, e.malzemeKod]),
    kart: birlestir([`Kart ${e.malzemeId}`, e.malzemeTuru && MALZEME_TURU_ADLARI[e.malzemeTuru]]),
    parti: birlestir([e.tedarikciPartiNo && `Parti ${e.tedarikciPartiNo}`, e.dokumNo && `Döküm ${e.dokumNo}`, e.sertifikaNo && `Sertifika ${e.sertifikaNo}`]),
    giris: birlestir([`${gun}.${ay}.${yil}`, e.miktar === null ? null : [miktarYazisi(e.miktar), e.birim].filter(Boolean).join(' '), e.belgeNo]),
  };
}

// EM-18: malzeme etiketi stoktaki malzeme etiketiyle aynı içeriği basar (stok/Etiketler.tsx): QR kart no, ad, stok kodu (269 a).
export function malzemeDegerleri(o: { id: number; kod: string; ad: string | null }): AlanDegerleri {
  return { qr: `${KOD_ONEKI.malzeme}:${o.id}`, ad: o.ad, kod: o.kod, kart: `Kart ${o.id}` };
}

// EM-20 (#116): raf etiketi rafın kodunu, adını ve yerini basar; QR raf önekiyle kurulur. Raf stok konumu değildir
// (stok gözdedir), okutan taraf rafın gözlerini gösterir.
export function rafDegerleri(r: { kod: string; ad: string; salonKodu: string | null; bolmeSayisi: number; katSayisi: number }): AlanDegerleri {
  return {
    qr: `${KOD_ONEKI.raf}:${r.kod}`, kod: r.kod, ad: r.ad === r.kod ? null : r.ad,
    yer: birlestir([r.salonKodu, r.bolmeSayisi > 0 && `${r.bolmeSayisi} bölme × ${r.katSayisi} kat`]),
  };
}

// EM-16: istasyon etiketi istasyonun stok konum kodunu basar; teslim bu kodla okutulur.
export function istasyonDegerleri(kod: string, ad: string | null): AlanDegerleri {
  return { qr: `${KOD_ONEKI.konum}:${kod}`, kod, ad };
}

const gunAyYil = (gun: string): string => gun.split('-').reverse().join('.');

// EM-17: refakat kartı etiketi üretim emrinin refakat kartıyla aynı satırları basar (uretim-emirleri/refakat.ts); işlem tablosu tek metinde sıralanır.
export function refakatDegerleri(k: RefakatKartiCevabi, basim: Date): AlanDegerleri {
  const { ustEmirNo, bolunmeSira } = k.parti;
  const parti = ustEmirNo === null ? 'Ana emir' : `${bolunmeSira === null ? 'Alt parti' : `Alt parti ${bolunmeSira}`} · üst ${ustEmirNo}`;
  const adim = (a: RefakatKartiCevabi['adimlar'][number]): string => {
    const yer = [a.yer, a.fason && 'fason'].filter(Boolean).join(', ');
    return yer === '' ? `${a.opNo} ${a.ad}` : `${a.opNo} ${a.ad} (${yer})`;
  };
  return {
    qr: k.qr,
    emirNo: k.emirNo,
    urunAd: k.urun.ad,
    urunKod: `Parça no: ${k.urun.kod}`,
    adetTermin: `Adet ${k.adet} · Termin ${k.teslim === null ? 'yok' : gunAyYil(k.teslim)}`,
    parti: `Parti: ${parti}`,
    basim: `Basım ${gunAyYil(tesisGunu(basim))}`,
    adimlar: k.adimlar.length === 0 ? null : k.adimlar.map(adim).join(' · '),
    lot: null,
  };
}

// EM-20 (kart #127): refakat partisinin kartı emrin kartıdır; QR ve başlık partinin (RP, emir no-P sıra), lot satırı depodan verilen lotun
// bilgisidir (lot no, tedarikçi partisi, döküm, sertifika).
export function refakatPartisiDegerleri(
  k: RefakatKartiCevabi, r: { qr: string; etiket: string }, lot: { lotNo: string; tedarikciPartiNo: string | null; dokumNo: string | null; sertifikaNo: string | null }, basim: Date,
): AlanDegerleri {
  return {
    ...refakatDegerleri(k, basim),
    qr: r.qr,
    emirNo: r.etiket,
    lot: birlestir([`Lot ${lot.lotNo}`, lot.tedarikciPartiNo && `Parti ${lot.tedarikciPartiNo}`, lot.dokumNo && `Döküm ${lot.dokumNo}`, lot.sertifikaNo && `Sertifika ${lot.sertifikaNo}`]),
  };
}
