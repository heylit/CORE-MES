import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import type { Alet, Durum, Sonuc } from '#paylasilan/sozlesme/kalibrasyon.ts';

// GGGG-AA-GG -> GG.AA.GGGG; tarih yoksa null kalır, boş metin üretilmez.
export function tarihMetni(tarih: string | null): string | null {
  if (tarih === null) return null;
  const [y, a, g] = tarih.split('-');
  return `${g}.${a}.${y}`;
}

export function durumMetni(alet: Pick<Alet, 'durum' | 'kalanGun'>): string {
  switch (alet.durum) {
    case 'kullanim-disi': return 'Kullanım dışı';
    case 'kayit-yok': return 'Kalibrasyon kaydı yok';
    case 'gecmis': return 'Kalibrasyonu geçmiş';
    // Kalan gün bilinmiyorsa sayı yazılmaz; durumun kendisi yine gösterilir.
    case 'yaklasan': return alet.kalanGun === null ? 'Vadesi yaklaşıyor' : `${alet.kalanGun} gün kaldı`;
    case 'gecerli': return 'Geçerli';
  }
}

export const DURUM_TONU: Record<Durum, RozetTonu> = {
  'kullanim-disi': 'pasif',
  'kayit-yok': 'bilgi',
  gecmis: 'hata',
  yaklasan: 'uyari',
  gecerli: 'tamam',
};

export const SONUC_METNI: Record<Sonuc, string> = { uygun: 'Uygun', uygunsuz: 'Uygunsuz' };

// Excel Türkçe ayarı noktalı virgül ayırıcı bekler; BOM'suz UTF-8'de Türkçe harfler bozulur.
export function aletlerCsv(aletler: readonly Alet[]): string {
  const alan = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const baslik = ['Alet no', 'Tür', 'Ad', 'Ölçme aralığı', 'Yer', 'Periyot (gün)', 'Son kalibrasyon', 'Vade', 'Durum'];
  const satirlar = aletler.map((a) => [a.no, a.tur, a.ad, a.olcmeAraligi, a.yer, a.periyotGun, tarihMetni(a.sonKalibrasyon), tarihMetni(a.vade), durumMetni(a)]);
  return '﻿' + [baslik, ...satirlar].map((s) => s.map(alan).join(';')).join('\r\n');
}
