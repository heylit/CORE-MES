import type { TakvimKaydi, TakvimKaynagi } from '#paylasilan/sozlesme/takvim.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { gunFarki } from './tarih.ts';

// Renk takvim.css'te kaynağa göre verilir (data-kaynak); yol kaydın kendi ekranıdır, takvim tarihi değiştirmez (1161 a).
export const KAYNAK_BILGISI: Readonly<Record<TakvimKaynagi, { ad: string; simge: SimgeAdi; modul: string; yol: (k: TakvimKaydi) => string }>> = {
  'siparis': { ad: 'Sipariş termini', simge: 'cart', modul: 'Siparişler', yol: (k) => `/siparisler/${k.kimlik}` },
  'emir-plan': { ad: 'Emir başlangıcı', simge: 'gantt', modul: 'Üretim Emirleri', yol: (k) => `/uretim-emirleri/${k.kimlik}` },
  'emir-bitis': { ad: 'Emir teslimi', simge: 'flag', modul: 'Üretim Emirleri', yol: (k) => `/uretim-emirleri/${k.kimlik}` },
  'sevk': { ad: 'Sevk', simge: 'truck', modul: 'Sevkiyat', yol: () => '/sevkiyat/tum-isler' },
  'satin-alma': { ad: 'Satın alma teslimi', simge: 'box', modul: 'Satın Alma', yol: () => '/satin-alma/talepler' },
  'kalibrasyon': { ad: 'Kalibrasyon vadesi', simge: 'ruler', modul: 'Ölçü Aletleri', yol: () => '/kalibrasyon' },
  'denetim': { ad: 'Denetim', simge: 'file', modul: 'Denetim Hazırlığı', yol: () => '/denetim-hazirlik' },
  'izin': { ad: 'İzin', simge: 'user', modul: 'İnsan Kaynakları', yol: () => '/ik/izinler' },
  'vergi': { ad: 'Vergi beyanı', simge: 'lira', modul: 'Finans', yol: () => '/finans/vergi' },
  'planli-durus': { ad: 'Planlı duruş', simge: 'pause', modul: 'Vardiya', yol: () => '/vardiya/planli-duruslar' },
};

export const gecikti = (k: TakvimKaydi, bugun: string): boolean => !k.bitti && k.tarih < bugun;

export function kalanMetni(k: TakvimKaydi, bugun: string): { metin: string; ton: RozetTonu } {
  if (k.bitti) return { metin: k.durum, ton: 'tamam' };
  const g = gunFarki(bugun, k.tarih);
  if (g < 0) return { metin: `${-g} gün geçti`, ton: 'hata' };
  if (g === 0) return { metin: 'Bugün', ton: 'uyari' };
  return { metin: `${g} gün kaldı`, ton: g <= 3 ? 'uyari' : 'bilgi' };
}

export type OzetSuzgeci = 'gec' | 'bugun' | 'hafta' | 'ay';

// Özet kartları açık kayıtları sayar: geciken, bugün, 7 gün içinde (bugün dahil), 30 gün içinde.
export function ozeteUyar(k: TakvimKaydi, s: OzetSuzgeci, bugun: string): boolean {
  if (s === 'gec') return gecikti(k, bugun);
  if (k.bitti) return false;
  const g = gunFarki(bugun, k.tarih);
  return s === 'bugun' ? g === 0 : s === 'hafta' ? g >= 0 && g <= 6 : g >= 0 && g <= 29;
}

export const aramayaUyar = (k: TakvimKaydi, ara: string): boolean => {
  const q = ara.trim().toLocaleLowerCase('tr');
  return q === '' || [k.no, k.baslik, k.ilgili, k.durum, KAYNAK_BILGISI[k.kaynak].ad].join(' ').toLocaleLowerCase('tr').includes(q);
};
