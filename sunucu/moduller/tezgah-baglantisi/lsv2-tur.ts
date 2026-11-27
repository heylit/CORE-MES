import type { Db, Veritabani } from '#cekirdek/db.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import type { Lsv2Makinesi } from './ayar.ts';
import {
  ARALIK_AYARI, diziyiDurumaCevir, durumdanDiziye, etkinAralikMs, gecmisiBosalt, gecmisiSuz, LSV2_KATEGORILERI, LSV2_OKUMA_AYARI, LSV2_PLC_SAYACI_AYARI,
  LSV2_SEYREK_ARALIK_AYARI, LSV2_SEYREK_OKUMA_AYARI, lsv2AlanTanimlari, lsv2Degisenler, lsv2Durumu, lsv2GecmisteYok, lsv2Ogeleri, lsv2TanimImzasi, lsv2TaniMetni,
  OKUMA_AYARI, ozetle, sayaciArttir, seyrekAralikMs, takimDegisenleri, VARSAYILAN_ARALIK_SN,
} from './kurallar.ts';
import type { GecmisOgeDurumu, Lsv2Okumasi, Lsv2Uyarisi, SuzulecekOge, TezgahOgeleriHaritasi, TezgahOgesi } from './kurallar.ts';
import type { Lsv2Istemcisi, Lsv2OkumaSecenegi, Lsv2Sonucu } from './lsv2.ts';
import { lsv2ListesiOku, temizlikTuru } from './servis.ts';
import type { TurBellegi } from './servis.ts';
import * as s from './sorgular.ts';

// Heidenhain makinelerinin okuma turu (kart 3753). Her makine kendi aralığıyla ve kendi geri çekilmesiyle okunur: bir makinenin
// kapalı olması ötekileri bekletmez. Okunan anlık görüntü MTConnect öğelerine çevrilir; son durum, durum örneği ve değer geçmişi
// MTConnect turuyla aynı tablolara aynı kurallarla yazılır.
export interface Lsv2MakineBellegi {
  sonKontrol: number | null;
  ardisikHata: number;
  calisiyor: boolean;
  uyarilar: Lsv2Uyarisi[];
  sonHata: string | null;
  // Son durum; null ise henüz veritabanından okunmadı.
  durum: TezgahOgeleriHaritasi | null;
  suzgec: ReadonlyMap<string, GecmisOgeDurumu>;
  // Yazılmış alan tanımlarının imzası (eksen takımı dahil); değişince tanım yeniden yazılır.
  tanimImzasi: string | null;
  // Son seyrek okuma denemesi (takım tablosu); null ise bu süreçte henüz denenmedi.
  sonSeyrek: number | null;
}

export interface Lsv2Bellegi {
  makineler: Map<string, Lsv2MakineBellegi>;
  istemciler: Map<string, { istemci: Lsv2Istemcisi; tanim: string }>;
  aralikMs: number;
}

export const yeniLsv2Bellegi = (): Lsv2Bellegi => ({ makineler: new Map(), istemciler: new Map(), aralikMs: VARSAYILAN_ARALIK_SN * 1000 });

// Bağlantının dayandığı tanım: adres ya da sayaç değişince eski bağlantı kapatılır, yenisi kurulur.
const tanimAnahtari = (m: Lsv2Makinesi): string => `${m.adres};${m.sayac === null ? '' : String(m.sayac)}`;

const yeniMakineBellegi = (): Lsv2MakineBellegi => ({
  sonKontrol: null, ardisikHata: 0, calisiyor: false, uyarilar: [], sonHata: null, durum: null, suzgec: new Map(), tanimImzasi: null, sonSeyrek: null,
});

export interface Lsv2TurOrtami {
  // Yalnız test: verilmezse liste her turda Sistem Ayarları'ndan ("Heidenhain makineleri") okunur.
  makineler?: readonly Lsv2Makinesi[];
  istemciKur: (m: Lsv2Makinesi) => Lsv2Istemcisi;
  saat: () => Date;
  bellek: Lsv2Bellegi;
  // MTConnect turunun belleği: doluluk sayaçları ve saatlik temizlik ortaktır.
  ortak: TurBellegi;
  // MTConnect adresi tanımlı mı: tanımlı ve okuma açıksa temizliği MTConnect turu yapar.
  mtconnectVar: boolean;
}

export type Lsv2TurSonucu = { tur: 'kapali' } | { tur: 'ayar-yok' } | { tur: 'okundu'; makine: number };

export const LSV2_BEKLEME_NEDENLERI = {
  kapali: 'Heidenhain okuması kapalı.',
  'ayar-yok': 'Heidenhain makine listesi boş (Sistem Ayarları).',
} as const;

export function lsv2Kapat(b: Lsv2Bellegi): void {
  for (const i of b.istemciler.values()) i.istemci.kapat();
  b.istemciler.clear();
}

// Listeden çıkan ya da adresi değişen makinenin açık bağlantısı kapatılır; belleği de düşer (ekranda kalmaz).
function listeyiEsle(b: Lsv2Bellegi, makineler: readonly Lsv2Makinesi[]): void {
  const tanimlar = new Map(makineler.map((m) => [m.cihazAdi, tanimAnahtari(m)]));
  for (const [ad, i] of b.istemciler) {
    if (tanimlar.get(ad) !== i.tanim) {
      i.istemci.kapat();
      b.istemciler.delete(ad);
    }
  }
  for (const ad of b.makineler.keys()) if (!tanimlar.has(ad)) b.makineler.delete(ad);
}

// Zamanlanmış iş her saniye çağırır; aralığı dolan ve okunmakta olmayan makineler aynı anda okunur. Ayar kapalıysa açık bağlantılar
// kapatılır, istek atılmaz. Makineye istek hiçbir transaction açıkken beklenmez.
export async function lsv2Turu(vt: Pick<Veritabani, 'tx'>, o: Lsv2TurOrtami): Promise<Lsv2TurSonucu> {
  const b = o.bellek;
  const ayarlar = await vt.tx(async (db) => ({
    acik: await sistemAyariOku(db, LSV2_OKUMA_AYARI), aralik: await sistemAyariOku(db, ARALIK_AYARI), mt: await sistemAyariOku(db, OKUMA_AYARI),
    plc: await sistemAyariOku(db, LSV2_PLC_SAYACI_AYARI),
    seyrek: await sistemAyariOku(db, LSV2_SEYREK_OKUMA_AYARI), seyrekDk: await sistemAyariOku(db, LSV2_SEYREK_ARALIK_AYARI),
    liste: o.makineler ?? await lsv2ListesiOku(db),
  }));
  b.aralikMs = (ayarlar.aralik ?? VARSAYILAN_ARALIK_SN) * 1000;
  if (!ayarlar.acik) {
    lsv2Kapat(b);
    return { tur: 'kapali' };
  }
  listeyiEsle(b, ayarlar.liste);
  if (ayarlar.liste.length === 0) return { tur: 'ayar-yok' };
  const simdi = o.saat().getTime();
  const sirada = ayarlar.liste.filter((m) => {
    const mb = makineBellegi(b, m.cihazAdi);
    return !mb.calisiyor && (mb.sonKontrol === null || simdi - mb.sonKontrol >= etkinAralikMs(b.aralikMs, mb.ardisikHata));
  });
  const seyrekMs = ayarlar.seyrek === true ? seyrekAralikMs(ayarlar.seyrekDk) : null;
  await Promise.all(sirada.map((m) => {
    const mb = makineBellegi(b, m.cihazAdi);
    const takimTablosu = seyrekMs !== null && (mb.sonSeyrek === null || simdi - mb.sonSeyrek >= seyrekMs);
    return makineyiOku(vt, o, m, { plcSayaci: ayarlar.plc === true, takimTablosu });
  }));
  if (sirada.length > 0 && !(ayarlar.mt && o.mtconnectVar)) await temizlikTuru(vt, o.ortak, o.saat());
  return { tur: 'okundu', makine: sirada.length };
}

function makineBellegi(b: Lsv2Bellegi, cihazAdi: string): Lsv2MakineBellegi {
  let mb = b.makineler.get(cihazAdi);
  if (mb === undefined) {
    mb = yeniMakineBellegi();
    b.makineler.set(cihazAdi, mb);
  }
  return mb;
}

async function makineyiOku(vt: Pick<Veritabani, 'tx'>, o: Lsv2TurOrtami, m: Lsv2Makinesi, secenek: Lsv2OkumaSecenegi): Promise<void> {
  const b = o.bellek;
  const mb = makineBellegi(b, m.cihazAdi);
  mb.calisiyor = true;
  mb.sonKontrol = o.saat().getTime();
  // Seyrek okuma denemesi sonucu ne olursa olsun aralığı başlatır: tablo okunamayıp bağlantı düşse de sonraki normal turlar FILE'a
  // girmez, canlı okuma sürer.
  if (secenek.takimTablosu === true) mb.sonSeyrek = mb.sonKontrol;
  try {
    let kayit = b.istemciler.get(m.cihazAdi);
    if (kayit === undefined) {
      kayit = { istemci: o.istemciKur(m), tanim: tanimAnahtari(m) };
      b.istemciler.set(m.cihazAdi, kayit);
    }
    const istemci = kayit.istemci;
    const r = await istemci.oku(secenek);
    const zaman = o.saat();
    const sonuc = await vt.tx((db) => isle(db, m.cihazAdi, mb, r, zaman, secenek.takimTablosu === true));
    // Bellek yalnız işlem kesinleşince değişir.
    mb.durum = sonuc.durum;
    mb.suzgec = sonuc.suzgec;
    if (r.tur === 'basarili') {
      mb.tanimImzasi = lsv2TanimImzasi(r.okuma);
    }
    o.ortak.sayac = sayaciArttir(o.ortak.sayac, zaman.getTime(), sonuc.yazilan, sonuc.atlanan);
    if (o.ortak.satirSayisi !== null) o.ortak.satirSayisi += sonuc.eklenen;
    if (r.tur === 'basarili') {
      mb.ardisikHata = 0;
      mb.sonHata = null;
      mb.uyarilar = r.okuma.uyarilar;
    } else {
      mb.ardisikHata += 1;
      mb.sonHata = r.ileti;
      mb.uyarilar = r.tur === 'kapali' ? ['kapali-ya-da-mesgul'] : [];
    }
  } finally {
    mb.calisiyor = false;
  }
}

async function isle(db: Db, cihazAdi: string, mb: Lsv2MakineBellegi, r: Lsv2Sonucu, zaman: Date, seyrekIstendi: boolean) {
  const okundu = r.tur === 'basarili';
  if (okundu && mb.tanimImzasi !== lsv2TanimImzasi(r.okuma)) await s.tanimlariYaz(db, [{ cihazAdi, alanlar: lsv2AlanTanimlari(r.okuma) }]);
  if (okundu && r.okuma.takimTablosu !== undefined) await takimTablosunuIsle(db, cihazAdi, r.okuma, zaman);
  if (!okundu && seyrekIstendi) await s.lsv2SeyrekYaz(db, cihazAdi, zaman, `Takım tablosu okunamadı: ${r.ileti}`);
  const kayitli = await s.ogeleriGetir(db, cihazAdi);
  const onceki = mb.durum ?? diziyiDurumaCevir(kayitli ?? []);
  const yeni = lsv2Ogeleri(okundu ? r.okuma : null, zaman);
  const degisen = lsv2Degisenler(onceki, yeni);
  const bos = { durum: onceki, suzgec: mb.suzgec, yazilan: 0, atlanan: 0, eklenen: 0 };
  // Bağlanılamayan makinede yalnız durum değişince yazılır: son okuma anı ilerlemez, ekran "eski okuma" der.
  if (!okundu && kayitli !== null && degisen.length === 0) return bos;
  const durum = lsv2Durumu(onceki, yeni, okundu);
  const ogeler = durumdanDiziye(durum);
  const ozet = ozetle(ogeler);
  if ((await s.oncekiDurum(db, cihazAdi)) !== ozet.durum) await s.ornekYaz(db, cihazAdi, zaman, ozet.durum, ozet.sayac);
  await s.okumaYaz(db, cihazAdi, ozet, ogeler, zaman);
  // Geçmişe EVENT ve CONDITION yalnız değişince, SAMPLE her okumada süzgeçten geçerek gider.
  const adaylar: SuzulecekOge[] = [];
  const degisenKimlik = new Set(degisen.map((d) => d.kimlik));
  for (const oge of yeni) {
    if (lsv2GecmisteYok(oge.kimlik)) continue;
    const kategori = (oge.kimlik === null ? undefined : LSV2_KATEGORILERI.get(oge.kimlik)) ?? null;
    if (kategori !== 'SAMPLE' && !degisenKimlik.has(oge.kimlik)) continue;
    const k = gecmisKaydi(cihazAdi, oge);
    if (k !== null) adaylar.push({ kayit: k, tur: oge.tur, kategori });
  }
  const suzulen = gecmisiSuz(mb.suzgec, adaylar, zaman);
  const bosalan = gecmisiBosalt(suzulen.suzgec, zaman);
  const yazilacak = [...suzulen.yazilacak, ...bosalan.yazilacak];
  const eklenen = await s.gecmisYaz(db, yazilacak);
  return { durum, suzgec: bosalan.suzgec, yazilan: yazilacak.length, atlanan: suzulen.atlanan, eklenen };
}

function gecmisKaydi(cihazAdi: string, o: TezgahOgesi) {
  if (o.kimlik === null || o.sira === null || o.zaman === null) return null;
  return { cihazAdi, kimlik: o.kimlik, sira: o.sira, zaman: new Date(o.zaman), deger: o.deger, kosul: o.kosul };
}

// Seyrek okuma: takım tablosunun son durumu bütünüyle yenilenir; geçmişe yalnız ömür ya da kilidi değişen takım yazılır.
// Okunamadıysa son durum korunur, nedeni seyrek kaydına yazılır.
async function takimTablosunuIsle(db: Db, cihazAdi: string, o: Lsv2Okumasi, zaman: Date): Promise<void> {
  const tani = o.tani.find((t) => t.alan === 'takim-tablosu');
  const satirlar = o.takimTablosu ?? null;
  await s.lsv2SeyrekYaz(db, cihazAdi, zaman, satirlar !== null ? null : tani === undefined ? 'Takım tablosu çözülemedi (biçim tanınmadı)' : lsv2TaniMetni(tani));
  if (satirlar === null) return;
  const onceki = new Map((await s.lsv2TakimlariGetir(db, cihazAdi)).map((t) => [t.no, t]));
  await s.lsv2TakimGecmisiYaz(db, cihazAdi, takimDegisenleri(onceki, satirlar), zaman);
  await s.lsv2TakimlariYaz(db, cihazAdi, satirlar, zaman);
}
