import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ADIM_STATULERI, BEKLEME_NEDENI_ADLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type {
  AdimDurumuCevabi, AdimStatusu, BeklemeNedeni, AdimDurumuTerminalCevabi, AdimTedariki, ElleStatuGovdesi, HazirlikMaddesi, HazirlikOnayiGovdesi, HazirlikOnayiKaldirGovdesi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { hazirlik, isEmriHazirliklari } from './hazirlik.ts';
import {
  ADIM_KAPALI_EMIR, ELLE_STATU_YOK, EMIR_BEKLEMEDE_STATU, EMIR_YOK, GEREKCE_GEREK, HAL_ESKIDI, IS_EMRI_EMIRDE_YOK, ONAY_YOK, STATU_ESKIDI,
  acikElleStatu, acikOnaylar, adimSistemStatusu, calismaDurumu, hazirlikOnayiReddi, oncekiBekleniyor,
} from './kurallar.ts';
import type { HazirlikHali } from './kurallar.ts';
import * as s from './sorgular.ts';
import { emrinIlerlemesi } from './servis.ts';

// 2893 D2: açık tedarik satın almadan okunur (satın alma bu modülün üstündedir; kablolama bağlar). Bağlı değilse tedarik boştur ve
// malzeme eksiği "malzeme" görünür.
export interface EmirTedarikSatiri {
  uretimEmriId: number | null; isEmriId: number | null; malzemeNo: number | null; asama: 'talep' | 'siparis'; talepNo: string; siparisNo: string | null; termin: string | null;
}
export type TedarikCozucusu = (db: Db, uretimEmriIdleri: readonly number[], isEmriIdleri: readonly number[]) => Promise<readonly EmirTedarikSatiri[]>;
let tedarikCozucusu: TedarikCozucusu | null = null;
export function tedarikCozucusuKaydet(c: TedarikCozucusu | null): TedarikCozucusu | null {
  const onceki = tedarikCozucusu;
  tedarikCozucusu = c;
  return onceki;
}
// Hammadde talebi adımın girdisine (emir bağı + malzeme no) eşlenir; emre bağlanmamış ya da katalogsuz kalem eşlenmez. Fason satırı iş emrine.
async function adimTedarikleri(db: Db, emirId: number, idler: readonly number[]): Promise<Map<number, AdimTedariki[]>> {
  const sonuc = new Map<number, AdimTedariki[]>(idler.map((id) => [id, []]));
  if (tedarikCozucusu === null || idler.length === 0) return sonuc;
  const satirlar = await tedarikCozucusu(db, [emirId], idler);
  for (const id of idler) {
    const girdiler = new Set((await s.adimGirdileriGetir(db, id)).map((g) => g.malzemeNo));
    for (const r of satirlar) {
      const fason = r.isEmriId !== null;
      if (fason ? r.isEmriId !== id : r.uretimEmriId !== emirId || r.malzemeNo === null || !girdiler.has(r.malzemeNo)) continue;
      sonuc.get(id)?.push({ asama: r.asama, fason, talepNo: r.talepNo, siparisNo: r.siparisNo, termin: r.termin });
    }
  }
  return sonuc;
}

// Tabloda statü serbest metindir (liste sonradan değişebilir); listede olmayan eski değer 'diger' okunur.
const ACIK = new Set(['planli', 'basladi']);
const emrinBekletmesi = async (db: Db, emirId: number, durum: string): Promise<BeklemeNedeni | null> =>
  ACIK.has(durum) ? (await s.aktifBekletmeler(db, [emirId]))[0]?.neden ?? null : null;
const statuOku = (x: string): AdimStatusu => (ADIM_STATULERI as readonly string[]).includes(x) ? x as AdimStatusu : 'diger';

// Adım Durumu (2893): emrin her iş emri için sistem statüsü, açık elle statü, açık elle onaylar ve geçmiş. Elle statü sistem statüsü
// değişince düşer (yazıldığı andaki sistem statüsüyle saklanır); elle onay hazırlıkta muafiyet gibi sayılır (hazirlik.ts).
export async function adimDurumu(db: Db, emirId: number): Promise<AdimDurumuCevabi> {
  const e = await s.ustEmirBul(db, emirId);
  if (e === null) throw bulunamadi(EMIR_YOK);
  const genel = await hazirlik(db, emirId);
  const isEmirleri = [...(await s.isEmirleriGetir(db, [emirId]))].sort((a, b) => a.sira - b.sira);
  const idler = isEmirleri.map((i) => i.id);
  const ilerleme = await emrinIlerlemesi(db, emirId, e.adet);
  const calisma = new Map((await s.adimDurumlariGetir(db, [emirId])).map((a) => [a.id, a.durum === 'calisiyor' ? calismaDurumu(a.sonOlay) : null]));
  const fason = new Map<number, number>();
  for (const h of await s.akisFasonGetir(db, emirId)) fason.set(h.isEmriId, (fason.get(h.isEmriId) ?? 0) + (h.yon === 'gidis' ? h.adet : -h.adet));
  const haller = await isEmriHazirliklari(db, emirId, idler);
  const tedarik = await adimTedarikleri(db, emirId, idler);
  const statuDefteri = await s.elleStatuDefteri(db, idler);
  const onayDefteri = await s.hazirlikOnayDefteri(db, idler);
  const bekletme = await emrinBekletmesi(db, emirId, e.durum);
  const adlar = await kisiAdlari(db, [...new Set([...statuDefteri, ...onayDefteri].map((x) => x.kisiId))]);
  const ad = (id: number) => adlar.get(id) ?? null;
  return {
    emirId, emirNo: e.emirNo, urun: { kod: e.parcaNo, ad: e.parcaAd }, adet: e.adet, teslim: e.teslim, durum: e.durum,
    rotaYuzde: ilerleme?.rota ?? null, hazirlik: genel,
    adimlar: isEmirleri.map((i, sira) => {
      const hal = new Map<HazirlikMaddesi, HazirlikHali>([...(haller.get(i.id) ?? [])].map(([m, h]) => [m, h.hal]));
      const sistem = adimSistemStatusu({
        durum: i.durum, calisma: calisma.get(i.id) ?? null, fasonda: i.fasonFirmaId !== null && i.durum !== 'tamam' && (fason.get(i.id) ?? 0) > 0, hal,
        oncekiBekleniyor: oncekiBekleniyor({ sira: i.sira, bagimlilik: i.bagimlilik, oncul: i.onculler?.map((o) => o.id) ?? null }, isEmirleri),
        tedarik: i.durum === 'tamam' ? [] : tedarik.get(i.id) ?? [],
        bekletme,
      });
      const statuSatirlari = statuDefteri.filter((x) => x.isEmriId === i.id);
      const onaySatirlari = onayDefteri.filter((x) => x.isEmriId === i.id);
      const elle = acikElleStatu(statuSatirlari, sistem.statu);
      const adim = ilerleme?.adimlar[sira];
      return {
        isEmriId: i.id, opNo: i.opNo, ad: i.ad, durum: i.durum, calisma: calisma.get(i.id) ?? null, bagimlilik: i.bagimlilik,
        fason: i.fasonFirmaId !== null, hedef: adim?.hedef ?? 0, yapilan: adim?.yapilan ?? 0, yuzde: adim?.yuzde ?? 0,
        sistemStatusu: sistem.statu, nedenler: sistem.nedenler,
        maddeler: [...(haller.get(i.id) ?? [])].map(([madde, h]) => ({ madde, hal: h.hal, ham: h.ham })),
        tedarik: i.durum === 'tamam' ? [] : tedarik.get(i.id) ?? [],
        elle: elle === null || elle.statu === null ? null : { statu: statuOku(elle.statu), not: elle.aciklama, kisiAdi: ad(elle.kisiId), zaman: elle.zaman },
        onaylar: [...acikOnaylar(onaySatirlari).values()].map((o) => ({
          madde: o.madde as HazirlikMaddesi, gerekce: o.gerekce, sistemHali: (o.sistemHali ?? 'bilinmiyor') as HazirlikHali, kisiAdi: ad(o.kisiId), zaman: o.zaman,
        })),
        gecmis: [
          ...statuSatirlari.map((x) => ({ olay: x.olay === 'yaz' ? 'statu' as const : 'statu-kaldir' as const, deger: x.statu ?? '', not: x.aciklama, kisiAdi: ad(x.kisiId), zaman: x.zaman })),
          ...onaySatirlari.map((x) => ({ olay: x.olay === 'onay' ? 'onay' as const : 'onay-kaldir' as const, deger: x.madde, not: x.gerekce, kisiAdi: ad(x.kisiId), zaman: x.zaman })),
        ].sort((a, b) => Date.parse(b.zaman) - Date.parse(a.zaman)),
      };
    }),
  };
}

// 2893-3 b: operatör statüyü, nedenleri ve statünün elle yazıldığını görür; kişi, gerekçe ve geçmiş gitmez. Tedarik satırı yalnız adım
// malzeme, talep ya da sipariş beklerken gider: malzeme yerindeyken başka miktar için açık talep "malzeme yok" sanılmasın (Atölye N1).
const TEDARIK_GORUNEN = new Set<AdimStatusu>(['talep', 'siparis', 'malzeme']);
export async function adimDurumuTerminal(db: Db, emirId: number): Promise<AdimDurumuTerminalCevabi> {
  const d = await adimDurumu(db, emirId);
  const bekletme = await emrinBekletmesi(db, emirId, d.durum);
  return {
    emirId, bekletme: bekletme === null ? null : BEKLEME_NEDENI_ADLARI[bekletme],
    adimlar: d.adimlar.map((a) => ({
      isEmriId: a.isEmriId, opNo: a.opNo, ad: a.ad, statu: a.elle?.statu ?? a.sistemStatusu, elle: a.elle !== null, yuzde: a.yuzde, nedenler: a.nedenler,
      tedarik: TEDARIK_GORUNEN.has(a.elle?.statu ?? a.sistemStatusu) ? a.tedarik : [],
    })),
  };
}

// Yazmalar emri ve iş emrini kilitler: aynı adıma eşzamanlı iki yazma sırayla girer ve ikincisi güncel duruma göre karar verir.
async function yazmaHazirla(db: Db, emirId: number, isEmriId: number): Promise<AdimDurumuCevabi['adimlar'][number]> {
  const e = await s.ustEmirBul(db, emirId, true);
  if (e === null) throw bulunamadi(EMIR_YOK);
  if (e.durum === 'bitti' || e.durum === 'iptal') throw cakisma(ADIM_KAPALI_EMIR);
  if (!(await s.isEmriKilitle(db, isEmriId, emirId))) throw bulunamadi(IS_EMRI_EMIRDE_YOK);
  const adim = (await adimDurumu(db, emirId)).adimlar.find((a) => a.isEmriId === isEmriId);
  if (adim === undefined) throw bulunamadi(IS_EMRI_EMIRDE_YOK);
  return adim;
}

export async function elleStatuYaz(db: Db, kullanici: Kullanici, emirId: number, isEmriId: number, g: ElleStatuGovdesi): Promise<AdimDurumuCevabi> {
  const adim = await yazmaHazirla(db, emirId, isEmriId);
  if (adim.sistemStatusu !== g.sistemStatusu) throw cakisma(STATU_ESKIDI);
  // 3050 a: beklemedeki adımın statüsü bekletmeden gelir; elle statü "Beklemede"yi örtmesin, bekletme kalkınca yazılır.
  if (adim.sistemStatusu === 'beklemede') throw cakisma(EMIR_BEKLEMEDE_STATU);
  await s.elleStatuEkle(db, { isEmriId, olay: 'yaz', statu: g.statu, sistemStatusu: adim.sistemStatusu, aciklama: g.not === '' ? null : g.not, kisiId: kullanici.id });
  return adimDurumu(db, emirId);
}

export async function elleStatuKaldir(db: Db, kullanici: Kullanici, emirId: number, isEmriId: number): Promise<AdimDurumuCevabi> {
  const adim = await yazmaHazirla(db, emirId, isEmriId);
  if (adim.elle === null) throw cakisma(ELLE_STATU_YOK);
  await s.elleStatuEkle(db, { isEmriId, olay: 'kaldir', statu: null, sistemStatusu: null, aciklama: null, kisiId: kullanici.id });
  return adimDurumu(db, emirId);
}

// 2893-2 b: onay, istemcinin gördüğü hâl sunucudakiyle aynıysa yazılır; onaylanan sürüm (çizim revizyonu gibi) biliniyorsa saklanır.
export async function hazirlikOnayla(db: Db, kullanici: Kullanici, emirId: number, isEmriId: number, g: HazirlikOnayiGovdesi): Promise<AdimDurumuCevabi> {
  await yazmaHazirla(db, emirId, isEmriId);
  const madde = (await isEmriHazirliklari(db, emirId, [isEmriId])).get(isEmriId)?.get(g.madde);
  const hal = madde?.hal ?? 'bilinmiyor';
  if (hal !== g.sistemHali) throw cakisma(HAL_ESKIDI);
  const gerekce = g.gerekce === '' ? null : g.gerekce;
  const ret = hazirlikOnayiReddi(g.madde, hal, gerekce);
  if (ret === GEREKCE_GEREK) throw dogrulama(ret, 'gerekce');
  if (ret !== null) throw cakisma(ret);
  await s.hazirlikOnayiEkle(db, { isEmriId, madde: g.madde, olay: 'onay', sistemHali: hal, gerekce, onaylananSurum: madde?.surum ?? null, kisiId: kullanici.id });
  return adimDurumu(db, emirId);
}

export async function hazirlikOnayKaldir(db: Db, kullanici: Kullanici, emirId: number, isEmriId: number, g: HazirlikOnayiKaldirGovdesi): Promise<AdimDurumuCevabi> {
  const adim = await yazmaHazirla(db, emirId, isEmriId);
  if (!adim.onaylar.some((o) => o.madde === g.madde)) throw cakisma(ONAY_YOK);
  await s.hazirlikOnayiEkle(db, { isEmriId, madde: g.madde, olay: 'kaldir', sistemHali: null, gerekce: null, onaylananSurum: null, kisiId: kullanici.id });
  return adimDurumu(db, emirId);
}
