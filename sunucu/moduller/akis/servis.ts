import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { EmirAkisiCevabi, EmirListesiCevabi, KartAkisiCevabi, KartOzetleriCevabi, SureOzeti } from '#paylasilan/sozlesme/akis.ts';
import { durusNedenleriniListele, hurdaNedenleriniListele } from '../durus-nedenleri/disari.ts';
import { istasyonAdlari } from '../istasyonlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { receteRotaStatuleri } from '../recete-rota/disari.ts';
import { emirlerinSevkDurumu } from '../sevkiyat/disari.ts';
import { emrinAkisHareketleri, partiGirisZamanlari, refakatKartiKapsami } from '../stok/disari.ts';
import { adimliEmirListesi, emirAkisKaydi, sureOzetiHesapla } from '../uretim-emirleri/disari.ts';
import { emirAkisi, kartAnlari, kartKonumu, kartPenceresi, kartSarfi, sevkAni, type AkisGirdisi } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

// Standart süreler numeric metin gelir; ekranda dakika sayısıdır.
const sayi = (m: string | null): number | null => (m === null ? null : Number(m));
const tekil = (d: readonly (number | null)[]): number[] => [...new Set(d.filter((x): x is number => x !== null))];

export async function emirListesi(db: Db): Promise<EmirListesiCevabi> {
  const { emirler } = await adimliEmirListesi(db, false);
  return {
    emirler: emirler.map((e) => ({ id: e.id, emirNo: e.emirNo, urun: `${e.urun.kod} ${e.urun.ad}`.trim(), adet: e.adet, durum: e.durum, teslim: e.teslim })),
  };
}

// Emir yolculuğu ve kartın akışı aynı girdiyle hesaplanır; kart kapsamı hareketleri kartın partilerine, sayımları kartla
// sayılanlara daraltır (kart #708).
async function akisGirdisi(db: Db, id: number, kart: { id: number; partiIdler: readonly number[] } | null) {
  const kayit = await emirAkisKaydi(db, id);
  if (kayit === null) throw bulunamadi('Üretim emri bulunamadı.');
  const tumHareketler = await emrinAkisHareketleri(db, id);
  const hareketler = kart === null ? tumHareketler : tumHareketler.filter((h) => h.partiId !== null && kart.partiIdler.includes(h.partiId));
  const sayimlar = kart === null ? kayit.sayimlar : kayit.sayimlar.filter((s) => s.refakatPartisiId === kart.id);
  const partiler = await partiGirisZamanlari(db, tekil(hareketler.map((h) => h.partiId)));
  const sevkler = await emirlerinSevkDurumu(db, [id]);
  const statuler = await receteRotaStatuleri(db);
  const istasyonlar = await istasyonAdlari(db, tekil(kayit.isEmirleri.map((i) => i.istasyonId)));
  const simdi = await sorgular.simdi(db);
  const { emir } = kayit;
  const adimlar = kayit.isEmirleri.map((i) => ({
    id: i.id, opNo: i.opNo, sira: i.sira, istasyon: i.istasyonId === null ? null : istasyonlar.get(i.istasyonId) ?? null,
    fason: i.fasonFirmaId !== null, terminGun: i.terminGun, baslama: i.baslama, bitis: i.bitis, birimSureDk: sayi(i.birimSureDk), ayarSuresiDk: sayi(i.ayarSuresiDk),
    bagimlilik: i.bagimlilik, devirAdedi: i.devirAdedi,
  }));
  const girdi: AkisGirdisi = {
    simdi,
    emir: { id: emir.id, emirNo: emir.emirNo, malzemeNo: emir.malzemeNo, adet: emir.adet, durum: emir.durum, baslama: emir.baslama, teslim: emir.teslim },
    adimlar,
    olaylar: kayit.olaylar,
    sayimlar,
    fason: kayit.fason,
    hareketler,
    statuler: new Map(statuler.map((s) => [s.id, { ad: s.ad, tur: s.tur }])),
    partiGirisleri: new Map([...partiler].map(([k, p]) => [k, { lotNo: p.lotNo, malKabul: p.malKabulZamani }])),
    sevk: sevkAni(sevkler.get(id) ?? null),
  };
  return { girdi, kayit, emir: { id: emir.id, emirNo: emir.emirNo, adet: emir.adet, durum: emir.durum, teslim: emir.teslim } };
}

export async function emirAkisiOku(db: Db, id: number): Promise<EmirAkisiCevabi> {
  const { girdi, emir } = await akisGirdisi(db, id, null);
  return { emir, ...emirAkisi(girdi) };
}

const adHaritasi = (d: readonly { id: number; ad: string }[]): Map<number, string> => new Map(d.map((x) => [x.id, x.ad]));

export async function kartAkisiOku(db: Db, id: number): Promise<KartAkisiCevabi> {
  const a = await kartAkisi(db, id);
  if (a === null) throw bulunamadi('Refakat kartı bulunamadı.');
  return a;
}

async function kartAkisi(db: Db, id: number): Promise<KartAkisiCevabi | null> {
  const k = await refakatKartiKapsami(db, id);
  if (k === null) return null;
  const { girdi, kayit, emir } = await akisGirdisi(db, k.refakat.uretimEmriId, { id, partiIdler: k.partiIdler });
  const sonuc = emirAkisi(girdi);
  const kisiler = await kisiAdlari(db, tekil([
    ...kayit.olaylar.map((o) => o.kisiId), ...kayit.sayimlar.map((s) => s.kisiId), ...k.teslimler.flatMap((t) => [t.gonderenKisiId, t.kapatanKisiId]),
  ]));
  const adlar = {
    kisi: kisiler,
    durus: adHaritasi(await durusNedenleriniListele(db, { yalnizAktif: false })),
    hurda: adHaritasi(await hurdaNedenleriniListele(db, { yalnizAktif: false })),
  };
  const kisi = (x: number | null) => (x === null ? null : kisiler.get(x) ?? null);
  const teslimler = k.teslimler.map((t) => ({
    durum: t.durum, gonderim: t.gonderim, kapanis: t.kapanis, kaynak: t.kaynak, hedef: t.hedef, miktar: t.miktar, alinan: t.alinan,
    gonderen: kisi(t.gonderenKisiId), kapatan: kisi(t.kapatanKisiId),
  }));
  const anlar = kartAnlari({
    acilis: k.refakat.kayitZamani, hammadde: sonuc.hammadde, teslimler, adimlar: girdi.adimlar,
    olaylar: girdi.olaylar, sayimlar: girdi.sayimlar, fason: girdi.fason, sevk: girdi.sevk, adlar,
  });
  const r = k.refakat;
  // Süre özeti iş emrinin kuralıyla: emir sütunu adımın bütün sayımları, kart sütunu kartın penceresi ve sayımlarıyla (AKS-9).
  const sureOzetleri = girdi.adimlar.filter((a) => !a.fason).map((a) => {
    const olaylar = kayit.olaylar.filter((o) => o.isEmriId === a.id);
    const ayarlar = olaylar.filter((o) => o.olay === 'ayar').map((o) => o.zaman);
    const duruslar = olaylar.flatMap((o) => (o.olay === 'duraklat' || o.olay === 'durdur' || o.olay === 'devam' ? [{ olay: o.olay, zaman: o.zaman }] : []));
    const sayimlar = kayit.sayimlar.filter((s) => s.isEmriId === a.id);
    const ozet = (p: { baslama: string | null; bitis: string | null }, ayar: readonly string[], say: typeof sayimlar): SureOzeti =>
      sureOzetiHesapla({ baslama: p.baslama, bitis: p.bitis, simdi: girdi.simdi, ayarlar: ayar, olaylar: duruslar, sayimlar: say });
    const pencere = kartPenceresi(a, sayimlar.map((s) => ({ zaman: s.zaman, kartin: s.refakatPartisiId === id })));
    return {
      isEmriId: a.id,
      kart: ozet(pencere, pencere.hazirlikKartin ? ayarlar : [], sayimlar.filter((s) => s.refakatPartisiId === id)),
      emir: ozet(a, ayarlar, sayimlar),
    };
  });
  return {
    emir, ...sonuc,
    kart: {
      id, etiket: r.etiket, durum: r.durum, lotNo: r.lotNo, acilis: r.kayitZamani,
      malzeme: r.malzemeKod === null && r.malzemeAd === null ? null : `${r.malzemeKod ?? ''} ${r.malzemeAd ?? ''}`.trim(), birim: r.birim,
      tedarikciPartiNo: r.tedarikciPartiNo, dokumNo: r.dokumNo, sertifikaNo: r.sertifikaNo,
      verilen: r.verilen, sarf: kartSarfi(girdi.hareketler, r.partiId),
    },
    // Birleşen kolun kartı birleştiği kartla sürer: bu kart orada kapanmıştır.
    ...(({ sonAn: _s, ...x }) => x)(kartKonumu({ durum: r.birlestigi === null ? r.durum : 'birlesti', acilis: r.kayitZamani }, anlar, girdi.adimlar, girdi.simdi)),
    teslimler,
    sureOzetleri,
    olaylarEmrin: true,
    anlar,
  };
}

// Kart listesi özeti: kartın akışı hesaplanır, yalnız yer, rota, son an ve lead döner. Olmayan kart listede yoktur.
export async function kartOzetleri(db: Db, idler: readonly number[]): Promise<KartOzetleriCevabi> {
  const kartlar: KartOzetleriCevabi['kartlar'] = [];
  // Sırayla: işlem içindeki tek bağlantıda sorgular eşzamanlı koşamaz.
  for (const id of idler) {
    const a = await kartAkisi(db, id);
    if (a !== null) kartlar.push({ id, konum: a.konum, rota: a.rota, lead: a.lead, sonAn: a.anlar.at(-1) ?? null });
  }
  return { kartlar };
}
