import { isBekliyor, isTanimi } from '#cekirdek/zamanlayici.ts';
import { ortamIstemcisi } from './baglanti.ts';
import { HESAP_ISI_ARALIGI_MS, IS_ARALIKLARI_MS, KALITE_AMBAR_KAYNAKLARI, LISTE_ISI_ARALIGI_MS, MAKINE_OKUMA_ARALIGI_MS } from './kurallar.ts';
import type { KaliteAmbarKaynagi, OkumaKaynagi } from './kurallar.ts';
import {
  BEKLEME_NEDENLERI, ilerlemeTuru, makineTuru, yeniMakineBellegi, gonderimTuru, kaliteAmbarTuru, listeTuru, okumaTuru, tanimTuru, yeniBekleyenBellegi,
  yeniOkumaBellegi, yeniSurecBellegi,
} from './servis.ts';
import { hesapTuru } from './servis.ts';
import type { TurOrtami } from './servis.ts';

// İşler her zaman koşar; istek ancak "SmartES bağlantısı" ayarı açık ve TMIV2_SMARTES_ADRESI varken çıkar (karar 3b: okuma ve yazma birlikte).
// Kalite/ambar okuması ve tanım gönderimi ayrıca kendi anahtarlarıyla (varsayılan kapalı) açılır.
const ortam: TurOrtami = {
  istemci: ortamIstemcisi, saat: () => new Date(), operasyonlar: yeniSurecBellegi(), okumalar: yeniOkumaBellegi(), bekleyenler: yeniBekleyenBellegi(), niyetler: new Set<string>(),
};

const makineBellegi = yeniMakineBellegi();

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
  // Canlı makine panosu: kendi anahtarıyla (varsayılan kapalı) dakikada bir; iş emri ilerlemesi aynı anahtarla, beş dakikada bir okunur.
  isTanimi({ ad: 'smartes-makine-okumasi', aralikMs: MAKINE_OKUMA_ARALIGI_MS, txDisi: async (vt) => bekliyorMu(await makineTuru(vt, ortam, makineBellegi)) }),
  isTanimi({ ad: 'smartes-ilerleme-okumasi', aralikMs: MAKINE_OKUMA_ARALIGI_MS, txDisi: async (vt) => bekliyorMu(await ilerlemeTuru(vt, ortam)) }),
  // SmartES'in tanım listeleri (eşleme ekranı bunlardan seçtirir): iş sık bakar, liste günde bir kez okunur.
  isTanimi({ ad: 'smartes-liste-okumasi', aralikMs: LISTE_ISI_ARALIGI_MS, txDisi: async (vt) => bekliyorMu(await listeTuru(vt, ortam)) }),
  // SmartES'in kendi hesapları (OEE raporu, çevrim süresi): iş sık bakar, hesap saatte bir okunur.
  isTanimi({ ad: 'smartes-hesap-okumasi', aralikMs: HESAP_ISI_ARALIGI_MS, txDisi: async (vt) => bekliyorMu(await hesapTuru(vt, ortam)) }),
  isTanimi({ ad: 'smartes-tanim-gonderimi', aralikMs: IS_ARALIKLARI_MS.tanim, txDisi: async (vt) => bekliyorMu(await tanimTuru(vt, ortam)) }),
];
