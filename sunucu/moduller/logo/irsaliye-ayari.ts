import { gecersiz } from '#cekirdek/hata.ts';
import type { Db } from '#cekirdek/db.ts';
import { modulAyariDegistir } from '../ayarlar/disari.ts';
import { KAPI_ENGEL_ILETILERI, yazmaKapisi } from './irsaliye-yazma-kapisi.ts';
import type { IrsaliyeTuru } from './irsaliye-yazma-kapisi.ts';

// İrsaliye yazma ayarlarını açan tek yol (kart 3694): genel ayar ucu bu ayarlara yazmaz (degistirenEkran). Açmak ölçüm kapısına bağlıdır; kapatmak
// her zaman serbesttir. Sevk ayarı satış ve konsinyeyi birlikte yönetir: açmak için satış kapısı açık olmalı; konsinye kendi kapısıyla ayrıca kapalı kalır.
export type IrsaliyeAyari = 'logo.satin-alma-irsaliyesi' | 'logo.sevk-irsaliyesi';
const KAPI_TURU: Readonly<Record<IrsaliyeAyari, IrsaliyeTuru>> = Object.freeze({ 'logo.satin-alma-irsaliyesi': 'satin_alma', 'logo.sevk-irsaliyesi': 'satis' });
const KAYNAK = { modul: 'logo', yetki: 'ayarlar.yaz', yol: '/logo/irsaliye-ayari/degistir' } as const;

export async function irsaliyeAyariniDegistir(
  db: Db, kisiId: number, anahtar: IrsaliyeAyari, deger: boolean, beklenen: boolean,
): Promise<boolean> {
  if (deger) {
    const kapi = yazmaKapisi(KAPI_TURU[anahtar]);
    if (!kapi.acik) throw gecersiz(`Bu ayar açılamaz: ${kapi.engeller.map((e) => KAPI_ENGEL_ILETILERI[e]).join(' ')}`);
  }
  return modulAyariDegistir(db, kisiId, anahtar, deger, beklenen, KAYNAK);
}
