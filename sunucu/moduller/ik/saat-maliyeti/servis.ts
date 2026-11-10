import type { Db } from '#cekirdek/db.ts';
import { tesisGunBasi } from '#paylasilan/tesis-zamani.ts';
import {
  ayAraligi, dogrudanEmilmeyen, dolayliPersonel, emilimDegerleri, grupDegerleri, kucukGrupHavuzu, type Girdi, type GrupDegeri, type HavuzDegeri, type KapsamGirdisi, type Parametreler,
  type PersonelToplami,
} from './kurallar.ts';
import { ayinParametreleri, personelGirdileri, personelKapsami } from './sorgular.ts';

const sayi = (v: string | null): number | null => (v === null ? null : Number(v));

async function girdileriOku(db: Db, ay: string): Promise<{ girdiler: Girdi[]; parametreler: Parametreler; kisiGrubu: Map<number, number> }> {
  const aralik = ayAraligi(ay);
  if (aralik === null) throw new Error(`Geçersiz ay: ${ay}`);
  const p = await ayinParametreleri(db, aralik.ayBasi);
  const parametreler: Parametreler = {
    sgkIsverenOrani: sayi(p?.sgkIsverenOrani ?? null), issizlikIsverenOrani: sayi(p?.issizlikIsverenOrani ?? null), sgkTavani: sayi(p?.sgkTavani ?? null), aylikSaat: sayi(p?.aylikSaat ?? null),
  };
  const satirlar = await personelGirdileri(db, aralik.ayBasi, aralik.aySonu);
  const girdiler = satirlar.map((r) => ({
    personelNo: r.personelNo, departmanNo: r.departmanNo, departmanAd: r.departmanAd, brut: sayi(r.brut), saat: Number(r.saat),
    bordro: r.bordroMaliyeti === null ? null : { maliyet: Number(r.bordroMaliyeti), mesaiSaati: sayi(r.bordroMesaiSaati), tatilSaati: sayi(r.bordroTatilSaati), gun: sayi(r.bordroGun) },
  }));
  const kisiGrubu = new Map(satirlar.flatMap((r) => (r.kisiId === null ? [] : [[r.kisiId, r.departmanNo] as const])));
  return { girdiler, parametreler, kisiGrubu };
}

async function hesapla(db: Db, ay: string): Promise<{ gruplar: GrupDegeri[]; kisiGrubu: Map<number, number> }> {
  const { girdiler, parametreler, kisiGrubu } = await girdileriOku(db, ay);
  return { gruplar: grupDegerleri(girdiler, parametreler), kisiGrubu };
}

export type { GrupDegeri, HavuzDegeri } from './kurallar.ts';
export interface KisiGrupDegeri { departmanNo: number; saatMaliyeti: number | null; kucuk: boolean }

// Küçük grupta değer gizlenir (2603 a, Güvenlik K1): tek ya da iki kişilik grubun ortalaması kişinin kendi değerini verir.
const gizli = <T extends { saatMaliyeti: number | null; kucuk: boolean }>(g: T): T => (g.kucuk ? { ...g, saatMaliyeti: null } : g);

async function kisiDegerleri(db: Db, kisiIdler: readonly number[], ay: string): Promise<Map<number, KisiGrupDegeri>> {
  const tekil = [...new Set(kisiIdler)];
  if (tekil.length === 0) return new Map();
  const { gruplar, kisiGrubu } = await hesapla(db, ay);
  const grup = new Map(gruplar.map((g) => [g.departmanNo, g]));
  return new Map(tekil.flatMap((id) => {
    const no = kisiGrubu.get(id);
    const g = no === undefined ? undefined : grup.get(no);
    return g === undefined ? [] : [[id, { departmanNo: g.departmanNo, saatMaliyeti: g.saatMaliyeti, kucuk: g.kucuk }] as const];
  }));
}

// Departman başına grup saat maliyeti (TRY); ekrana gidebilir. Küçük grupta saatMaliyeti null, kucuk true. Kişi değeri dönmez.
// Yetki denetlemez; çağıran uç korur.
export async function grupSaatMaliyetleri(db: Db, ay: string): Promise<Map<number, GrupDegeri>> {
  return new Map((await hesapla(db, ay)).gruplar.map((g) => [g.departmanNo, gizli(g)]));
}

// Kişinin (kisi.id) grubunun değeri; ekrana gidebilir, küçük grupta null. Personel bağı ya da departmanı olmayan kişi haritada yoktur.
export async function kisilerinGrupSaatMaliyeti(db: Db, kisiIdler: readonly number[], ay: string): Promise<Map<number, KisiGrupDegeri>> {
  return new Map([...(await kisiDegerleri(db, kisiIdler, ay))].map(([id, d]) => [id, gizli(d)]));
}

// YALNIZ SUNUCU İÇİ TOPLAM HESABI (2603 a: küçük grubun değeri hesapta kullanılır). Küçük grupta da gerçek değer döner; bu değer hiçbir
// cevaba, günlüğe ya da dışa aktarıma konmaz, yalnız toplanmış tutarın (iş emri, proje, OEE kaybı) içinde kullanılır.
export async function kisilerinGrupSaatMaliyetiYalnizHesapIcin(db: Db, kisiIdler: readonly number[], ay: string): Promise<Map<number, KisiGrupDegeri>> {
  return kisiDegerleri(db, kisiIdler, ay);
}

// YALNIZ SUNUCU İÇİ TOPLAM HESABI (IK-87, 2657 a): küçük grupların tek havuz değeri; havuz 3 kişiden azsa null. Değer hiçbir cevaba,
// günlüğe ya da dışa aktarıma konmaz; yalnız toplanmış tutarın içinde kullanılır. Yetki denetlemez.
export async function kucukGrupHavuzuYalnizHesapIcin(db: Db, ay: string): Promise<HavuzDegeri | null> {
  const { girdiler, parametreler } = await girdileriOku(db, ay);
  return kucukGrupHavuzu(girdiler, parametreler);
}

// 2647 a, 2659: ayın kapsamı (kişi değeri İK içinde kalır).
async function kapsamOku(db: Db, ay: string): Promise<{ kapsam: KapsamGirdisi[]; parametreler: Parametreler; ayBasi: string; aySonu: string }> {
  const aralik = ayAraligi(ay);
  if (aralik === null) throw new Error(`Geçersiz ay: ${ay}`);
  const p = await ayinParametreleri(db, aralik.ayBasi);
  const parametreler: Parametreler = {
    sgkIsverenOrani: sayi(p?.sgkIsverenOrani ?? null), issizlikIsverenOrani: sayi(p?.issizlikIsverenOrani ?? null), sgkTavani: sayi(p?.sgkTavani ?? null), aylikSaat: sayi(p?.aylikSaat ?? null),
  };
  const kapsam = (await personelKapsami(db, aralik.ayBasi, aralik.aySonu)).map((r) => ({ ...r, brut: sayi(r.brut), bordroMaliyeti: sayi(r.bordroMaliyeti) }));
  return { kapsam, parametreler, ...aralik };
}

export type { PersonelToplami } from './kurallar.ts';
// Küçük birleşik grupta tutar gizlenir (Güvenlik 2647 K1); kucuk ve eksik kalır.
const toplamGizli = (t: PersonelToplami): PersonelToplami => (t.kucuk ? { ...t, tutar: null } : t);

async function dolayli(db: Db, ay: string): Promise<PersonelToplami> {
  const { kapsam, parametreler, ayBasi, aySonu } = await kapsamOku(db, ay);
  return dolayliPersonel(kapsam, parametreler, ayBasi, aySonu);
}

// IK-88 (2647 a): dolaylı personel toplamı; ekrana gidebilir, küçük birleşik grupta tutar null. Yetki denetlemez; çağıran uç korur.
export async function dolayliPersonelToplami(db: Db, ay: string): Promise<PersonelToplami> {
  return toplamGizli(await dolayli(db, ay));
}

// YALNIZ SUNUCU İÇİ TOPLAM HESABI (IK-88): küçük grupta da gerçek tutar; değer ayrı alan olarak hiçbir cevaba, kayda, günlüğe ya da dışa
// aktarıma konmaz, yalnız genel gider toplamının içinde kullanılır (gizleme çağıranındır, 2652 a). Yetki denetlemez.
export async function dolayliPersonelToplamiYalnizHesapIcin(db: Db, ay: string): Promise<PersonelToplami> {
  return dolayli(db, ay);
}

// Katılım kaynağı (uretim-emirleri katilimSureleri biçimi): kişi başına [baslangic, bitis) içinde işlerde çalışılan saniye. İK onu ithal
// etmez; kablolama verir (ADR 0006).
export type KatilimKaynagi = (db: Db, kisiIdleri: readonly number[], baslangic: string, bitis: string) => Promise<Map<number, number>>;

async function emilmeyen(db: Db, ay: string, katilim: KatilimKaynagi | null): Promise<PersonelToplami> {
  const { kapsam, parametreler, ayBasi, aySonu } = await kapsamOku(db, ay);
  // Maaş, katılım ve grup değeri aynı aydan (Maliyet 1); küçük grupta IK-87 havuz değeri (2706 a).
  const { girdiler, parametreler: p } = await girdileriOku(db, ay);
  const grup = emilimDegerleri(grupDegerleri(girdiler, p), kucukGrupHavuzu(girdiler, p));
  let saat: Map<number, number> | null = null;
  if (katilim !== null) {
    const kisiler = kapsam.flatMap((k) => (k.kisiId !== null && k.dogrudan === true ? [k.kisiId] : []));
    const [y, m] = ay.split('-').map(Number) as [number, number];
    const ertesi = `${String(m === 12 ? y + 1 : y)}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
    const sn = await katilim(db, kisiler, new Date(tesisGunBasi(ayBasi)).toISOString(), new Date(tesisGunBasi(ertesi)).toISOString());
    saat = new Map([...sn].map(([id, s]) => [id, s / 3600]));
  }
  return dogrudanEmilmeyen(kapsam, parametreler, ayBasi, aySonu, saat, grup);
}

// IK-89 (2659): doğrudan işçilikte emilmeyen maaş; ekrana gidebilir, küçük birleşik doğrudan grupta tutar null. katilim null: kaynak yok
// (tutar null, eksik). Yetki denetlemez; kişi başı katılım İK içinde kalır.
export async function dogrudanEmilmeyenToplami(db: Db, ay: string, katilim: KatilimKaynagi | null): Promise<PersonelToplami> {
  return toplamGizli(await emilmeyen(db, ay, katilim));
}

// YALNIZ SUNUCU İÇİ TOPLAM HESABI (IK-89): küçük grupta da gerçek tutar; yalnız genel gider toplamının içinde kullanılır. Yetki denetlemez.
export async function dogrudanEmilmeyenToplamiYalnizHesapIcin(db: Db, ay: string, katilim: KatilimKaynagi | null): Promise<PersonelToplami> {
  return emilmeyen(db, ay, katilim);
}
