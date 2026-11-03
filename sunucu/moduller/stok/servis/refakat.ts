import { type Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, gecersiz } from '#cekirdek/hata.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import { type RefakatKartiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { DefterFarklariCevabi } from '#paylasilan/sozlesme/stok.ts';
import {
  REFAKAT_KARTLARI_SINIRI, type LotBekleyenKartlarCevabi, type RefakatKartlariCevabi, type RefakatCiktisi, type RefakatIziCevabi, type RefakatLotaBaglaCevabi, type RefakatPartileriCevabi,
  type RefakatPartisi, type RefakatPartisiCevabi, type RefakatPartisiKartiCevabi, type RefakatSevki,
} from '#paylasilan/sozlesme/stok.ts';
import { KOD_ONEKI, kodTuru } from '#paylasilan/kod-sozlugu.ts';
import { malzemeOzetleri } from '../../malzemeler/disari.ts';
import { uretimEmriOzeti, refakatKarti } from '../../uretim-emirleri/disari.ts';
import { binde, bindenMetin, girdiSec, refakatBaglamaEngeli, refakatEtiketi, refakatIptalEngeli, refakatKolEngeli, refakatLotEngeli } from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import { seriEklemeleri } from '../kurallar.ts';
import { SERI_SATIR_SINIRI, type SeriEkleKomutu, type SeriListeCevabi, type SeriListelerCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { RefakatPartisiHam } from '../sorgular.ts';
import { korumali, emirNoDe, emirNoHaritasi, bakiyeDegistir, siraliKilitle, hareket } from './ortak.ts';
import { type UretimYazimi, rezerveDegistir } from './uretim.ts';

// ---- Refakat partisi (kart #123): depo lotu okutup emre ayırınca doğar, kartı basılır; teslim kartla yapılır ------------------
export async function refakatPartileriCevir(db: Db, satirlar: RefakatPartisiHam[]): Promise<RefakatPartisi[]> {
  const bagliIdler = [...new Set(satirlar.flatMap((r) => [r.ustRefakatPartisiId, r.birlestigiRefakatPartisiId]).filter((x): x is number => x !== null))];
  const bagliler = bagliIdler.length === 0 ? [] : await sorgular.refakatPartileriBul(db, bagliIdler);
  const nolar = await emirNoHaritasi(db, [...satirlar, ...bagliler].map((r) => r.uretimEmriId));
  const ozetler = await malzemeOzetleri(db, satirlar.map((r) => r.malzemeId));
  const bag = (id: number | null): { id: number; etiket: string } | null => {
    const b = id === null ? undefined : bagliler.find((x) => x.id === id);
    return b === undefined ? null : { id: b.id, etiket: refakatEtiketi(emirNoDe(nolar, b.uretimEmriId), b.uretimEmriId, b.sira) };
  };
  return satirlar.map((r) => {
    const o = ozetler.get(r.malzemeId);
    const emirNo = emirNoDe(nolar, r.uretimEmriId);
    return {
      id: r.id, qr: `${KOD_ONEKI['refakat-partisi']}:${r.id}`, etiket: refakatEtiketi(emirNo, r.uretimEmriId, r.sira), uretimEmriId: r.uretimEmriId, emirNo, sira: r.sira,
      malzemeId: r.malzemeId, malzemeKod: o?.kod ?? null, malzemeAd: o?.ad ?? null, birim: o?.birim ?? null,
      partiId: r.partiId, lotNo: r.lotNo, tedarikciPartiNo: r.tedarikciPartiNo, dokumNo: r.dokumNo, sertifikaNo: r.sertifikaNo, lotaBaglanmaZamani: r.lotaBaglanmaZamani,
      verilen: bindenMetin(binde(r.verilen)), durum: r.durum, surum: r.surum, kayitZamani: r.kayitZamani,
      ust: bag(r.ustRefakatPartisiId), birlestigi: bag(r.birlestigiRefakatPartisiId), birlesmeZamani: r.birlesmeZamani,
    };
  });
}
export async function refakatPartisiOku(db: Db, id: number): Promise<RefakatPartisiCevabi> {
  const r = await sorgular.refakatPartisiBul(db, id);
  if (!r) throw bulunamadi('Refakat kartı bulunamadı.');
  return { refakat: (await refakatPartileriCevir(db, [r]))[0]! };
}
// Refakat kartları sayfası (kart #708): emrin kartı bir kez okunur; aynı emrin kartları ürünü paylaşır. Sırayla: işlemdeki tek bağlantıda
// sorgular eşzamanlı koşamaz.
export async function refakatKartlari(db: Db, durum: 'acik' | 'tumu'): Promise<RefakatKartlariCevabi> {
  const satirlar = await sorgular.refakatKartlariListe(db, durum === 'tumu', REFAKAT_KARTLARI_SINIRI + 1);
  const kartlar = await refakatPartileriCevir(db, satirlar.slice(0, REFAKAT_KARTLARI_SINIRI));
  const emirler = new Map<number, RefakatKartiCevabi>();
  for (const id of new Set(kartlar.map((k) => k.uretimEmriId))) emirler.set(id, await refakatKarti(db, id));
  return {
    kartlar: kartlar.map((r) => {
      const e = emirler.get(r.uretimEmriId)!;
      return { refakat: r, urun: e.urun, adet: e.adet, teslim: e.teslim, adimSayisi: e.adimlar.length };
    }),
    sinirda: satirlar.length > REFAKAT_KARTLARI_SINIRI,
  };
}
export async function emrinRefakatPartileri(db: Db, uretimEmriId: number): Promise<RefakatPartileriCevabi> {
  return { partiler: await refakatPartileriCevir(db, await sorgular.emrinRefakatPartileri(db, uretimEmriId)) };
}
// Soru 116 b: emre ayırmada lot etiketi okutulur (ya da lot okutularak eklenmiş sepet satırı seçilir); kart etiketi kartı açmaz. Aynı emir ve lotun açık partisi
// varsa o döner (aynı lotun kalanı aynı kartla gider); başka lot yeni parti açar.
export async function refakatPartisiAc(db: Db, kisiId: number, g: { uretimEmriId: number; lotKodu?: string | undefined; sepetSatirId?: number | undefined }): Promise<RefakatPartisiCevabi> {
  let lot: Awaited<ReturnType<typeof sorgular.partiBul>>;
  let sepetSatiri: number | null = null;
  if (g.sepetSatirId !== undefined) {
    const satir = (await sorgular.sepetSatirlari(db, kisiId, true)).find((x) => x.id === g.sepetSatirId);
    if (!satir) throw bulunamadi('Sepet satırı bulunamadı.');
    if (satir.partiId === null) throw dogrulama('Bu satırın lotu yok; lot etiketini okutup sepete ekleyin.', 'sepetSatirId');
    lot = await sorgular.partiBul(db, satir.partiId);
    sepetSatiri = satir.id;
  } else {
    const t = kodTuru(g.lotKodu ?? '');
    lot = t.tur === 'lot' ? await sorgular.lotNoylaParti(db, t.deger) : null;
    if (!lot) throw dogrulama(t.tur === 'lot' ? 'Lot bulunamadı.' : 'Lot etiketini okutun; refakat kartı lotla açılır.', 'lotKodu');
  }
  if (!lot) throw bulunamadi('Lot bulunamadı.');
  const engel = refakatLotEngeli(lot);
  if (engel) throw dogrulama(engel, 'lotKodu');
  const e = await uretimEmriOzeti(db, g.uretimEmriId);
  if (e === null) throw dogrulama('Üretim emri bulunamadı.', 'uretimEmriId');
  if (e.durum === 'bitti' || e.durum === 'iptal') throw dogrulama(`Emir ${e.emirNo} ${e.durum === 'bitti' ? 'bitti' : 'iptal edildi'}; refakat kartı açılmaz.`, 'uretimEmriId');
  if (sepetSatiri !== null) await sorgular.sepettenSil(db, sepetSatiri, kisiId);
  const varOlan = await sorgular.acikRefakatPartisi(db, g.uretimEmriId, lot.id);
  if (varOlan) return { refakat: (await refakatPartileriCevir(db, [varOlan]))[0]! };
  const id = await sorgular.refakatPartisiAc(db, { uretimEmriId: g.uretimEmriId, malzemeId: lot.malzemeId, partiId: lot.id, kisiId })
    ?? (await sorgular.acikRefakatPartisi(db, g.uretimEmriId, lot.id))!.id;
  return refakatPartisiOku(db, id);
}
export async function refakatPartisiIptal(db: Db, kisiId: number, id: number, g: { surum: number }): Promise<RefakatPartisiCevabi> {
  const r = await sorgular.refakatPartisiBul(db, id, true);
  if (!r) throw bulunamadi('Refakat kartı bulunamadı.');
  const engel = refakatIptalEngeli(r, await sorgular.refakatUretimiVar(db, r.id));
  if (engel) throw cakisma(engel);
  await surumluGuncelle({
    guncelle: () => sorgular.refakatPartisiIptal(db, id, g.surum, kisiId), varMi: () => sorgular.refakatPartisiVarMi(db, id), bulunamadiIletisi: 'Refakat kartı bulunamadı.',
  });
  return refakatPartisiOku(db, id);
}
// Alt parti (kol) kartı (kart #126): bölmeyle doğan kol, üst emrin kartının lotuyla kendi kartını alır; parçalar artık bu kartla
// sayılır. Kart üst karta bağlanır (iz ve birleşmede üst karta dönüş). Kolun aynı lotla açık kartı varsa o döner.
export async function refakatKolKartiAc(db: Db, kisiId: number, ustId: number, g: { uretimEmriId: number }): Promise<RefakatPartisiCevabi> {
  const ust = await sorgular.etkinRefakatPartisiBul(db, ustId);
  if (!ust) throw bulunamadi('Refakat kartı bulunamadı.');
  const kol = await uretimEmriOzeti(db, g.uretimEmriId);
  if (kol === null) throw dogrulama('Üretim emri bulunamadı.', 'uretimEmriId');
  const engel = refakatKolEngeli(ust, kol);
  if (engel) throw dogrulama(engel, 'uretimEmriId');
  const lotId = ust.partiId;
  if (lotId === null) throw dogrulama('Üst kart lot bekliyor; alt parti kartı lota bağlandıktan sonra açılır.', 'uretimEmriId');
  const varOlan = await sorgular.acikRefakatPartisi(db, kol.id, lotId);
  if (varOlan) return { refakat: (await refakatPartileriCevir(db, [varOlan]))[0]! };
  const id = await sorgular.refakatPartisiAc(db, { uretimEmriId: kol.id, malzemeId: ust.malzemeId, partiId: lotId, kisiId, ustRefakatPartisiId: ust.id })
    ?? (await sorgular.acikRefakatPartisi(db, kol.id, lotId))!.id;
  return refakatPartisiOku(db, id);
}
// Birleşen emrin açık kartları hedef emrin kartına bağlanır (kart #126): kol üst emre döndüyse üst kart, değilse hedefin aynı lotla
// açık kartı; o da yoksa hedefe aynı lotla kart açılır. Eski kart okutulunca birleştiği kart döner; iz iki kartı da gösterir.
export async function refakatKartlariniBirlestir(db: Db, kaynakEmirId: number, hedefEmirId: number, kisiId: number): Promise<void> {
  for (const k of await sorgular.emrinRefakatPartileri(db, kaynakEmirId)) {
    if (k.durum !== 'acik' || k.birlestigiRefakatPartisiId !== null) continue;
    const ust = k.ustRefakatPartisiId === null ? null : await sorgular.etkinRefakatPartisiBul(db, k.ustRefakatPartisiId);
    const lotId = k.partiId;
    // İstisna kartı hedefin aynı malzemedeki istisna kartına birleşir; yoksa hedefe lotsuz kart açılır (bağlanmamış düşümler kaynak kartta kalır).
    const ayniKart = (): Promise<RefakatPartisiHam | null> =>
      (lotId === null ? sorgular.acikIstisnaKarti(db, hedefEmirId, k.malzemeId) : sorgular.acikRefakatPartisi(db, hedefEmirId, lotId));
    const hedef = ust !== null && ust.uretimEmriId === hedefEmirId && ust.durum === 'acik' ? ust : await ayniKart();
    const hedefId = hedef?.id
      ?? (lotId === null ? await sorgular.istisnaKartiAc(db, { uretimEmriId: hedefEmirId, malzemeId: k.malzemeId, kisiId })
        : await sorgular.refakatPartisiAc(db, { uretimEmriId: hedefEmirId, malzemeId: k.malzemeId, partiId: lotId, kisiId }))
      ?? (await ayniKart())!.id;
    await sorgular.refakatBirlestir(db, k.id, hedefId);
  }
}
export async function refakatIzi(db: Db, id: number): Promise<RefakatIziCevabi> {
  const r = await sorgular.refakatPartisiBul(db, id);
  if (!r) throw bulunamadi('Refakat kartı bulunamadı.');
  const soy = await sorgular.refakatSoyu(db, r.id);
  const ustler: RefakatPartisiHam[] = [];
  for (let u = r.ustRefakatPartisiId; u !== null && ustler.length < 20;) {
    const x = await sorgular.refakatPartisiBul(db, u);
    if (x === null) break;
    ustler.push(x);
    u = x.ustRefakatPartisiId;
  }
  const [altlar, birlesenler, ayniLot] = [
    await sorgular.altRefakatPartileri(db, r.id), await sorgular.birlesenRefakatPartileri(db, r.id),
    r.partiId === null ? [] : (await sorgular.lotunRefakatPartileri(db, r.partiId)).filter((x) => x.id !== r.id),
  ];
  const { ciktilar, sevkCikislari } = await kartlarinCiktiVeSevkleri(db, soy);
  const cevir = (l: RefakatPartisiHam[]) => refakatPartileriCevir(db, l);
  return {
    refakat: (await cevir([r]))[0]!, ustler: await cevir(ustler), altlar: await cevir(altlar), birlesenler: await cevir(birlesenler), ayniLot: await cevir(ayniLot),
    ciktilar, sevkler: sevkCikislari,
  };
}
// Kartlarla sayılan üretim partileri (eldekiyle) ve bu partilerden yapılmış sevk çıkışları; kart izi ve lot izi ortak okur.
export async function kartlarinCiktiVeSevkleri(db: Db, kartlar: readonly number[]): Promise<{ ciktilar: RefakatCiktisi[]; sevkCikislari: RefakatSevki[] }> {
  if (kartlar.length === 0) return { ciktilar: [], sevkCikislari: [] };
  const [ciktilar, sevkler] = [await sorgular.refakatCiktilari(db, kartlar), await sorgular.refakatSevkleri(db, kartlar)];
  const ozetler = await malzemeOzetleri(db, [...ciktilar.map((c) => c.malzemeId), ...sevkler.map((x) => x.malzemeId)]);
  const nolar = await emirNoHaritasi(db, sevkler.flatMap((x) => (x.uretimEmriId === null ? [] : [x.uretimEmriId])));
  const malzeme = (m: number) => { const o = ozetler.get(m); return { malzemeId: m, malzemeKod: o?.kod ?? null, malzemeAd: o?.ad ?? null, birim: o?.birim ?? null }; };
  return {
    ciktilar: ciktilar.map((c) => ({ partiId: c.partiId, lotNo: c.lotNo, refakatPartisiId: c.refakatPartisiId, ...malzeme(c.malzemeId), eldeki: bindenMetin(binde(c.eldeki)) })),
    sevkCikislari: sevkler.map((x) => ({
      hareketId: x.hareketId, zaman: x.zaman, partiId: x.partiId, lotNo: x.lotNo, ...malzeme(x.malzemeId), miktar: bindenMetin(binde(x.miktar)),
      emirNo: x.uretimEmriId === null ? null : emirNoDe(nolar, x.uretimEmriId), aciklama: x.aciklama,
    })),
  };
}
// ---- İstisna kartı (Soru 129, 131 a): lot bekleyen kartlar ve lota bağlama ---------------------------------------------------------
export async function lotBekleyenKartlar(db: Db): Promise<LotBekleyenKartlarCevabi> {
  const satirlar = await sorgular.lotBekleyenKartlar(db);
  const kartlar = await refakatPartileriCevir(db, await sorgular.refakatPartileriBul(db, satirlar.map((x) => x.id)));
  return { kartlar: satirlar.flatMap((x) => { const r = kartlar.find((k) => k.id === x.id); return r ? [{ refakat: r, bekleyen: bindenMetin(binde(x.bekleyen)) }] : []; }) };
}
// Lota bağlama: her lotsuz düşüm geri alınır ve aynı miktar lottan (önce düşümün istasyonundaki, sonra en eski bakiyeden) emre sarf
// yazılır; lot o düşüme yetmezse durulur, kalan bekler. Hepsi bağlanınca kart lotu alır; emrin o lotla açık kartı varsa ona birleşir.
// Kod lot etiketi ya da refakat kartıdır (eksik malzeme o kartın lotundandır). Sarfın iş emri korunur: sayım düzeltmesi onu geri alır.
export async function refakatLotaBagla(db: Db, kisiId: number, id: number, g: { kod: string; surum: number }): Promise<RefakatLotaBaglaCevabi> {
  const r = await sorgular.refakatPartisiBul(db, id, true);
  if (!r) throw bulunamadi('Refakat kartı bulunamadı.');
  const t = kodTuru(g.kod);
  let partiId: number | null = null;
  if (t.tur === 'lot') partiId = (await sorgular.lotNoylaParti(db, t.deger))?.id ?? null;
  else if (t.tur === 'refakat-partisi') partiId = (await sorgular.etkinRefakatPartisiBul(db, Number(t.deger)))?.partiId ?? null;
  const lot = partiId === null ? null : await sorgular.partiBul(db, partiId);
  if (!lot) throw dogrulama(t.tur === 'refakat-partisi' ? 'Okutulan kartın lotu yok.' : 'Lot bulunamadı; lot etiketini ya da refakat kartını okutun.', 'kod');
  const engel = refakatBaglamaEngeli(r, lot, g.surum);
  if (engel) throw dogrulama(engel, 'kod');
  const etiket = (await refakatPartileriCevir(db, [r]))[0]!.etiket;
  const y: UretimYazimi = { uretimEmriId: r.uretimEmriId, kisiId, konumId: 0, malzemeId: r.malzemeId, aciklama: `Lota bağlama · ${etiket} · ${lot.lotNo}`.slice(0, 200) };
  let baglanan = 0n;
  await korumali(async () => {
    for (const d of await sorgular.istisnaDusumleri(db, r.id)) {
      const m = binde(d.miktar);
      // Rezerve sınırı yok: geri alma ve lottan düşüm aynı miktardır, malzemenin toplamı değişmez; başka emre ayrılan azalmaz.
      const secim = girdiSec((await sorgular.lotunBaglamaBakiyeleri(db, lot.id, d.konumId)).map((b) => ({ ...b, kaliteDurumu: 'serbest' as const })), m, m);
      if (secim.reduce((x, a) => x + a.miktar, 0n) < m) break;
      await siraliKilitle(db, { malzemeId: r.malzemeId, konumId: d.konumId, partiId: null }, ...secim.map((a) => ({ malzemeId: r.malzemeId, konumId: a.konumId, partiId: lot.id })));
      const geriId = await sorgular.hareketYaz(db, hareket({
        tur: 'geri_alma', malzemeId: r.malzemeId, miktar: d.miktar, kisiId, hedefKonumId: d.konumId, hedefKaliteDurumu: 'serbest', uretimEmriId: r.uretimEmriId,
        geriAlinanId: d.hareketId, aciklama: y.aciklama,
      }));
      await bakiyeDegistir(db, { malzemeId: r.malzemeId, konumId: d.konumId, partiId: null, statuId: null, kaliteDurumu: 'serbest', fark: m });
      await rezerveDegistir(db, { malzemeId: r.malzemeId, statuId: null, uretimEmriId: r.uretimEmriId, fark: m });
      let lotHareketi: number | null = null;
      for (const a of secim) {
        const hid = await sorgular.hareketYaz(db, hareket({
          tur: 'cikis', malzemeId: r.malzemeId, miktar: bindenMetin(a.miktar), kisiId, partiId: lot.id, partiSecimi: 'kisi', kaynakKonumId: a.konumId, kaynakKaliteDurumu: 'serbest',
          cikisNedeni: 'uretime_sarf', uretimEmriId: r.uretimEmriId, isEmriId: d.isEmriId, aciklama: y.aciklama,
        }));
        lotHareketi ??= hid;
        await bakiyeDegistir(db, { malzemeId: r.malzemeId, konumId: a.konumId, partiId: lot.id, statuId: null, kaliteDurumu: 'serbest', fark: -a.miktar });
        await rezerveDegistir(db, { malzemeId: r.malzemeId, statuId: null, uretimEmriId: r.uretimEmriId, fark: -a.miktar });
      }
      await sorgular.istisnaDusumuBagla(db, d.id, geriId, lotHareketi!);
      baglanan += m;
    }
    if ((await sorgular.istisnaDusumleri(db, r.id)).length > 0) return;
    const ayni = await sorgular.acikRefakatPartisi(db, r.uretimEmriId, lot.id);
    if (ayni) await sorgular.refakatBirlestir(db, r.id, ayni.id);
    else if (!(await sorgular.refakatLotaBagla(db, r.id, lot.id, kisiId))) throw cakisma('Kart bu sırada değişti; listeyi yenileyip yeniden deneyin.');
  });
  const bekleyen = (await sorgular.istisnaDusumleri(db, r.id)).reduce((x, d) => x + binde(d.miktar), 0n);
  const etkin = (await sorgular.etkinRefakatPartisiBul(db, r.id))!;
  return { refakat: (await refakatPartileriCevir(db, [etkin]))[0]!, baglanan: bindenMetin(baglanan), bekleyen: bindenMetin(bekleyen) };
}
// Kart, emrin refakat kartıdır (Üretim Emirleri'nin verisi); QR partiyi taşır, lot bilgisi partiden gelir.
export async function refakatPartisiKarti(db: Db, id: number): Promise<RefakatPartisiKartiCevabi> {
  const { refakat } = await refakatPartisiOku(db, id);
  return { refakat, kart: { ...(await refakatKarti(db, refakat.uretimEmriId)), qr: refakat.qr } };
}

// Gece defter karşılaştırması (1692 a). İş saatte bir koşar; İstanbul saatiyle eşikten sonra günde bir kez karşılaştırır. Fark
// düzeltilmez, gösterilir: düzeltme sayım ya da geri almayla, hareketle yapılır (1692 b tetiği hareketsiz düzeltmeyi zaten reddeder).
export const DEFTER_KARSILASTIRMA_SAATI = 2;
export async function geceDefterKarsilastirmasi(db: Db, saat = DEFTER_KARSILASTIRMA_SAATI): Promise<{ id: number; farkSayisi: number } | null> {
  if (!(await sorgular.defterKarsilastirmaZamaniMi(db, saat))) return null;
  return sorgular.defterKarsilastir(db);
}
export async function defterFarklari(db: Db): Promise<DefterFarklariCevabi> {
  const k = await sorgular.sonDefterKarsilastirmasi(db);
  return { karsilastirma: k, farklar: k === null ? [] : await sorgular.defterFarklari(db, k.id) };
}

// ---- Seri liste (1915, 1914 teyit): kişinin taslağı; stok yazılmaz. Başkasının listesi yokmuş gibi davranır. -----------------
export async function seriListeler(db: Db, kisiId: number): Promise<SeriListelerCevabi> {
  return { listeler: await sorgular.seriAcikListeler(db, kisiId) };
}
export async function seriListeAyrinti(db: Db, kisiId: number, id: number): Promise<SeriListeCevabi> {
  const liste = await sorgular.seriListe(db, id, kisiId);
  if (!liste) throw bulunamadi('Seri liste bulunamadı.');
  return { liste, satirlar: (await sorgular.seriSatirlari(db, id)).map((x) => ({ ...x, adet: x.adet === null ? null : bindenMetin(binde(x.adet)) })) };
}
async function acikSeriListe(db: Db, kisiId: number, id: number): Promise<void> {
  const l = await sorgular.seriListeKilitle(db, id, kisiId);
  if (!l) throw bulunamadi('Seri liste bulunamadı.');
  if (l.kapanis !== null) throw gecersiz('Seri liste kapandı; yeni okutma yeni listeye düşer.');
}
export async function seriEkle(db: Db, kisiId: number, g: SeriEkleKomutu): Promise<SeriListeCevabi> {
  let id = g.listeId;
  if (id === undefined) id = await sorgular.seriListeAc(db, kisiId, g.kaynak);
  else await acikSeriListe(db, kisiId, id);
  const satirlar = await sorgular.seriSatirlari(db, id);
  const son = satirlar.at(-1) ?? null;
  const e = seriEklemeleri(son && son.islendi === null ? son : null, g.kodlar);
  if (satirlar.length + e.yeni.length > SERI_SATIR_SINIRI) throw dogrulama(`Bir listede en çok ${SERI_SATIR_SINIRI} satır olur; listeyi bitirip yenisini aç.`, 'kodlar');
  if (e.sonAdet !== null && son) await sorgular.seriAdetYaz(db, id, son.id, e.sonAdet);
  let sira = son?.sira ?? 0;
  for (const y of e.yeni) await sorgular.seriSatirEkle(db, id, ++sira, y.kod, y.adet);
  await sorgular.seriDegisti(db, id);
  return seriListeAyrinti(db, kisiId, id);
}
export async function seriAdetDegistir(db: Db, kisiId: number, id: number, satirId: number, adet: string): Promise<SeriListeCevabi> {
  await acikSeriListe(db, kisiId, id);
  if (!(await sorgular.seriAdetYaz(db, id, satirId, bindenMetin(binde(adet))))) throw bulunamadi('Satır bulunamadı ya da işlendi.');
  await sorgular.seriDegisti(db, id);
  return seriListeAyrinti(db, kisiId, id);
}
export async function seriSatirSil(db: Db, kisiId: number, id: number, satirId: number): Promise<SeriListeCevabi> {
  await acikSeriListe(db, kisiId, id);
  if (!(await sorgular.seriSatirSil(db, id, satirId))) throw bulunamadi('Satır bulunamadı ya da işlendi.');
  await sorgular.seriDegisti(db, id);
  return seriListeAyrinti(db, kisiId, id);
}
// İşin kendi ucu yazdıktan sonra çağrılır; işlenen satır değişmez, silinmez.
export async function seriIslendi(db: Db, kisiId: number, id: number, satirIdler: number[]): Promise<SeriListeCevabi> {
  await acikSeriListe(db, kisiId, id);
  await sorgular.seriIslendi(db, id, satirIdler);
  await sorgular.seriDegisti(db, id);
  return seriListeAyrinti(db, kisiId, id);
}
export async function seriKapat(db: Db, kisiId: number, id: number): Promise<SeriListeCevabi> {
  await acikSeriListe(db, kisiId, id);
  await sorgular.seriListeKapat(db, id);
  return seriListeAyrinti(db, kisiId, id);
}
