import type { Db } from '#cekirdek/db.ts';
import type { SiparisLogoOzetiCevabi } from '#paylasilan/sozlesme/logo.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { logoSiparisKalemleri } from '../satin-alma/disari.ts';
import { irsaliyeBaslangicGunu, siparisLogoOzetleri } from './kurallar.ts';
import * as s from './sorgular.ts';

// 3384 a: satın alma siparişinin Logo'daki irsaliye ve fatura özeti. Yalnız aynadan okur; Logo'ya, satın almaya, stoğa ya da finansa yazmaz.
// İrsaliye okuması kapalıyken kalem karşılaştırması yapılmaz (boş ayna "Logo'da yok" sayılmasın); fatura okuması kapalıyken yalnız irsaliyenin
// taşıdığı fatura numarası bilinir.
export async function siparisLogoOzeti(db: Db, simdi: Date, nolar: readonly string[]): Promise<SiparisLogoOzetiCevabi> {
  const baglanti = (await sistemAyariOku(db, 'logo.baglanti')) === true;
  const irsaliye = baglanti && (await sistemAyariOku(db, 'logo.irsaliye-okumasi')) === true;
  const fatura = baglanti && (await sistemAyariOku(db, 'logo.fatura-okumasi')) === true;
  const okuma = { irsaliye, fatura, sonOkuma: irsaliye ? await s.irsaliyeSonOkumasi(db) : null };
  if (!irsaliye && !fatura) return { okuma, siparisler: [] };
  const kalemler = await logoSiparisKalemleri(db, nolar);
  const var_ = [...new Set(kalemler.map((k) => k.siparisNo))];
  const satirlar = irsaliye ? await s.siparisIrsaliyeSatirlari(db, var_) : [];
  const faturalar = fatura ? await s.siparisFaturaNolari(db, var_) : null;
  const ozetler = siparisLogoOzetleri(var_, kalemler, satirlar, faturalar?.gecerli ?? null, irsaliyeBaslangicGunu(simdi), faturalar?.iptal);
  // Okuma kapalıyken o tarafın verisi gösterilmez: kalem karşılaştırması ya da fatura "bilinmiyor"dur.
  return {
    okuma,
    siparisler: ozetler.map((o) => (irsaliye ? o : {
      ...o, irsaliyeler: [], irsaliyeliKalem: 0, farkliKalem: 0,
      kalemler: o.kalemler.map((k) => ({ ...k, logoMiktari: null, logoBirimi: null, fark: null, durum: k.durum === 'logo-bagi-yok' ? k.durum : 'okunmadi' as const })),
    })),
  };
}
