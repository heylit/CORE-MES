import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { VARSAYILAN_CEVRIMDE_PARCA, VARSAYILAN_DURUS_ESIGI_DK } from '#paylasilan/sozlesme/tezgah-deneme-sabitleri.ts';
import type { DenemePenceresi } from '#paylasilan/sozlesme/tezgah-deneme-sabitleri.ts';
import type { TezgahDurusCevabi, TezgahEslemeCevabi, TezgahGecisCevabi, TezgahOeeCevabi, TezgahSayimCevabi } from '#paylasilan/sozlesme/tezgah-deneme.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { makineler as coreMakineleri } from '../istasyonlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { makineOeeleri } from '../oee/disari.ts';
import { makineIsAraliklari, makineSayimAnlari } from '../uretim-emirleri/disari.ts';
import { calismaTakvimleri } from '../vardiya/disari.ts';
import {
  artislar, bolum, durumCizgisi, duruslar, enSikAlarmlar, gecisOlcutleri, gercekCevrim, hizDusurme, isEmriAninda, isSayimlari, kes, programKullanimi, sure,
} from './deneme-kurallar.ts';
import type { AlarmOlayi, Aralik, Artis, CizgiParcasi, IsAraligi, IsSayimi, ProgramSurumu, SayimAni } from './deneme-kurallar.ts';
import { pencereAraligi } from './deneme-kurallar.ts';
import { eslemeOnerisi } from './kurallar.ts';
import type { TezgahOgesi } from './kurallar.ts';
import { lsv2ListesiOku } from './servis.ts';
import * as s from './sorgular.ts';

// Deneme sayfası (kart 3811): yalnız kendi tablolarına yazar (eşleme ve deneme ayarları); başka modülleri disari.ts ile okur.

export async function esleme(db: Db): Promise<TezgahEslemeCevabi> {
  const makineler = (await coreMakineleri(db, { pasiflerDahil: false })).map((m) => ({ id: m.id, kod: m.kod, ad: m.ad }));
  const eslemeler = new Map((await s.eslemeleriGetir(db)).map((e) => [e.cihazAdi, e]));
  const lsv2 = new Set((await lsv2ListesiOku(db)).map((m) => m.cihazAdi.toLowerCase()));
  const adlar = await kisiAdlari(db, [...new Set([...eslemeler.values()].map((e) => e.degistirenKisiId))]);
  const cihazlar = [...new Set([...(await s.okumalar(db)).map((o) => o.cihazAdi), ...eslemeler.keys()])].sort((a, b) => a.localeCompare(b, 'tr'));
  return {
    makineler,
    cihazlar: cihazlar.map((cihazAdi) => {
      const e = eslemeler.get(cihazAdi);
      return {
        cihazAdi,
        kaynak: lsv2.has(cihazAdi.toLowerCase()) ? 'lsv2' as const : 'mtconnect' as const,
        makineId: e?.makineId ?? null,
        oneriMakineId: eslemeOnerisi(cihazAdi, makineler),
        cevrimdeParca: e?.cevrimdeParca ?? VARSAYILAN_CEVRIMDE_PARCA,
        durusEsigiDk: e?.durusEsigiDk ?? VARSAYILAN_DURUS_ESIGI_DK,
        degistiren: e === undefined ? null : adlar.get(e.degistirenKisiId) ?? null,
        degisti: e?.degisti ?? null,
      };
    }),
  };
}

export async function eslemeKaydet(
  db: Db, kullanici: Kullanici, cihazAdi: string, govde: { makineId: number | null; cevrimdeParca: number; durusEsigiDk: number },
): Promise<TezgahEslemeCevabi> {
  if (await s.okumaGetir(db, cihazAdi) === null) throw bulunamadi('Tezgâh bulunamadı.');
  if (govde.makineId !== null) {
    if (!(await coreMakineleri(db, { pasiflerDahil: false })).some((m) => m.id === govde.makineId)) throw dogrulama('Makine bulunamadı ya da pasif.', 'makineId');
    const baska = await s.makineninEslemesi(db, govde.makineId);
    if (baska !== null && baska !== cihazAdi) throw dogrulama(`Bu makine ${baska} tezgâhına eşli.`, 'makineId');
  }
  await s.eslemeYaz(db, cihazAdi, govde, kullanici.id);
  return esleme(db);
}

/* ---------------- sayım, duruş, OEE, geçiş (gölge hesap; hiçbir yere yazmaz) ---------------- */
const GUN_MS = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();
const ms = (z: string): number => Date.parse(z);
const gunEkle = (tarih: string, gun: number): string => new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * GUN_MS).toISOString().slice(0, 10);
const NC_ALANI_YOK = 'Rota adımında NC program alanı yok: program eşleşmesi tahmindir (parça no ve OP programda aranır), "uyuşmuyor" ölçülemez.';

interface Cihaz {
  cihazAdi: string;
  kaynak: 'mtconnect' | 'lsv2';
  makine: { id: number; kod: string; ad: string } | null;
  cevrimdeParca: number;
  durusEsigiDk: number;
}

interface Baglam {
  pencere: { ad: DenemePenceresi; baslangic: string; bitis: string };
  aralik: Aralik;
  cihazlar: Cihaz[];
  isler: Map<string, IsAraligi[]>;
  sayimlar: Map<string, SayimAni[]>;
  artis: Map<string, Artis[]>;
  plan: Map<string, Aralik[] | null>;
  cizgi: Map<string, CizgiParcasi[]>;
  surumler: Map<string, ProgramSurumu[] | null>;
}

async function cihazlariOku(db: Db): Promise<Cihaz[]> {
  const e = await esleme(db);
  const makine = new Map(e.makineler.map((m) => [m.id, m]));
  return e.cihazlar.map((c) => ({
    cihazAdi: c.cihazAdi, kaynak: c.kaynak, makine: c.makineId === null ? null : makine.get(c.makineId) ?? null, cevrimdeParca: c.cevrimdeParca, durusEsigiDk: c.durusEsigiDk,
  }));
}

async function baglamKur(db: Db, ad: DenemePenceresi, simdi: number): Promise<Baglam> {
  const aralik = pencereAraligi(ad, simdi);
  const cihazlar = await cihazlariOku(db);
  const adlar = cihazlar.map((c) => c.cihazAdi);
  const makineIdleri = cihazlar.flatMap((c) => (c.makine === null ? [] : [c.makine.id]));
  const bas = iso(aralik.bas), bit = iso(aralik.bit);
  const isMap = await makineIsAraliklari(db, makineIdleri, bas, bit);
  const sayimMap = await makineSayimAnlari(db, makineIdleri, bas, bit);
  const takvimler = makineIdleri.length === 0 ? new Map() : await calismaTakvimleri(db, makineIdleri.map((id) => ({ tur: 'makine' as const, id })),
    { baslangic: gunEkle(tesisGunu(aralik.bas), -1), bitis: gunEkle(tesisGunu(aralik.bit), 1) });
  const artisSatirlari = await s.sayacArtislari(db, adlar, new Date(aralik.bas), new Date(aralik.bit));
  const ornekler = await s.durumOrnekleri(db, adlar, new Date(aralik.bas), new Date(aralik.bit));
  const surumSatirlari = await s.programSurumleri(db, cihazlar.filter((c) => c.kaynak === 'lsv2').map((c) => c.cihazAdi));
  const baglam: Baglam = {
    pencere: { ad, baslangic: bas, bitis: bit }, aralik, cihazlar,
    isler: new Map(), sayimlar: new Map(), artis: new Map(), plan: new Map(), cizgi: new Map(), surumler: new Map(),
  };
  for (const c of cihazlar) {
    const id = c.makine?.id;
    baglam.isler.set(c.cihazAdi, id === undefined ? [] : (isMap.get(id) ?? []).map((i) => ({
      bas: ms(i.baslangic), bit: i.bitis === null ? null : ms(i.bitis), isEmriNo: i.isEmriNo, op: i.op === null ? null : String(i.op), parcaNo: i.parcaNo,
      ilkParcaOnayi: i.ilkParcaOnayi === null ? null : ms(i.ilkParcaOnayi), cevrimdeParca: i.cevrimdeParca,
    })));
    baglam.sayimlar.set(c.cihazAdi, id === undefined ? [] : (sayimMap.get(id) ?? []).map(({ zaman, ...x }) => ({ zaman: ms(zaman), ...x })));
    baglam.artis.set(c.cihazAdi, artislar(artisSatirlari.filter((a) => a.cihazAdi === c.cihazAdi).map((a) => ({ ...a, zaman: ms(a.zaman) }))));
    // Vardiyası tanımlanmamış makinenin planı yoktur (0 dakika değil, bilinmiyor).
    const t = id === undefined ? null : takvimler.get(`makine:${String(id)}`) ?? null;
    const takvim = t === null || t.vardiyaTanimli === false ? null : t;
    const plan = takvim === null ? null : kes(takvim.araliklar.map((a: { baslangic: string; bitis: string }) => ({ bas: ms(a.baslangic), bit: ms(a.bitis) })), aralik);
    baglam.plan.set(c.cihazAdi, plan);
    baglam.cizgi.set(c.cihazAdi, durumCizgisi(ornekler.filter((o) => o.cihazAdi === c.cihazAdi).map((o) => ({ zaman: ms(o.zaman), durum: o.durum })), aralik, plan));
    baglam.surumler.set(c.cihazAdi, c.kaynak !== 'lsv2' ? null : surumSatirlari.filter((x) => x.cihazAdi === c.cihazAdi).map((x) => ({ ...x, ilkGoruldu: ms(x.ilkGoruldu) })));
  }
  return baglam;
}

const isSayimiOku = (b: Baglam, c: Cihaz): IsSayimi[] =>
  isSayimlari(b.isler.get(c.cihazAdi) ?? [], b.artis.get(c.cihazAdi) ?? [], b.sayimlar.get(c.cihazAdi) ?? [], c.cevrimdeParca, b.aralik, b.surumler.get(c.cihazAdi) ?? null);

export async function sayim(db: Db, ad: DenemePenceresi, simdi = Date.now()): Promise<TezgahSayimCevabi> {
  const b = await baglamKur(db, ad, simdi);
  const eksikler = [NC_ALANI_YOK];
  if (b.cihazlar.some((c) => c.makine === null)) eksikler.push('Eşlenmemiş tezgâhın işleri okunmaz: önce Makine eşleme.');
  return {
    pencere: b.pencere, eksikler,
    makineler: b.cihazlar.map((c) => ({
      cihazAdi: c.cihazAdi, makine: c.makine, cevrimdeParca: c.cevrimdeParca,
      isler: isSayimiOku(b, c).map(({ baslangic, bitis, uretimArtisSayisi: _u, ilkEslesme: _i, ...x }) => ({
        ...x, baslangic: iso(baslangic), bitis: bitis === null ? null : iso(bitis),
        farkYuzde: x.farkYuzde === null ? null : Math.round(x.farkYuzde * 10) / 10,
      })),
      programKullanimi: programKullanimi(b.isler.get(c.cihazAdi) ?? [], b.artis.get(c.cihazAdi) ?? [], b.aralik.bit)
        .map((p) => ({ ...p, ilk: iso(p.ilk), son: iso(p.son) })),
    })),
  };
}

// Alarm okunamıyorsa nedeni: Heidenhain'de alarm öğesi Unavailable ise değeri (ör. "kumanda desteklemiyor"); MTConnect'te hiç koşul öğesi
// yoksa kumanda koşul bilgisi vermiyor.
function alarmTanisi(kaynak: Cihaz['kaynak'], ogeler: readonly TezgahOgesi[] | null): string | null {
  if (ogeler === null) return 'Tezgâh henüz okunmadı';
  if (kaynak === 'lsv2') {
    const a = ogeler.find((o) => o.kimlik === 'lsv2-alarm');
    if (a === undefined) return 'Alarm öğesi yok';
    return a.kosul === 'Unavailable' ? (a.deger ?? 'Alarm okunamıyor') : null;
  }
  return ogeler.some((o) => o.kosul !== null) ? null : 'Kumanda koşul (alarm) bilgisi vermiyor';
}

export async function durus(db: Db, ad: DenemePenceresi, simdi = Date.now()): Promise<TezgahDurusCevabi> {
  const b = await baglamKur(db, ad, simdi);
  const olaylar = await s.alarmOlaylari(db, new Date(b.aralik.bas), new Date(b.aralik.bit));
  const enSik: TezgahDurusCevabi['enSikAlarmlar'] = [];
  const alarmOlaylari: TezgahDurusCevabi['alarmOlaylari'] = [];
  const makineler: TezgahDurusCevabi['makineler'] = [];
  for (const c of b.cihazlar) {
    const isler = b.isler.get(c.cihazAdi) ?? [];
    const alarmlar: AlarmOlayi[] = olaylar.filter((o) => o.cihazAdi === c.cihazAdi).map((o) => ({ bas: ms(o.baslangic), bit: o.bitis === null ? null : ms(o.bitis), kod: o.kod, metin: o.metin }));
    const cizgi = b.cizgi.get(c.cihazAdi) ?? [];
    const d = duruslar(cizgi, c.durusEsigiDk, isler, alarmlar, b.aralik.bit);
    const okuma = await s.okumaGetir(db, c.cihazAdi);
    makineler.push({
      cihazAdi: c.cihazAdi, makine: c.makine, durusEsigiDk: c.durusEsigiDk,
      cizgi: cizgi.map((p) => ({ baslangic: iso(p.bas), bitis: iso(p.bit), hal: p.hal })),
      adaylar: d.adaylar.map((a) => ({ baslangic: iso(a.bas), bitis: iso(a.bit), saniye: a.saniye, sinif: a.sinif, metin: a.metin, isEmriNo: a.isEmriNo })),
      kisaDuruslar: d.kisa, toplamDurusSaniye: d.toplamSaniye,
      kayitsizDurusSaniye: c.makine === null ? null : d.kayitsizSaniye,
      alarmTani: alarmTanisi(c.kaynak, okuma?.ogeler ?? null),
    });
    for (const a of enSikAlarmlar(alarmlar, b.aralik)) enSik.push({ cihazAdi: c.cihazAdi, ...a });
    for (const a of alarmlar) {
      alarmOlaylari.push({ cihazAdi: c.cihazAdi, kod: a.kod, metin: a.metin, baslangic: iso(a.bas), bitis: a.bit === null ? null : iso(a.bit), isEmriNo: isEmriAninda(a.bas, isler, b.aralik.bit) });
    }
  }
  enSik.sort((x, y) => y.adet - x.adet || y.saniye - x.saniye);
  const eksikler: string[] = [];
  if (b.cihazlar.some((c) => c.makine === null)) eksikler.push('Eşlenmemiş tezgâhta vardiya, iş ve terminal karşılaştırması yok.');
  return { pencere: b.pencere, eksikler, makineler, enSikAlarmlar: enSik.slice(0, 10), alarmOlaylari };
}

// Performans: işlerin standart süresi (terminal sayımının standart saniyesinden adet başına) × tezgâh adedi / çalışma. Kalite: terminal
// sağlam / (sağlam + hurda + red). Standart çevrim, gerçek çevrim gibi çevrim başınadır: toplam standart süre / çevrim sayısı
// (çevrim = tezgâh adedi / çevrimde parça).
export async function oee(db: Db, kullanici: Kullanici, ad: DenemePenceresi, simdi = Date.now()): Promise<TezgahOeeCevabi> {
  const b = await baglamKur(db, ad, simdi);
  const eksikler: string[] = [];
  let modul: Map<number, { kullanilabilirlik: number | null; performans: number | null; kalite: number | null; oee: number | null }> | null = null;
  try {
    const m = await makineOeeleri(db, kullanici, { baslangic: tesisGunu(b.aralik.bas), bitis: tesisGunu(b.aralik.bit - 1) }, simdi);
    modul = new Map(m.map((x) => [x.id, { kullanilabilirlik: x.kullanilabilirlik, performans: x.performans, kalite: x.kalite, oee: x.oee }]));
  } catch {
    eksikler.push('OEE modülü okunamadı (yetki ya da aralık).');
  }
  const gecmisBasi = Math.max(b.aralik.bas, simdi - 24 * 3_600_000);
  if (gecmisBasi > b.aralik.bas) eksikler.push('Hız düşürme yalnız son 24 saat için hesaplanır (değer geçmişi 24 saattir).');
  const makineler: TezgahOeeCevabi['makineler'] = [];
  for (const c of b.cihazlar) {
    const plan = b.plan.get(c.cihazAdi) ?? null;
    const cizgi = b.cizgi.get(c.cihazAdi) ?? [];
    const calisma = cizgi.filter((p) => p.hal === 'calisiyor');
    const planliSaniye = plan === null ? null : Math.round(sure(plan) / 1000);
    const calismaSaniye = plan === null ? Math.round(sure(calisma) / 1000) : Math.round(sure(calisma.flatMap((p) => kes(plan, p))) / 1000);
    const isler = isSayimiOku(b, c);
    const sayimlar = b.sayimlar.get(c.cihazAdi) ?? [];
    let standart = 0, standartli = false, cevrimSayisi = 0;
    const isAraliklari = b.isler.get(c.cihazAdi) ?? [];
    isler.forEach((x, n) => {
      const ia = isAraliklari[n]!;
      const bit = Math.min(ia.bit ?? b.aralik.bit, b.aralik.bit);
      const ss = sayimlar.filter((y) => y.zaman >= ia.bas && y.zaman < bit);
      const sureli = ss.reduce((t, y) => t + y.saglam - y.suresizSaglam, 0);
      const stdSn = ss.reduce((t, y) => t + y.standartSaniye, 0);
      if (sureli > 0 && x.tezgahAdedi !== null) {
        standart += (stdSn / sureli) * x.tezgahAdedi;
        cevrimSayisi += x.tezgahAdedi / x.cevrimdeParca;
        standartli = true;
      }
    });
    const saglam = sayimlar.reduce((t, y) => t + y.saglam, 0), toplam = sayimlar.reduce((t, y) => t + y.saglam + y.hurda + y.red, 0);
    const kullanilabilirlik = bolum(calismaSaniye, planliSaniye);
    const performans = standartli ? bolum(standart, calismaSaniye) : null;
    const kalite = bolum(saglam, toplam);
    const gercek = gercekCevrim(b.artis.get(c.cihazAdi) ?? []);
    const standartCevrim = standartli && cevrimSayisi > 0 ? standart / cevrimSayisi : null;
    let hiz: number | null = null;
    if (gecmisBasi < b.aralik.bit) {
      const kimlikler = (await s.tanimlariGetir(db, c.cihazAdi)).filter((t) => t.tur === 'PathFeedrateOverride' && (t.altTur === null || t.altTur === 'PROGRAMMED')).map((t) => t.kimlik);
      if (kimlikler.length > 0) {
        const degerler = await s.sayiDegerleri(db, c.cihazAdi, kimlikler, new Date(gecmisBasi), new Date(b.aralik.bit));
        hiz = degerler.length === 0 ? null : hizDusurme(degerler.map((d) => ({ zaman: ms(d.zaman), deger: d.deger })), kes(calisma, { bas: gecmisBasi, bit: b.aralik.bit }), b.aralik.bit);
      }
    }
    makineler.push({
      cihazAdi: c.cihazAdi, makine: c.makine,
      tezgah: { kullanilabilirlik, performans, kalite, oee: kullanilabilirlik === null || performans === null || kalite === null ? null : kullanilabilirlik * performans * kalite },
      modul: c.makine === null || modul === null ? null : modul.get(c.makine.id) ?? null,
      calismaSaniye, planliSaniye,
      gercekCevrimSaniye: gercek, standartCevrimSaniye: standartCevrim,
      // Gerçek çevrim standarttan %10'dan fazla saparsa önerilir; yazılmaz.
      onerilenStandartSaniye: gercek !== null && standartCevrim !== null && Math.abs(gercek - standartCevrim) / standartCevrim > 0.1 ? gercek : null,
      hizDusurmeSaniye: hiz,
    });
  }
  return { pencere: b.pencere, eksikler, makineler };
}

// MTConnect'te kumanda saati okunmaz: tezgâh çalışırken son okumadaki en yeni öğe zamanı ile okuma anının farkı tahmin edilir (okuma
// aralığı kadar şaşar). Heidenhain'de R_DT'den gelen fark kullanılır.
function saatFarki(kaynak: Cihaz['kaynak'], okuma: (s.OkumaSatiri & { ogeler: TezgahOgesi[] }) | null): { sn: number | null; tani: string | null } {
  if (okuma === null) return { sn: null, tani: 'Tezgâh henüz okunmadı' };
  if (kaynak === 'lsv2') {
    const o = okuma.ogeler.find((x) => x.kimlik === 'lsv2-saat-farki');
    const n = o?.deger === null || o?.deger === undefined ? null : Number(o.deger);
    return n === null || !Number.isFinite(n) ? { sn: null, tani: 'Kumanda saati okunamadı' } : { sn: n, tani: null };
  }
  if (okuma.durum !== 'calisiyor') return { sn: null, tani: 'Tezgâh çalışırken ölçülür' };
  const enYeni = Math.max(...okuma.ogeler.flatMap((o) => (o.zaman === null ? [] : [ms(o.zaman)])));
  return Number.isFinite(enYeni) ? { sn: Math.round((enYeni - ms(okuma.okundu)) / 1000), tani: null } : { sn: null, tani: 'Öğe zamanı yok' };
}

export async function gecis(db: Db, simdi = Date.now()): Promise<TezgahGecisCevabi> {
  const b = await baglamKur(db, 'yedi-gun', simdi);
  const makineler: TezgahGecisCevabi['makineler'] = [];
  for (const c of b.cihazlar) {
    const isler = isSayimiOku(b, c);
    const plan = b.plan.get(c.cihazAdi) ?? null;
    const cizgi = b.cizgi.get(c.cihazAdi) ?? [];
    const okuma = await s.okumaGetir(db, c.cihazAdi);
    const artis = (b.artis.get(c.cihazAdi) ?? []).filter((a) => a.uretim && a.adet > 0);
    const isAraliklari = b.isler.get(c.cihazAdi) ?? [];
    const saat = saatFarki(c.kaynak, okuma);
    const olcutler = gecisOlcutleri({
      eslendi: c.makine !== null,
      planliMs: plan === null ? null : sure(plan),
      baglantiYokMs: plan === null ? 0 : sure(cizgi.filter((p) => p.hal === 'baglanti-yok')),
      kapananlar: isler.flatMap((x) => (x.bitis !== null && x.tezgahAdedi !== null && x.saglam !== null ? [{ tezgah: x.tezgahAdedi, terminal: x.saglam + (x.hurda ?? 0) }] : [])),
      eslesmeler: isler.filter((x) => x.uretimArtisSayisi > 0).map((x) => x.programEslesmesi),
      ncAlaniVar: false,
      alarmTani: alarmTanisi(c.kaynak, okuma?.ogeler ?? null),
      saatFarkiSn: saat.sn, saatTani: saat.tani,
      uretimArtisi: artis.length,
      iseBagliUretimArtisi: artis.filter((a) => isEmriAninda(a.zaman, isAraliklari, b.aralik.bit) !== null).length,
    });
    makineler.push({ cihazAdi: c.cihazAdi, makine: c.makine, olcutler, hazir: olcutler.every((o) => o.tamam) });
  }
  return { pencere: b.pencere, makineler };
}
