import type { RozetTonu } from '../../../ortak/arayuz/Rozet.tsx';
import type { Islem } from '#paylasilan/islemler.ts';
import type { VeriSagligiCevabi } from '#paylasilan/sozlesme/plan.ts';

export type VeriSagligiKategorisi = VeriSagligiCevabi['kategoriler'][number];

// Okunamayan dilim (yetki ya da kayıt yok) 0 değildir: "okunamadı" yazılır, sayı uydurulmaz.
export function durumu(k: VeriSagligiKategorisi): { ton: RozetTonu; metin: string } {
  if (k.sayi === null) return { ton: 'pasif', metin: 'Okunamadı' };
  if (k.sayi === 0) return { ton: 'tamam', metin: 'Eksik yok' };
  return { ton: 'uyari', metin: k.toplam === null ? `${String(k.sayi)} eksik` : `${String(k.sayi)} / ${String(k.toplam)} eksik` };
}

export function ozet(c: VeriSagligiCevabi): string {
  const eksik = c.kategoriler.filter((k) => (k.sayi ?? 0) > 0).length;
  const okunamayan = c.kategoriler.filter((k) => k.sayi === null).length;
  const parcalar = [eksik === 0 ? 'Sayılan alanlarda eksik yok' : `${String(eksik)} konuda eksik veri var; plan bu yerlerde varsayımla çalışıyor`];
  if (okunamayan > 0) parcalar.push(`${String(okunamayan)} konu yetkiniz ya da kayıt olmadığı için okunamadı`);
  return `${parcalar.join('. ')}.`;
}

// Eksik verinin düzeltildiği sayfa (2664, B-2482-31/7) ve o sayfayı açan işlem. Plan yalnız okur; düzeltme verinin sahibinde yapılır.
// İşlemi olmayana bağlantı yerine düz metin yazılır. Kişi saat maliyeti İK'nındır, Finans'a bağlanmaz.
export const DUZELTME_YERI: Partial<Record<VeriSagligiKategorisi['anahtar'], { yol: string; ad: string; islem: Islem }>> = {
  'stok-bos': { yol: '/stok', ad: 'Stok Merkezi', islem: 'sayfa.stok' },
  'sure-bos': { yol: '/recete-rota/sureler', ad: 'Reçete ve Rota > Süreler', islem: 'sayfa.recete-rota' },
  'istasyon-plan-ayari-yok': { yol: '/istasyonlar/is-merkezleri', ad: 'İstasyonlar > İş merkezleri ve istasyonlar', islem: 'sayfa.istasyonlar' },
  'vardiyasiz-istasyon': { yol: '/istasyonlar/vardiyalar', ad: 'İstasyonlar > Vardiyalar', islem: 'sayfa.istasyonlar' },
  'istasyon-maliyet-yok': { yol: '/finans/saatlik-maliyet', ad: 'Finans > Saatlik maliyetler', islem: 'finans.maliyet-oku' },
  'maliyet-doviz': { yol: '/finans', ad: 'Finans (Kur ve faiz şeridi)', islem: 'finans.oku' },
  'terminsiz-emir': { yol: '/siparisler', ad: 'Siparişler', islem: 'siparisler.oku' },
  'arizali-makine': { yol: '/istasyonlar/makineler', ad: 'İstasyonlar > Makineler', islem: 'sayfa.istasyonlar' },
  'elle-tezgah-ucreti': { yol: '/plan/maliyet', ad: 'Planlama > Maliyetler', islem: 'finans.maliyet-oku' },
};
