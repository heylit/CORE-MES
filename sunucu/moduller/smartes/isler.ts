import { isBekliyor, isTanimi } from '#cekirdek/zamanlayici.ts';
import { ortamIstemcisi } from './baglanti.ts';
import { IS_ARALIKLARI_MS, KALITE_AMBAR_KAYNAKLARI } from './kurallar.ts';
import type { KaliteAmbarKaynagi, OkumaKaynagi } from './kurallar.ts';
import { BEKLEME_NEDENLERI, gonderimTuru, kaliteAmbarTuru, okumaTuru, tanimTuru, yeniBekleyenBellegi, yeniOkumaBellegi, yeniSurecBellegi } from './servis.ts';
import type { TurOrtami } from './servis.ts';

// İşler her zaman koşar; istek ancak "SmartES bağlantısı" ayarı açık ve TMIV2_SMARTES_ADRESI varken çıkar (karar 3b: okuma ve yazma birlikte).
// Kalite/ambar okuması ve tanım gönderimi ayrıca kendi anahtarlarıyla (varsayılan kapalı) açılır.
const ortam: TurOrtami = {
  istemci: ortamIstemcisi, saat: () => new Date(), operasyonlar: yeniSurecBellegi(), okumalar: yeniOkumaBellegi(), bekleyenler: yeniBekleyenBellegi(), niyetler: new Set<string>(),
};

const bekliyorMu = (r: { tur: string }) =>
  r.tur === 'kapali' || r.tur === 'ortam-degiskeni-yok' || r.tur === 'akis-kapali' ? isBekliyor(BEKLEME_NEDENLERI[r.tur]) : undefined;

const okumaIsi = (kaynak: OkumaKaynagi) => isTanimi({
  ad: `smartes-okuma-${kaynak}`,
  aralikMs: IS_ARALIKLARI_MS[kaynak],
  txDisi: async (vt) => bekliyorMu(await okumaTuru(vt, kaynak, ortam)),
});

// Üç kaynak ayrı işlerde, aynı anahtar ve aralıkla okunur; biri düşse ötekiler okunur.
const kaliteAmbarIsi = (kaynak: KaliteAmbarKaynagi) => isTanimi({
  ad: `smartes-okuma-${kaynak}`,
  aralikMs: IS_ARALIKLARI_MS['kalite-ambar'],
  txDisi: async (vt) => bekliyorMu(await kaliteAmbarTuru(vt, kaynak, ortam)),
});

export const isler = [
  okumaIsi('is-emri-durumu'),
  okumaIsi('durus'),
  okumaIsi('alarm'),
  isTanimi({ ad: 'smartes-is-emri-gonderimi', aralikMs: IS_ARALIKLARI_MS.gonderim, txDisi: async (vt) => bekliyorMu(await gonderimTuru(vt, ortam)) }),
  ...KALITE_AMBAR_KAYNAKLARI.map(kaliteAmbarIsi),
  isTanimi({ ad: 'smartes-tanim-gonderimi', aralikMs: IS_ARALIKLARI_MS.tanim, txDisi: async (vt) => bekliyorMu(await tanimTuru(vt, ortam)) }),
];
