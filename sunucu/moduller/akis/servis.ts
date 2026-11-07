import type { Db } from '#cekirdek/db.ts';
import { AZAMI_TAKVIM_GUNU } from '#paylasilan/sozlesme/vardiya.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { EmirAkisiCevabi, EmirListesiCevabi, KartAkisiCevabi, KartOzetleriCevabi, KonumHareketi, SureOzeti } from '#paylasilan/sozlesme/akis.ts';
import { durusNedenleriniListele, hurdaNedenleriniListele } from '../durus-nedenleri/disari.ts';
import { istasyonAdlari } from '../istasyonlar/disari.ts';
import { canliPlan, tabanPlani } from '../plan/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { receteRotaStatuleri } from '../recete-rota/disari.ts';
import { emirlerinSevkDurumu } from '../sevkiyat/disari.ts';
import { emrinAkisHareketleri, partiGirisZamanlari, refakatKartiKapsami, type AkisHareketi } from '../stok/disari.ts';
import { adimliEmirListesi, emirAkisKaydi, sureOzetiHesapla } from '../uretim-emirleri/disari.ts';
import { calismaTakvimleri } from '../vardiya/disari.ts';
import { aralikBirlesimi, aramaMetni, emirAkisi, kartAnlari, kartKonumu, kartPenceresi, kartSarfi, sevkAni, type AkisGirdisi } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

// Standart süreler numeric metin gelir; ekranda dakika sayısıdır.
const sayi = (m: string | null): number | null => (m === null ? null : Number(m));
const tekil = (d: readonly (number | null)[]): number[] => [...new Set(d.filter((x): x is number => x !== null))];

// Liste Üretim Emirleri'nin arşiv dışı emir listesidir (en yeni önce); arama ve sayfa burada uygulanır. Kaynak sayfalı okuma
// vermediği için satırlar bir kez okunup dilimlenir (3000 emirde ölçüm: uç 0,05-0,12 sn).
export async function emirListesi(db: Db, sorgu: { sayfa: number; sayfaBoyu?: number | undefined; ara?: string | undefined }): Promise<EmirListesiCevabi> {
  const { emirler } = await adimliEmirListesi(db, false);
  const satirlar = emirler.map((e) => ({ id: e.id, emirNo: e.emirNo, urun: `${e.urun.kod} ${e.urun.ad}`.trim(), adet: e.adet, durum: e.durum, teslim: e.teslim }));
  const aranan = aramaMetni(sorgu.ara ?? '');
  const uyan = aranan === '' ? satirlar : satirlar.filter((e) => aramaMetni(`${e.emirNo} ${e.urun}`).includes(aranan));
  return sayfaliListe(sorgu, { say: () => Promise.resolve(uyan.length), satirlar: (d) => Promise.resolve(uyan.slice(d.atla, d.atla + d.sinir)) });
}

const GUN = 86_400_000;

// 1852 a: adımların istasyonlarının çalışma aralıkları, ölçülen en eski andan bugüne tek okumada. Takvimi olmayan (iş merkezine
// bağlanamayan ya da hiç çalışma günü tanımlanmamış) istasyon haritada yoktur; hiçbiri yoksa ya da pencere takvim sınırını aşarsa null:
// ölçüler takvim saatiyle kalır, çalışma saati uydurulmaz.
async function calismaAraliklari(
  db: Db, adimlar: readonly { id: number; istasyonId: number | null }[], enErken: number | null, simdi: number,
): Promise<AkisGirdisi['calisma']> {
  const istasyonlar = tekil(adimlar.map((a) => a.istasyonId));
  if (istasyonlar.length === 0 || enErken === null || enErken > simdi) return null;
  const aralik = { baslangic: tesisGunu(enErken), bitis: tesisGunu(simdi + GUN) };
  if ((Date.parse(aralik.bitis) - Date.parse(aralik.baslangic)) / GUN > AZAMI_TAKVIM_GUNU) return null;
  const takvimler = await calismaTakvimleri(db, istasyonlar.map((id) => ({ tur: 'istasyon' as const, id })), aralik);
  const istasyonAraliklari = new Map(istasyonlar.flatMap((id) => {
    const t = takvimler.get(`istasyon:${String(id)}`) ?? null;
    if (t === null || t.gunler.every((x) => x.dakika === 0)) return [];
    return [[id, t.araliklar.map((a) => ({ bas: Date.parse(a.baslangic), bit: Date.parse(a.bitis) }))] as const];
  }));
  if (istasyonAraliklari.size === 0) return null;
  return {
    adimlar: new Map(adimlar.flatMap((a) => { const t = a.istasyonId === null ? undefined : istasyonAraliklari.get(a.istasyonId); return t === undefined ? [] : [[a.id, t] as const]; })),
    tesis: aralikBirlesimi([...istasyonAraliklari.values()]),
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
    birimSureler: new Map(adimlar.filter((a) => !a.fason).map((a) => [a.id, adimSureOzeti(kayit, a, simdi).netBirimDk])),
    olaylar: kayit.olaylar,
    sayimlar,
    fason: kayit.fason,
    hareketler,
    statuler: new Map(statuler.map((s) => [s.id, { ad: s.ad, tur: s.tur }])),
    partiGirisleri: new Map([...partiler].map(([k, p]) => [k, { lotNo: p.lotNo, malKabul: p.malKabulZamani }])),
    sevk: sevkAni(sevkler.get(id) ?? null),
    calisma: null,
  };
  const anlar = [
    ...[...partiler.values()].map((p) => p.malKabulZamani), emir.baslama, ...kayit.olaylar.map((o) => o.zaman), girdi.sevk?.hazir ?? null,
  ].flatMap((z) => (z === null ? [] : [Date.parse(z)]));
  girdi.calisma = await calismaAraliklari(db, kayit.isEmirleri, anlar.length === 0 ? null : Math.min(...anlar), Date.parse(simdi));
  return { girdi, kayit, hareketler, emir: { id: emir.id, emirNo: emir.emirNo, adet: emir.adet, durum: emir.durum, teslim: emir.teslim } };
}

type Kayit = NonNullable<Awaited<ReturnType<typeof emirAkisKaydi>>>;

// Adımın Üretim Emirleri süre özeti: emir yolculuğu ve kartın emir sütunu aynı tanımı okur (AKS-4 a). Pencere verilirse
// (kartın adımdaki penceresi) yalnız o aralık ve verilen sayımlar ölçülür.
function adimSureOzeti(
  kayit: Kayit, a: { id: number; baslama: string | null; bitis: string | null }, simdi: string,
  pencere?: { baslama: string | null; bitis: string | null; ayarlar: boolean; sayimlar: Kayit['sayimlar'] },
): SureOzeti {
  const olaylar = kayit.olaylar.filter((o) => o.isEmriId === a.id);
  const ayarlar = olaylar.filter((o) => o.olay === 'ayar').map((o) => o.zaman);
  const duruslar = olaylar.flatMap((o) => (o.olay === 'duraklat' || o.olay === 'durdur' || o.olay === 'devam' ? [{ olay: o.olay, zaman: o.zaman }] : []));
  const p = pencere ?? { baslama: a.baslama, bitis: a.bitis, ayarlar: true, sayimlar: kayit.sayimlar.filter((s) => s.isEmriId === a.id) };
  return sureOzetiHesapla({ baslama: p.baslama, bitis: p.bitis, simdi, ayarlar: p.ayarlar ? ayarlar : [], olaylar: duruslar, sayimlar: p.sayimlar });
}

export async function emirAkisiOku(db: Db, id: number): Promise<EmirAkisiCevabi> {
  const { girdi, emir, hareketler } = await akisGirdisi(db, id, null);
  return { emir, ...emirAkisi(girdi), konumHareketleri: await konumHareketleri(db, hareketler) };
}

// Parçayı izle (2224): hareketler konumlarıyla aynen geçer; istasyon konumunun adı istasyonlardan okunur.
async function konumHareketleri(db: Db, hareketler: readonly AkisHareketi[]): Promise<KonumHareketi[]> {
  const istasyon = await istasyonAdlari(db, tekil(hareketler.flatMap((h) => [h.kaynakIstasyonId, h.hedefIstasyonId])));
  const uc = (id: number | null, kod: string | null, ad: string | null, tur: string | null, ist: number | null) =>
    (id === null || kod === null || tur === null ? null : { id, kod, ad, tur, istasyon: ist === null ? null : istasyon.get(ist) ?? null });
  return hareketler.map((h) => ({
    id: h.id, zaman: h.zaman, tur: h.tur, malzemeId: h.malzemeId, partiId: h.partiId, miktar: h.miktar, cikisNedeni: h.cikisNedeni, geriAlinanId: h.geriAlinanId,
    kaynak: uc(h.kaynakKonumId, h.kaynakKonumKod, h.kaynakKonumAd, h.kaynakKonumTur, h.kaynakIstasyonId),
    hedef: uc(h.hedefKonumId, h.hedefKonumKod, h.hedefKonumAd, h.hedefKonumTur, h.hedefIstasyonId),
  }));
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
    const sayimlar = kayit.sayimlar.filter((s) => s.isEmriId === a.id);
    const pencere = kartPenceresi(a, sayimlar.map((s) => ({ zaman: s.zaman, kartin: s.refakatPartisiId === id })));
    return {
      isEmriId: a.id,
      kart: adimSureOzeti(kayit, a, girdi.simdi, { ...pencere, ayarlar: pencere.hazirlikKartin, sayimlar: sayimlar.filter((s) => s.refakatPartisiId === id) }),
      emir: adimSureOzeti(kayit, a, girdi.simdi),
    };
  });
  // 750 a: plan saatleri adımın güncel canlı yeri; taban (ilk canlıya alınan yer) ikinci satırdır.
  const isEmriIdleri = girdi.adimlar.map((a) => a.id);
  const canli = new Map((await canliPlan(db, isEmriIdleri)).map((p) => [p.isEmriId, { baslangic: p.baslangic, bitis: p.bitis }]));
  const iso = (z: string) => new Date(z).toISOString();
  const taban = new Map((await tabanPlani(db, { isEmriIdleri })).map((p) => [p.isEmriId, { baslangic: iso(p.baslangic), bitis: iso(p.bitis) }]));
  const planli = girdi.adimlar.map((a) => ({ ...a, plan: canli.get(a.id) ?? null, taban: taban.get(a.id) ?? null }));
  return {
    emir, ...sonuc,
    kart: {
      id, etiket: r.etiket, durum: r.durum, lotNo: r.lotNo, acilis: r.kayitZamani,
      malzeme: r.malzemeKod === null && r.malzemeAd === null ? null : `${r.malzemeKod ?? ''} ${r.malzemeAd ?? ''}`.trim(), birim: r.birim,
      tedarikciPartiNo: r.tedarikciPartiNo, dokumNo: r.dokumNo, sertifikaNo: r.sertifikaNo,
      verilen: r.verilen, sarf: kartSarfi(girdi.hareketler, r.partiId),
    },
    // Birleşen kolun kartı birleştiği kartla sürer: bu kart orada kapanmıştır.
    ...(({ sonAn: _s, ...x }) => x)(kartKonumu({ durum: r.birlestigi === null ? r.durum : 'birlesti', acilis: r.kayitZamani }, anlar, planli, girdi.simdi)),
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
