import type { Db } from '#cekirdek/db.ts';
import { islemKilidiAl } from '#cekirdek/kilit.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { IkTuru } from '#paylasilan/sozlesme/ik.ts';
import type { Deger, SatirDegeri, Satirlar } from './eslesme.ts';
import type { Degisiklik, ResmiTatilSatiri } from './kurallar.ts';
import {
  DONEM_ALANLARI, GENEL_AYAR_ALANLARI, GOREV_ALANLARI, KANAL_ALANLARI, PLAN_ALANLARI, PLAN_KADRO_ALANLARI, PRIM_ALANLARI, SORU_SETI_ALANLARI,
  TESVIK_ALANLARI, TUR_TANIMLARI,
} from './sema.ts';
import type { Alan, Liste, TurTanimi } from './sema.ts';

/* Bütün SQL buradadır. Sütun adları sema.ts'teki sabit tanımdan gelir (kullanıcı girdisi değil); değerler parametredir.
   Bağ alanı (başka İK kaydı) yazarken kimlikten sayı kimliğe, okurken sayı kimlikten kimliğe çevrilir. */

const tablo = (tur: IkTuru): string => TUR_TANIMLARI[tur].tablo;
const bagYaz = (a: Alan, yer: string): string => (a.bag ? `(SELECT no FROM ${tablo(a.bag)} WHERE kimlik = ${yer})` : yer);
const bagOku = (a: Alan, sutun: string, kaynak: string): string =>
  a.bag ? `(SELECT kimlik FROM ${tablo(a.bag)} b WHERE b.no = ${kaynak}.${sutun}) AS "${sutun}"`
    : a.t === 'zaman' ? `${zamanMetni(`${kaynak}.${sutun}`)} AS "${sutun}"` : `${kaynak}.${sutun} AS "${sutun}"`;

interface Sutun { alan: Alan; s: string }
const MANTIK: Alan = { a: '', s: '', t: 'mantik' };
function anaSutunlari(t: TurTanimi): Sutun[] {
  const s: Sutun[] = t.alanlar.map((a) => ({ alan: a, s: a.s }));
  if (t.ozet) {
    const o = t.ozet;
    s.push(...o.alanlar.map((a) => ({ alan: a, s: o.onek + a.s })));
    for (const n of o.nesneler) {
      s.push({ alan: MANTIK, s: `${o.onek}${n.onek}var` });
      s.push(...n.alanlar.map((a) => ({ alan: a, s: o.onek + n.onek + a.s })));
    }
  }
  return s;
}
const altListeleri = (t: TurTanimi): Liste[] => [...t.listeler, ...(t.ozet?.listeler ?? [])];

export interface KayitSatiri {
  tur: IkTuru;
  no: number;
  kimlik: string;
  surum: number;
  iptal: boolean;
  ana: SatirDegeri;
  altlar: Record<string, SatirDegeri[]>;
  olusturma: string;
  guncelleme: string;
  // Türe özel sunucu sütunları (pozisyonda gönderen ve onaylayan, izinde kararı veren, bordroda parametre dönemi).
  ek: Record<string, Deger>;
}

const EK_SUTUNLAR: Partial<Record<IkTuru, readonly string[]>> = {
  job: ['gonderen_kisi_id', 'onaylayan_kisi_id', 'dort_gozsuz_onay'],
  leave: ['karar_veren_kisi_id'],
  pay: ['parametre_donemi_no', 'kesinlestiren_kisi_id'],
};

function secim(t: TurTanimi): string {
  return [
    't.no', 't.kimlik', 't.surum', 't.iptal', `${zamanMetni('t.olusturma')} AS olusturma`, `${zamanMetni('t.guncelleme')} AS guncelleme`,
    ...anaSutunlari(t).map((c) => bagOku(c.alan, c.s, 't')),
    ...(EK_SUTUNLAR[t.tur] ?? []).map((s) => `t.${s} AS "${s}"`),
  ].join(', ');
}

async function altlariOku(db: Db, t: TurTanimi, nolar: readonly number[]): Promise<Map<number, Record<string, SatirDegeri[]>>> {
  const sonuc = new Map<number, Record<string, SatirDegeri[]>>();
  if (!nolar.length) return sonuc;
  for (const l of altListeleri(t)) {
    const sutunlar = [`a.${t.bagSutunu} AS "anaNo"`, ...(l.bicim === 'dizi' ? ['a.sira AS "sira"'] : []), ...(l.anahtar ? [`a.${l.anahtar} AS "${l.anahtar}"`] : []),
      ...l.alanlar.map((al) => bagOku(al, al.s, 'a'))];
    const satirlar = await db.sorgu<SatirDegeri>(`SELECT ${sutunlar.join(', ')} FROM ${l.tablo} a WHERE a.${t.bagSutunu} = ANY($1::int[])`, [nolar]);
    for (const r of satirlar) {
      const anaNo = Number(r['anaNo']);
      const geri: SatirDegeri = { ...r };
      delete geri['anaNo'];
      const k = sonuc.get(anaNo) ?? {};
      (k[l.tablo] ??= []).push(geri);
      sonuc.set(anaNo, k);
    }
  }
  return sonuc;
}

function satirKur(t: TurTanimi, r: SatirDegeri, altlar: Record<string, SatirDegeri[]>): KayitSatiri {
  const ana: SatirDegeri = {};
  for (const c of anaSutunlari(t)) ana[c.s] = r[c.s] ?? null;
  const ek: Record<string, Deger> = {};
  for (const s of EK_SUTUNLAR[t.tur] ?? []) ek[s] = r[s] ?? null;
  return {
    tur: t.tur, no: Number(r['no']), kimlik: String(r['kimlik']), surum: Number(r['surum']), iptal: r['iptal'] === true, ana, altlar, ek,
    olusturma: String(r['olusturma']), guncelleme: String(r['guncelleme']),
  };
}

// Bütün kayıtlar (ya da verilen türlerinkiler); iptal edilenler dahil (geçmişten geri getirme için). Süzme servistedir.
export async function kayitlar(db: Db, turler?: readonly IkTuru[]): Promise<KayitSatiri[]> {
  const hepsi: KayitSatiri[] = [];
  for (const t of Object.values(TUR_TANIMLARI).filter((x) => !turler || turler.includes(x.tur))) {
    const satirlar = await db.sorgu<SatirDegeri>(`SELECT ${secim(t)} FROM ${t.tablo} t ORDER BY t.no`);
    const altlar = await altlariOku(db, t, satirlar.map((r) => Number(r['no'])));
    for (const r of satirlar) hepsi.push(satirKur(t, r, altlar.get(Number(r['no'])) ?? {}));
  }
  return hepsi;
}

export async function kayitKilitle(db: Db, tur: IkTuru, kimlik: string): Promise<KayitSatiri | null> {
  const t = TUR_TANIMLARI[tur];
  const r = await db.tek<SatirDegeri>(`SELECT ${secim(t)} FROM ${t.tablo} t WHERE t.kimlik = $1 FOR UPDATE`, [kimlik]);
  if (!r) return null;
  return satirKur(t, r, (await altlariOku(db, t, [Number(r['no'])])).get(Number(r['no'])) ?? {});
}

// Kimlik bütün İK kayıtlarında tekildir: başka türde kayıtlıysa yazılmaz.
export async function kimlikBaskaTurdeMi(db: Db, tur: IkTuru, kimlik: string): Promise<boolean> {
  for (const t of Object.values(TUR_TANIMLARI)) {
    if (t.tur !== tur && (await db.tek(`SELECT 1 AS var FROM ${t.tablo} WHERE kimlik = $1`, [kimlik])) !== null) return true;
  }
  return false;
}

export async function varMi(db: Db, tur: IkTuru, kimlik: string): Promise<boolean> {
  return (await db.tek(`SELECT 1 AS var FROM ${tablo(tur)} WHERE kimlik = $1`, [kimlik])) !== null;
}

function parametreli(t: TurTanimi, s: Satirlar, ek: Record<string, Deger>): { sutunlar: string[]; yerler: string[]; degerler: unknown[] } {
  const sutunlar: string[] = []; const yerler: string[] = []; const degerler: unknown[] = [];
  for (const c of anaSutunlari(t)) {
    degerler.push(s.ana[c.s] ?? null);
    sutunlar.push(c.s);
    yerler.push(bagYaz(c.alan, `$${degerler.length}`));
  }
  for (const [k, v] of Object.entries(ek)) { degerler.push(v); sutunlar.push(k); yerler.push(`$${degerler.length}`); }
  return { sutunlar, yerler, degerler };
}

// Alt satırlar ana kayıtla birlikte yenilenir (silinip yeniden yazılır).
async function altlariYaz(db: Db, t: TurTanimi, no: number, s: Satirlar): Promise<void> {
  for (const l of altListeleri(t)) {
    await db.sorgu(`DELETE FROM ${l.tablo} WHERE ${t.bagSutunu} = $1`, [no]);
    for (const r of s.altlar[l.tablo] ?? []) {
      const sutunlar = [t.bagSutunu]; const yerler = ['$1']; const degerler: unknown[] = [no];
      const ekle = (sutun: string, deger: unknown, al?: Alan): void => { degerler.push(deger); sutunlar.push(sutun); yerler.push(al ? bagYaz(al, `$${degerler.length}`) : `$${degerler.length}`); };
      if (l.bicim === 'dizi') ekle('sira', r['sira']);
      if (l.anahtar) ekle(l.anahtar, r[l.anahtar]);
      for (const al of l.alanlar) ekle(al.s, r[al.s] ?? null, al);
      await db.sorgu(`INSERT INTO ${l.tablo} (${sutunlar.join(', ')}) VALUES (${yerler.join(', ')})`, degerler);
    }
  }
}

export async function kayitEkle(db: Db, tur: IkTuru, kimlik: string, s: Satirlar, kisiId: number, ek: Record<string, Deger> = {}): Promise<KayitSatiri> {
  const t = TUR_TANIMLARI[tur];
  const p = parametreli(t, s, ek);
  p.degerler.push(kimlik, kisiId);
  const n = p.degerler.length;
  const r = await db.tek<{ no: number }>(
    `INSERT INTO ${t.tablo} (${[...p.sutunlar, 'kimlik', 'olusturan_kisi_id', 'guncelleyen_kisi_id'].join(', ')})
     VALUES (${[...p.yerler, `$${n - 1}`, `$${n}`, `$${n}`].join(', ')}) RETURNING no`, p.degerler);
  await altlariYaz(db, t, r!.no, s);
  return (await kayitKilitle(db, tur, kimlik))!;
}

// Sürüm koşullu (surumluGuncelle): null dönerse kayıt yok ya da sürüm ilerlemiş. İptal edilmiş kayıt geri gelir.
export async function kayitGuncelle(db: Db, tur: IkTuru, kimlik: string, surum: number, s: Satirlar, kisiId: number, ek: Record<string, Deger> = {}): Promise<KayitSatiri | null> {
  const t = TUR_TANIMLARI[tur];
  const p = parametreli(t, s, ek);
  p.degerler.push(kimlik, surum, kisiId);
  const n = p.degerler.length;
  const r = await db.tek<{ no: number }>(
    `UPDATE ${t.tablo} SET ${p.sutunlar.map((c, i) => `${c} = ${p.yerler[i] ?? 'NULL'}`).join(', ')}, iptal = false, surum = surum + 1,
            guncelleyen_kisi_id = $${n}, guncelleme = now()
      WHERE kimlik = $${n - 2} AND surum = $${n - 1} RETURNING no`, p.degerler);
  if (!r) return null;
  await altlariYaz(db, t, r.no, s);
  return kayitKilitle(db, tur, kimlik);
}

export async function kayitIptal(db: Db, tur: IkTuru, kimlik: string, surum: number, kisiId: number): Promise<KayitSatiri | null> {
  const r = await db.tek<{ no: number }>(
    `UPDATE ${tablo(tur)} SET iptal = true, surum = surum + 1, guncelleyen_kisi_id = $3, guncelleme = now()
      WHERE kimlik = $1 AND surum = $2 AND NOT iptal RETURNING no`, [kimlik, surum, kisiId]);
  return r ? kayitKilitle(db, tur, kimlik) : null;
}

export async function kesinlesmisVarMi(db: Db, donem: string): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM ik_bordro WHERE donem = $1 AND NOT iptal LIMIT 1', [`${donem}-01`])) !== null;
}

// Aynı ayı iki kişi aynı anda kesinleştiremez; ayarları iki kişi aynı anda yazamaz.
export async function anahtarKilitle(db: Db, anahtar: string): Promise<void> {
  await islemKilidiAl(db, anahtar);
}

export async function parametreDonemiNo(db: Db, kod: string): Promise<number | null> {
  return (await db.tek<{ no: number }>('SELECT no FROM ik_parametre_donemi WHERE kod = $1', [kod]))?.no ?? null;
}

// Bordroya bağlı (kesinleşmiş bordronun hesaplandığı) parametre dönemlerinin kodları.
export async function bordroluDonemKodlari(db: Db): Promise<string[]> {
  return (await db.sorgu<{ kod: string }>('SELECT DISTINCT d.kod FROM ik_bordro b JOIN ik_parametre_donemi d ON d.no = b.parametre_donemi_no')).map((r) => r.kod);
}

/* ---------------- ayarlar ---------------- */

export interface DonemSatiri extends SatirDegeri { kod: string }
export interface AyarSatirlari {
  surum: number | null;
  genel: SatirDegeri | null;
  tatiller: SatirDegeri[];
  belgeler: string[];
  kriterler: { kullanim: string; ad: string }[];
  soruSetleri: { satir: SatirDegeri; sorular: string[] }[];
  kanallar: SatirDegeri[];
  gorevler: SatirDegeri[];
  plan: SatirDegeri | null;
  planKadrosu: SatirDegeri[];
  donemler: { satir: SatirDegeri; dilimler: SatirDegeri[]; primler: SatirDegeri[]; tesvikler: SatirDegeri[] }[];
}

const kolonlar = (alanlar: readonly Alan[]): string => alanlar.map((a) => bagOku(a, a.s, 't')).join(', ');

export async function ayarlariOku(db: Db): Promise<AyarSatirlari> {
  const genel = await db.tek<SatirDegeri>(`SELECT t.surum, ${kolonlar(GENEL_AYAR_ALANLARI)} FROM ik_genel_ayar t WHERE t.anahtar = 'genel'`);
  const donemler = await db.sorgu<SatirDegeri>(`SELECT t.no, t.kod, t.ad, t.baslangic, t.notu, ${kolonlar(DONEM_ALANLARI)} FROM ik_parametre_donemi t ORDER BY t.baslangic`);
  const dilimler = await db.sorgu<SatirDegeri>('SELECT donem_no, ust_sinir, oran FROM ik_gelir_vergisi_dilimi ORDER BY donem_no, sira');
  const primler = await db.sorgu<SatirDegeri>(`SELECT t.donem_no, ${kolonlar(PRIM_ALANLARI)} FROM ik_prim_tanimi t ORDER BY t.donem_no, t.sira`);
  const tesvikler = await db.sorgu<SatirDegeri>(`SELECT t.donem_no, ${kolonlar(TESVIK_ALANLARI)} FROM ik_tesvik_tanimi t ORDER BY t.donem_no, t.sira`);
  const setler = await db.sorgu<SatirDegeri>(`SELECT t.no, ${kolonlar(SORU_SETI_ALANLARI)} FROM ik_soru_seti t ORDER BY t.sira`);
  const sorular = await db.sorgu<{ setNo: number; metin: string }>('SELECT set_no AS "setNo", metin FROM ik_soru ORDER BY set_no, sira');
  const ayir = (liste: SatirDegeri[], no: Deger | undefined): SatirDegeri[] => liste.filter((r) => r['donem_no'] === no);
  return {
    surum: genel ? Number(genel['surum']) : null,
    genel,
    tatiller: await db.sorgu<SatirDegeri>('SELECT yil, ay, gun, ad FROM ik_resmi_tatil ORDER BY sira'),
    belgeler: (await db.sorgu<{ ad: string }>('SELECT ad FROM ik_ozluk_belge_tanimi ORDER BY sira')).map((r) => r.ad),
    kriterler: await db.sorgu<{ kullanim: string; ad: string }>('SELECT kullanim, ad FROM ik_degerlendirme_kriteri ORDER BY kullanim, sira'),
    soruSetleri: setler.map((r) => ({ satir: r, sorular: sorular.filter((q) => q.setNo === r['no']).map((q) => q.metin) })),
    kanallar: await db.sorgu<SatirDegeri>(`SELECT ${kolonlar(KANAL_ALANLARI)} FROM ik_ilan_kanali t ORDER BY t.sira`),
    gorevler: await db.sorgu<SatirDegeri>(`SELECT t.anahtar, ${kolonlar(GOREV_ALANLARI)} FROM ik_gorev_durumu t ORDER BY t.anahtar`),
    plan: await db.tek<SatirDegeri>(`SELECT ${kolonlar(PLAN_ALANLARI)} FROM ik_maliyet_plani t WHERE t.anahtar = 'genel'`),
    planKadrosu: await db.sorgu<SatirDegeri>(`SELECT ${kolonlar(PLAN_KADRO_ALANLARI)} FROM ik_maliyet_plani_kadrosu t ORDER BY t.sira`),
    donemler: donemler.map((d) => ({ satir: d, dilimler: ayir(dilimler, d['no']), primler: ayir(primler, d['no']), tesvikler: ayir(tesvikler, d['no']) })),
  };
}

// IK-80: İK ayarı hiç kaydedilmediyse null.
export async function resmiTatilListesi(db: Db): Promise<ResmiTatilSatiri[] | null> {
  if ((await db.tek("SELECT 1 AS var FROM ik_genel_ayar WHERE anahtar = 'genel'")) === null) return null;
  return db.sorgu<ResmiTatilSatiri>('SELECT yil, ay, gun, ad FROM ik_resmi_tatil ORDER BY sira');
}

export interface AyarYazimi {
  genel: SatirDegeri;
  tatiller: SatirDegeri[];
  belgeler: string[];
  kriterler: { kullanim: string; ad: string }[];
  soruSetleri: { satir: SatirDegeri; sorular: string[] }[];
  kanallar: SatirDegeri[];
  gorevler: SatirDegeri[];
  plan: SatirDegeri | null;
  planKadrosu: SatirDegeri[];
  // null: dönemlere dokunulmaz (ayar gövdesinde dönem listesi yoksa).
  donemler: { satir: SatirDegeri; dilimler: SatirDegeri[]; primler: SatirDegeri[]; tesvikler: SatirDegeri[] }[] | null;
}

async function satirlariYaz(db: Db, tabloAdi: string, alanlar: readonly Alan[], satirlar: readonly SatirDegeri[], on: Record<string, (r: SatirDegeri, i: number) => unknown>): Promise<void> {
  for (const [i, r] of satirlar.entries()) {
    const sutunlar: string[] = []; const yerler: string[] = []; const degerler: unknown[] = [];
    for (const [s, f] of Object.entries(on)) { degerler.push(f(r, i)); sutunlar.push(s); yerler.push(`$${degerler.length}`); }
    for (const a of alanlar) { degerler.push(r[a.s] ?? null); sutunlar.push(a.s); yerler.push(bagYaz(a, `$${degerler.length}`)); }
    await db.sorgu(`INSERT INTO ${tabloAdi} (${sutunlar.join(', ')}) VALUES (${yerler.join(', ')})`, degerler);
  }
}

// Ayarı sürüm koşuluyla yazar; null dönerse sürüm ilerlemiş. Listeler silinip yeniden yazılır; parametre dönemi koduyla
// güncellenir. Listede olmayan dönem silinir (kural, kilitli ve bordroya bağlı dönemin silinmesini önceden reddeder).
export async function ayarYaz(db: Db, a: AyarYazimi, surum: number | null, kisiId: number): Promise<number | null> {
  const g = GENEL_AYAR_ALANLARI;
  const degerler = g.map((al) => a.genel[al.s] ?? null);
  const r = surum === null
    ? await db.tek<{ surum: number }>(
      `INSERT INTO ik_genel_ayar (anahtar, ${g.map((x) => x.s).join(', ')}, guncelleyen_kisi_id)
       VALUES ('genel', ${g.map((_, i) => `$${i + 1}`).join(', ')}, $${g.length + 1}) ON CONFLICT (anahtar) DO NOTHING RETURNING surum`, [...degerler, kisiId])
    : await db.tek<{ surum: number }>(
      `UPDATE ik_genel_ayar SET ${g.map((x, i) => `${x.s} = $${i + 1}`).join(', ')}, surum = surum + 1, guncelleyen_kisi_id = $${g.length + 1}, guncelleme = now()
        WHERE anahtar = 'genel' AND surum = $${g.length + 2} RETURNING surum`, [...degerler, kisiId, surum]);
  if (!r) return null;
  for (const t of ['ik_resmi_tatil', 'ik_ozluk_belge_tanimi', 'ik_degerlendirme_kriteri', 'ik_soru_seti', 'ik_ilan_kanali', 'ik_gorev_durumu', 'ik_maliyet_plani_kadrosu', 'ik_maliyet_plani']) {
    await db.sorgu(`DELETE FROM ${t}`);
  }
  for (const [i, x] of a.tatiller.entries()) await db.sorgu('INSERT INTO ik_resmi_tatil (sira, yil, ay, gun, ad) VALUES ($1, $2, $3, $4, $5)', [i + 1, x['yil'] ?? null, x['ay'], x['gun'], x['ad'] ?? '']);
  for (const [i, ad] of a.belgeler.entries()) await db.sorgu('INSERT INTO ik_ozluk_belge_tanimi (sira, ad) VALUES ($1, $2)', [i + 1, ad]);
  const sayac = new Map<string, number>();
  for (const k of a.kriterler) {
    const sira = (sayac.get(k.kullanim) ?? 0) + 1;
    sayac.set(k.kullanim, sira);
    await db.sorgu('INSERT INTO ik_degerlendirme_kriteri (kullanim, sira, ad) VALUES ($1, $2, $3)', [k.kullanim, sira, k.ad]);
  }
  for (const [i, s] of a.soruSetleri.entries()) {
    const set = await db.tek<{ no: number }>(
      `INSERT INTO ik_soru_seti (sira, ${SORU_SETI_ALANLARI.map((x) => x.s).join(', ')}) VALUES ($1, ${SORU_SETI_ALANLARI.map((_, j) => `$${j + 2}`).join(', ')}) RETURNING no`,
      [i + 1, ...SORU_SETI_ALANLARI.map((x) => s.satir[x.s] ?? null)]);
    for (const [j, metin] of s.sorular.entries()) await db.sorgu('INSERT INTO ik_soru (set_no, sira, metin) VALUES ($1, $2, $3)', [set!.no, j + 1, metin]);
  }
  await satirlariYaz(db, 'ik_ilan_kanali', KANAL_ALANLARI, a.kanallar, { sira: (_, i) => i + 1 });
  await satirlariYaz(db, 'ik_gorev_durumu', GOREV_ALANLARI, a.gorevler, { anahtar: (x) => x['anahtar'] });
  if (a.plan) await satirlariYaz(db, 'ik_maliyet_plani', PLAN_ALANLARI, [a.plan], { anahtar: () => 'genel' });
  await satirlariYaz(db, 'ik_maliyet_plani_kadrosu', PLAN_KADRO_ALANLARI, a.planKadrosu, { sira: (_, i) => i + 1 });
  if (a.donemler !== null) {
    const D = DONEM_ALANLARI;
    for (const d of a.donemler) {
      const s = d.satir;
      const yaz = await db.tek<{ no: number }>(
        `INSERT INTO ik_parametre_donemi (kod, ad, baslangic, notu, ${D.map((x) => x.s).join(', ')})
         VALUES ($1, $2, $3, $4, ${D.map((_, i) => `$${i + 5}`).join(', ')})
         ON CONFLICT (kod) DO UPDATE SET ad = EXCLUDED.ad, baslangic = EXCLUDED.baslangic, notu = EXCLUDED.notu,
           ${D.map((x) => `${x.s} = EXCLUDED.${x.s}`).join(', ')} RETURNING no`,
        [s['kod'], s['ad'], s['baslangic'], s['notu'] ?? null, ...D.map((x) => s[x.s] ?? null)]);
      const no = yaz!.no;
      for (const t of ['ik_gelir_vergisi_dilimi', 'ik_prim_tanimi', 'ik_tesvik_tanimi']) await db.sorgu(`DELETE FROM ${t} WHERE donem_no = $1`, [no]);
      for (const [i, x] of d.dilimler.entries()) await db.sorgu('INSERT INTO ik_gelir_vergisi_dilimi (donem_no, sira, ust_sinir, oran) VALUES ($1, $2, $3, $4)', [no, i + 1, x['ust_sinir'] ?? null, x['oran']]);
      await satirlariYaz(db, 'ik_prim_tanimi', PRIM_ALANLARI, d.primler, { donem_no: () => no, sira: (_, i) => i + 1 });
      await satirlariYaz(db, 'ik_tesvik_tanimi', TESVIK_ALANLARI, d.tesvikler, { donem_no: () => no, sira: (_, i) => i + 1 });
    }
    const silinecek = await db.sorgu<{ no: number }>('SELECT no FROM ik_parametre_donemi WHERE NOT (kod = ANY($1::text[]))', [a.donemler.map((d) => d.satir['kod'])]);
    for (const { no } of silinecek) {
      for (const t of ['ik_gelir_vergisi_dilimi', 'ik_prim_tanimi', 'ik_tesvik_tanimi']) await db.sorgu(`DELETE FROM ${t} WHERE donem_no = $1`, [no]);
      await db.sorgu('DELETE FROM ik_parametre_donemi WHERE no = $1', [no]);
    }
  }
  return r.surum;
}

/* ---------------- geçmiş ---------------- */

export interface GecmisYazimi {
  kimlik: string | null;
  tur: string;
  islem: 'ekle' | 'guncelle' | 'sil' | 'geri' | 'ayarlar' | 'toplu';
  etiket: string;
  degisiklikler: Degisiklik[];
  notu: string | null;
  kisiId: number;
}

export interface GecmisAlani { alan: string; onceki: string | null; sonraki: string | null; buyuk: boolean }
export interface GecmisSatiri {
  no: string;
  kimlik: string | null;
  tur: string;
  islem: GecmisYazimi['islem'];
  etiket: string;
  notu: string | null;
  kisiId: number;
  zaman: string;
  alanlar: GecmisAlani[];
}

const GECMIS = `no::text AS no, kimlik, tur, islem, etiket, notu, kisi_id AS "kisiId", ${zamanMetni('zaman')} AS zaman`;

// Değer metni JSON yazımıdır (liste ve nesne alanları için); geri almada aynen çözülür.
export async function gecmisYaz(db: Db, g: GecmisYazimi): Promise<GecmisSatiri> {
  const r = (await db.tek<Omit<GecmisSatiri, 'alanlar'>>(
    `INSERT INTO ik_kayit_gecmisi (kimlik, tur, islem, etiket, notu, kisi_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${GECMIS}`,
    [g.kimlik, g.tur, g.islem, g.etiket, g.notu, g.kisiId]))!;
  const alanlar: GecmisAlani[] = [];
  for (const [i, d] of g.degisiklikler.entries()) {
    const a: GecmisAlani = { alan: d.f, onceki: d.big ? null : JSON.stringify(d.from ?? null), sonraki: d.big ? null : JSON.stringify(d.to ?? null), buyuk: d.big === true };
    await db.sorgu('INSERT INTO ik_kayit_gecmisi_alani (gecmis_no, sira, alan, onceki, sonraki, buyuk) VALUES ($1, $2, $3, $4, $5, $6)', [r.no, i + 1, a.alan, a.onceki, a.sonraki, a.buyuk]);
    alanlar.push(a);
  }
  return { ...r, alanlar };
}

export async function gecmis(db: Db, sinir: number): Promise<GecmisSatiri[]> {
  const satirlar = await db.sorgu<Omit<GecmisSatiri, 'alanlar'>>(`SELECT ${GECMIS} FROM ik_kayit_gecmisi ORDER BY zaman DESC, no DESC LIMIT $1`, [sinir]);
  const alanlar = await db.sorgu<GecmisAlani & { gecmisNo: string }>(
    'SELECT gecmis_no::text AS "gecmisNo", alan, onceki, sonraki, buyuk FROM ik_kayit_gecmisi_alani WHERE gecmis_no = ANY($1::bigint[]) ORDER BY gecmis_no, sira',
    [satirlar.map((s) => s.no)]);
  return satirlar.map((s) => ({ ...s, alanlar: alanlar.filter((a) => a.gecmisNo === s.no).map((a) => ({ alan: a.alan, onceki: a.onceki, sonraki: a.sonraki, buyuk: a.buyuk })) }));
}


/* Bordro onayı (IK-40..IK-46): yalnız ekleme defteri. Onay, bordronun o anki kesinleştirme sayısıyla (kayıt sürümü) yazılır;
   bordro yeniden kesinleşince sürüm artar ve eski onay geçerli sayılmaz. */

// Güncel kesinleştirmeye ait onaylar: bordro kimliği -> onay zamanı.
export async function gecerliBordroOnaylari(db: Db): Promise<Map<string, string>> {
  const satirlar = await db.sorgu<{ kimlik: string; zaman: string }>(
    `SELECT b.kimlik, ${zamanMetni('o.zaman')} AS zaman
       FROM ik_bordro_onayi o JOIN ik_bordro b ON b.no = o.bordro_no AND b.surum = o.kesinlestirme_sayisi`);
  return new Map(satirlar.map((r) => [r.kimlik, r.zaman]));
}

export async function bordroOnayiVarMi(db: Db, bordroKimlik: string, kesinlestirmeSayisi: number): Promise<boolean> {
  return (await db.tek(
    `SELECT 1 AS var FROM ik_bordro_onayi o JOIN ik_bordro b ON b.no = o.bordro_no WHERE b.kimlik = $1 AND o.kesinlestirme_sayisi = $2`,
    [bordroKimlik, kesinlestirmeSayisi])) !== null;
}

export async function bordroOnayiEkle(db: Db, bordroKimlik: string, kesinlestirmeSayisi: number, kisiId: number): Promise<string> {
  return (await db.tek<{ zaman: string }>(
    `INSERT INTO ik_bordro_onayi (bordro_no, personel_no, kisi_id, kesinlestirme_sayisi)
     SELECT b.no, b.personel_no, $3, $2 FROM ik_bordro b WHERE b.kimlik = $1
     RETURNING ${zamanMetni('zaman')} AS zaman`, [bordroKimlik, kesinlestirmeSayisi, kisiId]))!.zaman;
}

// Verilen gün onaylı izni (rapor dahil) süren, TMI kullanıcısına bağlı personelin kişi kimlikleri. İptal edilmiş izin ve personel sayılmaz.
export async function izinliKisiNolari(db: Db, tarih: string): Promise<number[]> {
  const satirlar = await db.sorgu<{ kisi_id: number }>(
    `SELECT DISTINCT p.kisi_id
       FROM ik_izin i JOIN ik_personel p ON p.no = i.personel_no
      WHERE i.durum = 'Onaylandı' AND NOT i.iptal AND NOT p.iptal AND p.kisi_id IS NOT NULL
        AND i.baslangic <= $1::date AND i.bitis >= $1::date
      ORDER BY p.kisi_id`,
    [tarih],
  );
  return satirlar.map((s) => s.kisi_id);
}

// IK-76: o gün verilen türlerden iptal edilmemiş devam satırı olan, TMI kullanıcısına bağlı personelin kişi kimlikleri (onay durumu fark etmez).
export async function gunDevamKisiNolari(db: Db, tarih: string, turler: readonly string[]): Promise<number[]> {
  const satirlar = await db.sorgu<{ kisi_id: number }>(
    `SELECT DISTINCT p.kisi_id
       FROM ik_devam d JOIN ik_personel p ON p.no = d.personel_no
      WHERE d.tarih = $1::date AND NOT d.iptal AND d.tur = ANY($2::text[]) AND NOT p.iptal AND p.kisi_id IS NOT NULL
      ORDER BY p.kisi_id`,
    [tarih, [...turler]],
  );
  return satirlar.map((s) => s.kisi_id);
}

// TMI kullanıcısına bağlı, iptal edilmemiş personelin numarası; bağ yoksa null (kisi_id tekildir, ik_personel_kisi_id_tek).
export async function kisininPersonelNo(db: Db, kisiId: number): Promise<number | null> {
  const r = await db.tek<{ no: number }>('SELECT no FROM ik_personel WHERE kisi_id = $1 AND NOT iptal', [kisiId]);
  return r?.no ?? null;
}

// Personelin [baslangic, bitis] günlerindeki iptal edilmemiş devam satırları, verilen türlerden. Saat girilmemişse null.
export async function personelDevamSatirlari(
  db: Db, personelNo: number, turler: readonly string[], baslangic: string, bitis: string,
): Promise<{ tarih: string; tur: string; saat: number | null; onay: string | null }[]> {
  const satirlar = await db.sorgu<{ tarih: string; tur: string; saat: string | null; onay: string | null }>(
    `SELECT tarih, tur, saat, onay FROM ik_devam
      WHERE personel_no = $1 AND NOT iptal AND tur = ANY($2::text[]) AND tarih >= $3::date AND tarih <= $4::date
      ORDER BY tarih, no`,
    [personelNo, [...turler], baslangic, bitis],
  );
  return satirlar.map((r) => ({ ...r, saat: r.saat === null ? null : Number(r.saat) }));
}

// Personelin [baslangic, bitis] ile kesişen iptal edilmemiş izinleri; gün girilmemişse null.
export async function personelIzinSatirlari(
  db: Db, personelNo: number, baslangic: string, bitis: string,
): Promise<{ tur: string; baslangic: string; bitis: string; gun: number | null; durum: string }[]> {
  const satirlar = await db.sorgu<{ tur: string; baslangic: string; bitis: string; gun: string | null; durum: string }>(
    `SELECT tur, baslangic, bitis, gun, durum FROM ik_izin
      WHERE personel_no = $1 AND NOT iptal AND baslangic <= $3::date AND bitis >= $2::date
      ORDER BY baslangic, no`,
    [personelNo, baslangic, bitis],
  );
  return satirlar.map((r) => ({ ...r, gun: r.gun === null ? null : Number(r.gun) }));
}

// Kişilerin [baslangic, bitis] ile kesişen iptal edilmemiş izinleri tek sorguda; personelIzinSatirlari ile aynı satırlar ve sıra.
// Personeli olup izni olmayan kişi tür alanı null tek satırla döner: "bağ var, izin yok" ile "bağ yok" ayrı kalır.
export async function kisilerinIzinSatirlari(
  db: Db, kisiIdleri: readonly number[], baslangic: string, bitis: string,
): Promise<{ kisi_id: number; tur: string | null; baslangic: string; bitis: string; gun: number | null; durum: string }[]> {
  const satirlar = await db.sorgu<{ kisi_id: number; tur: string | null; baslangic: string; bitis: string; gun: string | null; durum: string }>(
    `SELECT p.kisi_id, i.tur, i.baslangic, i.bitis, i.gun, i.durum
       FROM ik_personel p
       LEFT JOIN ik_izin i ON i.personel_no = p.no AND NOT i.iptal AND i.baslangic <= $3::date AND i.bitis >= $2::date
      WHERE p.kisi_id = ANY($1::int[]) AND NOT p.iptal
      ORDER BY p.kisi_id, i.baslangic, i.no`,
    [[...kisiIdleri], baslangic, bitis],
  );
  return satirlar.map((r) => ({ ...r, gun: r.gun === null ? null : Number(r.gun) }));
}

// Kişilerin İK çıkış tarihleri tek sorguda: iptal edilmemiş, kişiye bağlı personel; çıkışı girilmemiş personel null ile döner.
export function kisilerinCikisSatirlari(db: Db, kisiIdleri: readonly number[]): Promise<{ kisi_id: number; cikis_tarihi: string | null }[]> {
  return db.sorgu<{ kisi_id: number; cikis_tarihi: string | null }>(
    'SELECT kisi_id, cikis_tarihi FROM ik_personel WHERE kisi_id = ANY($1::int[]) AND NOT iptal ORDER BY kisi_id',
    [[...kisiIdleri]],
  );
}

export interface PersonelKartiSatiri {
  ad: string;
  soyad: string;
  sicil_no: string | null;
  pozisyon: string | null;
  departman: string | null;
  yonetici: string | null;
  ise_giris: string | null;
  calisma_sekli: string | null;
  telefon: string | null;
  eposta: string | null;
  adres: string | null;
  acil_kisi: string | null;
  acil_yakinlik: string | null;
  acil_telefon: string | null;
}

// Kişinin kendi kartından çalışana açık alanlar (ücret, kimlik no, banka, sağlık yok); bağ yoksa null.
export function kisininPersonelKartiSatiri(db: Db, kisiId: number): Promise<PersonelKartiSatiri | null> {
  return db.tek<PersonelKartiSatiri>(
    `SELECT p.ad, p.soyad, p.sicil_no, p.pozisyon, d.ad AS departman,
            CASE WHEN y.no IS NULL THEN NULL ELSE btrim(y.ad || ' ' || y.soyad) END AS yonetici,
            p.ise_giris::text AS ise_giris, p.calisma_sekli, p.telefon, p.eposta,
            NULLIF(concat_ws(', ', NULLIF(btrim(p.adres), ''), NULLIF(btrim(p.ilce), ''), NULLIF(btrim(p.il), '')), '') AS adres,
            p.acil_kisi, p.acil_yakinlik, p.acil_telefon
       FROM ik_personel p
       LEFT JOIN ik_departman d ON d.no = p.departman_no AND NOT d.iptal
       LEFT JOIN ik_personel y ON y.no = p.yonetici_no AND NOT y.iptal
      WHERE p.kisi_id = $1 AND NOT p.iptal`,
    [kisiId],
  );
}

/* ---------------- puantaj (kart #1571) ---------------- */

export interface PuantajSatiri {
  personel: string;
  tarih: string;
  durum: string;
  giris: string | null;
  cikis: string | null;
  aciklama: string | null;
  surum: number;
  yazan_kisi_id: number;
  yazildi: string;
}
const PUANTAJ_SECIMI = `p.kimlik AS personel, u.tarih::text AS tarih, u.durum, to_char(u.giris, 'HH24:MI') AS giris, to_char(u.cikis, 'HH24:MI') AS cikis,
  u.aciklama, u.surum, u.yazan_kisi_id, ${zamanMetni('u.yazildi')} AS yazildi`;

// Verilen personelin [baslangic, bitis] günlerindeki puantajı.
export function puantajSatirlari(db: Db, personeller: readonly string[], baslangic: string, bitis: string): Promise<PuantajSatiri[]> {
  return db.sorgu<PuantajSatiri>(
    `SELECT ${PUANTAJ_SECIMI} FROM ik_puantaj u JOIN ik_personel p ON p.no = u.personel_no
      WHERE p.kimlik = ANY($1::text[]) AND u.tarih >= $2::date AND u.tarih <= $3::date
      ORDER BY u.tarih, p.kimlik`,
    [[...personeller], baslangic, bitis],
  );
}

export function puantajKilitle(db: Db, personel: string, tarih: string): Promise<PuantajSatiri | null> {
  return db.tek<PuantajSatiri>(
    `SELECT ${PUANTAJ_SECIMI} FROM ik_puantaj u JOIN ik_personel p ON p.no = u.personel_no
      WHERE p.kimlik = $1 AND u.tarih = $2::date FOR UPDATE OF u`,
    [personel, tarih],
  );
}

export interface PuantajYazimi { personel: string; tarih: string; durum: string; giris: string | null; cikis: string | null; aciklama: string | null }

export async function puantajEkle(db: Db, y: PuantajYazimi, kisiId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO ik_puantaj (personel_no, tarih, durum, giris, cikis, aciklama, yazan_kisi_id)
     SELECT p.no, $2::date, $3, $4::time, $5::time, $6, $7 FROM ik_personel p WHERE p.kimlik = $1`,
    [y.personel, y.tarih, y.durum, y.giris, y.cikis, y.aciklama, kisiId],
  );
}

// Okunan sürümle koşullu yazma; sürüm tutmazsa satır dönmez.
export async function puantajGuncelle(db: Db, y: PuantajYazimi, surum: number, kisiId: number): Promise<boolean> {
  const r = await db.tek<{ no: number }>(
    `UPDATE ik_puantaj u SET durum = $3, giris = $4::time, cikis = $5::time, aciklama = $6, yazan_kisi_id = $7, yazildi = now(), surum = u.surum + 1
       FROM ik_personel p WHERE p.no = u.personel_no AND p.kimlik = $1 AND u.tarih = $2::date AND u.surum = $8 RETURNING u.no`,
    [y.personel, y.tarih, y.durum, y.giris, y.cikis, y.aciklama, kisiId, surum],
  );
  return r !== null;
}

export async function puantajSil(db: Db, personel: string, tarih: string, surum: number): Promise<boolean> {
  const r = await db.tek<{ no: number }>(
    `DELETE FROM ik_puantaj u USING ik_personel p WHERE p.no = u.personel_no AND p.kimlik = $1 AND u.tarih = $2::date AND u.surum = $3 RETURNING u.no`,
    [personel, tarih, surum],
  );
  return r !== null;
}

// Ayın bordrosu kesinleşmiş (iptal edilmemiş bordro kaydı olan) personelin kimlikleri.
export async function kesinlesmisPersoneller(db: Db, donem: string): Promise<Set<string>> {
  const satirlar = await db.sorgu<{ kimlik: string }>(
    `SELECT p.kimlik FROM ik_bordro b JOIN ik_personel p ON p.no = b.personel_no WHERE b.donem = $1::date AND NOT b.iptal`,
    [`${donem}-01`],
  );
  return new Set(satirlar.map((r) => r.kimlik));
}

// Takvim (891): başlangıcı [baslangic, bitis] içinde olan, iptal ve red edilmemiş izinler, personelin adıyla; başlangıç sırasıyla.
// gecti: bitiş günü bugünden (tesis günü) önce.
// kisiId verilirse yalnız o kişiye bağlı personelin izinleri (ik_personel.kisi_id).
export function takvimIzinSatirlari(db: Db, baslangic: string, bitis: string, kisiId: number | null): Promise<{
  kimlik: string; tur: string; baslangic: string; gun: string | null; durum: string; ad: string; soyad: string; gecti: boolean;
}[]> {
  return db.sorgu(
    `SELECT i.kimlik, i.tur, i.baslangic, i.gun, i.durum, p.ad, p.soyad, i.bitis < current_date AS gecti
       FROM ik_izin i JOIN ik_personel p ON p.no = i.personel_no
      WHERE NOT i.iptal AND NOT p.iptal AND i.durum NOT IN ('Reddedildi', 'İptal') AND i.baslangic BETWEEN $1::date AND $2::date
        AND ($3::int IS NULL OR p.kisi_id = $3::int)
      ORDER BY i.baslangic, i.no`,
    [baslangic, bitis, kisiId],
  );
}
