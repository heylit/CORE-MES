import type { Db } from '#cekirdek/db.ts';
import { cakisma, gecersiz } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { OndalikMetin } from '#paylasilan/ondalik.ts';
import { KATALOG_TURLERI } from '#paylasilan/sozlesme/malzemeler.ts';
import type { KatalogTuru } from '#paylasilan/sozlesme/malzemeler.ts';
import type { EmirTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { AgacCevabi, Bagimlilik, IlkParcaSecimi, KullanimCevabi, MakineKullanimi, RevizyonDurumu, UrunOzeti } from '#paylasilan/sozlesme/rota.ts';
import { malzemeAra as kartAra } from '../../malzemeler/disari.ts';
import { aletTurleri } from '../../kalibrasyon/disari.ts';
import { adimliEmirAyrintisi, isEmirleriniYenile, uretimEmriAc } from '../../uretim-emirleri/disari.ts';
import { cokKatmanaCevir, emreKopyalanabilirMi, girdiEksigi, oncullerCikar } from '../kurallar.ts';
import type { Oncul } from '../kurallar.ts';
import * as s from '../sorgular.ts';
import type { AdimKaynagi, Icerik, Kaynak, RevizyonSatiri } from '../sorgular.ts';
import { ARAMA_SAYFA_BOYU, icerikYazimlari, isEmirlerineSabitle, isEmriGirdileri, patlat, revizyonuAl, urunOzetiAl, urunOzetine } from './ortak.ts';
import { agac } from './agac.ts';

/* ---------------- başka modüllere ---------------- */

export interface RotaAdimi {
  opNo: number;
  sira: number;
  operasyonTipiId: number;
  ad: string;
  // Operasyonu yapan makine ya da kişi; null: henüz atanmadı ya da adım fason.
  kaynak: Kaynak | null;
  // Fason adım: işi yapan finans firması ve takvim günü termini. Plan fason adımı henüz yerleştirmez (F10).
  // fason doluysa adım fasondadır; firmaId null: firma seçilmedi (2681). Fason olup olmadığı yalnız bu alandan okunur (Mimar K2).
  fason: { firmaId: number | null; terminGun: number | null } | null;
  ayarSuresiDk: OndalikMetin | null;
  birimSureDk: OndalikMetin | null;
  bagimlilik: Bagimlilik;
  devirAdedi: number | null;
  firePayiYuzde: OndalikMetin;
  makineKullanimi: MakineKullanimi;
  enKucukParca: number | null;
  yenidenAyar: boolean;
  ilkParca: IlkParcaSecimi;
  adaylar: { kaynak: Kaynak; ayarSuresiDk: OndalikMetin | null; birimSureDk: OndalikMetin | null }[];
  bilesenler: { malzemeId: number; miktar: OndalikMetin; fireYuzde: OndalikMetin }[];
  yanUrunler: { malzemeId: number; miktar: OndalikMetin }[];
  // Emre kopyalanırken sabitlenecek geçerli talimat sürümü; talimat yoksa null.
  talimatSurumu: number | null;
  // Çok dallı rota (1248 a): öncüller kurallar.ts oncullerCikar'dan; null tek hatlı rotadır (bugünkü bağımlılık kuralı), boş dizi hiçbir adımı beklemez.
  dal: string | null;
  onculler: Oncul[] | null;
  // Dal çarpanı (1257 a); boş 1.
  adetCarpani: number | null;
}

export interface RotaRevizyonu {
  id: number;
  malzemeId: number;
  harf: string;
  durum: RevizyonDurumu;
  adimlar: RotaAdimi[];
}

// Kural gelmeden onaylanmış revizyonda da girensiz adım olabilir (#1372): plan ve Arkon bu revizyondan açılan emri yerleştirmez, nedenini gösterir.
export async function girdisiEksikRevizyonlar(db: Db, revizyonIdleri: readonly number[]): Promise<Map<number, string>> {
  const adimlar = await s.adimGirenSayilari(db, [...new Set(revizyonIdleri)]);
  const sonuc = new Map<number, string>();
  for (const id of new Set(adimlar.map((a) => a.revizyonId))) {
    const eksik = girdiEksigi(adimlar.filter((a) => a.revizyonId === id));
    if (eksik) sonuc.set(id, `Rotada girdi eksik (${eksik.replace(/\.$/, '')})`);
  }
  return sonuc;
}

export async function revizyonGetir(db: Db, id: number): Promise<RotaRevizyonu | null> {
  const r = await s.revizyonOku(db, id);
  if (!r) return null;
  const icerik = await s.icerikOku(db, id);
  const talimatlar = new Map((await s.gecerliTalimatlar(db, r.malzemeId)).map((t) => [t.opNo, t.surum]));
  return revizyonKur(r, icerik, talimatlar);
}

// /plan gibi çok revizyon okuyan çağıranlar için: revizyon sayısından bağımsız sabit sayıda sorgu. Bulunmayan kimlik haritada yer almaz.
export async function revizyonlar(db: Db, idler: readonly number[]): Promise<Map<number, RotaRevizyonu>> {
  const sonuc = new Map<number, RotaRevizyonu>();
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return sonuc;
  const satirlar = await s.revizyonlariOku(db, tekil);
  if (satirlar.length === 0) return sonuc;
  const icerikler = await s.iceriklerOku(db, satirlar.map((r) => r.id));
  const talimatlar = new Map<number, Map<number, number>>();
  for (const t of await s.urunlerinGecerliTalimatlari(db, [...new Set(satirlar.map((r) => r.malzemeId))])) {
    let urun = talimatlar.get(t.malzemeId);
    if (!urun) talimatlar.set(t.malzemeId, urun = new Map());
    urun.set(t.opNo, t.surum);
  }
  for (const r of satirlar) {
    sonuc.set(r.id, revizyonKur(r, icerikler.get(r.id) ?? { adimlar: [], adaylar: [], bilesenler: [], yanUrunler: [] }, talimatlar.get(r.malzemeId) ?? new Map()));
  }
  return sonuc;
}

function revizyonKur(r: RevizyonSatiri, icerik: Icerik, talimatlar: ReadonlyMap<number, number>): RotaRevizyonu {
  const yazim = icerikYazimlari(icerik);
  const onculler = oncullerCikar(icerik.adimlar);
  return {
    id: r.id, malzemeId: r.malzemeId, harf: r.harf, durum: r.durum,
    adimlar: icerik.adimlar.map((a, i) => ({
      opNo: a.opNo, sira: a.sira, operasyonTipiId: a.operasyonTipiId, ad: a.ad,
      kaynak: a.kaynak === null || a.kaynak.tur === 'fason' ? null : (a.kaynak as Kaynak),
      fason: a.kaynak?.tur === 'fason' ? { firmaId: a.kaynak.id, terminGun: a.terminGun } : null,
      ayarSuresiDk: a.ayarSuresiDk, birimSureDk: a.birimSureDk, bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi, firePayiYuzde: a.firePayiYuzde,
      makineKullanimi: a.makineKullanimi, enKucukParca: a.enKucukParca, yenidenAyar: a.yenidenAyar, ilkParca: a.ilkParca,
      adaylar: (yazim[i]?.adaylar ?? []).map(({ kaynak, ayarSuresiDk, birimSureDk }) => ({ kaynak, ayarSuresiDk, birimSureDk })) as RotaAdimi['adaylar'],
      bilesenler: (yazim[i]?.bilesenler ?? []) as RotaAdimi['bilesenler'],
      yanUrunler: (yazim[i]?.yanUrunler ?? []) as RotaAdimi['yanUrunler'],
      talimatSurumu: talimatlar.get(a.opNo) ?? null,
      dal: a.dal, onculler: onculler[i] ?? null, adetCarpani: a.adetCarpani,
    })),
  };
}

// Reçete ve Rota'nın bağlı durumu (kart #1184): ekranın düzenlediği alanlar. Adımın kaynağı ham haliyle verilir (istasyon, makine, kişi, fason);
// ekranın karşılığı olmayan kişi, fason ve makine adayları yorumsuz taşınır ki kaydet onları silmesin.
export interface DurumRotaAdimi {
  opNo: number;
  operasyonTipiId: number;
  ad: string;
  kaynak: AdimKaynagi | null;
  terminGun: number | null;
  ayarSuresiDk: OndalikMetin | null;
  birimSureDk: OndalikMetin | null;
  islemSuresiDk: OndalikMetin | null;
  degisimSuresiDk: OndalikMetin | null;
  bagimlilik: Bagimlilik;
  devirAdedi: number | null;
  firePayiYuzde: OndalikMetin;
  makineKullanimi: MakineKullanimi;
  enKucukParca: number | null;
  yenidenAyar: boolean;
  // Ayar işaretli adımda plan ayarcı arar; ayarSuresiDk hazırlık ile ayarın toplamıdır (1310 a).
  hazirlikDk: OndalikMetin | null;
  ayar: boolean;
  ayarDk: OndalikMetin | null;
  ilkParca: IlkParcaSecimi;
  adaylar: { kaynak: Kaynak; ayarSuresiDk: OndalikMetin | null; birimSureDk: OndalikMetin | null; islemSuresiDk: OndalikMetin | null; degisimSuresiDk: OndalikMetin | null }[];
  bilesenler: { malzemeId: number; miktar: OndalikMetin; fireYuzde: OndalikMetin }[];
  yanUrunler: { malzemeId: number; miktar: OndalikMetin }[];
  dal: string | null;
  adetCarpani: number | null;
  birlesen: string[];
  onculler: Oncul[] | null;
}

export interface DurumRotaRevizyonu {
  id: number;
  malzemeId: number;
  harf: string;
  durum: RevizyonDurumu;
  surum: number;
  aciklama: string | null;
  acilma: string;
  onaylama: string | null;
  yururlugeAlma: string | null;
  geriGondermeNedeni: string | null;
  adimlar: DurumRotaAdimi[];
}

// malzemeId verilince yalnız o ürünün revizyonları (sayımda tek rotanın statüsü çözülür).
export async function durumRevizyonlari(db: Db, malzemeId: number | null = null): Promise<DurumRotaRevizyonu[]> {
  const sonuc: DurumRotaRevizyonu[] = [];
  const revizyonlar = await s.iptalsizRevizyonlar(db, malzemeId);
  // Planlama çalışması her açılışta bütün revizyonları okur: içerik revizyon başına değil, toplu okunur.
  const icerikler = revizyonlar.length === 0 ? new Map<number, Icerik>() : await s.iceriklerOku(db, revizyonlar.map((r) => r.id));
  for (const r of revizyonlar) {
    const icerik = icerikler.get(r.id) ?? { adimlar: [], adaylar: [], bilesenler: [], yanUrunler: [] };
    const onculler = oncullerCikar(icerik.adimlar);
    sonuc.push({
      id: r.id, malzemeId: r.malzemeId, harf: r.harf, durum: r.durum, surum: r.surum, aciklama: r.aciklama, acilma: r.acilma, onaylama: r.onaylama,
      yururlugeAlma: r.yururlugeAlma, geriGondermeNedeni: r.geriGondermeNedeni,
      adimlar: icerik.adimlar.map((a, i) => ({
        opNo: a.opNo, operasyonTipiId: a.operasyonTipiId, ad: a.ad, kaynak: a.kaynak, terminGun: a.terminGun, ayarSuresiDk: a.ayarSuresiDk,
        birimSureDk: a.birimSureDk, islemSuresiDk: a.islemSuresiDk, degisimSuresiDk: a.degisimSuresiDk, bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi,
        firePayiYuzde: a.firePayiYuzde, makineKullanimi: a.makineKullanimi, enKucukParca: a.enKucukParca, yenidenAyar: a.yenidenAyar, ilkParca: a.ilkParca,
        adaylar: icerik.adaylar.filter((x) => x.adimId === a.id)
          .map(({ kaynak, ayarSuresiDk, birimSureDk, islemSuresiDk, degisimSuresiDk }) => ({ kaynak, ayarSuresiDk, birimSureDk, islemSuresiDk, degisimSuresiDk })),
        bilesenler: icerik.bilesenler.filter((x) => x.adimId === a.id).map(({ malzemeId, miktar, fireYuzde }) => ({ malzemeId, miktar, fireYuzde })),
        yanUrunler: icerik.yanUrunler.filter((x) => x.adimId === a.id).map(({ malzemeId, miktar }) => ({ malzemeId, miktar })),
        hazirlikDk: a.hazirlikDk, ayar: a.ayar, ayarDk: a.ayarDk, dal: a.dal, birlesen: a.birlesen, adetCarpani: a.adetCarpani, onculler: onculler[i] ?? null,
      })),
    });
  }
  return sonuc;
}

// Adımın ilk parça seçimi (744 a), anahtar `revizyonId:opNo`. Emrin revizyonu yayındadır ve değişmez; rotada olmayan adımı çağıran
// varsayılanla ("her kurulumda") okur.
export async function adimIlkParcaSecimleri(db: Db, revizyonIdleri: readonly number[]): Promise<Map<string, IlkParcaSecimi>> {
  if (revizyonIdleri.length === 0) return new Map();
  return new Map((await s.adimIlkParcaSecimleri(db, [...new Set(revizyonIdleri)])).map((x) => [`${x.revizyonId}:${x.opNo}`, x.ilkParca]));
}

export async function yururluktekiRevizyon(db: Db, malzemeId: number): Promise<RotaRevizyonu | null> {
  const id = await s.yururluktekiRevizyonId(db, malzemeId);
  return id === null ? null : revizyonGetir(db, id);
}

export async function adimBilesenleri(db: Db, revizyonId: number, opNo: number): Promise<RotaAdimi['bilesenler']> {
  const r = await revizyonGetir(db, revizyonId);
  return r?.adimlar.find((a) => a.opNo === opNo)?.bilesenler ?? [];
}

export async function gecerliTalimat(db: Db, malzemeId: number, opNo: number): Promise<{ surum: number; metin: string } | null> {
  const t = (await s.talimatlar(db, malzemeId, opNo))[0];
  return t ? { surum: t.surum, metin: t.metin } : null;
}

// Yürürlükteki rotayla ağaç; rotası yoksa null.
export async function urunAgaci(db: Db, malzemeId: number, miktar: number): Promise<AgacCevabi | null> {
  const id = await s.yururluktekiRevizyonId(db, malzemeId);
  return id === null ? null : agac(db, id, miktar);
}

// Malzemeler bölümü: kartın hangi rotalarda kullanıldığı.
export async function malzemeKullanimi(db: Db, malzemeIdleri: readonly number[]): Promise<KullanimCevabi> {
  const satirlar = await s.malzemeKullanimi(db, malzemeIdleri);
  const urunler = new Map<number, UrunOzeti>();
  for (const x of satirlar) if (!urunler.has(x.urunId)) urunler.set(x.urunId, await urunOzetiAl(db, x.urunId));
  return {
    kullanimlar: satirlar.map((x) => ({
      malzemeId: x.malzemeId, urun: urunler.get(x.urunId)!, revizyon: { id: x.revizyonId, harf: x.harf, durum: x.durum as RevizyonDurumu },
      opNo: x.opNo, adimAdi: x.adimAdi, rol: x.rol,
    })),
  };
}

/* ---------------- emre kopya (K1) ---------------- */

// Rota (üst) üretim emirlerinin (alt) komutunu kendi transaction'ında çağırır (ADR 0006): üretim emri açılır, her rota adımı bir
// iş emri olur; talimatın emir açıldığı andaki sürümü sabitlenir ve metni iş emrinin kontrol listesi olur.
export async function emreKopyala(db: Db, kullanici: Kullanici, id: number, g: {
  adet: number; teslim: string | null; oncelik?: number | undefined; baslangic?: string | null | undefined; aciklama?: string | null | undefined; taslak?: boolean | undefined; projeId?: number | null | undefined; siparisSatiriId?: number | null | undefined;
  stoktanRezerve?: boolean | undefined; emirTuru?: EmirTuru | undefined; cokKatmanli?: boolean | undefined; stoktanDugumler?: readonly string[] | undefined;
}) {
  const r = revizyonuAl(await s.revizyonOku(db, id));
  const urun = await urunOzetiAl(db, r.malzemeId);
  if (urun.onayDurumu !== 'aktif') throw gecersiz('Kart kullanımda değil; emir açılamaz.');
  const rota = await revizyonGetir(db, id);
  const ret = emreKopyalanabilirMi({ durum: r.durum, adimSayisi: rota?.adimlar.length ?? 0 });
  if (ret || !rota) throw gecersiz(ret ?? 'Rota bulunamadı.');
  const baslik = {
    malzemeNo: r.malzemeId, adet: g.adet, teslim: g.teslim, oncelik: g.oncelik, baslangic: g.baslangic ?? null, aciklama: g.aciklama ?? null,
    ...(g.taslak ? { taslak: true } : {}), ...(g.stoktanRezerve ? { stoktanRezerve: true } : {}), ...(g.emirTuru ? { emirTuru: g.emirTuru } : {}), projeId: g.projeId ?? null, siparisSatiriId: g.siparisSatiriId ?? null, kaynakRotaRevizyonId: r.id,
  };
  if (g.cokKatmanli === true) return cokKatmanliAc(db, kullanici, r.id, r.malzemeId, rota, baslik, g.stoktanDugumler ?? []);
  if ((g.stoktanDugumler ?? []).length > 0) throw gecersiz('Stoktan karşılanan düğüm yalnız çok katmanlı emirde seçilir.');
  const acilan = await uretimEmriAc(db, kullanici, { ...baslik, isEmirleri: await isEmriGirdileri(db, r.malzemeId, rota) });
  // Üretim emirleri iş emirlerini adım sırasıyla açar ve kimlikleri o sırayla döner.
  const sirali = [...rota.adimlar].sort((a, b) => a.sira - b.sira);
  await isEmirlerineSabitle(db, kullanici.id, r.id, acilan.isEmriIdleri.flatMap((ieId, i) => {
    const a = sirali[i];
    return a ? [{ id: ieId, opNo: a.opNo }] : [];
  }));
  return acilan;
}

// 1476: tek emir patlamış rotanın bütün düğümlerini taşır. Her düğümün adımları kendi revizyonundan (talimat, şartname) kurulur,
// sonra tek emrin numara, dal ve öncül düzenine çevrilir (cokKatmanaCevir); şartnameler düğümün revizyonu ve rotadaki numarayla sabitlenir.
async function cokKatmanliAc(
  db: Db, kullanici: Kullanici, revizyonId: number, malzemeId: number, kokRota: RotaRevizyonu,
  baslik: Omit<Parameters<typeof uretimEmriAc>[2], 'isEmirleri'>, stoktan: readonly string[],
) {
  const p = await patlat(db, kullanici.id, revizyonId, malzemeId);
  const dugumler = [...new Map(p.satirlar.map((x) => [x.dugum, x])).values()];
  const girdiler = new Map<string, Awaited<ReturnType<typeof isEmriGirdileri>>>();
  for (const d of dugumler) {
    const rota = d.dugum === '0' ? kokRota : await revizyonGetir(db, d.revizyonId);
    if (rota === null) throw gecersiz('Alt parçanın rotası bulunamadı.');
    girdiler.set(d.dugum, await isEmriGirdileri(db, d.malzemeId, rota));
  }
  const c = cokKatmanaCevir(p.satirlar, girdiler, stoktan);
  if ('ileti' in c) throw gecersiz(c.ileti);
  const acilan = await uretimEmriAc(db, kullanici, { ...baslik, patlatmaId: p.id, isEmirleri: c.girdiler });
  const revizyonu = new Map(dugumler.map((d) => [d.dugum, d.revizyonId]));
  for (const d of new Set(c.girdiler.map((x) => x.dugum.ad))) {
    await isEmirlerineSabitle(db, kullanici.id, revizyonu.get(d)!, c.girdiler.flatMap((x, i) => {
      const id = acilan.isEmriIdleri[i];
      return x.dugum.ad === d && id !== undefined ? [{ id, opNo: x.dugum.kaynakOpNo }] : [];
    }));
  }
  return acilan;
}

// Teslimdeki "Emirlere uygula (yürürlükteki rota)": iş emirleri ürünün yürürlükteki revizyonundan yenilenir. Güvenli kip
// üretim emirlerindedir (başlamış ya da bitmiş iş emri korunur); rota yalnız yürürlükteki adımları verir (ADR 0006).
export async function emreUygula(db: Db, kullanici: Kullanici, emirId: number) {
  const e = await adimliEmirAyrintisi(db, emirId);
  if (e.urun.id === null || e.kaynakRotaRevizyonId === null) throw gecersiz('Rotadan açılmamış emre rota uygulanmaz.');
  const yid = await s.yururluktekiRevizyonId(db, e.urun.id);
  if (yid === null) throw gecersiz('Ürünün yürürlükte rotası yok.');
  if (yid === e.kaynakRotaRevizyonId) throw cakisma('Emir zaten yürürlükteki rotayla açılmış.');
  const r = revizyonuAl(await s.revizyonOku(db, yid));
  const rota = await revizyonGetir(db, yid);
  const ret = emreKopyalanabilirMi({ durum: r.durum, adimSayisi: rota?.adimlar.length ?? 0 });
  if (ret || !rota) throw gecersiz(ret ?? 'Rota bulunamadı.');
  const { degisenler } = await isEmirleriniYenile(db, kullanici, emirId, { kaynakRotaRevizyonId: yid, isEmirleri: await isEmriGirdileri(db, r.malzemeId, rota) });
  // Yenilenen (başlamamış) iş emirleri yeni revizyonun şartnamelerini alır; değiştirilmeyen parti (kaynak revizyonu eski kalır) dokunulmaz.
  const sonra = await adimliEmirAyrintisi(db, emirId);
  if (sonra.kaynakRotaRevizyonId === yid) {
    const bekleyen = sonra.isEmirleri.filter((i) => i.tur === 'rota' && i.durum === 'bekliyor');
    await s.isEmriSabitleriniSil(db, bekleyen.map((i) => i.id));
    await s.isEmriEkipmaniniSil(db, bekleyen.map((i) => i.id));
    await isEmirlerineSabitle(db, kullanici.id, yid, bekleyen);
  }
  return { degisenler, kaynakRevizyon: { id: r.id, harf: r.harf } };
}

export async function revizyonKunyeleri(db: Db, idler: readonly number[]) {
  return { revizyonlar: await s.revizyonKunyeleri(db, idler) };
}

// Malzeme seçici ve Malzemeler bölümü: arama malzemeler modülündedir; rota yalnız ürün özetine çevirir.
// Bilinmeyen tür süzgeçten düşer; istenen türlerin hiçbiri bilinmiyorsa sonuç boştur (süzgeçsiz arama yapılmaz).
export async function malzemeAra(db: Db, g: { metin: string | null; tur: string[]; hepsi: boolean; sayfa: number }) {
  const turler = g.tur.filter((t): t is KatalogTuru => (KATALOG_TURLERI as readonly string[]).includes(t));
  if (g.tur.length > 0 && turler.length === 0) return { satirlar: [], toplam: 0, sayfaBoyu: ARAMA_SAYFA_BOYU };
  const r = await kartAra(db, { metin: g.metin, turler, yalnizAktif: !g.hepsi, sayfa: g.sayfa, sayfaBoyu: ARAMA_SAYFA_BOYU });
  // Malzemelerin araması sayımı hep verir; vermezse ekran en az görünen satır sayısını gösterir.
  return { satirlar: r.satirlar.map(urunOzetine), toplam: r.toplam ?? r.satirlar.length, sayfaBoyu: r.sayfaBoyu };
}

// gecerliTalimat'ın toplu hâli: anahtar `${malzemeId}:${opNo}`; talimatı olmayan anahtar haritada yoktur. Paket listesi adım başına
// ayrı sorgu atmasın diye.
export async function gecerliTalimatlarToplu(db: Db, anahtarlar: readonly { malzemeId: number; opNo: number }[]): Promise<Map<string, { surum: number; metin: string }>> {
  if (anahtarlar.length === 0) return new Map();
  const satirlar = await s.gecerliTalimatlarToplu(db, anahtarlar.map((a) => a.malzemeId), anahtarlar.map((a) => a.opNo));
  return new Map(satirlar.map((t) => [`${String(t.malzemeId)}:${String(t.opNo)}`, { surum: t.surum, metin: t.metin }]));
}

// Adım ekipmanında seçilebilen ölçü aleti türleri (2893-4 a).
// 3199: kartı isteyen adım sayısı (Kaynaklar > İkincil kaynaklar); yürürlükteki ve açık (taslak, onay bekleyen) revizyonlar sayılır.
export function aparatKullanimi(db: Db): Promise<{ malzemeId: number; adim: number }[]> {
  return s.aparatKullanimi(db);
}

export async function olcuAletiTurleri(db: Db): Promise<{ turler: { id: number; ad: string }[] }> {
  return { turler: (await aletTurleri(db)).map((t) => ({ id: t.id, ad: t.ad })) };
}
