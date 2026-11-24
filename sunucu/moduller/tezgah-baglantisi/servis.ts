import type { Db, Veritabani } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { TezgahAyrintisiCevabi, TezgahBaglantisiDurumCevabi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { smartesMakineDegerleri } from '../smartes/disari.ts';
import type { TezgahIstemcisi } from './istemci.ts';
import {
  akislariOku, ARALIK_AYARI, AZAMI_SAMPLE_SAYFASI, baslikOku, cihazSayisiOku, diziyiDurumaCevir, durumaIsle, durumdanDiziye, eskiMi, etkinAralikMs, farklar,
  GECMIS_SAKLAMA_MS, OKUMA_AYARI, ORNEK_SAKLAMA_GUNU, ozetle, SAMPLE_SAYISI, sonrakiSira, tamponAsildiMi, tanimlariOku, TEMIZLIK_ARALIGI_MS,
  varliklariOku, VARLIK_ARALIGI_MS, VARSAYILAN_ARALIK_SN,
} from './kurallar.ts';
import type { TezgahOgeleriHaritasi, TezgahOgesi, TezgahOkumasi } from './kurallar.ts';
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
}

export const yeniTurBellegi = (): TurBellegi => ({
  probeTamam: false, sonDeneme: null, sonHata: null, calisiyor: false, sonKontrol: null, aralikMs: VARSAYILAN_ARALIK_SN * 1000, ardisikHata: 0,
  instanceId: null, sonrakiSira: null, durum: new Map(), sonVarlikOkuma: null, varlikDurumu: 'bekleniyor', sonTemizlik: null,
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
}

const gecmisKaydi = (cihazAdi: string, o: TezgahOgesi, okundu: Date): s.GecmisKaydi | null => {
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
      await vt.tx((db) => isle(db, b, okumalar, taban, zaman));
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
    await vt.tx(async (db) => {
      await s.okunduYenile(db, simdi);
      if (b.sonTemizlik === null || simdi.getTime() - b.sonTemizlik >= TEMIZLIK_ARALIGI_MS) {
        await s.gecmisiTemizle(db, new Date(simdi.getTime() - GECMIS_SAKLAMA_MS));
        await s.eskiOrnekleriSil(db, new Date(simdi.getTime() - ORNEK_SAKLAMA_GUNU * 86_400_000));
        b.sonTemizlik = simdi.getTime();
      }
    });
    return { tur: 'okundu', tezgah: b.durum.size };
  }
  return hata('Tezgâh servisi tur sırasında yeniden başladı.');
}

// Cihazın son durumu ve geçmişi: /current duruma yazılan değeri yerine koyar, /sample yalnız değişen öğeleri işler.
async function isle(db: Db, b: TurBellegi, okumalar: readonly TezgahOkumasi[], taban: boolean, zaman: Date): Promise<void> {
  const gecmis: s.GecmisKaydi[] = [];
  const sinir = zaman.getTime() - GECMIS_SAKLAMA_MS;
  for (const okuma of okumalar) {
    for (const oge of okuma.ogeler) {
      const k = gecmisKaydi(okuma.cihazAdi, oge, zaman);
      if (k !== null && k.zaman.getTime() >= sinir) gecmis.push(k);
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
  await s.gecmisYaz(db, gecmis);
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

export async function durum(db: Db, istemci: TezgahIstemcisi | null, bellek: TurBellegi, simdi: Date): Promise<TezgahBaglantisiDurumCevabi> {
  const acik = await sistemAyariOku(db, OKUMA_AYARI);
  const aralik = await aralikSaniye(db);
  const satirlar = await s.okumalar(db);
  const smartes = await smartesMakineDegerleri(db);
  const sonOkuma = await s.sonOkuma(db);
  // Cihaz adı SmartES makine koduyla aynıysa (harf büyüklüğüne bakılmaz) eşleşir; deneme: elle eşleme yoktur.
  const koddan = new Map(smartes.map((m) => [m.makineKodu.toLowerCase(), m]));
  return {
    baglanti: !acik ? 'kapali' : istemci === null ? 'adres-yok' : 'acik',
    aralikSaniye: aralik,
    varlikDurumu: await varlikDurumu(db, bellek),
    sonDeneme: bellek.sonDeneme?.toISOString() ?? null,
    sonOkuma,
    sonHata: bellek.sonHata,
    tezgahlar: satirlar.map((t) => {
      const m = koddan.get(t.cihazAdi.toLowerCase()) ?? null;
      return {
        ...t,
        eski: eskiMi(t.okundu, simdi, aralik),
        smartes: m === null ? null : { durum: m.durum, program: m.program, sayac: m.sayac, isMiliHizi: m.isMiliHizi, isMiliYuku: m.isMiliYuku, okundu: m.okundu },
        farklar: m === null ? [] : farklar(t, m),
      };
    }),
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
    cihazAdi: t.cihazAdi, durum: t.durum, okundu: t.okundu, eski: eskiMi(t.okundu, simdi, aralik), aralikSaniye: aralik,
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
