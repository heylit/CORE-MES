import type { Db } from '#cekirdek/db.ts';
import type { IrsaliyeGonderimDurumu, IrsaliyeGonderimDurumuCevabi } from '#paylasilan/sozlesme/logo.ts';
import { acikIrsaliyeTurleri } from './irsaliye-gonderim.ts';
import { kimlikSuz } from './kimlik-suz.ts';
import type { GidenSonucu } from './kurallar.ts';
import * as s from './sorgular.ts';

// Giden kutusu satırının ekrandaki hali. Satır yoksa ekran "Logo'ya gitmedi" der (burada üretilmez: veri yoksa yok, uydurma yok).
export function gonderimDurumu(g: { logoKayitNo: string | null; niyetZamani: Date | null; sonSonuc: GidenSonucu | null }): IrsaliyeGonderimDurumu {
  if (g.logoKayitNo !== null) return 'gitti';
  if (g.sonSonuc === 'belirsiz') return 'belirsiz';
  if (g.sonSonuc === null) return g.niyetZamani !== null ? 'sirada' : 'gitmedi';
  return 'hata';
}

// acik: en az bir irsaliye türü hem ayarda açık hem ölçüm kapısı açık. Kapalıyken ekran hiçbir şey göstermez ve satır da dönmez.
export async function irsaliyeGonderimDurumlari(db: Db, belgeNolar: readonly number[]): Promise<IrsaliyeGonderimDurumuCevabi> {
  // Yalnız sevk türleri (satış, konsinye): satın alma irsaliyesi açıksa bile sevkiyat ekranı Logo durumu göstermez.
  const acik = (await acikIrsaliyeTurleri(db)).some((t) => t !== 'satin-alma-irsaliyesi');
  if (!acik || belgeNolar.length === 0) return { acik, satirlar: [] };
  const satirlar = await s.irsaliyeGidenDurumlari(db, belgeNolar);
  return {
    acik: true,
    satirlar: satirlar.map((g) => ({
      belgeTuru: g.belgeTuru, belgeNo: g.belgeNo, durum: gonderimDurumu(g), kayitNo: g.logoKayitNo,
      hata: g.logoKayitNo === null && g.sonHata !== null ? kimlikSuz(g.sonHata) : null, sonrakiDeneme: g.sonrakiDenemeMetni,
    })),
  };
}
