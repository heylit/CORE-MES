import type { Db, Veritabani } from '#cekirdek/db.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import type { Lsv2Makinesi } from './ayar.ts';
import {
  ARALIK_AYARI, diziyiDurumaCevir, durumdanDiziye, etkinAralikMs, gecmisiBosalt, gecmisiSuz, LSV2_ALAN_TANIMLARI, LSV2_KATEGORILERI, LSV2_OKUMA_AYARI,
  lsv2Degisenler, lsv2Durumu, lsv2Ogeleri, OKUMA_AYARI, ozetle, sayaciArttir, VARSAYILAN_ARALIK_SN,
} from './kurallar.ts';
import type { GecmisOgeDurumu, Lsv2Uyarisi, SuzulecekOge, TezgahOgeleriHaritasi, TezgahOgesi } from './kurallar.ts';
import type { Lsv2Istemcisi, Lsv2Sonucu } from './lsv2.ts';
import { temizlikTuru } from './servis.ts';
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
  tanimYazildi: boolean;
}

export interface Lsv2Bellegi {
  makineler: Map<string, Lsv2MakineBellegi>;
  istemciler: Map<string, Lsv2Istemcisi>;
  aralikMs: number;
}

export const yeniLsv2Bellegi = (): Lsv2Bellegi => ({ makineler: new Map(), istemciler: new Map(), aralikMs: VARSAYILAN_ARALIK_SN * 1000 });

const yeniMakineBellegi = (): Lsv2MakineBellegi => ({
  sonKontrol: null, ardisikHata: 0, calisiyor: false, uyarilar: [], sonHata: null, durum: null, suzgec: new Map(), tanimYazildi: false,
});

export interface Lsv2TurOrtami {
  makineler: readonly Lsv2Makinesi[];
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
  'ayar-yok': 'TMIV2_TEZGAH_LSV2_MAKINELERI tanımlı değil.',
} as const;

export function lsv2Kapat(b: Lsv2Bellegi): void {
  for (const i of b.istemciler.values()) i.kapat();
  b.istemciler.clear();
}

// Zamanlanmış iş her saniye çağırır; aralığı dolan ve okunmakta olmayan makineler aynı anda okunur. Ayar kapalıysa açık bağlantılar
// kapatılır, istek atılmaz. Makineye istek hiçbir transaction açıkken beklenmez.
export async function lsv2Turu(vt: Pick<Veritabani, 'tx'>, o: Lsv2TurOrtami): Promise<Lsv2TurSonucu> {
  const b = o.bellek;
  const ayarlar = await vt.tx(async (db) => ({
    acik: await sistemAyariOku(db, LSV2_OKUMA_AYARI), aralik: await sistemAyariOku(db, ARALIK_AYARI), mt: await sistemAyariOku(db, OKUMA_AYARI),
  }));
  b.aralikMs = (ayarlar.aralik ?? VARSAYILAN_ARALIK_SN) * 1000;
  if (!ayarlar.acik) {
    lsv2Kapat(b);
    return { tur: 'kapali' };
  }
  if (o.makineler.length === 0) return { tur: 'ayar-yok' };
  const simdi = o.saat().getTime();
  const sirada = o.makineler.filter((m) => {
    const mb = makineBellegi(b, m.cihazAdi);
    return !mb.calisiyor && (mb.sonKontrol === null || simdi - mb.sonKontrol >= etkinAralikMs(b.aralikMs, mb.ardisikHata));
  });
  await Promise.all(sirada.map((m) => makineyiOku(vt, o, m)));
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

async function makineyiOku(vt: Pick<Veritabani, 'tx'>, o: Lsv2TurOrtami, m: Lsv2Makinesi): Promise<void> {
  const b = o.bellek;
  const mb = makineBellegi(b, m.cihazAdi);
  mb.calisiyor = true;
  mb.sonKontrol = o.saat().getTime();
  try {
    let istemci = b.istemciler.get(m.cihazAdi);
    if (istemci === undefined) {
      istemci = o.istemciKur(m);
      b.istemciler.set(m.cihazAdi, istemci);
    }
    const r = await istemci.oku();
    const zaman = o.saat();
    const sonuc = await vt.tx((db) => isle(db, m.cihazAdi, mb, r, zaman));
    // Bellek yalnız işlem kesinleşince değişir.
    mb.durum = sonuc.durum;
    mb.suzgec = sonuc.suzgec;
    if (r.tur === 'basarili') mb.tanimYazildi = true;
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

async function isle(db: Db, cihazAdi: string, mb: Lsv2MakineBellegi, r: Lsv2Sonucu, zaman: Date) {
  const okundu = r.tur === 'basarili';
  if (okundu && !mb.tanimYazildi) await s.tanimlariYaz(db, [{ cihazAdi, alanlar: LSV2_ALAN_TANIMLARI }]);
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
