import type { Db, Veritabani } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { TezgahAyrintisiCevabi, TezgahBaglantisiDurumCevabi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { smartesMakineDegerleri } from '../smartes/disari.ts';
import type { TezgahIstemcisi } from './istemci.ts';
import { akislariOku, cihazSayisiOku, eskiMi, farklar, OKUMA_ARALIGI_MS, OKUMA_AYARI, ORNEK_SAKLAMA_GUNU, ozetle } from './kurallar.ts';
import * as s from './sorgular.ts';

// Süreç belleği: /probe süreç başına bir kez okunur; son turun sonucu ekranda gösterilir. Sunucu yeniden başlayınca sıfırlanır.
export interface TurBellegi {
  probeTamam: boolean;
  sonDeneme: Date | null;
  sonHata: string | null;
  calisiyor: boolean;
}

export const yeniTurBellegi = (): TurBellegi => ({ probeTamam: false, sonDeneme: null, sonHata: null, calisiyor: false });

export type TurSonucu = { tur: 'kapali' } | { tur: 'adres-yok' } | { tur: 'suruyor' } | { tur: 'hata'; ileti: string } | { tur: 'okundu'; tezgah: number };

export const BEKLEME_NEDENLERI = {
  kapali: 'Tezgah bağlantısı okuması kapalı.',
  'adres-yok': 'TMIV2_TEZGAH_MTCONNECT_ADRESI tanımlı değil.',
} as const;

export interface TurOrtami {
  istemci: TezgahIstemcisi | null;
  saat: () => Date;
  bellek: TurBellegi;
}

// Tezgah servisine istek hiçbir transaction açıkken beklenmez. Anahtar kapalıysa ya da adres yoksa istek atılmaz. Önceki tur
// sürüyorsa yenisi başlamaz: servis SmartES'in tezgahlarını da besler, üst üste istek binmez.
export async function okumaTuru(vt: Pick<Veritabani, 'tx'>, o: TurOrtami): Promise<TurSonucu> {
  if (!(await vt.tx((db) => sistemAyariOku(db, OKUMA_AYARI)))) return { tur: 'kapali' };
  const istemci = o.istemci;
  if (istemci === null) return { tur: 'adres-yok' };
  const b = o.bellek;
  if (b.calisiyor) return { tur: 'suruyor' };
  b.calisiyor = true;
  try {
    b.sonDeneme = o.saat();
    const hata = (ileti: string): TurSonucu => {
      b.sonHata = ileti;
      return { tur: 'hata', ileti };
    };
    if (!b.probeTamam) {
      const p = await istemci.oku('/probe');
      if (p.tur !== 'basarili') return hata(p.ileti);
      if (cihazSayisiOku(p.kok) === null) return hata('Tezgah servisi MTConnect cihaz listesi döndürmedi.');
      b.probeTamam = true;
    }
    const c = await istemci.oku('/current');
    if (c.tur !== 'basarili') return hata(c.ileti);
    const okumalar = akislariOku(c.kok);
    if (okumalar === null) return hata('Tezgah servisi MTConnect anlık değer cevabı döndürmedi.');
    const zaman = o.saat();
    await vt.tx(async (db) => {
      for (const okuma of okumalar) {
        const ozet = ozetle(okuma.ogeler);
        if ((await s.oncekiDurum(db, okuma.cihazAdi)) !== ozet.durum) await s.ornekYaz(db, okuma.cihazAdi, zaman, ozet.durum, ozet.sayac);
        await s.okumaYaz(db, okuma.cihazAdi, ozet, okuma.ogeler, zaman);
      }
      await s.eskiOrnekleriSil(db, new Date(zaman.getTime() - ORNEK_SAKLAMA_GUNU * 86_400_000));
    });
    b.sonHata = null;
    return { tur: 'okundu', tezgah: okumalar.length };
  } finally {
    b.calisiyor = false;
  }
}

export async function durum(db: Db, istemci: TezgahIstemcisi | null, bellek: TurBellegi, simdi: Date): Promise<TezgahBaglantisiDurumCevabi> {
  const acik = await sistemAyariOku(db, OKUMA_AYARI);
  const satirlar = await s.okumalar(db);
  const smartes = await smartesMakineDegerleri(db);
  const sonOkuma = await s.sonOkuma(db);
  // Cihaz adı SmartES makine koduyla aynıysa (harf büyüklüğüne bakılmaz) eşleşir; deneme: elle eşleme yoktur.
  const koddan = new Map(smartes.map((m) => [m.makineKodu.toLowerCase(), m]));
  return {
    baglanti: !acik ? 'kapali' : istemci === null ? 'adres-yok' : 'acik',
    aralikSaniye: OKUMA_ARALIGI_MS / 1000,
    sonDeneme: bellek.sonDeneme?.toISOString() ?? null,
    sonOkuma,
    sonHata: bellek.sonHata,
    tezgahlar: satirlar.map((t) => {
      const m = koddan.get(t.cihazAdi.toLowerCase()) ?? null;
      return {
        ...t,
        eski: eskiMi(t.okundu, simdi),
        smartes: m === null ? null : { durum: m.durum, program: m.program, sayac: m.sayac, isMiliHizi: m.isMiliHizi, isMiliYuku: m.isMiliYuku, okundu: m.okundu },
        farklar: m === null ? [] : farklar(t, m),
      };
    }),
  };
}

export async function ayrinti(db: Db, cihazAdi: string, simdi: Date): Promise<TezgahAyrintisiCevabi> {
  const t = await s.okumaGetir(db, cihazAdi);
  if (t === null) throw bulunamadi('Tezgah bulunamadı.');
  return {
    cihazAdi: t.cihazAdi, durum: t.durum, okundu: t.okundu, eski: eskiMi(t.okundu, simdi),
    ogeler: t.ogeler.map((o) => ({ tur: o.kosul === null ? o.tur : `${o.tur} (${o.kosul})`, ad: o.ad, bilesen: o.bilesen, deger: o.deger, zaman: o.zaman })),
  };
}
