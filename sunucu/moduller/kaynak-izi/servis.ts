import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Istasyon360Cevabi, Kisi360Cevabi, KaynakAramaCevabi, Makine360Cevabi } from '#paylasilan/sozlesme/kaynak-izi.ts';
import { KAYNAK_ARAMA_EN_COK } from '#paylasilan/sozlesme/kaynak-izi.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { birimMaliyetleri } from '../finans/disari.ts';
import { izinliKisiler } from '../ik/disari.ts';
import {
  isMerkezleri, istasyonGetir, istasyonKisiAtamalari, istasyonYetkinlikleri, istasyonlar, makineDurumlari, makineGetir, makineKisiAtamalari,
  makineYetkinlikleri, makineler,
} from '../istasyonlar/disari.ts';
import { kisiAdlari, kisiGorevi, kisiSecenekleri } from '../kisiler/disari.ts';
import { istasyonOeeleri } from '../oee/disari.ts';
import { kisininIsEmirleri } from '../uretim-emirleri/disari.ts';
import { kisiVardiyalari, vardiyaTanimlari } from '../vardiya/disari.ts';
import { bolumGorunur, gorunurBolumler, kaynakSuz, sonYediGun, type AramaAdayi } from './kurallar.ts';

const IS_SINIRI = 20;
const YEDI_GUN_MS = 7 * 24 * 3600 * 1000;
const KAYNAK_YOK = 'Kaynak bulunamadı.';

const ozet = (tur: 'istasyon' | 'makine', k: { id: number; kod: string; ad: string; aktif: boolean }) => ({ tur, id: k.id, kod: k.kod, ad: k.ad, aktif: k.aktif });
const kisiOzeti = (id: number, ad: string, aktif: boolean) => ({ tur: 'kisi' as const, id, kod: null, ad, aktif });

// Kişi adları pasif kişide de bulunur; aktiflik etkin kişi listesinden okunur.
async function kisiBilgileri(db: Db, idler: number[]): Promise<{ ad: (id: number) => string; aktif: (id: number) => boolean }> {
  const adlar = await kisiAdlari(db, idler);
  const etkin = new Set((await kisiSecenekleri(db)).map((k) => k.id));
  return { ad: (id) => adlar.get(id) ?? '', aktif: (id) => etkin.has(id) };
}

export async function kaynakAra(db: Db, metin: string): Promise<KaynakAramaCevabi> {
  const merkezler = new Map((await isMerkezleri(db, { pasiflerDahil: true })).map((m) => [m.id, m.kod]));
  const ist = await istasyonlar(db, { pasiflerDahil: true });
  const istKod = new Map(ist.map((i) => [i.id, i.kod]));
  const adaylar: AramaAdayi[] = [
    ...ist.map((i) => ({ tur: 'istasyon' as const, id: i.id, kod: i.kod, ad: i.ad, aktif: i.aktif, ust: i.isMerkeziId === null ? null : merkezler.get(i.isMerkeziId) ?? null })),
    ...(await makineler(db, { pasiflerDahil: true })).map((m) => ({
      tur: 'makine' as const, id: m.id, kod: m.kod, ad: m.ad, aktif: m.aktif, ust: m.istasyonId === null ? null : istKod.get(m.istasyonId) ?? null,
    })),
    ...(await kisiSecenekleri(db)).map((k) => ({ tur: 'kisi' as const, id: k.id, kod: k.sicilNo, ad: k.ad, aktif: true, ust: null })),
  ];
  const uyan = kaynakSuz(adaylar, metin);
  return { satirlar: uyan.slice(0, KAYNAK_ARAMA_EN_COK), dahaVar: uyan.length > KAYNAK_ARAMA_EN_COK };
}

async function oeeOzeti(db: Db, k: Kullanici, istasyonId: number) {
  const pencere = sonYediGun(tesisGunu(new Date()));
  const s = (await istasyonOeeleri(db, k, pencere)).find((x) => x.id === istasyonId);
  return { ...pencere, oee: s?.oee ?? null, kullanilabilirlik: s?.kullanilabilirlik ?? null, performans: s?.performans ?? null, kalite: s?.kalite ?? null };
}

async function maliyet(db: Db, tur: 'istasyon' | 'kisi', id: number) {
  const m = (await birimMaliyetleri(db, tur)).get(id);
  return m ? { saatMaliyeti: m.birimMaliyet, paraBirimi: m.paraBirimi } : null;
}

export async function istasyon360(db: Db, k: Kullanici, id: number): Promise<Istasyon360Cevabi> {
  const ist = await istasyonGetir(db, id);
  if (ist === null) throw bulunamadi(KAYNAK_YOK);
  const merkez = ist.isMerkeziId === null ? undefined : (await isMerkezleri(db, { pasiflerDahil: true })).find((m) => m.id === ist.isMerkeziId);
  let tesis: Istasyon360Cevabi['tesis'] = null;
  if (bolumGorunur(k.islemler, 'tesis')) {
    const durumlar = new Map((await makineDurumlari(db)).map((d) => [d.makineId, d]));
    const atamalar = await istasyonKisiAtamalari(db, { istasyonId: id });
    const yetkin = (await istasyonYetkinlikleri(db)).filter((y) => y.istasyonId === id).map((y) => y.kisiId);
    const kisi = await kisiBilgileri(db, [...atamalar.map((a) => a.kisiId), ...yetkin]);
    tesis = {
      makineler: (await makineler(db, { pasiflerDahil: true })).filter((m) => m.istasyonId === id).map((m) => {
        const d = durumlar.get(m.id);
        return { ...ozet('makine', m), durum: d ? { durum: d.durum, aciklama: d.aciklama, degisme: d.degisme } : null };
      }),
      atananlar: atamalar.map((a) => ({ kisiId: a.kisiId, ad: kisi.ad(a.kisiId), yuzde: a.yuzde })),
      yetkinler: yetkin.map((kisiId) => ({ kisiId, ad: kisi.ad(kisiId) })),
    };
  }
  return {
    kaynak: ozet('istasyon', ist),
    isMerkezi: merkez ? { id: merkez.id, kod: merkez.kod, ad: merkez.ad, aktif: merkez.aktif } : null,
    tesis,
    oee: bolumGorunur(k.islemler, 'oee') ? await oeeOzeti(db, k, id) : null,
    maliyet: bolumGorunur(k.islemler, 'maliyet') ? await maliyet(db, 'istasyon', id) : null,
    gorunurBolumler: gorunurBolumler(k.islemler),
  };
}

export async function makine360(db: Db, k: Kullanici, id: number): Promise<Makine360Cevabi> {
  const m = await makineGetir(db, id);
  if (m === null) throw bulunamadi(KAYNAK_YOK);
  const ist = m.istasyonId === null ? null : await istasyonGetir(db, m.istasyonId);
  let tesis: Makine360Cevabi['tesis'] = null;
  if (bolumGorunur(k.islemler, 'tesis')) {
    const d = (await makineDurumlari(db)).find((x) => x.makineId === id);
    const atamalar = await makineKisiAtamalari(db, { makineId: id });
    const yetkin = (await makineYetkinlikleri(db)).filter((y) => y.makineId === id).map((y) => y.kisiId);
    const kisi = await kisiBilgileri(db, [...atamalar.map((a) => a.kisiId), ...yetkin]);
    tesis = {
      durum: d ? { durum: d.durum, aciklama: d.aciklama, degisme: d.degisme } : null,
      atananlar: atamalar.map((a) => ({ kisiId: a.kisiId, ad: kisi.ad(a.kisiId), yuzde: a.yuzde })),
      yetkinler: yetkin.map((kisiId) => ({ kisiId, ad: kisi.ad(kisiId) })),
    };
  }
  return { kaynak: ozet('makine', m), istasyon: ist ? ozet('istasyon', ist) : null, tesis, gorunurBolumler: gorunurBolumler(k.islemler) };
}

export async function kisi360(db: Db, k: Kullanici, id: number): Promise<Kisi360Cevabi> {
  const kisi = await kisiBilgileri(db, [id]);
  if (kisi.ad(id) === '') throw bulunamadi(KAYNAK_YOK);
  let tesis: Kisi360Cevabi['tesis'] = null;
  if (bolumGorunur(k.islemler, 'tesis')) {
    const ist = new Map((await istasyonlar(db, { pasiflerDahil: true })).map((i) => [i.id, i]));
    const mak = new Map((await makineler(db, { pasiflerDahil: true })).map((m) => [m.id, m]));
    const atamalar = [
      ...(await istasyonKisiAtamalari(db, { kisiId: id })).flatMap((a) => {
        const i = ist.get(a.istasyonId);
        return i ? [{ tur: 'istasyon' as const, id: i.id, kod: i.kod, ad: i.ad, yuzde: a.yuzde }] : [];
      }),
      ...(await makineKisiAtamalari(db, { kisiId: id })).flatMap((a) => {
        const m = mak.get(a.makineId);
        return m ? [{ tur: 'makine' as const, id: m.id, kod: m.kod, ad: m.ad, yuzde: a.yuzde }] : [];
      }),
    ];
    tesis = {
      atamalar,
      istasyonYetkinlikleri: (await istasyonYetkinlikleri(db)).filter((y) => y.kisiId === id).flatMap((y) => {
        const i = ist.get(y.istasyonId);
        return i ? [ozet('istasyon', i)] : [];
      }),
      makineYetkinlikleri: (await makineYetkinlikleri(db)).filter((y) => y.kisiId === id).flatMap((y) => {
        const m = mak.get(y.makineId);
        return m ? [ozet('makine', m)] : [];
      }),
    };
  }
  let vardiya: Kisi360Cevabi['vardiya'] = null;
  if (bolumGorunur(k.islemler, 'vardiya')) {
    const vid = (await kisiVardiyalari(db)).find((v) => v.kisiId === id)?.vardiyaId;
    const v = vid === undefined ? undefined : (await vardiyaTanimlari(db)).find((x) => x.id === vid);
    vardiya = v ? { vardiyaId: v.id, ad: v.ad, baslangic: v.baslangic, bitis: v.bitis } : null;
  }
  const simdi = Date.now();
  const isler = bolumGorunur(k.islemler, 'isler')
    ? (await kisininIsEmirleri(db, id, new Date(simdi - YEDI_GUN_MS).toISOString(), new Date(simdi).toISOString())).slice(0, IS_SINIRI)
      .map((i) => ({ isEmriId: i.isEmriId, emirNo: i.emirNo, parca: `${i.urun.parcaNo} ${i.urun.parcaAd}`.trim(), saglam: i.saglam, hurda: i.hurda }))
    : null;
  return {
    kaynak: kisiOzeti(id, kisi.ad(id), kisi.aktif(id)),
    gorev: await kisiGorevi(db, id),
    tesis,
    vardiya,
    izin: bolumGorunur(k.islemler, 'izin') ? { bugunIzinli: (await izinliKisiler(db, tesisGunu(new Date()))).includes(id) } : null,
    isler,
    maliyet: bolumGorunur(k.islemler, 'maliyet') ? await maliyet(db, 'kisi', id) : null,
    gorunurBolumler: gorunurBolumler(k.islemler),
  };
}
