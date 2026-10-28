import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi, bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import { kapsamDisiysaReddet, kapsamdaMi, kapsamSuzgeci, kisininKapsami } from '#cekirdek/kapsam.ts';
import type { Kapsam } from '#cekirdek/kapsam.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { z } from 'zod';
import { KAPSAM_DISI_ILETISI } from '#paylasilan/hata.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type {
  FazlaMesai, FazlaMesaiGirdisi, GunlukMesaiCevabi, KaynakTakvimi, KisiVardiyasiTopluGovdesi, MatrisKopyalaGovdesi, MatrisTopluGovdesi, TopluRetAyrintisi, TakvimAraligi, KaynakTuru, KisiVardiyasiGovdesi, MatrisGovdesi, PlanliDurus, PlanliDurusGirdisi, PlanliDurusListeSorgusu, TakvimCevabi, TakvimGunuGovdesi,
  Vardiya, VardiyaGirdisi, VardiyaGuncelleGirdisi, VardiyaPersoneliCevabi,
} from '#paylasilan/sozlesme/vardiya.ts';
import { AZAMI_TAKVIM_GUNU, takvimGunuGovdesi } from '#paylasilan/sozlesme/vardiya.ts';
import type { planliDurusListeSorgusu } from '#paylasilan/sozlesme/vardiya.ts';
import type { TakvimKaydi } from '#paylasilan/sozlesme/takvim.ts';
import { durusNedeniGetir } from '../durus-nedenleri/disari.ts';
import { kisilerinCikisTarihleri, kisilerinIzinleri, resmiTatilGunleri } from '../ik/disari.ts';
import {
  aktifMakineler, calisirMakineler, ekipler, ekipUyeleri, isMerkezleri, istasyonAdlari, istasyonGetir, istasyonKisiAtamalari, istasyonlar, kisininIzinliIsMerkezleri, makineGetir,
  makineKisiAtamalari,
} from '../istasyonlar/disari.ts';
import {
  aralik, araliklardanCikar, atamaPayi, ayrildiMi, fazlaMesaiKisiHatasi, onayliIzinGunleri, durusAraliklari, durusHatasi, durusuDuzenle, fazlaMesaiHatasi, fazlaMesaiUyanlar, fazlaMesaiVardiyasi, gecmisMi, gunFarki, gunNetDakikasi, gunNetDakikasiEk, gununCalismaAraliklari, gununMolaAraliklari, izinliKisim, gununSonDakikasi, gununVardiyalari, haftaKopyasi, kaynagaUyanlar, kisiTakvimiGorunur, topluMatris,
  kisininIstasyonu, molaDenetle, netDakika, sonCalismaGunu, takvimAraliklari, takvimGunleriniBirlestir, tarihEkle, vardiyaKadrosu as kadroHesapla,
} from './kurallar.ts';
import type { KadroAtamasi, KadroSatiri, MatrisSatiri, TakvimGunu } from './kurallar.ts';
import { kisiAdlari, kisileriListele } from '../kisiler/disari.ts';
import * as s from './sorgular.ts';

const GECMIS = 'vardiya.gecmis-yaz';
const VARDIYA_YOK = 'Vardiya bulunamadı.';
const VARDIYA_KISITLARI = {
  vardiya_ad_tekil: { ileti: 'Bu adda bir vardiya var.', alan: 'ad' },
} as const;
const MATRIS_KISITLARI = {
  vardiya_matrisi_is_merkezi_fk: { ileti: 'İş merkezi bulunamadı.', alan: 'isMerkeziId' },
  vardiya_matrisi_vardiya_fk: { ileti: VARDIYA_YOK, alan: 'vardiyaId' },
} as const;
const KISI_KISITLARI = {
  vardiya_kisi_kisi_fk: { ileti: 'Kişi bulunamadı.', alan: 'kisiId' },
  vardiya_kisi_vardiya_fk: { ileti: VARDIYA_YOK, alan: 'vardiyaId' },
} as const;

async function vardiyaListesi(db: Db): Promise<Vardiya[]> {
  const ms = await s.molalar(db);
  return (await s.vardiyalar(db)).map((v) => {
    const molalar = ms.filter((m) => m.vardiyaId === v.id).map(({ baslangic, bitis }) => ({ baslangic, bitis }));
    return { ...v, molalar, netDakika: netDakika(v.baslangic, v.bitis, molalar) };
  });
}

// VR-17 (A7, #517): vardiyaların tek kaynağı bu modüldür; Arkon vardiyaları buradan okur. Pasifler dahil, çağıran süzer.
export function vardiyaTanimlari(db: Db): Promise<Vardiya[]> {
  return vardiyaListesi(db);
}

// Kadronun atamaları: bugün geçerli istasyon, makine ve ekip atamaları, aktif kişi ve aktif istasyon (makine, ekip) üzerinden iş merkezine.
async function kadroAtamalari(db: Db): Promise<KadroAtamasi[]> {
  const merkezi = new Map((await istasyonlar(db, { pasiflerDahil: false })).flatMap((i) => (i.isMerkeziId === null ? [] : [[i.id, i.isMerkeziId] as const])));
  const aktif = new Set((await kisileriListele(db)).filter((k) => k.aktif).map((k) => k.id));
  const makineIstasyonu = new Map((await aktifMakineler(db)).map((m) => [m.id, m.istasyonId]));
  const satirlar: { kisiId: number; istasyonId: number | null | undefined; yuzde: string }[] = [
    ...(await istasyonKisiAtamalari(db)).map((a) => ({ kisiId: a.kisiId, istasyonId: a.istasyonId, yuzde: a.yuzde })),
    ...(await makineKisiAtamalari(db)).map((a) => ({ kisiId: a.kisiId, istasyonId: makineIstasyonu.get(a.makineId), yuzde: a.yuzde })),
  ];
  for (const e of await ekipler(db)) {
    for (const u of await ekipUyeleri(db, e.id)) satirlar.push({ kisiId: u.kisiId, istasyonId: e.istasyonId, yuzde: u.yuzde });
  }
  return satirlar.flatMap((a) => {
    const isMerkeziId = a.istasyonId == null ? undefined : merkezi.get(a.istasyonId);
    return isMerkeziId === undefined || !aktif.has(a.kisiId) ? [] : [{ kisiId: a.kisiId, isMerkeziId, yuzde: a.yuzde }];
  });
}

// Tek tanım (kullanıcı kararı "Tek tanım"): iş merkezi x vardiya kadrosu. İstasyonlar ve Vardiya ekranları, kapasite ve OEE bunu okur.
export async function vardiyaKadrosu(db: Db): Promise<KadroSatiri[]> {
  const aktifVardiya = new Set((await vardiyaListesi(db)).filter((v) => v.aktif).map((v) => v.id));
  const kisiVardiyasi = new Map((await s.kisiVardiyalari(db)).filter((k) => aktifVardiya.has(k.vardiyaId)).map((k) => [k.kisiId, k.vardiyaId]));
  const acik = (await s.matris(db)).filter((x) => aktifVardiya.has(x.vardiyaId));
  return kadroHesapla(await kadroAtamalari(db), kisiVardiyasi, acik);
}

// Kişi payı (kart #1324) tek tanımla: iş merkezi başına kişinin istasyon, makine ve ekip atama yüzdelerinin toplamı, sent olarak.
export async function isMerkeziKisiPaylari(db: Db): Promise<Map<number, Map<number, number>>> {
  const sonuc = new Map<number, Map<number, number>>();
  for (const a of await kadroAtamalari(db)) {
    const l = sonuc.get(a.isMerkeziId) ?? new Map<number, number>();
    l.set(a.kisiId, (l.get(a.kisiId) ?? 0) + Math.round(Number(a.yuzde) * 100));
    sonuc.set(a.isMerkeziId, l);
  }
  return sonuc;
}

// Çalışan makine (tek tanım): iş merkezinin aktif, arızada ya da bakımda olmayan makineleri (durumu girilmemiş çalışır sayılır, IS-01).
export async function calisirMakineSayilari(db: Db): Promise<Map<number, number>> {
  const sonuc = new Map<number, number>();
  for (const i of await istasyonlar(db, { pasiflerDahil: false })) {
    if (i.isMerkeziId === null) continue;
    sonuc.set(i.isMerkeziId, (sonuc.get(i.isMerkeziId) ?? 0) + (await calisirMakineler(db, i.id)).length);
  }
  return sonuc;
}

// VR-28: takvim günleri = Vardiya'nın kendi günleri + İK'nın resmî tatilleri (aralık iki ucu dahil). Aralıksız okuma (takvim ekranı,
// `takvimGunleri`) İK tatillerini geçen yılın başından gelecek yılın sonuna kadar açar: her yıl tekrarlayan tatilin sonu yoktur.
async function gunleriOku(db: Db, baslangic?: string, bitis?: string): Promise<TakvimGunu[]> {
  let bas = baslangic; let bit = bitis;
  if (bas === undefined || bit === undefined) {
    const yil = Number((await s.bugun(db)).slice(0, 4));
    bas = `${String(yil - 1)}-01-01`; bit = `${String(yil + 1)}-12-31`;
  }
  return takvimGunleriniBirlestir(await s.gunler(db), await resmiTatilGunleri(db, bas, bit));
}

export async function takvim(db: Db): Promise<TakvimCevabi> {
  const vardiyalar = await vardiyaListesi(db);
  const matris = await s.matris(db);
  const harita = new Map(vardiyalar.map((v) => [v.id, v]));
  const haftalik = (isMerkeziId: number) =>
    matris.filter((x) => x.isMerkeziId === isMerkeziId).reduce((t, x) => { const v = harita.get(x.vardiyaId); return v?.aktif ? t + v.netDakika : t; }, 0);
  return {
    vardiyalar,
    matris,
    gunler: await gunleriOku(db),
    isMerkezleri: (await isMerkezleri(db, { pasiflerDahil: true })).map((m) => ({ id: m.id, kod: m.kod, ad: m.ad, aktif: m.aktif, haftalikDakika: haftalik(m.id) })),
    kisiVardiyalari: await s.kisiVardiyalari(db),
    kadro: (await vardiyaKadrosu(db)).map(({ isMerkeziId, vardiyaId, kisiIdleri }) => ({ isMerkeziId, vardiyaId, kisiIdleri })),
    bugun: await s.bugun(db),
  };
}

const kapsamiAl = (db: Db, kullanici: Kullanici): Promise<Kapsam> => kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);

// VR-09: vardiya tanımı, tatil ve kapalı gün ile haftayı uygula bütün iş merkezlerini değiştirir: yalnız iş merkezi kısıtı olmayan kişi yazar.
async function tesisGeneliDenetle(db: Db, kullanici: Kullanici): Promise<void> {
  if (kapsamSuzgeci(await kapsamiAl(db, kullanici)) !== null) {
    throw yetkiYok('Bütün iş merkezlerini etkileyen takvim değişikliği için iş merkezi kısıtın olmamalı.');
  }
}

// VR-03: bugünden önceki takvim günü ancak geçmiş yazma işlemiyle değişir.
async function gecmisDenetle(db: Db, kullanici: Kullanici, tarih: string): Promise<void> {
  if (gecmisMi(tarih, await s.bugun(db)) && !kullanici.islemler.includes(GECMIS)) {
    throw yetkiYok('Geçmiş tarihli takvim değişikliği için yetkin yok.');
  }
}

function vardiyaDenetle(v: { baslangic: string; bitis: string; molalar: readonly { baslangic: string; bitis: string }[] }): void {
  if (v.baslangic === v.bitis) throw dogrulama('Başlangıç ve bitiş aynı olamaz.', 'bitis');
  const hata = molaDenetle(v.baslangic, v.bitis, v.molalar);
  if (hata) throw dogrulama(hata, 'molalar');
}

export async function vardiyaEkle(db: Db, kullanici: Kullanici, v: VardiyaGirdisi): Promise<TakvimCevabi> {
  await tesisGeneliDenetle(db, kullanici);
  vardiyaDenetle(v);
  const id = await kisitKorumali(VARDIYA_KISITLARI, () => s.vardiyaEkle(db, v));
  await s.molalariYaz(db, id, v.molalar);
  return takvim(db);
}

export async function vardiyaGuncelle(db: Db, kullanici: Kullanici, id: number, v: VardiyaGuncelleGirdisi): Promise<TakvimCevabi> {
  await tesisGeneliDenetle(db, kullanici);
  vardiyaDenetle(v);
  await kisitKorumali(VARDIYA_KISITLARI, () => surumluGuncelle({
    guncelle: () => s.vardiyaGuncelle(db, id, v),
    varMi: () => s.vardiyaVarMi(db, id),
    bulunamadiIletisi: VARDIYA_YOK,
  }));
  await s.molalariYaz(db, id, v.molalar);
  return takvim(db);
}

// Matris hücresi iş merkezine bağlıdır: kapsam dışı iş merkezine yazılmaz.
export async function matrisYaz(db: Db, kullanici: Kullanici, g: MatrisGovdesi): Promise<TakvimCevabi> {
  kapsamDisiysaReddet(await kapsamiAl(db, kullanici), g.isMerkeziId);
  await kisitKorumali(MATRIS_KISITLARI, () => s.matrisYaz(db, g.isMerkeziId, g.gun, g.vardiyaId, g.acik));
  return takvim(db);
}

// VR-06: kaynak iş merkezinin haftası bütün öbür aktif iş merkezlerine kopyalanır; pasif iş merkezinin düzeni değişmez.
export async function haftaUygula(db: Db, kullanici: Kullanici, kaynakIsMerkeziId: number): Promise<TakvimCevabi> {
  await tesisGeneliDenetle(db, kullanici);
  const merkezler = await isMerkezleri(db, { pasiflerDahil: true });
  if (!merkezler.some((m) => m.id === kaynakIsMerkeziId)) throw bulunamadi('İş merkezi bulunamadı.');
  await s.matrisiKilitle(db);
  const hedefler = merkezler.filter((m) => m.aktif && m.id !== kaynakIsMerkeziId).map((m) => m.id);
  await s.matrisiYenidenYaz(db, hedefler, haftaKopyasi(await s.matris(db), kaynakIsMerkeziId, hedefler));
  return takvim(db);
}

// Toplu komut kapsam dışı kayıtta tek 403 verir; ayrıntı reddedilen kayıtları sayar, ekran nedeni satıra yazar. Hiçbiri yazılmaz.
function topluKapsamDisi(ayrinti: TopluRetAyrintisi): UygulamaHatasi {
  return new UygulamaHatasi('YETKI_YOK', KAPSAM_DISI_ILETISI, { ayrinti });
}

// Hedef iş merkezleri var olmalı ve kişinin kapsamında olmalı; olmayan 400, kapsam dışı 403 (ikisi de kayıtlarıyla).
async function hedefMerkezleriDenetle(db: Db, kullanici: Kullanici, hedefler: readonly number[], alan: string): Promise<void> {
  const varolan = new Set((await isMerkezleri(db, { pasiflerDahil: true })).map((m) => m.id));
  const olmayan = hedefler.filter((h) => !varolan.has(h));
  if (olmayan.length) throw dogrulama('İş merkezi bulunamadı.', alan, { isMerkeziIdleri: olmayan } satisfies TopluRetAyrintisi);
  const kapsam = await kapsamiAl(db, kullanici);
  const disi = hedefler.filter((h) => !kapsamdaMi(kapsam, h));
  if (disi.length) throw topluKapsamDisi({ isMerkeziIdleri: disi });
}

// VR-18: seçilen iş merkezleri ve günlerde toplu vardiya; tek kilit, tek yazım (hepsi ya da hiçbiri).
export async function matrisTopluYaz(db: Db, kullanici: Kullanici, g: MatrisTopluGovdesi): Promise<TakvimCevabi> {
  await hedefMerkezleriDenetle(db, kullanici, g.isMerkeziIdleri, 'isMerkeziIdleri');
  await s.matrisiKilitle(db);
  const yeni = topluMatris(await s.matris(db), g.isMerkeziIdleri, g.gunler, g.vardiyaIdleri, g.kip);
  await kisitKorumali(MATRIS_KISITLARI, () => s.matrisiYenidenYaz(db, g.isMerkeziIdleri, yeni));
  return takvim(db);
}

// VR-19: kaynak haftası yalnız seçilen hedeflere kopyalanır; tesis geneli değildir, her hedef kişinin kapsamında olmalı.
export async function matrisKopyala(db: Db, kullanici: Kullanici, g: MatrisKopyalaGovdesi): Promise<TakvimCevabi> {
  if (g.hedefIsMerkeziIdleri.includes(g.kaynakIsMerkeziId)) throw dogrulama('Kaynak iş merkezi hedeflerde olamaz.', 'hedefIsMerkeziIdleri');
  if (!(await isMerkezleri(db, { pasiflerDahil: true })).some((m) => m.id === g.kaynakIsMerkeziId)) throw bulunamadi('İş merkezi bulunamadı.');
  await hedefMerkezleriDenetle(db, kullanici, g.hedefIsMerkeziIdleri, 'hedefIsMerkeziIdleri');
  await s.matrisiKilitle(db);
  await s.matrisiYenidenYaz(db, g.hedefIsMerkeziIdleri, haftaKopyasi(await s.matris(db), g.kaynakIsMerkeziId, g.hedefIsMerkeziIdleri));
  return takvim(db);
}

export async function gunYaz(db: Db, kullanici: Kullanici, girdi: TakvimGunuGovdesi): Promise<TakvimCevabi> {
  const g = takvimGunuGovdesi.parse(girdi);
  // VR-28: Vardiya yalnız kapalı gün yazar; resmî tatil İK ayarlarından girilir.
  if (g.tur === 'tatil') throw dogrulama('Resmî tatiller İK ayarlarından girilir; burada yalnız kapalı gün eklenir.', 'tur');
  await tesisGeneliDenetle(db, kullanici);
  await gecmisDenetle(db, kullanici, g.tarih);
  await s.gunYaz(db, g);
  return takvim(db);
}

export async function gunSil(db: Db, kullanici: Kullanici, tarih: string): Promise<TakvimCevabi> {
  await tesisGeneliDenetle(db, kullanici);
  await gecmisDenetle(db, kullanici, tarih);
  if (!(await s.gunSil(db, tarih))) throw bulunamadi('Takvim günü bulunamadı.');
  return takvim(db);
}

// VR-10: Vardiya'nın bütün günleri silinir (İK tatilleri kalır); geçmiş tarihli olanlar yalnız geçmiş yazma işlemiyle, yoksa kalır.
export async function tatilleriTemizle(db: Db, kullanici: Kullanici): Promise<TakvimCevabi> {
  await tesisGeneliDenetle(db, kullanici);
  await s.gunleriSil(db, kullanici.islemler.includes(GECMIS) ? null : await s.bugun(db));
  return takvim(db);
}

// VR-08: kişinin vardiyası kişinin iş merkezi kapsamında yazılır (iş merkezi yoksa herkesin kapsamındadır).
export async function kisiVardiyasiBelirle(db: Db, kullanici: Kullanici, kisiId: number, g: KisiVardiyasiGovdesi): Promise<TakvimCevabi> {
  kapsamDisiysaReddet(await kapsamiAl(db, kullanici), await kisininIsMerkezi(db, kisiId));
  await kisitKorumali(KISI_KISITLARI, () => s.kisiVardiyasiYaz(db, kisiId, g.vardiyaId));
  return takvim(db);
}

// VR-20: seçilen kişilerin vardiyası tek komutla; kişilerden biri kapsam dışıysa hiçbiri yazılmaz (VR-08 kapsamı her kişide).
export async function kisiVardiyasiTopluBelirle(db: Db, kullanici: Kullanici, g: KisiVardiyasiTopluGovdesi): Promise<TakvimCevabi> {
  const kapsam = await kapsamiAl(db, kullanici);
  const merkezi = await kisilerinIsMerkezi(db, g.kisiIdleri);
  const disi = g.kisiIdleri.filter((k) => !kapsamdaMi(kapsam, merkezi.get(k) ?? null));
  if (disi.length) throw topluKapsamDisi({ kisiIdleri: disi });
  await kisitKorumali(KISI_KISITLARI, () => s.kisiVardiyalariYaz(db, g.kisiIdleri, g.vardiyaId));
  return takvim(db);
}

async function kisilerinIsMerkezi(db: Db, kisiIdleri: readonly number[]): Promise<Map<number, number | null>> {
  const atamalar = await istasyonKisiAtamalari(db);
  const istasyonMerkezi = new Map((await istasyonlar(db, { pasiflerDahil: true })).map((i) => [i.id, i.isMerkeziId]));
  return new Map(kisiIdleri.map((k) => {
    const istasyonId = kisininIstasyonu(atamalar.filter((a) => a.kisiId === k));
    return [k, istasyonId === null ? null : istasyonMerkezi.get(istasyonId) ?? null];
  }));
}

async function kisininIsMerkezi(db: Db, kisiId: number): Promise<number | null> {
  const istasyonId = kisininIstasyonu(await istasyonKisiAtamalari(db, { kisiId }));
  if (istasyonId === null) return null;
  return (await istasyonlar(db, { pasiflerDahil: true })).find((i) => i.id === istasyonId)?.isMerkeziId ?? null;
}

interface KisiIstasyonu { kisiId: number; istasyonId: number; yuzde: string }

// Kişinin istasyonu önce istasyon atamasından, yoksa makine ve ekip atamasının istasyonundan bulunur (pasif makine ve ekip sayılmaz).
async function kisiAtamalari(db: Db): Promise<{ istasyon: KisiIstasyonu[]; digerleri: KisiIstasyonu[] }> {
  const istasyon = (await istasyonKisiAtamalari(db)).map((a) => ({ kisiId: a.kisiId, istasyonId: a.istasyonId, yuzde: a.yuzde }));
  const makineIstasyonu = new Map((await aktifMakineler(db)).map((m) => [m.id, m.istasyonId]));
  const digerleri: KisiIstasyonu[] = (await makineKisiAtamalari(db)).flatMap((a) => {
    const istasyonId = makineIstasyonu.get(a.makineId);
    return istasyonId == null ? [] : [{ kisiId: a.kisiId, istasyonId, yuzde: a.yuzde }];
  });
  for (const e of await ekipler(db)) {
    if (e.istasyonId !== null) for (const u of await ekipUyeleri(db, e.id)) digerleri.push({ kisiId: u.kisiId, istasyonId: e.istasyonId, yuzde: u.yuzde });
  }
  return { istasyon, digerleri };
}

const kisininAtamalari = (a: { istasyon: KisiIstasyonu[]; digerleri: KisiIstasyonu[] }, kisiId: number): KisiIstasyonu[] => {
  const kendi = a.istasyon.filter((x) => x.kisiId === kisiId);
  return kendi.length > 0 ? kendi : a.digerleri.filter((x) => x.kisiId === kisiId);
};

// VR-29: kişilerin son çalışma günü (İK çıkış tarihi, pasif kişide dün); sınırı olmayan kişi null. Kişi kaydı yoksa yalnız İK'ya bakılır.
async function sonCalismaGunleri(db: Db, kisiIdleri: readonly number[]): Promise<Map<number, string | null>> {
  if (kisiIdleri.length === 0) return new Map();
  const aktif = new Map((await kisileriListele(db)).map((k) => [k.id, k.aktif]));
  const cikislar = await kisilerinCikisTarihleri(db, kisiIdleri);
  const bugun = await s.bugun(db);
  return new Map(kisiIdleri.map((id) => [id, sonCalismaGunu({ aktif: aktif.get(id) ?? true, cikisTarihi: cikislar.get(id) ?? null, bugun })]));
}

// İstasyon ataması olmayan kişi makine ya da ekip atamasıyla listeye girer: kadroda sayılan herkes listede görünür. VR-29: tarihte
// (verilmezse bugün) işten ayrılmış kişi listede yoktur; pasif kişi bugünden itibaren yoktur, geçmiş günün mesaisinde görünür.
export async function vardiyaPersoneli(db: Db, tarih?: string): Promise<VardiyaPersoneliCevabi> {
  const tumu = await kisiAtamalari(db);
  const istasyonMerkezi = new Map((await istasyonlar(db, { pasiflerDahil: true })).map((i) => [i.id, i.isMerkeziId]));
  const vardiyasi = new Map((await s.kisiVardiyalari(db)).map((k) => [k.kisiId, k.vardiyaId]));
  const idler = [...new Set([...tumu.istasyon, ...tumu.digerleri].map((a) => a.kisiId))];
  const adlar = await kisiAdlari(db, idler);
  const gun = tarih ?? await s.bugun(db);
  const sonGun = await sonCalismaGunleri(db, idler);
  const personel = idler.flatMap((kisiId) => {
    const istasyonId = kisininIstasyonu(kisininAtamalari(tumu, kisiId));
    const ad = adlar.get(kisiId);
    if (istasyonId === null || ad === undefined || ayrildiMi(sonGun.get(kisiId) ?? null, gun)) return [];
    return [{ kisiId, ad, istasyonId, isMerkeziId: istasyonMerkezi.get(istasyonId) ?? null, vardiyaId: vardiyasi.get(kisiId) ?? null }];
  });
  return { personel: personel.sort((a, b) => a.ad.localeCompare(b.ad, 'tr') || a.kisiId - b.kisiId) };
}

export interface TakvimKaynagi { tur: KaynakTuru; id: number }
export interface TakvimAraligiGirdisi { baslangic: string; bitis: string }

const kaynakAnahtari = (k: TakvimKaynagi): string => `${k.tur}:${k.id}`;

function araligiDenetle(a: TakvimAraligiGirdisi): number {
  const gun = gunFarki(a.baslangic, a.bitis);
  if (gun < 1) throw dogrulama('Bitiş başlangıçtan önce olamaz.', 'bitis');
  if (gun > AZAMI_TAKVIM_GUNU) throw dogrulama(`Takvim en çok ${AZAMI_TAKVIM_GUNU} gün okunur.`, 'bitis');
  return gun;
}

// VR-04, VR-07, VR-08 (K3), VR-15: kaynakların çalışma takvimleri tek okumada. Makine istasyonunun, istasyon kendi iş merkezinin, kişi en büyük
// yüzdeli istasyon atamasının (istasyon ataması yoksa makine ya da ekip atamasının istasyonunun, soru 30) iş merkezinin takvimini alır; kişinin vardiyası varsa yalnız o vardiya. Kaynağa uyan aktif planlı duruşlar
// aralıklardan ve gün dakikasından düşülür. İş merkezine bağlanamayan kaynak (istasyonsuz makine, ataması olmayan kişi, olmayan kayıt)
// haritada null'dır: sürekli çalışma uydurulmaz.
export async function calismaTakvimleri(db: Db, kaynaklar: readonly TakvimKaynagi[], aralik: TakvimAraligiGirdisi): Promise<Map<string, KaynakTakvimi | null>> {
  return new Map([...(await takvimleriHesapla(db, kaynaklar, aralik))].map(([k, h]) => [k, h?.takvim ?? null]));
}

export interface BasladigiGun { araliklar: TakvimAraligi[]; molalar: TakvimAraligi[]; bitis: string | null }
interface TakvimHesabi { takvim: KaynakTakvimi; basladigiGunler: BasladigiGun[] }

// basladigiGunSayisi: ilk kaç günün, o gün başlayan vardiyalarının net aralıkları ve bitişi de çevrilsin (günlük mesai ve Arkon gün kaydı
// ister; ek dönüşüm ötekilere yüklenmez).
async function takvimleriHesapla(db: Db, kaynaklar: readonly TakvimKaynagi[], aralik: TakvimAraligiGirdisi, basladigiGunSayisi = 0): Promise<Map<string, TakvimHesabi | null>> {
  const gunSayisi = araligiDenetle(aralik);
  const sonuc = new Map<string, TakvimHesabi | null>();
  if (kaynaklar.length === 0) return sonuc;
  const merkezler = new Set((await isMerkezleri(db, { pasiflerDahil: true })).map((m) => m.id));
  const istasyonMerkezi = new Map((await istasyonlar(db, { pasiflerDahil: true })).map((i) => [i.id, i.isMerkeziId]));
  const atamalar = kaynaklar.some((k) => k.tur === 'kisi') ? await kisiAtamalari(db) : { istasyon: [], digerleri: [] };
  const kisiVardiyasi = new Map((await s.kisiVardiyalari(db)).map((k) => [k.kisiId, k.vardiyaId]));
  const vardiyalar = new Map((await vardiyaListesi(db)).map((v) => [v.id, v]));
  const matris = await s.matris(db);
  // Önceki günden taşan gece vardiyası için bir gün önce de okunur.
  const gunler = new Map((await gunleriOku(db, tarihEkle(aralik.baslangic, -1), aralik.bitis)).map((g) => [g.tarih, g]));
  const kapali = new Set(gunler.keys());
  const duruslar = await s.takvimDuruslari(db, aralik.baslangic, gunSayisi);
  // Önceki günün fazla mesaisi gece yarısını geçip aralığa taşabilir: bir gün önceden okunur.
  const fazlaMesailer = await s.fazlaMesailer(db, tarihEkle(aralik.baslangic, -1), tarihEkle(aralik.baslangic, gunSayisi - 1), false);
  const izinliler = await izinGunleri(db, kaynaklar, aralik.baslangic, gunSayisi);
  const sonGunler = await sonCalismaGunleri(db, [...new Set(kaynaklar.filter((k) => k.tur === 'kisi').map((k) => k.id))]);
  // Makinenin istasyonu tek okumada; pasif makine listede yoktur, tek tek okunur.
  const makineIstasyonu = new Map(kaynaklar.some((k) => k.tur === 'makine') ? (await aktifMakineler(db)).map((m) => [m.id, m.istasyonId]) : []);

  interface Bag { isMerkeziId: number; istasyonId: number | null; vardiyaId: number | null }
  async function merkezVeVardiya(k: TakvimKaynagi): Promise<Bag | null> {
    const merkez = (id: number | null | undefined) => (id !== null && id !== undefined && merkezler.has(id) ? id : null);
    let isMerkeziId: number | null = null;
    let istasyonId: number | null = null;
    if (k.tur === 'is-merkezi') isMerkeziId = merkez(k.id);
    else if (k.tur === 'istasyon') {
      isMerkeziId = merkez(istasyonMerkezi.get(k.id));
      istasyonId = k.id;
    } else if (k.tur === 'makine') {
      istasyonId = makineIstasyonu.has(k.id) ? makineIstasyonu.get(k.id)! : (await makineGetir(db, k.id))?.istasyonId ?? null;
      isMerkeziId = istasyonId === null ? null : merkez(istasyonMerkezi.get(istasyonId));
    } else {
      const kisininIstasyonId = kisininIstasyonu(kisininAtamalari(atamalar, k.id));
      isMerkeziId = kisininIstasyonId === null ? null : merkez(istasyonMerkezi.get(kisininIstasyonId));
    }
    if (isMerkeziId === null) return null;
    return { isMerkeziId, istasyonId, vardiyaId: k.tur === 'kisi' ? kisiVardiyasi.get(k.id) ?? null : null };
  }

  // Dakikalar bütün kaynaklar için tek sorguda ana çevrilir: önce her kaynağın dakikaları toplanır, sonra sonuç kurulur.
  const kurulacaklar: { anahtar: string; dakikaSayisi: number; kur: (anlar: readonly string[]) => TakvimHesabi }[] = [];
  const tumDakikalar: number[] = [];
  for (const k of kaynaklar) {
    const anahtar = kaynakAnahtari(k);
    if (sonuc.has(anahtar)) continue;
    // Yer tutucu: haritanın sırası kaynakların sırasıdır.
    sonuc.set(anahtar, null);
    const bag = await merkezVeVardiya(k);
    if (bag === null) continue;
    const kisiId = k.tur === 'kisi' ? k.id : null;
    // VR-25: kişi tam gün onaylı izindeyse o gün çalışmaz (vardiya da fazla mesai de); kısmi izin (soru 54) aşağıda düşülür.
    const izinOranlari = kisiId === null ? new Map<string, number>() : izinliler.get(kisiId) ?? new Map<string, number>();
    const izinli = (tarih: string) => izinOranlari.get(tarih) === 1;
    // VR-29: son çalışma gününden sonra kişinin vardiyası da fazla mesaisi de yoktur (izinli gün gibi 0 dakika, ayrı işaretle).
    const sonGun = kisiId === null ? null : sonGunler.get(kisiId) ?? null;
    const ayrildi = (tarih: string) => ayrildiMi(sonGun, tarih);
    const calismaz = (tarih: string) => izinli(tarih) || ayrildi(tarih);
    const uyanMesailer = fazlaMesaiUyanlar(fazlaMesailer, { isMerkeziId: bag.isMerkeziId, istasyonId: bag.istasyonId, kisiId });
    const gununVardiyalariniVer = (tarih: string) => (calismaz(tarih) ? [] : gununVardiyalari(tarih, bag.isMerkeziId, matris, vardiyalar, kapali, bag.vardiyaId));
    const gununMesaileriniVer = (tarih: string) => (calismaz(tarih) ? [] : uyanMesailer.filter((f) => f.tarih === tarih).map(fazlaMesaiVardiyasi));
    const hepsiniVer = (tarih: string) => [...gununVardiyalariniVer(tarih), ...gununMesaileriniVer(tarih)];
    const planliDuruslar = kaynagaUyanlar(duruslar, bag.isMerkeziId, bag.istasyonId).flatMap((d) => durusAraliklari(d, aralik.baslangic, gunSayisi));
    // Soru 54: kısmi izinli saatler duruş gibi çıkar; fazla mesai izinden etkilenmez (izinli kısım yalnız vardiyanın içindedir).
    const kisiIzinleri = [...izinOranlari].filter(([, oran]) => oran < 1).flatMap(([tarih, oran]) =>
      izinliKisim(gununCalismaAraliklari(gunFarki(aralik.baslangic, tarih) - 1, gununVardiyalariniVer(tarih), planliDuruslar), oran));
    const durusDakikalari = [...planliDuruslar, ...kisiIzinleri];
    const dakikalar = araliklardanCikar(takvimAraliklari(aralik.baslangic, gunSayisi, hepsiniVer), durusDakikalari);
    const gunluk = Array.from({ length: basladigiGunSayisi }, (_, i) => {
      const vardiyasi = hepsiniVer(tarihEkle(aralik.baslangic, i));
      return { araliklar: gununCalismaAraliklari(i, vardiyasi, durusDakikalari), molalar: gununMolaAraliklari(i, vardiyasi), son: gununSonDakikasi(i, vardiyasi) };
    });
    const kaynaginDakikalari = [
      ...dakikalar.flatMap((a) => [a.bas, a.bit]),
      ...gunluk.flatMap((g) => [...g.araliklar.flatMap((a) => [a.bas, a.bit]), ...g.molalar.flatMap((a) => [a.bas, a.bit]), ...(g.son === null ? [] : [g.son])]),
    ];
    tumDakikalar.push(...kaynaginDakikalari);
    // Kaynağın anları, bütün kaynakların tek çevirisinden kendi payıyla gelir.
    const kur = (anlar: readonly string[]): TakvimHesabi => {
      const cevir = (i: number): TakvimAraligi => ({ baslangic: anlar[2 * i]!, bitis: anlar[2 * i + 1]! });
      let sira = 2 * dakikalar.length;
      const basladigiGunler = gunluk.map((g): BasladigiGun => {
        const al = () => { sira += 2; return { baslangic: anlar[sira - 2]!, bitis: anlar[sira - 1]! }; };
        const araliklar = g.araliklar.map(al);
        const molalar = g.molalar.map(al);
        const bitis = g.son === null ? null : anlar[sira++]!;
        return { araliklar, molalar, bitis };
      });
      return { basladigiGunler, takvim: {
        isMerkeziId: bag.isMerkeziId,
        vardiyaId: bag.vardiyaId,
        gunler: Array.from({ length: gunSayisi }, (_, i) => {
          const tarih = tarihEkle(aralik.baslangic, i);
          const g = gunler.get(tarih);
          const vardiyasi = gununVardiyalariniVer(tarih);
          const dakika = gunNetDakikasiEk(i, vardiyasi, gununMesaileriniVer(tarih), durusDakikalari);
          const fazlaMesaiDakika = dakika - gunNetDakikasi(i, vardiyasi, durusDakikalari);
          return {
            tarih, dakika, kapali: g ? { tur: g.tur, ad: g.ad } : null,
            ...(izinli(tarih) ? { izinli: true } : {}),
            ...(ayrildi(tarih) ? { ayrildi: true } : {}),
            ...(fazlaMesaiDakika > 0 ? { fazlaMesaiDakika } : {}),
          };
        }),
        araliklar: dakikalar.map((_, i) => cevir(i)),
        // VR-26: kişinin çalışma payı; kapasite hesabı tam zamanla çarpar.
        ...(kisiId !== null ? { yuzde: atamaPayi(kisininAtamalari(atamalar, kisiId)) } : {}),
      } };
    };
    kurulacaklar.push({ anahtar, dakikaSayisi: kaynaginDakikalari.length, kur });
  }
  const tumAnlar = await s.anlaraCevir(db, aralik.baslangic, tumDakikalar);
  let bas = 0;
  for (const k of kurulacaklar) {
    sonuc.set(k.anahtar, k.kur(tumAnlar.slice(bas, bas + k.dakikaSayisi)));
    bas += k.dakikaSayisi;
  }
  return sonuc;
}

// Kişi kaynaklarının onaylı izin günleri (önceki gün dahil: gece taşması). İzin İK'nındır; okuma ik/disari.ts üzerinden, kişi başına bir sorgu.
async function izinGunleri(db: Db, kaynaklar: readonly TakvimKaynagi[], baslangic: string, gunSayisi: number): Promise<Map<number, Map<string, number>>> {
  const sonuc = new Map<number, Map<string, number>>();
  const ilk = tarihEkle(baslangic, -1);
  const son = tarihEkle(baslangic, gunSayisi - 1);
  const kisiIdleri = [...new Set(kaynaklar.filter((k) => k.tur === 'kisi').map((k) => k.id))];
  const izinler = await kisilerinIzinleri(db, kisiIdleri, ilk, son);
  for (const id of kisiIdleri) sonuc.set(id, onayliIzinGunleri(izinler.get(id) ?? [], ilk, son));
  return sonuc;
}

export async function calismaTakvimi(db: Db, kaynak: TakvimKaynagi, aralik: TakvimAraligiGirdisi): Promise<KaynakTakvimi | null> {
  return (await calismaTakvimleri(db, [kaynak], aralik)).get(kaynakAnahtari(kaynak)) ?? null;
}

// GET /calisma-takvimi: kişi kaynağı izin günlerini gösterdiği için VR-27 ile süzülür. Plan, Arkon ve öteki modüller takvimi disari.ts'ten
// okur; bu denetim yalnız uçtadır.
export async function kaynakTakvimiOku(db: Db, kullanici: Kullanici, kaynak: TakvimKaynagi, aralik: TakvimAraligiGirdisi): Promise<KaynakTakvimi | null> {
  if (kaynak.tur === 'kisi') await kisiTakvimiDenetle(db, kullanici, kaynak.id);
  return calismaTakvimi(db, kaynak, aralik);
}

async function kisiTakvimiDenetle(db: Db, kullanici: Kullanici, kisiId: number): Promise<void> {
  const islemler: readonly string[] = kullanici.islemler;
  const amirVeyaPlanlama = islemler.includes('arkon.amir') || islemler.includes('vardiya.yaz');
  const kapsamda = amirVeyaPlanlama && kapsamdaMi(await kapsamiAl(db, kullanici), await kisininIsMerkezi(db, kisiId));
  if (!kisiTakvimiGorunur({ kendisi: kullanici.id === kisiId, ikOkur: islemler.includes('ik.oku'), amirVeyaPlanlama, kapsamda })) {
    throw yetkiYok('Bu kişinin çalışma takvimini görme yetkin yok.');
  }
}

// Arkon gün kaydı (anomali, emek verimi): o gün BAŞLAYAN vardiyaların net aralıkları, gece yarısından sonraki kısım dahil, önceki günden
// taşan kısım hariç; molalar ve planlı duruşlar düşülmüş (fazla mesai dahil). bitis o gün başlayan son vardiyanın bitişidir (gün kaydı o
// ana kadar açık kalır); vardiya yoksa null. Kaynak iş merkezine bağlanamıyorsa null. calismaTakvimi değişmez: Plan ve Kapasite onu okur.
export async function basladigiGunTakvimi(db: Db, kaynak: TakvimKaynagi, tarih: string): Promise<BasladigiGun | null> {
  return (await basladigiGunTakvimleri(db, [kaynak], { baslangic: tarih, bitis: tarih })).get(kaynakAnahtari(kaynak))?.get(tarih) ?? null;
}

// Toplu okuma (emek verimi ayı kişi x gün okur): anahtar `tur:id`, iç anahtar tarih; tek hesap turunda.
export async function basladigiGunTakvimleri(db: Db, kaynaklar: readonly TakvimKaynagi[], aralik: TakvimAraligiGirdisi): Promise<Map<string, Map<string, BasladigiGun> | null>> {
  const gunSayisi = gunFarki(aralik.baslangic, aralik.bitis);
  const hesaplar = await takvimleriHesapla(db, kaynaklar, aralik, Math.max(gunSayisi, 0));
  return new Map([...hesaplar].map(([k, h]) => [k, h === null ? null : new Map(h.basladigiGunler.map((g, i) => [tarihEkle(aralik.baslangic, i), g]))]));
}

// Günlük mesai: vardiya personeli (istasyona atanmış kişiler) ve her birinin o gün başlayan vardiyaları tek okumada. İki gün okunur:
// gece yarısını geçen vardiya ertesi sabaha kadar görünsün.
export async function gunlukMesai(db: Db, tarih: string): Promise<GunlukMesaiCevabi> {
  const { personel } = await vardiyaPersoneli(db, tarih);
  const hesaplar = await takvimleriHesapla(db, personel.map((p) => ({ tur: 'kisi' as const, id: p.kisiId })), { baslangic: tarih, bitis: tarihEkle(tarih, 1) }, 1);
  return {
    tarih,
    satirlar: personel.map((p) => {
      const h = hesaplar.get(kaynakAnahtari({ tur: 'kisi', id: p.kisiId })) ?? null;
      const gun = h?.takvim.gunler[0];
      return {
        kisiId: p.kisiId, ad: p.ad, isMerkeziId: p.isMerkeziId, vardiyaId: p.vardiyaId,
        plan: h === null || gun === undefined ? null : { dakika: gun.dakika, kapali: gun.kapali, araliklar: h.basladigiGunler[0]!.araliklar },
      };
    }),
  };
}

// İlk sistemin okuma yolu: bir iş merkezinin bir günkü net dakikası (tatil ve kapalı günde sıfır; tesis ve iş merkezi duruşları düşülmüş).
// Olmayan iş merkezinde sıfırdır.
export async function calismaSuresi(db: Db, isMerkeziId: number, tarih: string): Promise<number> {
  return (await calismaTakvimi(db, { tur: 'is-merkezi', id: isMerkeziId }, { baslangic: tarih, bitis: tarih }))?.gunler[0]?.dakika ?? 0;
}

export const takvimGunleri = (db: Db): Promise<TakvimGunu[]> => gunleriOku(db);
// İş merkezi x haftanın günü x vardiya (takvim cevabındaki `matris` satırları); yalnız okur.
export const vardiyaMatrisi = (db: Db): Promise<MatrisSatiri[]> => s.matris(db);

// Planlı duruş (kart #519, yol haritası A6). Tek sahip Vardiya'dır; Arkon planlı duruş takvimi `disari.ts` üzerinden okur ve yazar.
const DURUS_ISLEMI = 'vardiya.durus-yaz';
const DURUS_YOK = 'Planlı duruş bulunamadı.';
const DURUS_KISITLARI = {
  vardiya_planli_durus_neden_fk: { ileti: 'Duruş nedeni bulunamadı.', alan: 'durusNedeniId' },
  vardiya_planli_durus_is_merkezi_fk: { ileti: 'İş merkezi bulunamadı.', alan: 'isMerkeziId' },
  vardiya_planli_durus_istasyon_fk: { ileti: 'İstasyon bulunamadı.', alan: 'istasyonId' },
  vardiya_planli_durus_kaynak_tekil: { ileti: 'Bu kaynak kimliğiyle bir planlı duruş var.', alan: 'kaynakKimligi' },
} as const;

// Arkon'un okuduğu kayıt: kaynak kimliği Arkon belgesinin kimliğidir (Arkon'dan açılmadıysa null).
export type PlanliDurusKaydi = PlanliDurus & { kaynakKimligi: string | null };

async function duruslaraAdVer(db: Db, satirlar: readonly s.PlanliDurusSatiri[]): Promise<PlanliDurusKaydi[]> {
  const adlar = await kisiAdlari(db, [...new Set(satirlar.map((d) => d.yazanId))]);
  return satirlar.map(({ yazanId, ...d }) => ({ ...d, yazan: adlar.get(yazanId) ?? null }));
}
const kaydiAt = ({ kaynakKimligi: _atilan, ...d }: PlanliDurusKaydi): PlanliDurus => d;

export async function planliDurusListesi(db: Db, sorgu: z.output<typeof planliDurusListeSorgusu>): Promise<SayfaliListe<PlanliDurus>> {
  return sayfaliListe(sorgu, {
    say: () => s.planliDurusSay(db, sorgu.yalnizAktif),
    satirlar: async (dilim) => (await duruslaraAdVer(db, await s.planliDurusSatirlari(db, sorgu.yalnizAktif, sorgu, dilim))).map(kaydiAt),
  });
}

export const planliDuruslarinHepsi = async (db: Db): Promise<PlanliDurusKaydi[]> => duruslaraAdVer(db, await s.planliDuruslarinHepsi(db));

async function durusGetir(db: Db, id: number): Promise<PlanliDurusKaydi> {
  const satir = await s.planliDurus(db, id);
  if (satir === null) throw bulunamadi(DURUS_YOK);
  return (await duruslaraAdVer(db, [satir]))[0]!;
}

// VR-11, VR-12: düzenlenmiş ve denetlenmiş girdi.
function durusGirdisi(g: PlanliDurusGirdisi): PlanliDurusGirdisi {
  const d = durusuDuzenle(g);
  const hata = durusHatasi(d);
  if (hata) throw dogrulama(hata.ileti, hata.alan);
  return d;
}

// VR-13: tesis geneli duruşu yalnız iş merkezi kısıtı olmayan kişi yazar; iş merkezi ya da istasyon duruşu kişinin kapsamında olmalı.
async function durusKapsamiDenetle(db: Db, kullanici: Kullanici, d: { kapsam: string; isMerkeziId: number | null; istasyonId: number | null }): Promise<void> {
  const kapsam = await kapsamiAl(db, kullanici);
  if (d.kapsam === 'tesis') {
    if (kapsamSuzgeci(kapsam) !== null) throw yetkiYok('Tesis geneli planlı duruş için iş merkezi kısıtın olmamalı.');
    return;
  }
  let isMerkeziId = d.isMerkeziId;
  if (d.istasyonId !== null) {
    const istasyon = await istasyonGetir(db, d.istasyonId);
    if (istasyon === null) throw dogrulama('İstasyon bulunamadı.', 'istasyonId');
    isMerkeziId = istasyon.isMerkeziId;
  }
  kapsamDisiysaReddet(kapsam, isMerkeziId);
}

// VR-14: duruş nedeni planlı kategoride olmalı; pasif neden yalnız kayıtta zaten seçiliyse kalır.
async function durusNedeniDenetle(db: Db, nedenId: number | null, onceki: number | null): Promise<void> {
  if (nedenId === null) return;
  const neden = await durusNedeniGetir(db, nedenId);
  if (neden === null) throw dogrulama('Duruş nedeni bulunamadı.', 'durusNedeniId');
  if (neden.kategori !== 'planli') throw dogrulama('Planlı duruşun nedeni planlı kategoride olmalı.', 'durusNedeniId');
  if (!neden.aktif && nedenId !== onceki) throw dogrulama('Pasif duruş nedeni seçilemez.', 'durusNedeniId');
}

async function durusEkle(db: Db, kullanici: Kullanici, g: PlanliDurusGirdisi, kaynakKimligi: string | null): Promise<number> {
  const d = durusGirdisi(g);
  await durusKapsamiDenetle(db, kullanici, d);
  await durusNedeniDenetle(db, d.durusNedeniId, null);
  return kisitKorumali(DURUS_KISITLARI, () => s.planliDurusEkle(db, d, kullanici.id, kaynakKimligi));
}

// Kilitten sonra kapsam (eski ve yeni hedef), sonra kural; yazma sürüm koşullu.
async function durusGuncelle(db: Db, kullanici: Kullanici, onceki: s.PlanliDurusSatiri, g: PlanliDurusGirdisi, surum: number): Promise<void> {
  await durusKapsamiDenetle(db, kullanici, onceki);
  const d = durusGirdisi(g);
  await durusKapsamiDenetle(db, kullanici, d);
  await durusNedeniDenetle(db, d.durusNedeniId, onceki.durusNedeniId);
  await kisitKorumali(DURUS_KISITLARI, () => surumluGuncelle({
    guncelle: () => s.planliDurusGuncelle(db, onceki.id, d, surum, kullanici.id),
    varMi: () => s.planliDurusVarMi(db, onceki.id),
    bulunamadiIletisi: DURUS_YOK,
  }));
}

async function durusSil(db: Db, kullanici: Kullanici, onceki: s.PlanliDurusSatiri, surum: number): Promise<void> {
  await durusKapsamiDenetle(db, kullanici, onceki);
  await surumluGuncelle({
    guncelle: async () => ((await s.planliDurusSil(db, onceki.id, surum)) ? { id: onceki.id } : null),
    varMi: () => s.planliDurusVarMi(db, onceki.id),
    bulunamadiIletisi: DURUS_YOK,
  });
}

async function kilitliDurus(db: Db, id: number): Promise<s.PlanliDurusSatiri> {
  const satir = await s.planliDurusKilitle(db, id);
  if (satir === null) throw bulunamadi(DURUS_YOK);
  return satir;
}

export async function planliDurusOlustur(db: Db, kullanici: Kullanici, g: PlanliDurusGirdisi): Promise<PlanliDurus> {
  return kaydiAt(await durusGetir(db, await durusEkle(db, kullanici, g, null)));
}

export async function planliDurusDegistir(db: Db, kullanici: Kullanici, id: number, g: PlanliDurusGirdisi & { surum: number }): Promise<PlanliDurus> {
  await durusGuncelle(db, kullanici, await kilitliDurus(db, id), g, g.surum);
  return kaydiAt(await durusGetir(db, id));
}

export async function planliDurusKaldir(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<void> {
  await durusSil(db, kullanici, await kilitliDurus(db, id), surum);
}

// VR-16: Arkon'dan yazım ve silme (çağıranın transaction'ında). Uç Arkon'undur; işlem burada denetlenir. Kayıt kimlikle ya da Arkon belge
// kimliğiyle (kaynak kimliği) bulunur ve kilitlenir; Arkon kendi belge sürümünü kilitten sonra `guncelMi` ile denetler, böylece Vardiya
// ekranından araya giren yazım ezilmez. Kaynak kimliğiyle bulunamayan kayıt o kimlikle açılır: yinelenen yazım ikinci kayıt açmaz.
// Kimlikle anılan kayıt yoksa (başka yerden silinmiş) yeniden açılmaz.
export interface ArkonDurusHedefi {
  id: number | null;
  kaynakKimligi: string;
  guncelMi: (onceki: PlanliDurusKaydi | null) => boolean;
}
export type ArkonDurusSonucu = { sonuc: 'yazildi'; kayit: PlanliDurusKaydi | null } | { sonuc: 'cakisma'; guncel: PlanliDurusKaydi | null };

async function arkonHedefiniKilitle(db: Db, kullanici: Kullanici, hedef: ArkonDurusHedefi) {
  if (!kullanici.islemler.includes(DURUS_ISLEMI)) throw yetkiYok('Planlı duruş yazma yetkin yok.');
  const satir = hedef.id !== null ? await s.planliDurusKilitle(db, hedef.id) : await s.kaynakKimligiyleKilitle(db, hedef.kaynakKimligi);
  return { satir, kayit: satir === null ? null : await durusGetir(db, satir.id) };
}

export async function planliDurusYaz(db: Db, kullanici: Kullanici, hedef: ArkonDurusHedefi, g: PlanliDurusGirdisi): Promise<ArkonDurusSonucu> {
  const { satir, kayit } = await arkonHedefiniKilitle(db, kullanici, hedef);
  if (!hedef.guncelMi(kayit)) return { sonuc: 'cakisma', guncel: kayit };
  if (satir === null && hedef.id !== null) throw bulunamadi(DURUS_YOK);
  if (satir === null) return { sonuc: 'yazildi', kayit: await durusGetir(db, await durusEkle(db, kullanici, g, hedef.kaynakKimligi)) };
  await durusGuncelle(db, kullanici, satir, g, satir.surum);
  return { sonuc: 'yazildi', kayit: await durusGetir(db, satir.id) };
}

// Kayıt yoksa bir şey yapılmaz (Arkon başka cihazda silinmiş belgeyi yeniden silebilir); `kayit` silinen kayıttır.
export async function planliDurusSilArkon(db: Db, kullanici: Kullanici, hedef: ArkonDurusHedefi): Promise<ArkonDurusSonucu> {
  const { satir, kayit } = await arkonHedefiniKilitle(db, kullanici, hedef);
  if (satir === null) return { sonuc: 'yazildi', kayit: null };
  if (!hedef.guncelMi(kayit)) return { sonuc: 'cakisma', guncel: kayit };
  await durusSil(db, kullanici, satir, satir.surum);
  return { sonuc: 'yazildi', kayit };
}

// Fazla mesai planı (kart #1324). Yazma `vardiya.yaz`; kapsam, geçmiş tarih ve kişi listesi burada denetlenir.
const FAZLA_MESAI_YOK = 'Fazla mesai bulunamadı.';
const FAZLA_MESAI_KISITLARI = {
  vardiya_fazla_mesai_is_merkezi_fk: { ileti: 'İş merkezi bulunamadı.', alan: 'isMerkeziId' },
  vardiya_fazla_mesai_istasyon_fk: { ileti: 'İstasyon bulunamadı.', alan: 'istasyonId' },
  vardiya_fazla_mesai_kisi_kisi_fk: { ileti: 'Kişi bulunamadı.', alan: 'kisiIdleri' },
} as const;

async function mesailereAdVer(db: Db, satirlar: readonly s.FazlaMesaiSatiri[]): Promise<FazlaMesai[]> {
  const adlar = await kisiAdlari(db, satirlar.map((f) => f.yazanId));
  return satirlar.map(({ yazanId, ...f }) => ({ ...f, dakika: aralik(f.baslangic, f.bitis), yazan: adlar.get(yazanId) ?? null }));
}

export async function fazlaMesaiListesi(db: Db, baslangic: string, bitis: string): Promise<FazlaMesai[]> {
  if (bitis < baslangic) throw dogrulama('Bitiş başlangıçtan önce olamaz.', 'bitis');
  if (gunFarki(baslangic, bitis) + 1 > AZAMI_TAKVIM_GUNU) throw dogrulama(`Aralık en çok ${AZAMI_TAKVIM_GUNU} gün olur.`, 'bitis');
  return mesailereAdVer(db, await s.fazlaMesailer(db, baslangic, bitis, true));
}

async function fazlaMesaiGetir(db: Db, id: number): Promise<FazlaMesai> {
  const satir = await s.fazlaMesai(db, id);
  if (satir === null) throw bulunamadi(FAZLA_MESAI_YOK);
  return (await mesailereAdVer(db, [satir]))[0]!;
}

// VR-22: hedef (iş merkezi ya da istasyonun iş merkezi) ve listedeki her kişi yazanın kapsamında olmalı; kapsam dışı kişiler ayrıntıda döner.
async function fazlaMesaiKapsamiDenetle(db: Db, kullanici: Kullanici, f: { isMerkeziId: number | null; istasyonId: number | null; kisiIdleri: readonly number[] }): Promise<void> {
  const kapsam = await kapsamiAl(db, kullanici);
  let isMerkeziId = f.isMerkeziId;
  if (f.istasyonId !== null) {
    const istasyon = await istasyonGetir(db, f.istasyonId);
    if (istasyon === null) throw dogrulama('İstasyon bulunamadı.', 'istasyonId');
    isMerkeziId = istasyon.isMerkeziId;
  }
  kapsamDisiysaReddet(kapsam, isMerkeziId);
  if (f.kisiIdleri.length === 0) return;
  const merkezi = await kisilerinIsMerkezi(db, f.kisiIdleri);
  const disi = f.kisiIdleri.filter((k) => !kapsamdaMi(kapsam, merkezi.get(k) ?? null));
  if (disi.length) throw topluKapsamDisi({ kisiIdleri: disi });
}

// VR-21 kural, VR-22 kapsam, VR-23 geçmiş tarih (VR-03 gibi), VR-29 ayrılmış ya da pasif kişi.
async function fazlaMesaiDenetle(db: Db, kullanici: Kullanici, g: FazlaMesaiGirdisi): Promise<void> {
  const sonGunler = await sonCalismaGunleri(db, g.kisiIdleri);
  const hata = fazlaMesaiHatasi(g) ?? fazlaMesaiKisiHatasi(g.tarih, g.kisiIdleri.map((kisiId) => ({ kisiId, sonGun: sonGunler.get(kisiId) ?? null })));
  if (hata) throw dogrulama(hata.ileti, hata.alan);
  await gecmisDenetle(db, kullanici, g.tarih);
  await fazlaMesaiKapsamiDenetle(db, kullanici, g);
}

const fazlaMesaiYazimi = (g: FazlaMesaiGirdisi): s.FazlaMesaiYazimi => ({
  tarih: g.tarih, baslangic: g.baslangic, bitis: g.bitis, kapsam: g.kapsam, isMerkeziId: g.isMerkeziId, istasyonId: g.istasyonId, aciklama: g.aciklama,
});

export async function fazlaMesaiOlustur(db: Db, kullanici: Kullanici, g: FazlaMesaiGirdisi): Promise<FazlaMesai> {
  await fazlaMesaiDenetle(db, kullanici, g);
  const id = await kisitKorumali(FAZLA_MESAI_KISITLARI, async () => {
    const yeni = await s.fazlaMesaiEkle(db, fazlaMesaiYazimi(g), kullanici.id);
    await s.fazlaMesaiKisileriniYaz(db, yeni, g.kisiIdleri);
    return yeni;
  });
  return fazlaMesaiGetir(db, id);
}

// Kilitten sonra eski kaydın tarihi ve kapsamı da denetlenir: kişi kapsamı dışındaki kaydı kendi kapsamına taşıyamaz.
async function kilitliFazlaMesai(db: Db, kullanici: Kullanici, id: number): Promise<s.FazlaMesaiSatiri> {
  const onceki = await s.fazlaMesaiKilitle(db, id);
  if (onceki === null) throw bulunamadi(FAZLA_MESAI_YOK);
  if (onceki.iptal) throw cakisma('İptal edilmiş fazla mesai değişmez.');
  await gecmisDenetle(db, kullanici, onceki.tarih);
  await fazlaMesaiKapsamiDenetle(db, kullanici, onceki);
  return onceki;
}

export async function fazlaMesaiDegistir(db: Db, kullanici: Kullanici, id: number, g: FazlaMesaiGirdisi & { surum: number }): Promise<FazlaMesai> {
  await kilitliFazlaMesai(db, kullanici, id);
  await fazlaMesaiDenetle(db, kullanici, g);
  await kisitKorumali(FAZLA_MESAI_KISITLARI, async () => {
    await surumluGuncelle({
      guncelle: () => s.fazlaMesaiGuncelle(db, id, fazlaMesaiYazimi(g), g.surum, kullanici.id),
      varMi: async () => (await s.fazlaMesai(db, id)) !== null,
      bulunamadiIletisi: FAZLA_MESAI_YOK,
    });
    await s.fazlaMesaiKisileriniYaz(db, id, g.kisiIdleri);
  });
  return fazlaMesaiGetir(db, id);
}

// İptal kaydı silmez: kim, ne zaman iptal etti görünür kalır; takvim iptal edilen kaydı okumaz.
export async function fazlaMesaiIptal(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<FazlaMesai> {
  await kilitliFazlaMesai(db, kullanici, id);
  await surumluGuncelle({
    guncelle: () => s.fazlaMesaiIptalEt(db, id, surum, kullanici.id),
    varMi: async () => (await s.fazlaMesai(db, id)) !== null,
    bulunamadiIletisi: FAZLA_MESAI_YOK,
  });
  return fazlaMesaiGetir(db, id);
}

// Takvim (891): aralıkta başlayan tek seferlik planlı duruşlar, kapsamın adıyla. Okuma oturumla açıktır (vardiya uçları gibi); yetkiyi çağıran denetler.
export async function takvimKayitlari(db: Db, baslangic: string, bitis: string): Promise<TakvimKaydi[]> {
  const satirlar = await s.tekSeferlikDuruslar(db, baslangic, bitis);
  if (satirlar.length === 0) return [];
  const merkezler = new Map((await isMerkezleri(db, { pasiflerDahil: true })).map((m) => [m.id, m.ad]));
  const istasyonAdi = await istasyonAdlari(db, satirlar.flatMap((d) => (d.istasyonId === null ? [] : [d.istasyonId])));
  return satirlar.map((d): TakvimKaydi => ({
    kaynak: 'planli-durus', kimlik: String(d.id), tarih: d.gun, no: null, baslik: d.baslik,
    ilgili: d.kapsam === 'tesis' ? 'Bütün atölye'
      : d.kapsam === 'is-merkezi' ? (d.isMerkeziId === null ? null : merkezler.get(d.isMerkeziId) ?? null)
        : (d.istasyonId === null ? null : istasyonAdi.get(d.istasyonId) ?? null),
    durum: d.gecti ? 'Geçti' : 'Planlı', bitti: d.gecti,
  }));
}
