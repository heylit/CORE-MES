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
