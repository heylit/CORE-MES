import type { RozetTonu } from '../../../ortak/arayuz/Rozet.tsx';
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

// Eksik verinin düzeltildiği sayfa (2664, B-2482-31/7). Plan yalnız okur; düzeltme verinin sahibinde yapılır. Sahibi belli olmayan konuda
// (Finans'ın birim maliyeti) bağlantı verilmez; yanlış sayfaya göndermek boş bırakmaktan kötüdür.
export const DUZELTME_YERI: Partial<Record<VeriSagligiKategorisi['anahtar'], { yol: string; ad: string }>> = {
  'stok-bos': { yol: '/stok', ad: 'Stok Merkezi' },
  'sure-bos': { yol: '/recete-rota/sureler', ad: 'Reçete ve Rota > Süreler' },
  'istasyon-plan-ayari-yok': { yol: '/istasyonlar/is-merkezleri', ad: 'İstasyonlar > İş merkezleri ve istasyonlar' },
  'vardiyasiz-istasyon': { yol: '/istasyonlar/vardiyalar', ad: 'İstasyonlar > Vardiyalar' },
  'terminsiz-emir': { yol: '/siparisler', ad: 'Siparişler' },
  'arizali-makine': { yol: '/istasyonlar/makineler', ad: 'İstasyonlar > Makineler' },
  'elle-tezgah-ucreti': { yol: '/plan/maliyet', ad: 'Planlama > Maliyetler' },
};
