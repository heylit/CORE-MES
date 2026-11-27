import type { Db, Veritabani } from '#cekirdek/db.ts';
import { lsv2ListesiniCoz } from '#paylasilan/lsv2-makineleri.ts';
import type { Lsv2Makinesi } from '#paylasilan/lsv2-makineleri.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import { TEZGAH_TURLERI } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import type { TezgahAyrintisiCevabi, TezgahBaglantisiDurumCevabi, TezgahDoluluguCevabi, TezgahTakimTablosuCevabi, TezgahTuru } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { smartesMakineDegerleri } from '../smartes/disari.ts';
import type { TezgahIstemcisi } from './istemci.ts';
import type { Lsv2Bellegi } from './lsv2-tur.ts';
import {
  akislariOku, ARALIK_AYARI, LSV2_MAKINELERI_AYARI, LSV2_OKUMA_AYARI, LSV2_SEYREK_OKUMA_AYARI, lsv2UyariMetni, AZAMI_SAMPLE_SAYFASI, baslikOku, cihazSayisiOku, diziyiDurumaCevir, dolulukSeviyesi, dolulukYuzdesi, durumaIsle, durumdanDiziye, eskiMi,
  etkinAralikMs, farklar, GECMIS_SAKLAMA_MS, gecmisiBosalt, gecmisiSuz, OKUMA_AYARI, ORNEK_SAKLAMA_GUNU, ozetle, sayaciArttir, sayaciOzetle, SAMPLE_SAYISI,
  SATIR_SINIRI_AYARI, sonrakiSira, tamponAsildiMi, tanimlariOku, TEMIZLIK_ARALIGI_MS, TEMIZLIK_PARCASI, TEMIZLIK_TUR_BUTCESI_MS, TEMIZLIK_TUR_PARCASI,
  varliklariOku, VARLIK_ARALIGI_MS, VARSAYILAN_ARALIK_SN, VARSAYILAN_SATIR_SINIRI, yeniSatirSayaci,
} from './kurallar.ts';
import type { GecmisKaydi, GecmisKategorisi, GecmisOgeDurumu, SatirSayaci, SuzulecekOge, TezgahOgeleriHaritasi, TezgahOgesi, TezgahOkumasi } from './kurallar.ts';
import * as s from './sorgular.ts';

// Süreç belleği: /probe süreç başına ve servis yeniden başlayınca okunur; son sıra, son durum ve tur zamanlaması burada durur.
// Sunucu yeniden başlayınca sıfırlanır (ilk tur /current ile başlar).
export type VarlikDurumu = 'bekleniyor' | 'okundu' | 'yok' | 'hata';

export interface TurBellegi {
  probeTamam: boolean;
  sonDeneme: Date | null;
  sonHata: string | null;
  calisiyor: boolean;
  // Zamanlama: son kontrol anı (ms), ayardaki aralık (ms), art arda hata sayısı.
  sonKontrol: number | null;
  aralikMs: number;
  ardisikHata: number;
  instanceId: string | null;
  // Bir sonraki /sample'ın isteyeceği sıra; null ise önce /current okunur.
  sonrakiSira: number | null;
  durum: Map<string, TezgahOgeleriHaritasi>;
  sonVarlikOkuma: number | null;
  varlikDurumu: VarlikDurumu;
  sonTemizlik: number | null;
  // Geçmiş süzgeci (kart 3680): öğe başına son saklanan değer; sunucu yeniden açılınca boştur, her öğenin ilk değeri saklanır.
  suzgec: ReadonlyMap<string, GecmisOgeDurumu>;
  // Cihaz başına probe kategorileri; probe yenilenince silinir.
  kategoriler: Map<string, Map<string, GecmisKategorisi>>;
  sayac: SatirSayaci;
  // Geçmiş tablosunun satır sayısı: saatlik temizlikte tam sayılır, aradaki yazma ve silmelerle güncellenir; null ise henüz sayılmadı.
  satirSayisi: number | null;
  temizlik: { surer: boolean; asama: 'yas' | 'sinir'; sonZaman: string | null };
}

export const yeniTurBellegi = (): TurBellegi => ({
  probeTamam: false, sonDeneme: null, sonHata: null, calisiyor: false, sonKontrol: null, aralikMs: VARSAYILAN_ARALIK_SN * 1000, ardisikHata: 0,
  instanceId: null, sonrakiSira: null, durum: new Map(), sonVarlikOkuma: null, varlikDurumu: 'bekleniyor', sonTemizlik: null,
  suzgec: new Map(), kategoriler: new Map(), sayac: yeniSatirSayaci(), satirSayisi: null, temizlik: { surer: false, asama: 'yas', sonZaman: null },
});

export type TurSonucu =
  | { tur: 'kapali' } | { tur: 'adres-yok' } | { tur: 'suruyor' } | { tur: 'erken' }
  | { tur: 'hata'; ileti: string } | { tur: 'okundu'; tezgah: number };

export const BEKLEME_NEDENLERI = {
  kapali: 'Tezgâh bağlantısı okuması kapalı.',
  'adres-yok': 'TMIV2_TEZGAH_MTCONNECT_ADRESI tanımlı değil.',
} as const;

export interface TurOrtami {
  istemci: TezgahIstemcisi | null;
  saat: () => Date;
  bellek: TurBellegi;
  // Heidenhain (LSV2) makinelerinin adları, küçük harfle: aynı adlı MTConnect cihazı yok sayılır, son okuma anları bu turda yenilenmez.
  lsv2Adlari?: ReadonlySet<string>;
}

const gecmisKaydi = (cihazAdi: string, o: TezgahOgesi, okundu: Date): GecmisKaydi | null => {
  if (o.kimlik === null || o.sira === null) return null;
  const z = o.zaman === null ? Number.NaN : Date.parse(o.zaman);
  const kosul = o.kosul;
  return { cihazAdi, kimlik: o.kimlik, sira: o.sira, zaman: Number.isNaN(z) ? okundu : new Date(z), deger: o.deger, kosul };
};

// Zamanlanmış iş her saniye bu işlevi çağırır; okuma ancak etkin aralık dolunca yapılır. Aralık art arda hatada uzar.
export async function zamanlanmisTur(vt: Pick<Veritabani, 'tx'>, o: TurOrtami): Promise<TurSonucu> {
  const b = o.bellek;
  const simdi = o.saat().getTime();
  if (b.sonKontrol !== null && simdi - b.sonKontrol < etkinAralikMs(b.aralikMs, b.ardisikHata)) return { tur: 'erken' };
  return okumaTuru(vt, o);
}

// Tezgâh servisine istek hiçbir transaction açıkken beklenmez. Anahtar kapalıysa ya da adres yoksa istek atılmaz. Önceki tur
// sürüyorsa yenisi başlamaz: servis başka sistemleri de besleyebilir, üst üste istek binmez.
export async function okumaTuru(vt: Pick<Veritabani, 'tx'>, o: TurOrtami): Promise<TurSonucu> {
  const b = o.bellek;
  const kontrol = o.saat();
  if (b.calisiyor) return { tur: 'suruyor' };
  b.sonKontrol = kontrol.getTime();
  b.calisiyor = true;
  try {
    const ayarlar = await vt.tx(async (db) => ({ acik: await sistemAyariOku(db, OKUMA_AYARI), aralik: await sistemAyariOku(db, ARALIK_AYARI) }));
    b.aralikMs = (ayarlar.aralik ?? VARSAYILAN_ARALIK_SN) * 1000;
    if (!ayarlar.acik) return { tur: 'kapali' };
    const istemci = o.istemci;
    if (istemci === null) return { tur: 'adres-yok' };
    b.sonDeneme = kontrol;
    const hata = (ileti: string): TurSonucu => {
      b.sonHata = ileti;
      b.ardisikHata += 1;
      return { tur: 'hata', ileti };
    };
    const sonuc = await oku(vt, istemci, o, hata);
    if (sonuc.tur === 'okundu') {
      b.sonHata = null;
      b.ardisikHata = 0;
      await varliklariTazele(vt, istemci, o);
    }
    return sonuc;
  } finally {
    b.calisiyor = false;
  }
}

async function oku(vt: Pick<Veritabani, 'tx'>, istemci: TezgahIstemcisi, o: TurOrtami, hata: (ileti: string) => TurSonucu): Promise<TurSonucu> {
  const b = o.bellek;
  // Servis yeniden başlarsa tur bir kez baştan kurulur: /probe, sonra /current.
  for (let deneme = 0; deneme < 2; deneme += 1) {
    if (!b.probeTamam) {
      const p = await istemci.oku('/probe');
      if (p.tur !== 'basarili') return hata(p.ileti);
      const tanimlar = tanimlariOku(p.kok);
      if (tanimlar === null || cihazSayisiOku(p.kok) === null) return hata('Tezgâh servisi MTConnect cihaz listesi döndürmedi.');
      await vt.tx((db) => s.tanimlariYaz(db, tanimlar));
      b.kategoriler.clear();
      b.instanceId = baslikOku(p.kok).instanceId;
      b.probeTamam = true;
    }
    let yenidenBasladi = false;
    for (let sayfa = 0; sayfa < AZAMI_SAMPLE_SAYFASI; sayfa += 1) {
      const istenen = b.sonrakiSira;
      const c = istenen === null ? await istemci.oku('/current') : await istemci.oku('/sample', { from: istenen, count: SAMPLE_SAYISI });
      if (c.tur === 'aralik-disi') {
        const zaman = o.saat();
        await vt.tx((db) => s.boslukYaz(db, zaman, 'tampon-asildi', istenen, null));
        b.sonrakiSira = null;
        continue;
      }
      if (c.tur !== 'basarili') return hata(c.ileti);
      const okumalar = akislariOku(c.kok);
      if (okumalar === null) return hata('Tezgâh servisi MTConnect anlık değer cevabı döndürmedi.');
      const lsv2 = o.lsv2Adlari;
      const kendi = lsv2 === undefined ? okumalar : okumalar.filter((m) => !lsv2.has(m.cihazAdi.toLowerCase()));
      const baslik = baslikOku(c.kok);
      const zaman = o.saat();
      if (baslik.instanceId !== null && b.instanceId !== null && baslik.instanceId !== b.instanceId) {
        await vt.tx((db) => s.boslukYaz(db, zaman, 'servis-yeniden-basladi', istenen, baslik.firstSequence));
        b.probeTamam = false;
        b.sonrakiSira = null;
        b.instanceId = baslik.instanceId;
        yenidenBasladi = true;
        break;
      }
      if (istenen !== null && tamponAsildiMi(istenen, baslik)) {
        await vt.tx((db) => s.boslukYaz(db, zaman, 'tampon-asildi', istenen, baslik.firstSequence));
        b.sonrakiSira = null;
        continue;
      }
      const taban = istenen === null;
      const isleme = await vt.tx((db) => isle(db, b, kendi, taban, zaman));
      // Bellek yalnız işlem kesinleşince değişir: geri alınan turda süzgeç eski haliyle kalır, aynı değerler yeniden süzülür.
      b.suzgec = isleme.suzgec;
      b.sayac = sayaciArttir(b.sayac, zaman.getTime(), isleme.yazilan, isleme.atlanan);
      if (b.satirSayisi !== null) b.satirSayisi += isleme.eklenen;
      const tum = okumalar.flatMap((m) => m.ogeler);
      const sonraki = sonrakiSira(baslik, tum, istenen ?? 0);
      b.instanceId ??= baslik.instanceId;
      b.sonrakiSira = Math.max(sonraki, istenen ?? 0);
      // Geride kalınmışsa ve sayfa doluysa aynı turda devam edilir.
      if (taban || baslik.lastSequence === null || b.sonrakiSira > baslik.lastSequence) break;
    }
    if (yenidenBasladi) continue;
    if (b.sonrakiSira === null) return hata('Tezgâh servisinden anlık değer alınamadı.');
    const simdi = o.saat();
    await vt.tx((db) => s.okunduYenile(db, simdi, [...(o.lsv2Adlari ?? [])]));
    await temizlikTuru(vt, b, simdi);
    return { tur: 'okundu', tezgah: b.durum.size };
  }
  return hata('Tezgâh servisi tur sırasında yeniden başladı.');
}

// Cihazın son durumu ve geçmişi: /current duruma yazılan değeri yerine koyar, /sample yalnız değişen öğeleri işler. Geçmişe yalnız süzgeçten
// geçen değerler yazılır (EVENT ve CONDITION her değişimde, SAMPLE anlamlı değişimde; bkz. kurallar.ts gecmisiSuz).
async function isle(db: Db, b: TurBellegi, okumalar: readonly TezgahOkumasi[], taban: boolean, zaman: Date) {
  const adaylar: SuzulecekOge[] = [];
  const sinir = zaman.getTime() - GECMIS_SAKLAMA_MS;
  for (const okuma of okumalar) {
    for (const oge of okuma.ogeler) {
      const k = gecmisKaydi(okuma.cihazAdi, oge, zaman);
      if (k !== null && k.zaman.getTime() >= sinir) adaylar.push({ kayit: k, tur: oge.tur, kategori: await kategoriOku(db, b, okuma.cihazAdi, oge) });
    }
    // /current durumu baştan kurar; /sample yalnız değişenleri getirir, bilinmeyen cihazın son durumu veritabanından alınır.
    if (taban) b.durum.set(okuma.cihazAdi, new Map());
    else if (!b.durum.has(okuma.cihazAdi)) b.durum.set(okuma.cihazAdi, diziyiDurumaCevir((await s.ogeleriGetir(db, okuma.cihazAdi)) ?? []));
    const durum = b.durum.get(okuma.cihazAdi) ?? new Map();
    durumaIsle(durum, okuma.ogeler);
    if (okuma.ogeler.length === 0 && !taban) continue;
    const ogeler = durumdanDiziye(durum);
    const ozet = ozetle(ogeler);
    if ((await s.oncekiDurum(db, okuma.cihazAdi)) !== ozet.durum) await s.ornekYaz(db, okuma.cihazAdi, zaman, ozet.durum, ozet.sayac);
    await s.okumaYaz(db, okuma.cihazAdi, ozet, ogeler, zaman);
  }
  const suzulen = gecmisiSuz(b.suzgec, adaylar, zaman);
  const bosalan = gecmisiBosalt(suzulen.suzgec, zaman);
  const yazilacak = [...suzulen.yazilacak, ...bosalan.yazilacak];
  const eklenen = await s.gecmisYaz(db, yazilacak);
  return { suzgec: bosalan.suzgec, yazilan: yazilacak.length, atlanan: suzulen.atlanan, eklenen };
}

// Koşul her zaman CONDITION; öteki öğelerin kategorisi probe tanımındandır. Tanımı olmayan öğe süzülmez (veri yitmesin).
async function kategoriOku(db: Db, b: TurBellegi, cihazAdi: string, o: TezgahOgesi): Promise<GecmisKategorisi | null> {
  if (o.kosul !== null) return 'CONDITION';
  let harita = b.kategoriler.get(cihazAdi);
  if (harita === undefined) {
    harita = await s.kategorileriGetir(db, cihazAdi);
    b.kategoriler.set(cihazAdi, harita);
  }
  return o.kimlik === null ? null : harita.get(o.kimlik) ?? null;
}

// Saatlik temizlik tur süresini uzatmasın diye parça parça yapılır: bir turda en çok TEMIZLIK_TUR_PARCASI parça ya da TEMIZLIK_TUR_BUTCESI_MS;
// bitmeyen iş sonraki turda sürer. Önce 24 saat kuralı, sonra satır sınırı uygulanır.
export async function temizlikTuru(vt: Pick<Veritabani, 'tx'>, b: TurBellegi, simdi: Date): Promise<void> {
  if (!b.temizlik.surer) {
    if (b.sonTemizlik !== null && simdi.getTime() - b.sonTemizlik < TEMIZLIK_ARALIGI_MS) return;
    b.sonTemizlik = simdi.getTime();
    await vt.tx(async (db) => {
      await s.bosluklariTemizle(db, new Date(simdi.getTime() - GECMIS_SAKLAMA_MS));
      await s.eskiOrnekleriSil(db, new Date(simdi.getTime() - ORNEK_SAKLAMA_GUNU * 86_400_000));
    });
    b.temizlik = { surer: true, asama: 'yas', sonZaman: null };
  }
  const basla = Date.now();
  for (let i = 0; i < TEMIZLIK_TUR_PARCASI; i += 1) {
    if (await vt.tx((db) => temizlikParcasi(db, b, simdi))) {
      b.temizlik = { surer: false, asama: 'yas', sonZaman: null };
      return;
    }
    if (Date.now() - basla >= TEMIZLIK_TUR_BUTCESI_MS) return;
  }
}

// Bir parça siler; temizlik bittiyse true.
async function temizlikParcasi(db: Db, b: TurBellegi, simdi: Date): Promise<boolean> {
  const t = b.temizlik;
  if (t.asama === 'yas') {
    const silinen = await s.eskiGecmisParcasiniSil(db, new Date(simdi.getTime() - GECMIS_SAKLAMA_MS), TEMIZLIK_PARCASI);
    if (b.satirSayisi !== null) b.satirSayisi = Math.max(0, b.satirSayisi - silinen);
    if (silinen >= TEMIZLIK_PARCASI) return false;
    b.satirSayisi = await s.gecmisSatirSay(db);
    b.temizlik = { ...t, asama: 'sinir' };
    return false;
  }
  const sinir = (await sistemAyariOku(db, SATIR_SINIRI_AYARI)) ?? VARSAYILAN_SATIR_SINIRI;
  const sayi = b.satirSayisi ?? await s.gecmisSatirSay(db);
  const fazla = sayi - sinir;
  const r = fazla > 0 ? await s.enEskiGecmisParcasiniSil(db, Math.min(TEMIZLIK_PARCASI, fazla)) : { silinen: 0, sonZaman: null };
  b.satirSayisi = sayi - r.silinen;
  const sonZaman = r.sonZaman ?? t.sonZaman;
  b.temizlik = { ...t, sonZaman };
  if (fazla > r.silinen && r.silinen > 0) return false;
  // Silinen en eski kayıtların en yenisinin anı: oynatma o ana kadar veri yok der.
  if (sonZaman !== null) await s.boslukYaz(db, new Date(sonZaman), 'satir-siniri', null, null);
  return true;
}

// Takım varlıkları dakikada bir okunur; hata turu bozmaz (servis /assets vermeyebilir).
async function varliklariTazele(vt: Pick<Veritabani, 'tx'>, istemci: TezgahIstemcisi, o: TurOrtami): Promise<void> {
  const b = o.bellek;
  const simdi = o.saat();
  if (b.sonVarlikOkuma !== null && simdi.getTime() - b.sonVarlikOkuma < VARLIK_ARALIGI_MS) return;
  b.sonVarlikOkuma = simdi.getTime();
  const c = await istemci.oku('/assets');
  if (c.tur === 'yok') { b.varlikDurumu = 'yok'; return; }
  if (c.tur !== 'basarili') { b.varlikDurumu = 'hata'; return; }
  const liste = varliklariOku(c.kok);
  if (liste === null) { b.varlikDurumu = 'hata'; return; }
  await vt.tx((db) => s.varliklariYaz(db, liste, simdi));
  b.varlikDurumu = 'okundu';
}

async function aralikSaniye(db: Db): Promise<number> {
  return (await sistemAyariOku(db, ARALIK_AYARI)) ?? VARSAYILAN_ARALIK_SN;
}

// Heidenhain okumasının durumu: makine listesi (ayardan) ve okuma turunun belleği.
export interface Lsv2Durumu {
  // Yalnız test: verilmezse liste Sistem Ayarları'ndan okunur.
  makineler?: readonly { cihazAdi: string }[];
  bellek: Lsv2Bellegi;
}

export async function lsv2ListesiOku(db: Db): Promise<Lsv2Makinesi[]> {
  return lsv2ListesiniCoz((await sistemAyariOku(db, LSV2_MAKINELERI_AYARI)) ?? '');
}

export async function durum(db: Db, istemci: TezgahIstemcisi | null, bellek: TurBellegi, simdi: Date, lsv2?: Lsv2Durumu): Promise<TezgahBaglantisiDurumCevabi> {
  const acik = await sistemAyariOku(db, OKUMA_AYARI);
  const lsv2Acik = await sistemAyariOku(db, LSV2_OKUMA_AYARI);
  const lsv2Adlari = new Map((lsv2?.makineler ?? await lsv2ListesiOku(db)).map((m) => [m.cihazAdi.toLowerCase(), m.cihazAdi]));
  const aralik = await aralikSaniye(db);
  const satirlar = await s.okumalar(db);
  const smartes = await smartesMakineDegerleri(db);
  const sonOkuma = await s.sonOkuma(db);
  // Cihaz adı SmartES makine koduyla aynıysa (harf büyüklüğüne bakılmaz) eşleşir; deneme: elle eşleme yoktur.
  const koddan = new Map(smartes.map((m) => [m.makineKodu.toLowerCase(), m]));
  return {
    baglanti: !acik ? 'kapali' : istemci === null ? 'adres-yok' : 'acik',
    lsv2Baglanti: !lsv2Acik ? 'kapali' : lsv2Adlari.size === 0 ? 'adres-yok' : 'acik',
    aralikSaniye: aralik,
    varlikDurumu: await varlikDurumu(db, bellek),
    sonDeneme: bellek.sonDeneme?.toISOString() ?? null,
    sonOkuma,
    sonHata: bellek.sonHata,
    doluluk: await doluluk(db, bellek, simdi),
    tezgahlar: satirlar.map((t) => {
      const m = koddan.get(t.cihazAdi.toLowerCase()) ?? null;
      const ad = lsv2Adlari.get(t.cihazAdi.toLowerCase());
      const mb = ad === undefined ? undefined : lsv2?.bellek.makineler.get(ad);
      return {
        ...t,
        kaynak: ad === undefined ? 'mtconnect' as const : 'lsv2' as const,
        // Uyarı yalnız okuma açıkken anlamlıdır; kapalıyken eski uyarı gösterilmez.
        uyari: mb === undefined || !lsv2Acik ? null : lsv2UyariMetni(mb.uyarilar) ?? mb.sonHata,
        eski: eskiMi(t.okundu, simdi, aralik),
        smartes: m === null ? null : { durum: m.durum, program: m.program, sayac: m.sayac, isMiliHizi: m.isMiliHizi, isMiliYuku: m.isMiliYuku, okundu: m.okundu },
        farklar: m === null ? [] : farklar(t, m),
      };
    }),
  };
}

async function doluluk(db: Db, bellek: TurBellegi, simdi: Date): Promise<TezgahDoluluguCevabi> {
  const sinir = (await sistemAyariOku(db, SATIR_SINIRI_AYARI)) ?? VARSAYILAN_SATIR_SINIRI;
  bellek.satirSayisi ??= await s.gecmisSatirSay(db);
  const boyut = await s.gecmisBoyutu(db);
  const yuzde = dolulukYuzdesi(bellek.satirSayisi, sinir);
  return {
    satirSayisi: bellek.satirSayisi, satirSiniri: sinir, yuzde, seviye: dolulukSeviyesi(yuzde),
    diskBayt: boyut.diskBayt === null ? null : Math.round(boyut.diskBayt), enEskiKayit: boyut.enEski, olcum: sayaciOzetle(bellek.sayac, simdi.getTime()),
  };
}

// Süreç yeniden başlayınca bellek boştur: veritabanında takım varsa "okundu" sayılır.
async function varlikDurumu(db: Db, bellek: TurBellegi): Promise<VarlikDurumu> {
  if (bellek.varlikDurumu !== 'bekleniyor') return bellek.varlikDurumu;
  return (await s.sonVarlikOkuma(db)) === null ? 'bekleniyor' : 'okundu';
}

const EGRI_PENCERESI_MS = 3_600_000;
const BOSLUK_PENCERESI_MS = GECMIS_SAKLAMA_MS;
const HALLER = new Set(['Normal', 'Warning', 'Fault', 'Unavailable']);

const tezgahTuruOku = async (db: Db, cihazAdi: string): Promise<TezgahTuru | null> => {
  const tur = await s.turGetir(db, cihazAdi);
  return TEZGAH_TURLERI.find((x) => x === tur) ?? null;
};

// Tür yalnız ekranın çizimini seçer; okunan değerlere ve başka hiçbir tabloya dokunmaz. Okunmamış tezgâha tür atanmaz.
export async function turAta(db: Db, cihazAdi: string, tur: TezgahTuru | null): Promise<{ tezgahTuru: TezgahTuru | null }> {
  if (await s.okumaGetir(db, cihazAdi) === null) throw bulunamadi('Tezgâh bulunamadı.');
  await s.turYaz(db, cihazAdi, tur);
  return { tezgahTuru: tur };
}

export async function ayrinti(db: Db, cihazAdi: string, simdi: Date, bellek: TurBellegi = yeniTurBellegi()): Promise<TezgahAyrintisiCevabi> {
  const t = await s.okumaGetir(db, cihazAdi);
  if (t === null) throw bulunamadi('Tezgâh bulunamadı.');
  const aralik = await aralikSaniye(db);
  const baslangic = new Date(simdi.getTime() - EGRI_PENCERESI_MS);
  const tanimlar = new Map((await s.tanimlariGetir(db, cihazAdi)).map((a) => [a.kimlik, a]));
  const egri = new Map<string, { zaman: string; deger: number }[]>();
  for (const e of await s.egriler(db, cihazAdi, baslangic)) egri.set(e.kimlik, [...(egri.get(e.kimlik) ?? []), { zaman: e.zaman, deger: e.deger }]);
  const kosullar = (await s.kosullar(db, cihazAdi, new Date(simdi.getTime() - BOSLUK_PENCERESI_MS)))
    .filter((k) => HALLER.has(k.hal))
    .map((k) => ({ ...k, hal: k.hal as 'Normal' | 'Warning' | 'Fault' | 'Unavailable', tur: tanimlar.get(k.kimlik)?.tur ?? null }));
  return {
    cihazAdi: t.cihazAdi, durum: t.durum, okundu: t.okundu, eski: eskiMi(t.okundu, simdi, aralik), aralikSaniye: aralik, tezgahTuru: await tezgahTuruOku(db, cihazAdi),
    ogeler: t.ogeler.map((o) => ({ tur: o.kosul === null ? o.tur : `${o.tur} (${o.kosul})`, ad: o.ad, bilesen: o.bilesen, deger: o.deger, zaman: o.zaman })),
    alanlar: t.ogeler.filter((o) => o.kosul === null).map((o) => {
      const d = o.kimlik === null ? undefined : tanimlar.get(o.kimlik);
      return {
        kimlik: o.kimlik, tur: o.tur, ad: o.ad, bilesen: d?.bilesen ?? o.bilesen, bilesenAdi: d?.bilesenAdi ?? null, birim: d?.birim ?? null,
        kategori: d?.kategori ?? null, deger: o.deger, sonDegisme: o.zaman, egri: o.kimlik === null ? [] : egri.get(o.kimlik) ?? [],
      };
    }),
    kosullar,
    varlikDurumu: await varlikDurumu(db, bellek),
    varliklar: await s.varliklar(db),
    bosluklar: await s.bosluklar(db, new Date(simdi.getTime() - BOSLUK_PENCERESI_MS)),
    egriBasi: baslangic.toISOString(), egriSonu: simdi.toISOString(),
  };
}

// Takım tablosu son durumu; okunmamış tezgâh için boş liste ve okundu null (sıfır uydurulmaz).
export async function takimTablosu(db: Db, cihazAdi: string): Promise<TezgahTakimTablosuCevabi> {
  if (await s.okumaGetir(db, cihazAdi) === null) throw bulunamadi('Tezgâh bulunamadı.');
  const seyrek = await s.lsv2SeyrekGetir(db, cihazAdi);
  return {
    cihazAdi, seyrekAcik: (await sistemAyariOku(db, LSV2_SEYREK_OKUMA_AYARI)) === true, okundu: seyrek?.okundu ?? null, tani: seyrek?.takimTani ?? null,
    gecmisSayisi: await s.lsv2TakimGecmisiSay(db, cihazAdi), takimlar: await s.lsv2TakimlariGetir(db, cihazAdi),
    programTani: seyrek?.programTani ?? null, programlar: await s.lsv2ProgramlariGetir(db, cihazAdi),
  };
}
