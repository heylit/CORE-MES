import { type Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, gecersiz } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { KATALOG_TURLERI, type KatalogMalzemeOzeti } from '#paylasilan/sozlesme/malzemeler.ts';
import { ACIK_EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type {
  KaliteDurumu, CikisOnerisiCevabi, MalzemeAyarKomutu, MalzemeAyrintiCevabi, MalzemeKartBilgileriCevabi, MalzemelerListesi, MalzemeOzetiCevabi, MalzemeStokSatiri, Parti, PartiIziCevabi,
  PartilerListesi, GozOnerisiCevabi, PanelCevabi, LotEtiketi, SktDuzeltCevabi, SktDuzeltGovdesi, StokTurListesi, TurListesiCevabi,
} from '#paylasilan/sozlesme/stok.ts';
import { STOK_TUR_LISTELERI } from '#paylasilan/sozlesme/stok.ts';
import { kartAlanDegerleri, kategoriKartlari, malzemeAra, malzemeKullanilabilirMi, malzemeNoKoddan, malzemeOzeti, malzemeOzetleri, sktTakipliKartlar } from '../../malzemeler/disari.ts';
import { emirlerinSevkleri } from '../../sevkiyat/disari.ts';
import { emirDurumlari } from '../../uretim-emirleri/disari.ts';
import { binde, bindenMetin, cikisOnerisi, partiEtiketi, statuAramasi, statuKirilimi, statuKodlari, stoksuzStatuler, stoklanirMi, malKabulGozOnerisi, stokDurumu } from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import { zeminDurumu } from './depo.ts';
import { korumali, adlar, emirNoDe, emirNoHaritasi, bakiyeSatiri, hareketleriCevir, sktBugun } from './ortak.ts';
import { refakatPartileriCevir, kartlarinCiktiVeSevkleri } from './refakat.ts';
import { statuler, bekleyenEmirler, rezerveListesi } from './uretim.ts';

// ---- Malzeme gözüyle stok -------------------------------------------------------------------------------------------------
// Açık emirlere ayrılan toplam, malzeme başına (kapanan ya da iptal edilen emrinki sayılmaz).
async function rezerveToplamlari(db: Db, malzemeIdler: number[]): Promise<Map<number, bigint>> {
  const satirlar = malzemeIdler.length === 0 ? [] : await sorgular.rezerveler(db, malzemeIdler);
  const durumlar = await emirDurumlari(db, satirlar.map((r) => r.uretimEmriId));
  const t = new Map<number, bigint>();
  for (const r of satirlar) {
    if ((ACIK_EMIR_DURUMLARI as readonly string[]).includes(durumlar.get(r.uretimEmriId) ?? '')) t.set(r.malzemeId, (t.get(r.malzemeId) ?? 0n) + binde(r.miktar));
  }
  return t;
}
function malzemeSatiri(h: sorgular.MalzemeStokHam, o: KatalogMalzemeOzeti | undefined | null, rezerve: bigint): MalzemeStokSatiri {
  return {
    malzemeId: h.malzemeId, ad: o?.ad ?? null, stokKodu: o?.kod ?? null, tur: o?.tur ?? null, birim: o?.birim ?? null,
    toplam: bindenMetin(binde(h.toplam)), serbest: bindenMetin(binde(h.serbest)), statude: bindenMetin(binde(h.statude)), kritikSeviye: h.kritikSeviye, durum: stokDurumu(h.serbest, h.kritikSeviye), konumSayisi: h.konumSayisi,
    rezerve: bindenMetin(rezerve),
    konumlar: h.konumlar.map((k) => ({ ...k, miktar: bindenMetin(binde(k.miktar)) })),
    kategoriAdi: o?.kategoriAdi ?? null, kartDurumu: o?.onayDurumu ?? null, varsayilanKonum: h.varsayilanKonum, sonHareket: h.sonHareket,
  };
}
// Kart tablosu malzemelerindir: "bütün kartlar" sayfası malzemeAra ile gelir, stok sayıları o sayfanın kartları için okunur.
export const STOKLANIR_TURLER = KATALOG_TURLERI.filter(stoklanirMi);
async function kartListesi(db: Db, s: MalzemelerListesi): Promise<SayfaliListe<MalzemeStokSatiri>> {
  const metin = s.metin ?? null;
  return sayfaliListe(s, {
    say: async () => (await malzemeAra(db, { metin, turler: STOKLANIR_TURLER, sayfa: 1, sayfaBoyu: 1 })).toplam ?? 0,
    satirlar: async (d) => {
      const kartlar = (await malzemeAra(db, { metin, turler: STOKLANIR_TURLER, sayfa: Math.floor(d.atla / d.sinir) + 1, sayfaBoyu: d.sinir })).satirlar;
      const stok = await sorgular.kartStoklari(db, kartlar.map((k) => k.id));
      const rezerve = await rezerveToplamlari(db, stok.map((h) => h.malzemeId));
      return stok.map((h, i) => malzemeSatiri(h, kartlar[i], rezerve.get(h.malzemeId) ?? 0n));
    },
  });
}
export async function malzemeListesi(db: Db, s: MalzemelerListesi): Promise<SayfaliListe<MalzemeStokSatiri>> {
  if (s.kapsam === 'kartlar') return kartListesi(db, s);
  // Ad ve stok koduyla eşleşen kartların ilk 200'ü süzgece girer; fazlası daha uzun metinle daraltılır.
  const adlaBulunan = s.metin ? (await malzemeAra(db, { metin: s.metin, sayfa: 1, sayfaBoyu: 200 })).satirlar.map((x) => x.id) : undefined;
  // Statülü süzgeç tanımlı statüsü olan kartı stoğu olmasa da getirir; metin statü adıyla da aranır (K-X8).
  const tum = s.durum === 'statulu' || s.metin ? (await statuler(db)).statuler : [];
  const statuIdleri = s.metin ? statuAramasi(tum, s.metin) : [];
  const kaynak = s.metin ? tum.filter((x) => statuIdleri.includes(x.id)) : tum;
  const statuluKartlar = await kartlarKoddan(db, statuKodlari(kaynak));
  const suzgec = { durum: s.durum, metin: s.metin, adlaBulunan, statuIdleri, statuluKartlar };
  const l = await sayfaliListe(s, { say: () => sorgular.malzemeSay(db, suzgec), satirlar: (d) => sorgular.malzemeStoklari(db, suzgec, s, d) });
  const ozetler = await malzemeOzetleri(db, l.satirlar.map((h) => h.malzemeId));
  const rezerve = await rezerveToplamlari(db, l.satirlar.map((h) => h.malzemeId));
  return { ...l, satirlar: l.satirlar.map((h) => malzemeSatiri(h, ozetler.get(h.malzemeId), rezerve.get(h.malzemeId) ?? 0n)) };
}
async function kartlarKoddan(db: Db, kodlar: readonly string[]): Promise<number[]> {
  const idler: number[] = [];
  for (const kod of kodlar) { const no = await malzemeNoKoddan(db, kod); if (no !== null) idler.push(no); }
  return idler;
}
export async function malzemeOzetiOku(db: Db, id: number): Promise<MalzemeOzetiCevabi> {
  const o = await malzemeOzeti(db, id);
  if (!o) throw bulunamadi('Malzeme kartı bulunamadı.');
  return { ozet: { id: o.id, tur: o.tur, kod: o.kod, ad: o.ad, onayDurumu: o.onayDurumu, kullanilabilir: await malzemeKullanilabilirMi(db, id), birim: o.birim } };
}
export async function malzemeAyrintisi(db: Db, id: number): Promise<MalzemeAyrintiCevabi> {
  const h = await sorgular.malzemeStoku(db, id);
  const o = await malzemeOzeti(db, id);
  if (!o) throw bulunamadi('Malzeme kartı bulunamadı.');
  const b = await sorgular.malzemeBakiyeleri(db, id);
  const ad = new Map(o.ad === null ? [] : [[id, o.ad]]);
  const ayar = await sorgular.malzemeAyari(db, id);
  const son = await sorgular.hareketler(db, { malzemeId: id }, {}, { sinir: 5, atla: 0 });
  const { zeminMetni } = await zeminDurumu(db);
  const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
  const kirilim = statuKirilimi(b);
  return {
    satir: malzemeSatiri(h!, o, (await rezerveToplamlari(db, [id])).get(id) ?? 0n),
    bakiyeler: b.map((x) => ({ ...bakiyeSatiri(x, ad, nolar), zemin: zeminMetni(x.konumId) })),
    statuKirilimi: kirilim,
    tanimliStatuler: stoksuzStatuler((await statuler(db)).statuler, o.kod, kirilim),
    rezerveler: (await rezerveListesi(db, id)).rezerveler,
    bekleyenler: (await bekleyenEmirler(db, id)).map((e) => ({ uretimEmriId: e.uretimEmriId, emirNo: e.emirNo, miktar: bindenMetin(e.bekleyen) })),
    ayar: {
      kritikSeviye: ayar?.kritikSeviye ?? null,
      varsayilanAmbalaj: ayar?.varsayilanAmbalajTur ? { tur: ayar.varsayilanAmbalajTur, olcu: ayar.varsayilanAmbalajOlcu ?? '' } : null,
      varsayilanKonum: ayar?.varsayilanKonumId != null && ayar.varsayilanKonumKod !== null ? { id: ayar.varsayilanKonumId, kod: ayar.varsayilanKonumKod } : null,
      ambalajlar: await sorgular.malzemeAmbalajlari(db, id),
      surum: ayar?.surum ?? null,
    },
    sonHareketler: await hareketleriCevir(db, son),
  };
}
export async function malzemeAyariYaz(db: Db, id: number, g: MalzemeAyarKomutu): Promise<MalzemeAyrintiCevabi> {
  if (!(await malzemeOzeti(db, id))) throw bulunamadi('Malzeme kartı bulunamadı.');
  const a = { kritikSeviye: g.kritikSeviye ?? null, ambalajTur: g.varsayilanAmbalaj?.tur ?? null, ambalajOlcu: g.varsayilanAmbalaj?.olcu ?? null, konumId: g.varsayilanKonumId };
  await korumali(async () => {
    if (a.konumId !== null && !(await sorgular.konumAktifMi(db, a.konumId))) throw gecersiz('Varsayılan konum bulunamadı ya da pasif.');
    if (g.surum === null) {
      if (!(await sorgular.ayarAc(db, id, a))) throw cakisma('Bu malzemenin ayarı az önce açıldı; yeniden okuyun.');
    } else {
      const surum = g.surum;
      await surumluGuncelle({ guncelle: () => sorgular.ayarGuncelle(db, id, surum, a), varMi: () => sorgular.ayarVarMi(db, id), bulunamadiIletisi: 'Malzeme ayarı bulunamadı.' });
    }
    await sorgular.ambalajlariYaz(db, id, g.ambalajlar);
  });
  return malzemeAyrintisi(db, id);
}
// DEP-60: kart kimliği malzemelerden okunur (stok malzemeleri ithal eder, ters yön döngü olurdu).
export function malzemeKartBilgileri(db: Db, s: { sayfa: number; sayfaBoyu?: number | undefined }): Promise<SayfaliListe<MalzemeKartBilgileriCevabi['satirlar'][number]>> {
  return sayfaliListe(s, {
    say: () => sorgular.kartBilgisiSay(db),
    satirlar: async (d) => {
      const satirlar = await sorgular.kartBilgileri(db, d);
      const ozet = await malzemeOzetleri(db, satirlar.map((x) => x.malzemeId));
      return satirlar.map((x) => ({ ...x, kartKimligi: ozet.get(x.malzemeId)?.kimlik ?? null }));
    },
    sayfaBoyu: { varsayilan: 200, azami: 500 },
  });
}
export async function cikisOnerisiOku(db: Db, id: number, miktar: string): Promise<CikisOnerisiCevabi> {
  const b = await sorgular.serbestBakiyeler(db, id);
  const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
  return cikisOnerisi(b.map((x) => ({
    bakiyeId: x.id, konumId: x.konumId, konumKod: x.konumKod, konumTur: x.konumTur, partiId: x.partiId, miktar: x.miktar, ilkGiris: x.ilkGiris, sonKullanma: x.sonKullanma,
    partiEtiketi: x.partiId === null ? null : partiEtiketi({ lotNo: x.lotNo, tedarikciPartiNo: x.tedarikciPartiNo, dokumNo: x.dokumNo, uretimEmriId: x.uretimEmriId }, emirNoDe(nolar, x.uretimEmriId)),
  })), miktar, sktBugun());
}

// Göz önerisi (DEP-34): kural saf fonksiyondadır; veri yoksa null döner, göz uydurulmaz.
export async function gozOnerisi(db: Db, malzemeId: number): Promise<GozOnerisiCevabi> {
  const o = malKabulGozOnerisi(await sorgular.gozAdaylari(db, malzemeId));
  return { oneri: o ? { konumId: o.konumId, kod: o.kod } : null };
}

// Panel: iş kutusunun gösterge kartları, son yedi gün, kritik stok, raf doluluğu ve son hareketler.
export async function panel(db: Db, islemler: readonly string[]): Promise<PanelCevabi> {
  const s = await sorgular.panelSayilari(db);
  const kritik = await sorgular.kritikMalzemeler(db);
  const ko = await malzemeOzetleri(db, kritik.map((k) => k.malzemeId));
  const kritikListe = kritik.map((k) => {
    const o = ko.get(k.malzemeId);
    return { malzemeId: k.malzemeId, ad: o?.ad ?? null, kod: o?.kod ?? null, toplam: bindenMetin(binde(k.toplam)), kritikSeviye: k.kritikSeviye };
  });
  const raflar = await sorgular.raflar(db, {}, {}, { sinir: 12, atla: 0 });
  const son = await sorgular.hareketler(db, {}, {}, { sinir: 6, atla: 0 });
  return {
    malzemeCesidi: s?.malzemeCesidi ?? 0, gozDolu: s?.gozDolu ?? 0, gozToplam: s?.gozToplam ?? 0, kritik: s?.kritik ?? 0, eksi: s?.eksi ?? 0, kabulde: s?.kabulde ?? 0,
    toplamaBekleyen: await sorgular.toplamaSay(db, 'topluyor'),
    gunluk: await sorgular.gunlukHareketler(db),
    kritikListe,
    raflar: raflar.map((r) => ({ rafId: r.id, kod: r.kod, tur: r.tur, dolu: r.doluGoz, toplam: r.toplamGoz })),
    sonHareketler: await hareketleriCevir(db, son),
  };
}

// ---- Parti -------------------------------------------------------------------------------------------------------------------
async function partileriCevir(db: Db, l: sorgular.PartiHam[]): Promise<Parti[]> {
  const ad = await adlar(db, l.map((p) => p.malzemeId));
  return l.map((p) => ({ ...p, malzemeAd: ad.get(p.malzemeId) ?? null, eldeki: bindenMetin(binde(p.eldeki)) }));
}
export async function partiListesi(db: Db, s: PartilerListesi): Promise<SayfaliListe<Parti>> {
  const suzgec = { malzemeId: s.malzemeId, metin: s.metin };
  const l = await sayfaliListe(s, { say: () => sorgular.partiSay(db, suzgec), satirlar: (d) => sorgular.partiler(db, suzgec, s, d) });
  return { ...l, satirlar: await partileriCevir(db, l.satirlar) };
}
// Parti izi (DEP-25, DEP-48, Dal 9): partinin bütün hareketleri, çıktığı (ya da üretildiği) ve kartlarının üretim emirleri, o emirlerin
// sevkleri; lotun kartları, kartlarla üretilen partiler ve sevk çıkışları.
export async function partiIzi(db: Db, id: number): Promise<PartiIziCevabi> {
  const p = await sorgular.partiBul(db, id);
  if (!p) throw bulunamadi('Parti bulunamadı.');
  const h = await sorgular.hareketler(db, { partiId: id }, { sirala: 'zaman', yon: 'artan' }, { sinir: 500, atla: 0 });
  const kartlar = await refakatPartileriCevir(db, await sorgular.refakatPartileriBul(db, await sorgular.lotunKartlari(db, id)));
  const emirler = [...new Set([
    ...(p.uretimEmriId === null ? [] : [p.uretimEmriId]), ...h.flatMap((x) => (x.uretimEmriId === null ? [] : [x.uretimEmriId])), ...kartlar.map((k) => k.uretimEmriId),
  ])];
  const sevkler = await emirlerinSevkleri(db, emirler);
  return {
    parti: (await partileriCevir(db, [p]))[0]!, hareketler: await hareketleriCevir(db, h), emirler,
    sevkler: emirler.flatMap((e) => (sevkler.get(e) ?? []).map((x) => ({
      emirId: e, isId: x.isId, gun: x.tarih, durum: x.durum, adet: x.adet, firmaId: x.firmaId, firmaAdi: x.firmaAdi,
    }))),
    kartlar, ...(await kartlarinCiktiVeSevkleri(db, kartlar.map((k) => k.id))),
  };
}

// ---- Lot etiketi (#1060) ------------------------------------------------------------------------------------------------------
async function lotEtiketleriCevir(db: Db, h: sorgular.LotEtiketiHam[]): Promise<LotEtiketi[]> {
  const ozet = await malzemeOzetleri(db, h.map((x) => x.malzemeId));
  return h.map((x) => {
    const o = ozet.get(x.malzemeId);
    return { ...x, malzemeAd: o?.ad ?? null, malzemeKod: o?.kod ?? null, malzemeTuru: o?.tur ?? null, birim: o?.birim ?? null };
  });
}
// Etiket Merkezi için: olmayan parti ya da mal kabul boş liste verir.
export async function lotEtiketleri(db: Db, a: { partiId: number } | { malKabulId: number }): Promise<LotEtiketi[]> {
  if ('partiId' in a) {
    const h = await sorgular.partiLotEtiketi(db, a.partiId);
    return h ? lotEtiketleriCevir(db, [h]) : [];
  }
  return lotEtiketleriCevir(db, await sorgular.malKabulLotEtiketleri(db, a.malKabulId));
}
// 3124 a: Etiket Merkezi malzeme etiketi; satır başına malzeme adı, kodu, türü ve birimi eklenir. Olmayan kayıt boş liste verir.
export interface MalzemeEtiketi extends sorgular.MalzemeEtiketiHam {
  malzemeAd: string | null; malzemeKod: string | null; malzemeTuru: KatalogMalzemeOzeti['tur'] | null; birim: string | null;
}
export async function malzemeEtiketleri(db: Db, a: sorgular.MalzemeEtiketiKaynagi): Promise<MalzemeEtiketi[]> {
  if ('bakiyeIdler' in a && a.bakiyeIdler.length === 0) return [];
  const h = await sorgular.malzemeEtiketleri(db, a);
  const ozet = await malzemeOzetleri(db, [...new Set(h.map((x) => x.malzemeId))]);
  return h.map((x) => {
    const o = ozet.get(x.malzemeId);
    return { ...x, malzemeAd: o?.ad ?? null, malzemeKod: o?.kod ?? null, malzemeTuru: o?.tur ?? null, birim: o?.birim ?? null };
  });
}
// Etiket Merkezi kalite durum etiketi (kart 1525): olmayan, lotsuz ya da boş satır listeye girmez; sıra istenen sıradır.
export interface KaliteEtiketi { bakiyeId: number; lotNo: string; malzemeId: number; malzemeAd: string | null; malzemeKod: string | null; birim: string | null; konumKod: string; miktar: string; kaliteDurumu: KaliteDurumu }
export async function kaliteEtiketleri(db: Db, bakiyeIdler: readonly number[]): Promise<KaliteEtiketi[]> {
  if (bakiyeIdler.length === 0) return [];
  const satirlar = new Map((await sorgular.kaliteEtiketleri(db, bakiyeIdler)).map((h) => [h.bakiyeId, h]));
  const ozet = await malzemeOzetleri(db, [...new Set([...satirlar.values()].map((h) => h.malzemeId))]);
  return bakiyeIdler.flatMap((id) => {
    const h = satirlar.get(id);
    if (!h) return [];
    const o = ozet.get(h.malzemeId);
    return [{ ...h, malzemeAd: o?.ad ?? null, malzemeKod: o?.kod ?? null, birim: o?.birim ?? null }];
  });
}

// ---- Tür listeleri ve SKT düzeltmesi (2099) -------------------------------------------------------------------------
// 2099-6 a: kartlar malzemelerden kategoriyle gelir (silinmiş hariç, stoğu olmayan da); stok sayıları ve SKT özeti stoktandır.
// Liste kategori başına sayfalanmaz: bir kategorideki kart sayısı yüzlerle sınırlı varsayılır (VARSAYIM, DEVIR.md).
export async function turListesi(db: Db, liste: StokTurListesi): Promise<TurListesiCevabi> {
  const t = STOK_TUR_LISTELERI[liste];
  const idler = await kategoriKartlari(db, t.tur, t.kategori);
  const bugun = sktBugun();
  if (idler.length === 0) return { bugun, satirlar: [] };
  // Tek bağlantıda sorgular sırayla gider.
  const stok = await sorgular.kartStoklari(db, idler);
  const ozet = await malzemeOzetleri(db, idler);
  const rezerve = await rezerveToplamlari(db, idler);
  const alanlar = await kartAlanDegerleri(db, idler);
  const takipli = await sktTakipliKartlar(db, idler);
  const skt = await sorgular.kartSktOzetleri(db, idler, bugun);
  const sktHaritasi = new Map(skt.map((x) => [x.malzemeId, x]));
  return {
    bugun,
    satirlar: stok.map((h) => ({
      ...malzemeSatiri(h, ozet.get(h.malzemeId), rezerve.get(h.malzemeId) ?? 0n),
      alanlar: alanlar.get(h.malzemeId) ?? {},
      sktTakipli: takipli.has(h.malzemeId),
      enYakinSkt: sktHaritasi.get(h.malzemeId)?.enYakin ?? null,
      sktGecmisMiktar: bindenMetin(binde(sktHaritasi.get(h.malzemeId)?.gecmisMiktar ?? '0')),
    })),
  };
}
// 2099-2 c: lotun SKT'si yalnız müdürün işlemiyle düzeltilir (yetki uçta); kartı SKT takipli olmayan lota tarih yazılmaz.
export async function sktDuzelt(db: Db, kisiId: number, partiId: number, g: SktDuzeltGovdesi): Promise<SktDuzeltCevabi> {
  const malzemeId = await sorgular.partiMalzemesi(db, partiId);
  if (malzemeId === null) throw bulunamadi('Lot bulunamadı.');
  if (!(await sktTakipliKartlar(db, [malzemeId])).has(malzemeId)) throw gecersiz('Bu lotun kartı son kullanma takipli değil; önce kartta SKT takibini açın.');
  return korumali(async () => {
    const mevcut = await sorgular.partiSonKullanmaKilitle(db, partiId);
    if (mevcut === null) {
      if (g.surum !== null) throw cakisma('Bu lotun son kullanma tarihi kaydı yok; sayfayı yenileyin.');
      await sorgular.partiSonKullanmaYaz(db, { partiId, sonKullanma: g.sonKullanma, kisiId });
      return { partiId, sonKullanma: g.sonKullanma, surum: 1 };
    }
    if (g.surum === null || !(await sorgular.partiSonKullanmaDuzelt(db, { partiId, sonKullanma: g.sonKullanma, kisiId, surum: g.surum }))) {
      throw cakisma('Lotun son kullanma tarihi az önce değişti; yeniden okuyun.');
    }
    return { partiId, sonKullanma: g.sonKullanma, surum: g.surum + 1 };
  });
}
