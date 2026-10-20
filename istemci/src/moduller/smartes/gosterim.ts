import type { DurumCevabi, GidenCevabi } from '#paylasilan/sozlesme/smartes.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

export const YOK = '—';

const ZAMAN = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
export const zamanMetni = (iso: string | null): string => (iso === null ? YOK : ZAMAN.format(new Date(iso)));
export const sayiMetni = (n: number | null): string => (n === null ? YOK : n.toLocaleString('tr-TR'));

export const BAGLANTI: Record<DurumCevabi['baglanti'], { metin: string; ton: RozetTonu; aciklama: string }> = {
  kapali: { metin: 'Kapalı', ton: 'pasif', aciklama: 'Bağlantı Sistem Ayarları’ndaki “SmartES bağlantısı” anahtarıyla açılır.' },
  'ortam-degiskeni-yok': {
    metin: 'Adres yok', ton: 'uyari',
    aciklama: 'Anahtar açık, ama sunucuda TMIV2_SMARTES_ADRESI tanımlı değil. Kurulum belgesine bakın (kurulum/smartes.md).',
  },
  acik: { metin: 'Açık', ton: 'tamam', aciklama: 'Okuma ve iş emri gönderimi çalışır.' },
};

export const KAYNAK_ADI: Record<DurumCevabi['okumalar'][number]['kaynak'], string> = {
  'is-emri-durumu': 'Üretim sayıları', durus: 'Duruşlar', alarm: 'Alarmlar',
};

type GidenDurumu = GidenCevabi['satirlar'][number]['durum'];
export const GIDEN: Record<GidenDurumu, { metin: string; ton: RozetTonu }> = {
  gonderildi: { metin: 'Gönderildi', ton: 'tamam' },
  hata: { metin: 'Hata', ton: 'hata' },
  kapandi: { metin: 'Kapatıldı', ton: 'pasif' },
};
