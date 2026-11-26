import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import type { DenetimSecimi, IkiliCevap } from '#cekirdek/uc.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ATLAMA_METNI, kalemKarari } from '#paylasilan/sozlesme/adim-matrisi-kurali.ts';
import { ADIM_STATULERI, BEKLEME_NEDENI_ADLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type {
  AdimDurumuCevabi, AdimMatrisiCevabi, AdimStatusu, BeklemeNedeni, CalismaDurumu, StatuTopluCevabi, StatuTopluGovdesi, StatuTopluSonucu, AdimDurumuTerminalCevabi, AdimTedariki, ElleStatuGovdesi, HazirlikElleEksikGovdesi, HazirlikMaddesi, HazirlikOnayiGovdesi,
  HazirlikOnayiKaldirGovdesi,
  ListeEkleGovdesi, ListeKaldirGovdesi, ListeIsaretleGovdesi, ListeKontrolu,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimSatiri, medyaTutamagi } from '../dosya/disari.ts';
import { denemeIsaretliKimlikler } from '../ayarlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { hazirlik, isEmriHazirliklari } from './hazirlik.ts';
import {
  ADIM_BITTI_STATU, ADIM_KAPALI_EMIR, ELLE_STATU_YOK, ISARETLI_KALDIRILMAZ, acikElleEksikler, elleEksikNedeni, elleEksikReddi, LISTE_ADIM_BITTI, LISTE_DOLU, EMIR_BEKLEMEDE_STATU, EMIR_YOK, GEREKCE_GEREK, HAL_ESKIDI, IS_EMRI_EMIRDE_YOK, LISTE_MADDESI_YOK,
  ONAY_YOK, STATU_ESKIDI, acikElleStatu, acikOnaylar, adimSistemStatusu, calismaDurumu, hazirlikOnayiReddi, kanitMetni, listeEkleReddi, listeIsaretReddi, oncekiBekleniyor,
  listeKanitiReddi, listeKontrolu, otomatikMuayeneMi, sinirDisiMi,
} from './kurallar.ts';
import type { HazirlikHali } from './kurallar.ts';
import * as s from './sorgular.ts';
import { emrinIlerlemesi } from './servis.ts';

// 2893 D2: açık tedarik satın almadan okunur (satın alma bu modülün üstündedir; kablolama bağlar). Bağlı değilse tedarik boştur ve
// malzeme eksiği "malzeme" görünür.
export interface EmirTedarikSatiri {
  uretimEmriId: number | null; isEmriId: number | null; malzemeNo: number | null; asama: 'talep' | 'siparis'; talepId?: string; talepNo: string; siparisNo: string | null; termin: string | null;
}
export type TedarikCozucusu = (db: Db, uretimEmriIdleri: readonly number[], isEmriIdleri: readonly number[]) => Promise<readonly EmirTedarikSatiri[]>;
let tedarikCozucusu: TedarikCozucusu | null = null;
export function tedarikCozucusuKaydet(c: TedarikCozucusu | null): TedarikCozucusu | null {
  const onceki = tedarikCozucusu;
  tedarikCozucusu = c;
  return onceki;
}
// 3576: iptal penceresinin uyarısı. Emre (ya da fason iş emrine) bağlı açık, siparişe dönmemiş talepler; bağlı değilse boş.
export async function acikTalepler(db: Db, emirIdleri: readonly number[], isEmriIdleri: readonly number[]): Promise<{ id: string | null; no: string }[]> {
  if (tedarikCozucusu === null || (emirIdleri.length === 0 && isEmriIdleri.length === 0)) return [];
  const emirler = new Set(emirIdleri);
  const isEmirleri = new Set(isEmriIdleri);
  const satirlar = await tedarikCozucusu(db, emirIdleri, isEmriIdleri);
  const talepler = new Map<string, string | null>();
  for (const r of satirlar) {
    if (r.asama === 'talep' && ((r.uretimEmriId !== null && emirler.has(r.uretimEmriId)) || (r.isEmriId !== null && isEmirleri.has(r.isEmriId)))) talepler.set(r.talepNo, r.talepId ?? null);
  }
  return [...talepler].map(([no, id]) => ({ id, no })).sort((x, y) => x.no.localeCompare(y.no));
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

// Operasyon tipinin emre gelen şablonu (rota) bu modülün üstündedir; kablolama.ts bağlar. Bağlı değilse şablon yoktur (yazma 409).
// 3494-3 a: Üretim Hazırlık ek maddesi artık emrin listesindedir (elle-madde.ts); ayrı ek madde kaynağı yoktur.
type DenetimEki = (satirlar: readonly DenetimSecimi[]) => void;
export type SablonOzetleyici = (db: Db, tipIdleri: readonly number[]) => Promise<ReadonlyMap<number, { id: number; kod: string; ad: string }>>;
export type SablonaEkleyici = (
  db: Db, kullanici: Kullanici, tipId: number, adim: { baslik: string; kontrol: ListeKontrolu; asama: 'on_hazirlik' | 'hazirlik' }, denetimEki: DenetimEki,
) => Promise<{ id: number; kod: string; surum: number }>;
const kaynak: { sablonOzet: SablonOzetleyici | null; sablonEkle: SablonaEkleyici | null } = { sablonOzet: null, sablonEkle: null };
const kaydedici = <K extends keyof typeof kaynak>(ad: K) => (c: (typeof kaynak)[K]): (typeof kaynak)[K] => {
  const onceki = kaynak[ad];
  kaynak[ad] = c;
  return onceki;
};
export const sablonOzetleyiciKaydet = kaydedici('sablonOzet');
export const sablonaEkleyiciKaydet = kaydedici('sablonEkle');
// Risk K2: şablona ekleme talimat yazma yetkisini de ister; uç yalnız adim-durumu-yaz'ı arar, ikinci yarı burada.
const sablonYazarMi = (k: Kullanici | null): boolean => k !== null && islemVarMi(k, 'rota.talimat-yaz');
export const SABLON_YETKISI = 'Şablona eklemek talimat yazma yetkisi de ister.';
export const SABLON_YOK = 'Bu adımın operasyon tipinin emre gelen şablonu yok.';
export const KALDIRILAMAZ = 'Yalnız elle eklenen madde kaldırılır; rota talimatından gelen madde talimatla değişir.';
// Liste fotoğrafı (Risk K4): yalnız resim, en çok 10 MB; tür içerikten bulunur (dosya modülü). Konum bilgisi istemcide silinir (UYUM-BORCU).
const fotoDeposu = medyaTutamagi('uretim-emirleri');
const FOTO_SINIRI = { turler: ['png', 'jpeg', 'webp'] as const, azamiBayt: 10 * 1024 ** 2 };

// Tabloda statü serbest metindir (liste sonradan değişebilir); listede olmayan eski değer 'diger' okunur.
const ACIK = new Set(['planli', 'basladi']);
const emrinBekletmesi = async (db: Db, emirId: number, durum: string): Promise<BeklemeNedeni | null> =>
  ACIK.has(durum) ? (await s.aktifBekletmeler(db, [emirId]))[0]?.neden ?? null : null;
const statuOku = (x: string): AdimStatusu => (ADIM_STATULERI as readonly string[]).includes(x) ? x as AdimStatusu : 'diger';

// Adım Durumu (2893): emrin her iş emri için sistem statüsü, açık elle statü, açık elle onaylar ve geçmiş. Elle statü sistem statüsü
// değişince düşer (yazıldığı andaki sistem statüsüyle saklanır); elle onay hazırlıkta muafiyet gibi sayılır (hazirlik.ts).
// Adımların sistem statüsü: Adım Durumu, matris ve toplu yazım aynı hesabı kullanır (3604); statü tek yerde türer.
interface SistemHesabi {
  isEmirleri: s.IsEmriSatiri[];
  calisma: ReadonlyMap<number, CalismaDurumu | null>;
  haller: Awaited<ReturnType<typeof isEmriHazirliklari>>;
  tedarik: ReadonlyMap<number, AdimTedariki[]>;
  bekletme: BeklemeNedeni | null;
  sistem: ReadonlyMap<number, { statu: AdimStatusu; nedenler: string[] }>;
}
async function sistemHesabi(db: Db, emirId: number, durum: string): Promise<SistemHesabi> {
  const isEmirleri = [...(await s.isEmirleriGetir(db, [emirId]))].sort((a, b) => a.sira - b.sira);
  const idler = isEmirleri.map((i) => i.id);
  const calisma = new Map((await s.adimDurumlariGetir(db, [emirId])).map((a) => [a.id, a.durum === 'calisiyor' ? calismaDurumu(a.sonOlay) : null]));
  const fason = new Map<number, number>();
  for (const h of await s.akisFasonGetir(db, emirId)) fason.set(h.isEmriId, (fason.get(h.isEmriId) ?? 0) + (h.yon === 'gidis' ? h.adet : -h.adet));
  const haller = await isEmriHazirliklari(db, emirId, idler);
  const tedarik = await adimTedarikleri(db, emirId, idler);
  const bekletme = await emrinBekletmesi(db, emirId, durum);
  const sistem = new Map(isEmirleri.map((i) => [i.id, adimSistemStatusu({
    durum: i.durum, calisma: calisma.get(i.id) ?? null, fasonda: i.fasonFirmaId !== null && i.durum !== 'tamam' && (fason.get(i.id) ?? 0) > 0,
    hal: new Map<HazirlikMaddesi, HazirlikHali>([...(haller.get(i.id) ?? [])].map(([m, h]) => [m, h.hal])),
    oncekiBekleniyor: oncekiBekleniyor({ sira: i.sira, bagimlilik: i.bagimlilik, oncul: i.onculler?.map((o) => o.id) ?? null }, isEmirleri),
    tedarik: i.durum === 'tamam' ? [] : tedarik.get(i.id) ?? [],
    bekletme,
  })]));
  return { isEmirleri, calisma, haller, tedarik, bekletme, sistem };
}

export async function adimDurumu(db: Db, emirId: number, kullanici: Kullanici | null = null): Promise<AdimDurumuCevabi> {
  const e = await s.ustEmirBul(db, emirId);
  if (e === null) throw bulunamadi(EMIR_YOK);
  const genel = await hazirlik(db, emirId);
  const { isEmirleri, calisma, haller, tedarik, sistem: sistemler } = await sistemHesabi(db, emirId, e.durum);
  const idler = isEmirleri.map((i) => i.id);
  const ilerleme = await emrinIlerlemesi(db, emirId, e.adet);
  const statuDefteri = await s.elleStatuDefteri(db, idler);
  const onayDefteri = await s.hazirlikOnayDefteri(db, idler);
  const atlamalar = await s.talimatAtlamalari(db, idler);
  const liste = await s.listeSatirlari(db, idler);
  const sablonlar = kaynak.sablonOzet === null ? new Map<number, { id: number; kod: string; ad: string }>() : await kaynak.sablonOzet(db, isEmirleri.map((i) => i.operasyonTipiId));
  const adlar = await kisiAdlari(db, [...new Set([
    ...[...statuDefteri, ...onayDefteri, ...atlamalar].map((x) => x.kisiId),
    ...liste.flatMap((x) => [x.olayKisiId, x.ekleyenId].filter((k): k is number => k !== null)),
  ])]);
  const ad = (id: number) => adlar.get(id) ?? null;
  return {
    emirId, emirNo: e.emirNo, urun: { kod: e.parcaNo, ad: e.parcaAd }, adet: e.adet, teslim: e.teslim, durum: e.durum,
    rotaYuzde: ilerleme?.rota ?? null, hazirlik: genel,
    yetki: { sablon: sablonYazarMi(kullanici) },
    adimlar: isEmirleri.map((i, sira) => {
      const sistem = sistemler.get(i.id) ?? { statu: 'diger' as const, nedenler: [] };
      const statuSatirlari = statuDefteri.filter((x) => x.isEmriId === i.id);
      const onaySatirlari = onayDefteri.filter((x) => x.isEmriId === i.id);
      const elle = acikElleStatu(statuSatirlari, sistem.statu);
      const eksikler = [...acikElleEksikler(onaySatirlari).values()];
      const adim = ilerleme?.adimlar[sira];
      return {
        isEmriId: i.id, opNo: i.opNo, ad: i.ad, durum: i.durum, calisma: calisma.get(i.id) ?? null, bagimlilik: i.bagimlilik,
        fason: i.fasonFirmaId !== null, muayene: otomatikMuayeneMi(i), hedef: adim?.hedef ?? 0, yapilan: adim?.yapilan ?? 0, yuzde: adim?.yuzde ?? 0,
        sistemStatusu: sistem.statu,
        nedenler: [...eksikler.map((x) => elleEksikNedeni(x.madde as HazirlikMaddesi, ad(x.kisiId))), ...sistem.nedenler],
        maddeler: [...(haller.get(i.id) ?? [])].map(([madde, h]) => ({ madde, hal: h.hal, ham: h.ham })),
        tedarik: i.durum === 'tamam' ? [] : tedarik.get(i.id) ?? [],
        elle: elle === null || elle.statu === null ? null : { statu: statuOku(elle.statu), not: elle.aciklama, kisiAdi: ad(elle.kisiId), zaman: elle.zaman },
        onaylar: [...acikOnaylar(onaySatirlari).values()].map((o) => ({
          madde: o.madde as HazirlikMaddesi, gerekce: o.gerekce, sistemHali: (o.sistemHali ?? 'bilinmiyor') as HazirlikHali, kisiAdi: ad(o.kisiId), zaman: o.zaman,
        })),
        elleEksikler: eksikler.map((o) => ({
          madde: o.madde as HazirlikMaddesi, gerekce: o.gerekce, sistemHali: (o.sistemHali ?? 'bilinmiyor') as HazirlikHali, kisiAdi: ad(o.kisiId), zaman: o.zaman,
        })),
        gecmis: [
          ...statuSatirlari.map((x) => ({ olay: x.olay === 'yaz' ? 'statu' as const : 'statu-kaldir' as const, deger: x.statu ?? '', not: x.aciklama, kisiAdi: ad(x.kisiId), zaman: x.zaman })),
          ...onaySatirlari.map((x) => ({ olay: x.olay === 'kaldir' ? 'onay-kaldir' as const : x.olay, deger: x.madde, not: x.gerekce, kisiAdi: ad(x.kisiId), zaman: x.zaman })),
          ...atlamalar.filter((x) => x.isEmriId === i.id).map((x) => ({ olay: 'talimat-atlama' as const, deger: x.eylem, not: x.maddeler.join(', '), kisiAdi: ad(x.kisiId), zaman: x.zaman })),
        ].sort((a, b) => Date.parse(b.zaman) - Date.parse(a.zaman)),
        liste: liste.filter((x) => x.isEmriId === i.id).map((x) => {
          const tamam = x.sonOlay === 'tamamla';
          const kontrol = listeKontrolu(x.kontrol);
          const olcum = tamam ? x.kanitOlcum : null;
          return {
            kontrol, olcum, secim: tamam ? x.kanitSecim : null, fotoOzet: tamam ? x.kanitFoto : null, sinirDisi: sinirDisiMi(kontrol, olcum),
            adimId: x.id, ad: x.ad, aciklama: x.aciklama, asama: x.asama, tamam,
            kisiAdi: x.olayKisiId === null ? null : ad(x.olayKisiId), zaman: x.olayZamani,
            kaynak: x.sonOlay === null ? null : x.olayKaynagi === 'adim-durumu' ? 'adim-durumu' as const : 'terminal' as const,
            kanit: tamam ? kanitMetni({ olcum: x.kanitOlcum, secim: x.kanitSecim, foto: x.kanitFoto }) : null,
            ekleyenAdi: x.ekleyenId === null ? null : ad(x.ekleyenId), eklenme: x.eklenme,
          };
        }),
        sablon: sablonlar.get(i.operasyonTipiId) ?? null,
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
async function yazmaHazirla(db: Db, emirId: number, isEmriId: number, kullanici: Kullanici | null = null): Promise<AdimDurumuCevabi['adimlar'][number]> {
  const e = await s.ustEmirBul(db, emirId, true);
  if (e === null) throw bulunamadi(EMIR_YOK);
  if (e.durum === 'bitti' || e.durum === 'iptal') throw cakisma(ADIM_KAPALI_EMIR);
  if (!(await s.isEmriKilitle(db, isEmriId, emirId))) throw bulunamadi(IS_EMRI_EMIRDE_YOK);
  const adim = (await adimDurumu(db, emirId, kullanici)).adimlar.find((a) => a.isEmriId === isEmriId);
  if (adim === undefined) throw bulunamadi(IS_EMRI_EMIRDE_YOK);
  return adim;
}

export async function elleStatuYaz(db: Db, kullanici: Kullanici, emirId: number, isEmriId: number, g: ElleStatuGovdesi): Promise<AdimDurumuCevabi> {
  const adim = await yazmaHazirla(db, emirId, isEmriId);
  if (adim.sistemStatusu !== g.sistemStatusu) throw cakisma(STATU_ESKIDI);
  // 3050 a: beklemedeki adımın statüsü bekletmeden gelir; elle statü "Beklemede"yi örtmesin, bekletme kalkınca yazılır.
  if (adim.sistemStatusu === 'beklemede') throw cakisma(EMIR_BEKLEMEDE_STATU);
  // 3604: biten adımın sistem statüsü değişmez, elle statü hiç düşmezdi; yazılmaz (otomatiğe dön açık kalır).
  if (adim.sistemStatusu === 'bitti') throw cakisma(ADIM_BITTI_STATU);
  await s.elleStatuEkle(db, { isEmriId, olay: 'yaz', statu: g.statu, sistemStatusu: adim.sistemStatusu, aciklama: g.not === '' ? null : g.not, kisiId: kullanici.id });
  return adimDurumu(db, emirId, kullanici);
}

export async function elleStatuKaldir(db: Db, kullanici: Kullanici, emirId: number, isEmriId: number): Promise<AdimDurumuCevabi> {
  const adim = await yazmaHazirla(db, emirId, isEmriId);
  if (adim.elle === null) throw cakisma(ELLE_STATU_YOK);
  await s.elleStatuEkle(db, { isEmriId, olay: 'kaldir', statu: null, sistemStatusu: null, aciklama: null, kisiId: kullanici.id });
  return adimDurumu(db, emirId, kullanici);
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
  return adimDurumu(db, emirId, kullanici);
}

// 3322 (Risk K4): elle "hazır değil". Hâl denetimi onaydaki gibidir; gerekmeyen madde ve zaten elle eksik olan reddedilir. Kişi ve zaman
// sunucudan; kaynak sürümü bilgi için saklanır, düşürmez (K3).
export async function hazirlikElleEksik(db: Db, kullanici: Kullanici, emirId: number, isEmriId: number, g: HazirlikElleEksikGovdesi): Promise<AdimDurumuCevabi> {
  const adim = await yazmaHazirla(db, emirId, isEmriId);
  const madde = (await isEmriHazirliklari(db, emirId, [isEmriId])).get(isEmriId)?.get(g.madde);
  const hal = madde?.hal ?? 'bilinmiyor';
  if (hal !== g.sistemHali) throw cakisma(HAL_ESKIDI);
  const ret = elleEksikReddi(madde?.ham ?? 'bilinmiyor', adim.elleEksikler.some((x) => x.madde === g.madde));
  if (ret !== null) throw cakisma(ret);
  const gerekce = g.gerekce === null || g.gerekce === '' ? null : g.gerekce;
  await s.hazirlikOnayiEkle(db, { isEmriId, madde: g.madde, olay: 'eksik', sistemHali: hal, gerekce, onaylananSurum: madde?.surum ?? null, kisiId: kullanici.id });
  return adimDurumu(db, emirId, kullanici);
}

// Elle değeri (onay ya da hazır değil) kaldırır; madde otomatik hâline döner.
export async function hazirlikOnayKaldir(db: Db, kullanici: Kullanici, emirId: number, isEmriId: number, g: HazirlikOnayiKaldirGovdesi): Promise<AdimDurumuCevabi> {
  const adim = await yazmaHazirla(db, emirId, isEmriId);
  if (!adim.onaylar.some((o) => o.madde === g.madde) && !adim.elleEksikler.some((o) => o.madde === g.madde)) throw cakisma(ONAY_YOK);
  await s.hazirlikOnayiEkle(db, { isEmriId, madde: g.madde, olay: 'kaldir', sistemHali: null, gerekce: null, onaylananSurum: null, kisiId: kullanici.id });
  return adimDurumu(db, emirId, kullanici);
}

// 3249 b: ofisten hazırlık listesi işareti. Yalnız ön hazırlık ve hazırlık aşaması (Risk K5); kayıt kişi, zaman ve "Adım Durumu"
// kaynağıyla yazılır (K4). Kanıt istemez: ölçüm, seçim ve fotoğraf operatörün terminal kaydıdır (Dilim 2 ayrı karar).
// 3249-2 a: ölçüm, seçim ve fotoğraf maddesi kanıtla işaretlenir; tür eşleşmesi, seçenek ve fotoğraf bağı sunucuda (Risk K3). İşaretli
// maddeye yeni kanıt değeri değiştirir (yeni tamamla olayı). Sınır dışı ölçüm kaydolur; bayrağı okumada sunucu hesaplar.
export async function listeIsaretle(
  db: Db, kullanici: Kullanici, emirId: number, isEmriId: number, g: ListeIsaretleGovdesi, denetimEki: DenetimEki = () => undefined,
): Promise<AdimDurumuCevabi> {
  const adim = await yazmaHazirla(db, emirId, isEmriId);
  const madde = adim.liste.find((m) => m.adimId === g.adimId);
  if (madde === undefined) throw bulunamadi(LISTE_MADDESI_YOK);
  const ret = listeIsaretReddi(adim.durum === 'tamam', madde.tamam, g.tamam, g.kanit !== undefined);
  if (ret !== null) throw cakisma(ret);
  const kanitRet = listeKanitiReddi(madde.kontrol, g.tamam, g.kanit);
  if (kanitRet !== null) throw dogrulama(kanitRet, 'kanit');
  const foto = g.kanit?.foto;
  if (foto !== undefined) {
    const kayit = s.listeFotoKaydi(g.adimId);
    if (!(await fotoDeposu.bagliOlanlar(db, kayit, [foto.ozet])).includes(foto.ozet)) {
      denetimEki([denetimSatiri('bagla', await fotoDeposu.dosyaBagla(db, kullanici, { ozet: foto.ozet, kayit, ad: foto.ad, belgeTuru: null }, FOTO_SINIRI))]);
    }
  }
  const olayId = await s.listeOlayiEkle(db, g.adimId, kullanici.id, g.tamam ? 'tamamla' : 'geri-al');
  if (g.tamam && g.kanit !== undefined) {
    await s.adimKanitiEkle(db, olayId, { olcum: g.kanit.olcum ?? null, secim: g.kanit.secim ?? null, foto: foto?.ozet ?? null });
  }
  return adimDurumu(db, emirId, kullanici);
}

// Fotoğraf yalnız kendi maddesinin kaydından ve adımı emirde olan maddeden okunur.
export async function listeFotografi(db: Db, emirId: number, adimId: number, ozet: string): Promise<IkiliCevap> {
  if (!(await adimEmrinListesinde(db, emirId, adimId))) throw bulunamadi(LISTE_MADDESI_YOK);
  const akis = await fotoDeposu.dosyaAkisi(db, s.listeFotoKaydi(adimId), ozet);
  if (akis === null) throw bulunamadi('Fotoğraf bulunamadı.');
  return akis;
}
async function adimEmrinListesinde(db: Db, emirId: number, adimId: number): Promise<boolean> {
  return (await adimDurumu(db, emirId)).adimlar.some((a) => a.liste.some((m) => m.adimId === adimId));
}

// 3494-3 a: elle eklenen madde kaldırılabilir (yanlış ya da gereksiz eklenen); iz kalır, kaldırma geri alınmaz. Biten adımın listesi
// değişmez. Rota talimatından gelen madde talimatla değişir, burada kaldırılmaz. İşaretli madde önce geri alınır (yapılmış iş sessizce silinmez).
export async function listeMaddesiKaldir(db: Db, kullanici: Kullanici, emirId: number, isEmriId: number, g: ListeKaldirGovdesi): Promise<AdimDurumuCevabi> {
  const adim = await yazmaHazirla(db, emirId, isEmriId);
  const madde = adim.liste.find((m) => m.adimId === g.adimId);
  if (madde === undefined) throw bulunamadi(LISTE_MADDESI_YOK);
  if (adim.durum === 'tamam') throw cakisma(LISTE_ADIM_BITTI);
  if (madde.eklenme === null) throw cakisma(KALDIRILAMAZ);
  if (madde.tamam) throw cakisma(ISARETLI_KALDIRILMAZ);
  await s.listeOlayiEkle(db, g.adimId, kullanici.id, 'kaldir');
  return adimDurumu(db, emirId, kullanici);
}

// Eklenen madde yalnız bu iş emrinindir: terminalde operatörün hazırlık listesinde de görünür, talimatı ve şablonu değiştirmez.
// "Şablona da ekle" (Risk K2): talimat yazma yetkisi de aranır, hedef adımın tipinin emre gelen şablonudur; şablon yeni sürüm alır ve
// kaydı denetim satırında (şablon, sürüm) bu ucun kaydına eklenir. Emrin maddesi ve şablon aynı işlemde yazılır.
export async function listeMaddesiEkle(
  db: Db, kullanici: Kullanici, emirId: number, isEmriId: number, g: ListeEkleGovdesi, denetimEki: DenetimEki = () => undefined,
): Promise<AdimDurumuCevabi> {
  if (g.sablonaEkle && !sablonYazarMi(kullanici)) throw yetkiYok(SABLON_YETKISI);
  const adim = await yazmaHazirla(db, emirId, isEmriId, kullanici);
  const ret = listeEkleReddi(adim.durum === 'tamam', adim.liste.length, g.asama, g.kontrol);
  if (ret === LISTE_ADIM_BITTI || ret === LISTE_DOLU) throw cakisma(ret);
  if (ret !== null) throw dogrulama(ret, 'kontrol');
  await s.listeMaddesiEkle(db, { emirId, isEmriId, ad: g.ad, asama: g.asama, kisiId: kullanici.id, kontrol: g.kontrol.tur === 'onay' ? null : g.kontrol });
  if (g.sablonaEkle) {
    const tipId = (await s.isEmirleriGetir(db, [emirId])).find((i) => i.id === isEmriId)?.operasyonTipiId;
    const ekle = kaynak.sablonEkle;
    if (ekle === null || tipId === undefined || adim.sablon === null) throw cakisma(SABLON_YOK);
    const yeni = await ekle(db, kullanici, tipId, { baslik: g.ad, kontrol: g.kontrol, asama: g.asama }, denetimEki);
    denetimEki([{ islem: 'sablona-ekle', sablon: yeni.kod, surum: yeni.surum, isEmriId }]);
  }
  return adimDurumu(db, emirId, kullanici);
}

// 3604: Adım Durumu matrisi. Açık emirlerin adımları tek okumada; hazırlık ayrıntısı, liste ve geçmiş yoktur. Sistem statüsü Adım Durumu'yla
// aynı hesaptan (sistemHesabi) gelir; elle statü sistem statüsü değişince düşmüş sayılır.
const MATRIS_BITEN_SAYISI = 30;
// Elle değer: onay ve elle "hazır değil" aynı maddede birlikte olmaz (son kayıt geçerlidir); adım detayındaki okumayla aynı kural.
function matrisMaddeleri(
  haller: ReadonlyMap<HazirlikMaddesi, { hal: HazirlikHali; ham: HazirlikHali }> | undefined, defter: readonly s.HazirlikOnaySatiri[], adlar: ReadonlyMap<number, string>,
): AdimMatrisiCevabi['emirler'][number]['adimlar'][number]['maddeler'] {
  const onay = acikOnaylar(defter);
  const eksik = acikElleEksikler(defter);
  return [...(haller ?? [])].map(([madde, h]) => {
    const e = eksik.get(madde);
    const o = onay.get(madde);
    const kayit = e ?? o;
    return {
      madde, hal: h.hal, ham: h.ham,
      elle: kayit === undefined ? null : { tur: e === undefined ? 'hazir' as const : 'eksik' as const, gerekce: kayit.gerekce, kisiAdi: adlar.get(kayit.kisiId) ?? null, zaman: kayit.zaman },
    };
  });
}
export async function adimMatrisi(db: Db, kullanici: Kullanici, biten: boolean): Promise<AdimMatrisiCevabi> {
  const gizli = new Set(await denemeIsaretliKimlikler(db, 'uretim_emri'));
  const emirler = (await s.ustEmirler(db, false, null, false)).filter((e) => !gizli.has(e.id) && e.durum !== 'bitti' && e.durum !== 'iptal');
  if (biten) emirler.push(...(await s.bitenUstEmirler(db, { durum: 'bitti', ara: null, gizli: [...gizli] }, { sinir: MATRIS_BITEN_SAYISI, atla: 0 })));
  const hesaplar = new Map<number, SistemHesabi>();
  for (const e of emirler) hesaplar.set(e.id, await sistemHesabi(db, e.id, e.durum));
  const idler = [...hesaplar.values()].flatMap((h) => h.isEmirleri.map((i) => i.id));
  const defter = await s.elleStatuDefteri(db, idler);
  // 3738: hazırlık maddelerinin elle değeri tek toplu okumadır; madde hâlleri sistem hesabında zaten hesaplandı.
  const onayDefteri = await s.hazirlikOnayDefteri(db, idler);
  const adlar = await kisiAdlari(db, [...new Set([...defter, ...onayDefteri].map((x) => x.kisiId))]);
  const sonuc: AdimMatrisiCevabi['emirler'] = [];
  for (const e of emirler) {
    const h = hesaplar.get(e.id);
    if (h === undefined || h.isEmirleri.length === 0) continue;
    const ilerleme = await emrinIlerlemesi(db, e.id, e.adet);
    sonuc.push({
      emirId: e.id, emirNo: e.emirNo, urun: { kod: e.parcaNo, ad: e.parcaAd }, durum: e.durum, teslim: e.teslim,
      adimlar: h.isEmirleri.map((i, sira) => {
        const sistem = h.sistem.get(i.id)?.statu ?? 'diger';
        const elle = acikElleStatu(defter.filter((x) => x.isEmriId === i.id), sistem);
        const adim = ilerleme?.adimlar[sira];
        return {
          isEmriId: i.id, opNo: i.opNo, ad: i.ad, durum: i.durum, hedef: adim?.hedef ?? 0, yapilan: adim?.yapilan ?? 0, yuzde: adim?.yuzde ?? 0, sistemStatusu: sistem,
          elle: elle === null || elle.statu === null ? null : { statu: statuOku(elle.statu), not: elle.aciklama, kisiAdi: adlar.get(elle.kisiId) ?? null, zaman: elle.zaman },
          maddeler: matrisMaddeleri(h.haller.get(i.id), onayDefteri.filter((x) => x.isEmriId === i.id), adlar),
        };
      }),
    });
  }
  return { emirler: sonuc, yazabilir: islemVarMi(kullanici, 'uretim-emirleri.adim-durumu-yaz') };
}

// 3604: toplu elle statü. Kalem başına bağımsız karar (bayat ya da atlanan kalem ötekileri bozmaz); karar adim-matrisi-kurali.ts'in kararıdır,
// ekranın sayımıyla aynı. Her yazılan kalem statü defterine kendi satırını yazar (kişi, zaman, statü, not, o anki sistem statüsü). Emir ve iş
// emri kilitleri emir, iş emri sırasıyla alınır: iki eşzamanlı toplu yazım aynı sırada kilitler, birbirini beklemeden kilitlenmez.
export async function statuTopluYaz(
  db: Db, kullanici: Kullanici, g: StatuTopluGovdesi, denetimEki: DenetimEki = () => undefined,
): Promise<StatuTopluCevabi> {
  const sonuclar = new Map<string, { sonuc: StatuTopluSonucu; neden: string | null }>();
  const anahtar = (emirId: number, isEmriId: number): string => `${String(emirId)}:${String(isEmriId)}`;
  const emreGore = new Map<number, StatuTopluGovdesi['kalemler']>();
  for (const k of g.kalemler) emreGore.set(k.emirId, [...(emreGore.get(k.emirId) ?? []), k]);
  for (const emirId of [...emreGore.keys()].sort((a, b) => a - b)) {
    const kalemler = [...(emreGore.get(emirId) ?? [])].sort((a, b) => a.isEmriId - b.isEmriId);
    const e = await s.ustEmirBul(db, emirId, true);
    const emirRet = (neden: string, sonuc: StatuTopluSonucu = 'ret') => { for (const k of kalemler) sonuclar.set(anahtar(emirId, k.isEmriId), { sonuc, neden }); };
    if (e === null) { emirRet(EMIR_YOK); continue; }
    const hesap = await sistemHesabi(db, emirId, e.durum);
    const defter = await s.elleStatuDefteri(db, hesap.isEmirleri.map((i) => i.id));
    for (const k of kalemler) {
      const yer = anahtar(emirId, k.isEmriId);
      if (!hesap.sistem.has(k.isEmriId) || !(await s.isEmriKilitle(db, k.isEmriId, emirId))) { sonuclar.set(yer, { sonuc: 'ret', neden: IS_EMRI_EMIRDE_YOK }); continue; }
      const sistem = hesap.sistem.get(k.isEmriId)?.statu ?? 'diger';
      const elle = acikElleStatu(defter.filter((x) => x.isEmriId === k.isEmriId), sistem);
      if (k.statu !== null && k.sistemStatusu !== sistem) { sonuclar.set(yer, { sonuc: 'eski', neden: STATU_ESKIDI }); continue; }
      const karar = kalemKarari({ emirDurumu: e.durum, sistemStatusu: sistem, elleVar: elle !== null, statu: k.statu, calisanOnay: g.calisanOnay === true });
      if (!karar.yazilir) { sonuclar.set(yer, { sonuc: 'atlandi', neden: ATLAMA_METNI[karar.neden] }); continue; }
      if (k.statu === null) await s.elleStatuEkle(db, { isEmriId: k.isEmriId, olay: 'kaldir', statu: null, sistemStatusu: null, aciklama: null, kisiId: kullanici.id });
      else await s.elleStatuEkle(db, { isEmriId: k.isEmriId, olay: 'yaz', statu: k.statu, sistemStatusu: sistem, aciklama: k.not === null || k.not === '' ? null : k.not, kisiId: kullanici.id });
      sonuclar.set(yer, { sonuc: k.statu === null ? 'kaldirildi' : 'yazildi', neden: null });
    }
  }
  const kalemler = g.kalemler.map((k) => {
    const r = sonuclar.get(anahtar(k.emirId, k.isEmriId)) ?? { sonuc: 'ret' as const, neden: IS_EMRI_EMIRDE_YOK };
    return { emirId: k.emirId, isEmriId: k.isEmriId, sonuc: r.sonuc, neden: r.neden };
  });
  // Genel denetim kaydı gövdeyi (kalemleri) zaten tutar; sonuç kalem başına ek satırdır (en çok 100 satır, her biri 3 küçük alan).
  denetimEki(kalemler.map((k) => ({ isEmriId: k.isEmriId, sonuc: k.sonuc, statu: g.kalemler.find((x) => x.isEmriId === k.isEmriId)?.statu ?? null })));
  return { kalemler };
}
