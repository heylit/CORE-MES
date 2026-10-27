import type { SatinAlmaUclari, Talebim } from '#paylasilan/sozlesme/satin-alma.ts';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import type { MALZEMELER_IKINCI_MENU } from '#paylasilan/sayfalar/malzemeler.ts';
import type { RozetTonu } from '../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { ucCagrisi } from '../../../ortak/veri/uc-cagrisi.ts';

export const cagri = ucCagrisi<SatinAlmaUclari>();
export const SURE = { zamanAsimiMs: 15_000 };
export const anahtarlar = {
  taleplerim: (sinir: number) => ['satin-alma', 'taleplerim', sinir] as const,
  taleplerimHepsi: ['satin-alma', 'taleplerim'] as const,
  onTalepler: ['satin-alma', 'on-talepler'] as const,
  ozet: ['satin-alma', 'ozet'] as const,
  acikEmirler: ['satin-alma', 'acik-emirler'] as const,
  disOperasyonlar: ['satin-alma', 'dis-operasyonlar'] as const,
  stokYokIstekleri: ['satin-alma', 'stok-yok-istekleri'] as const,
  fasonSureleri: (sonGun: number) => ['satin-alma', 'fason-sureleri', sonGun] as const,
  kartlar: (tur: string, ara: string) => ['satin-alma', 'malzeme-secenekleri', tur, ara] as const,
};

// Malzeme kartı yalnız Malzemeler ve Hizmetler'de oluşturulur; bağlantı oranın yeni kart formuna gider. Ad ve yol tanımdan okunur (yeniden adlanınca izler).
const kartSayfasi = SAYFALAR.find((s) => s.islem === 'sayfa.malzemeler');
type Madde = (typeof MALZEMELER_IKINCI_MENU)['gruplar'][number]['maddeler'][number];
const YENI_KART_YOLU: Extract<Madde, { anahtar: 'new' }>['yol'] = '/malzemeler/yeni';
export const KART_SAYFASI = { yol: YENI_KART_YOLU, baslik: kartSayfasi?.baslik ?? 'Malzemeler ve Hizmetler' };

// Talep edenin gördüğü sade durum: satın almanın iç aşamaları (teklif, değerlendirme) ayrılmaz.
export const DURUM: Record<Talebim['durum'], { metin: string; ton: RozetTonu }> = {
  taslak: { metin: 'Satın almada', ton: 'bilgi' },
  teklif_isteniyor: { metin: 'Teklif toplanıyor', ton: 'bilgi' },
  degerlendirme: { metin: 'Teklif toplanıyor', ton: 'bilgi' },
  onayda: { metin: 'Onayda', ton: 'uyari' },
  siparis_verildi: { metin: 'Sipariş verildi', ton: 'tamam' },
  teslim_alindi: { metin: 'Teslim alındı', ton: 'tamam' },
  iptal: { metin: 'İptal', ton: 'pasif' },
};

// 898 a: talebin nereden geldiği. Ön talepten açılan fason adım talebi "Fason adım"; sistemin bilmediği ihtiyaç "Elle".
export const KAYNAK: Record<Talebim['kaynak'], { metin: string; simge: SimgeAdi }> = {
  elle: { metin: 'Elle', simge: 'edit' },
  fason: { metin: 'Fason adım', simge: 'wrench' },
};
// Talep edenin gördüğü beş adım; iptal adımsızdır. Teslim alındı bütün adımları bitirir.
export const ADIMLAR = ['Satın almada', 'Teklif', 'Onay', 'Sipariş', 'Teslim'] as const;
export const ADIM_SIRASI: Record<Talebim['durum'], number | null> = {
  taslak: 0, teklif_isteniyor: 1, degerlendirme: 1, onayda: 2, siparis_verildi: 3, teslim_alindi: 5, iptal: null,
};
export const gunYaz = (t: string | null) => (t === null ? null : new Date(`${t.slice(0, 10)}T00:00:00`).toLocaleDateString('tr-TR'));
