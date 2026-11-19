import type { Db } from '#cekirdek/db.ts';
import { dogrulama } from '#cekirdek/hata.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import {
  type TopluSiparisDenetleCevabi, type TopluSiparisSatiri, type TopluSiparisYukleCevabi, siparisEkleGovdesi,
} from '#paylasilan/sozlesme/siparisler.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { malzemeNoKoddan, malzemeOzetleri, revizyonBilgileri } from '../malzemeler/disari.ts';
import { firmaNoKoddan, firmaOzetleri } from '../musteri-tedarikci/disari.ts';
import { siparisEkle } from './servis.ts';
import * as sorgular from './sorgular.ts';
import { type TopluBaglam, type TopluFirma, type TopluKart, type TopluSiparis, topluDenetle } from './toplu-kurallar.ts';

// 3455-3: Excel'den toplu satış siparişi. Denetle yazmaz; yükle aynı denetimi yeniden yapar ve hatasızsa bütün siparişleri tek
// işlemde taslak açar (3455-S4 a). Onay, emir, ayırma ve satın alma olağan akışla sonra gelir; Logo'ya gönderilmez (3455-logo c).

const anahtar = (k: string): string => k.trim().toUpperCase();
const doluKodlar = (degerler: readonly (string | null)[]): string[] => [...new Set(degerler.flatMap((d) => (d === null || d.trim() === '' ? [] : [d.trim()])))];

async function baglamKur(db: Db, satirlar: readonly TopluSiparisSatiri[]): Promise<TopluBaglam> {
  const firmaKodlari = doluKodlar(satirlar.map((s) => s.firma));
  const firmaNolari = new Map<string, number>();
  for (const k of firmaKodlari) {
    const id = await firmaNoKoddan(db, k);
    if (id !== null) firmaNolari.set(anahtar(k), id);
  }
  const ozetler = await firmaOzetleri(db, [...firmaNolari.values()]);
  const firmalar = new Map<string, TopluFirma>();
  for (const [k, id] of firmaNolari) {
    const f = ozetler.get(id);
    if (f) firmalar.set(k, { id, kod: f.kod ?? k, ad: f.ad, tur: f.tur, aktif: f.aktif });
  }
  const kartNolari = new Map<string, number>();
  for (const k of doluKodlar(satirlar.map((s) => s.malzeme))) {
    const no = await malzemeNoKoddan(db, k);
    if (no !== null) kartNolari.set(anahtar(k), no);
  }
  const nolar = [...kartNolari.values()];
  const kartOzetleri = await malzemeOzetleri(db, nolar);
  const revizyonlar = await revizyonBilgileri(db, nolar);
  const kartlar = new Map<string, TopluKart>();
  for (const [k, no] of kartNolari) {
    const o = kartOzetleri.get(no);
    const r = revizyonlar.get(no);
    if (o) kartlar.set(k, { no, kod: o.kod, ad: o.ad ?? o.kod, tur: o.tur, onayDurumu: o.onayDurumu, birim: o.birim, yururlukte: r === undefined || r.yururlukteki.no === no });
  }
  const ciftler = satirlar.flatMap((s) => {
    const f = s.firma === null ? undefined : firmalar.get(anahtar(s.firma));
    const no = (s.siparisNo ?? '').trim();
    return f === undefined || no === '' ? [] : [{ firmaId: f.id, no }];
  });
  return { bugun: tesisGunu(Date.now()), firmalar, kartlar, varOlanlar: await sorgular.varOlanMusteriNolari(db, ciftler) };
}

function cevap(d: ReturnType<typeof topluDenetle>): TopluSiparisDenetleCevabi {
  const gruplar = new Set(d.denetim.flatMap((s) => (s.grup === null ? [] : [s.grup])));
  return { satirlar: d.denetim, siparisSayisi: gruplar.size, hataliSatir: d.denetim.filter((s) => s.hatalar.length > 0).length };
}

export async function topluSiparisDenetle(db: Db, satirlar: readonly TopluSiparisSatiri[]): Promise<TopluSiparisDenetleCevabi> {
  return cevap(topluDenetle(satirlar, await baglamKur(db, satirlar)));
}

// Sipariş sözleşme şemasından geçer (taslakSiparisAc gibi): biçim kuralları elle girilen siparişle aynıdır.
function govde(s: TopluSiparis) {
  const r = siparisEkleGovdesi.safeParse({
    firmaId: s.firmaId, musteriSiparisNo: s.musteriSiparisNo, siparisTarihi: s.siparisTarihi, termin: s.termin, paraBirimi: s.paraBirimi,
    kdvOrani: s.kdvOrani, satirlar: s.kalemler.map((k) => ({ malzemeNo: k.malzemeNo, miktar: k.miktar, birimFiyat: k.birimFiyat, termin: k.termin, karsilama: k.karsilama })),
  });
  if (!r.success) {
    const ilk = r.error.issues[0];
    throw dogrulama(`${s.musteriSiparisNo}: ${ilk?.message ?? 'Sipariş geçersiz.'}`, 'satirlar');
  }
  return r.data;
}

export async function topluSiparisYukle(
  db: Db, kullanici: Kullanici, g: { dosyaAdi: string; satirlar: readonly TopluSiparisSatiri[] },
): Promise<TopluSiparisYukleCevabi> {
  const d = topluDenetle(g.satirlar, await baglamKur(db, g.satirlar));
  if (d.siparisler.length === 0) return { siparisler: null, denetim: cevap(d) };
  const yuklemeId = await sorgular.topluYuklemeEkle(db, {
    yukleyenId: kullanici.id, dosyaAdi: g.dosyaAdi, siparisSayisi: d.siparisler.length, satirSayisi: g.satirlar.length,
  });
  const acilan: NonNullable<TopluSiparisYukleCevabi['siparisler']> = [];
  for (const s of d.siparisler) {
    // Fiyat yazma, elle girilen siparişteki gibi siparisler.fiyat-oku ister (işlem ileride role verilirse de geçerli kalır).
    const a = await siparisEkle(db, kullanici, govde(s), islemVarMi(kullanici, 'siparisler.fiyat-oku'), null, true);
    await sorgular.topluIsaretle(db, a.id, yuklemeId, s.logoBaglanacak);
    acilan.push({ id: a.id, no: a.no, musteriSiparisNo: s.musteriSiparisNo });
  }
  return { siparisler: acilan, denetim: null };
}
