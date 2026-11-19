import type { FirmaTuru } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import {
  type KarsilamaYolu, SATIR_EN_COK, type TopluSiparisAlani, type TopluSiparisSatirDenetimi, type TopluSiparisSatiri,
  birimFiyatSemasi, kdvOraniSemasi, miktarSemasi, paraBirimiSemasi,
} from '#paylasilan/sozlesme/siparisler.ts';
import { firmaReddi, kalemKarsilamasi, malzemeReddi, miktarReddi, tarihAraligiReddi } from './kurallar.ts';

// 3455-3: toplu satış siparişinin saf denetimi. Veritabanı okumaz: firma, kart, revizyon ve var olan siparişler çağırandan gelir.
// Hata satıra ve sütuna yazılır; hatalı satır varken hiçbir sipariş yazılmaz (hepsi ya da hiçbiri).

export const TOPLU_ZORUNLU = 'Bu sütun zorunlu.';
export const TOPLU_TARIH = 'Tarih YYYY-AA-GG biçiminde olmalı (örnek: 2026-03-15).';
export const TOPLU_TERMIN_ONCE = 'Termin sipariş tarihinden önce olamaz.';
export const TOPLU_MUSTERI_NO_UZUN = 'Müşteri sipariş no en çok 40 karakter.';
export const TOPLU_KARSILAMA = 'Karşılama "Üret", "Stoktan" ya da "Satın al" olmalı (boşsa kart türünden).';
export const TOPLU_ESKI_REVIZYON = 'Kart yürürlükteki revizyon değil; toplu yüklemede yürürlükteki kartın kodunu yazın.';
export const TOPLU_GRUP_FARKI = 'Aynı siparişin satırlarında sipariş tarihi, para birimi ve KDV aynı olmalı.';
export const TOPLU_SIPARIS_VAR = 'Bu müşterinin bu sipariş numarasıyla iptal edilmemiş siparişi zaten var.';
export const TOPLU_SATIR_COK = `Bir siparişte en çok ${String(SATIR_EN_COK)} satır olur.`;

export interface TopluFirma { id: number; kod: string; ad: string; tur: FirmaTuru; aktif: boolean }
export interface TopluKart { no: number; kod: string; ad: string; tur: string; onayDurumu: string; birim: string | null; yururlukte: boolean }
export interface TopluBaglam {
  bugun: string;
  firmalar: ReadonlyMap<string, TopluFirma>;
  kartlar: ReadonlyMap<string, TopluKart>;
  // Firma kimliği ve müşteri sipariş no ile var olan (iptal edilmemiş) siparişler: `${firmaId}|${no}`.
  varOlanlar: ReadonlySet<string>;
}

// Yazılacak kalem: denetimden geçmiş, ayrıştırılmış değerler.
export interface TopluKalem {
  sira: number; malzemeNo: number; miktar: string; birimFiyat: string | null; termin: string; karsilama: KarsilamaYolu;
}
export interface TopluSiparis {
  grup: string; firmaId: number; musteriSiparisNo: string; siparisTarihi: string; termin: string; paraBirimi: string; kdvOrani: string;
  logoBaglanacak: boolean; kalemler: TopluKalem[];
}

const anahtar = (k: string | null): string => (k ?? '').trim().toUpperCase();
const bos = (m: string | null): boolean => m === null || m.trim() === '';
const TARIH = /^\d{4}-\d{2}-\d{2}$/;
function tarihMi(m: string): boolean {
  if (!TARIH.test(m)) return false;
  const d = new Date(`${m}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === m;
}
const KARSILAMA_ADLARI: Record<string, KarsilamaYolu> = {
  'URET': 'uret', 'ÜRET': 'uret', 'STOK': 'stok', 'STOKTAN': 'stok', 'SATIN-AL': 'satin-al', 'SATIN AL': 'satin-al', 'SATINAL': 'satin-al',
};
export const karsilamaCoz = (m: string | null): KarsilamaYolu | undefined | null =>
  (bos(m) ? undefined : KARSILAMA_ADLARI[(m ?? '').trim().toLocaleUpperCase('tr').replace(/\s+/g, ' ')] ?? null);
const semadan = <T>(sema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, deger: string) => {
  const r = sema.safeParse(deger);
  return r.success ? { deger: r.data, ileti: null } : { deger: null, ileti: r.error.issues[0]?.message ?? 'Geçersiz değer.' };
};

export function topluDenetle(
  satirlar: readonly TopluSiparisSatiri[], b: TopluBaglam,
): { denetim: TopluSiparisSatirDenetimi[]; siparisler: TopluSiparis[] } {
  const denetim: TopluSiparisSatirDenetimi[] = [];
  const gruplar = new Map<string, { s: TopluSiparis; satirlar: TopluSiparisSatirDenetimi[] }>();
  for (const r of satirlar) {
    const hatalar: { alan: TopluSiparisAlani; ileti: string }[] = [];
    const hata = (alan: TopluSiparisAlani, ileti: string) => { hatalar.push({ alan, ileti }); };
    const firma = bos(r.firma) ? undefined : b.firmalar.get(anahtar(r.firma));
    if (bos(r.firma)) hata('firma', TOPLU_ZORUNLU);
    else {
      const ret = firmaReddi(firma ?? null, firma?.id ?? 0, null);
      if (ret !== null) hata('firma', ret);
    }
    const no = (r.siparisNo ?? '').trim();
    if (no === '') hata('siparisNo', TOPLU_ZORUNLU);
    else if (no.length > 40) hata('siparisNo', TOPLU_MUSTERI_NO_UZUN);
    const tarih = (r.siparisTarihi ?? '').trim();
    if (tarih === '') hata('siparisTarihi', TOPLU_ZORUNLU);
    else if (!tarihMi(tarih)) hata('siparisTarihi', TOPLU_TARIH);
    const termin = (r.termin ?? '').trim();
    if (termin === '') hata('termin', TOPLU_ZORUNLU);
    else if (!tarihMi(termin)) hata('termin', TOPLU_TARIH);
    else if (tarihMi(tarih) && termin < tarih) hata('termin', TOPLU_TERMIN_ONCE);
    if (tarihMi(tarih) && tarihMi(termin) && termin >= tarih) {
      const ret = tarihAraligiReddi(b.bugun, { siparisTarihi: tarih, termin, satirlar: [] });
      if (ret !== null) hata(ret.alan === 'termin' ? 'termin' : 'siparisTarihi', ret.mesaj);
    }
    const kart = bos(r.malzeme) ? undefined : b.kartlar.get(anahtar(r.malzeme));
    if (bos(r.malzeme)) hata('malzeme', TOPLU_ZORUNLU);
    else {
      const ret = malzemeReddi(kart ?? null);
      if (ret !== null) hata('malzeme', ret);
      else if (kart && !kart.yururlukte) hata('malzeme', TOPLU_ESKI_REVIZYON);
    }
    let miktar: string | null = null;
    if (bos(r.miktar)) hata('miktar', TOPLU_ZORUNLU);
    else {
      const m = semadan(miktarSemasi, (r.miktar ?? '').replace(',', '.'));
      if (m.ileti !== null) hata('miktar', m.ileti);
      else {
        const ret = kart ? miktarReddi(kart.birim, m.deger ?? '') : null;
        if (ret !== null) hata('miktar', ret);
        else miktar = m.deger;
      }
    }
    let fiyat: string | null = null;
    if (!bos(r.birimFiyat)) {
      const f = semadan(birimFiyatSemasi, (r.birimFiyat ?? '').replace(',', '.'));
      if (f.ileti !== null) hata('birimFiyat', f.ileti);
      else fiyat = f.deger;
    }
    const secilen = karsilamaCoz(r.karsilama);
    if (secilen === null) hata('karsilama', TOPLU_KARSILAMA);
    const para = semadan(paraBirimiSemasi, bos(r.paraBirimi) ? 'TRY' : (r.paraBirimi ?? ''));
    if (para.ileti !== null) hata('paraBirimi', para.ileti);
    const kdv = semadan(kdvOraniSemasi, bos(r.kdvOrani) ? '20' : (r.kdvOrani ?? '').replace(',', '.'));
    if (kdv.ileti !== null) hata('kdvOrani', kdv.ileti);

    const grup = firma === undefined || no === '' ? null : `${firma.kod}|${no}`;
    const satir: TopluSiparisSatirDenetimi = {
      sira: r.sira, firma: firma ? { id: firma.id, kod: firma.kod, ad: firma.ad } : null, malzeme: kart ? { no: kart.no, kod: kart.kod, ad: kart.ad } : null,
      grup, hatalar,
    };
    denetim.push(satir);
    if (grup === null || firma === undefined) continue;
    let g = gruplar.get(grup);
    if (g === undefined) {
      g = {
        s: { grup, firmaId: firma.id, musteriSiparisNo: no, siparisTarihi: tarih, termin, paraBirimi: para.deger ?? 'TRY', kdvOrani: kdv.deger ?? '20', logoBaglanacak: false, kalemler: [] },
        satirlar: [],
      };
      gruplar.set(grup, g);
    } else if (tarihMi(tarih) && para.ileti === null && kdv.ileti === null && (g.s.siparisTarihi !== tarih || g.s.paraBirimi !== para.deger || g.s.kdvOrani !== kdv.deger)) {
      hata('siparisTarihi', TOPLU_GRUP_FARKI);
    }
    g.satirlar.push(satir);
    if (r.logo) g.s.logoBaglanacak = true;
    if (termin > g.s.termin) g.s.termin = termin;
    if (hatalar.length === 0 && kart && miktar !== null) {
      g.s.kalemler.push({ sira: r.sira, malzemeNo: kart.no, miktar, birimFiyat: fiyat, termin, karsilama: kalemKarsilamasi(kart.tur, secilen ?? undefined) });
    }
  }
  for (const g of gruplar.values()) {
    if (b.varOlanlar.has(`${String(g.s.firmaId)}|${g.s.musteriSiparisNo}`)) for (const s of g.satirlar) s.hatalar.push({ alan: 'siparisNo', ileti: TOPLU_SIPARIS_VAR });
    if (g.satirlar.length > SATIR_EN_COK) for (const s of g.satirlar) s.hatalar.push({ alan: 'siparisNo', ileti: TOPLU_SATIR_COK });
  }
  const hatasiz = denetim.every((d) => d.hatalar.length === 0);
  return { denetim, siparisler: hatasiz ? [...gruplar.values()].map((g) => g.s) : [] };
}
