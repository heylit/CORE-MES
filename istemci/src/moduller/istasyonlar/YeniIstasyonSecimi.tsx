import { IsaretKutusu, Secim } from '../../ortak/arayuz/index.ts';
import type { TesisVerisi } from './tesisVerisi.ts';

// 2902 (madde 6): yeni makine kendi istasyonuyla açılır; işaret kalkarsa var olan istasyon seçilir. İstasyon makinenin kodu ve adını alır,
// kapasite kaynağı makinedir; stok konumu istasyonla birlikte açılır.
export function YeniIstasyonSecimi({ v, acik, acikYaz, merkez, merkezYaz, eksik }: {
  v: TesisVerisi; acik: boolean; acikYaz: (a: boolean) => void; merkez: string; merkezYaz: (m: string) => void; eksik: boolean;
}) {
  const secenekler = v.merkezler.filter((m) => m.aktif).map((m) => ({ deger: String(m.id), baslik: `${m.kod} ${m.ad}` }));
  return (
    <>
      <IsaretKutusu etiket="Bu makine için yeni istasyon aç" checked={acik} onChange={(o) => acikYaz(o.target.checked)} />
      {acik && (
        <Secim etiket="Yeni istasyonun iş merkezi" required value={merkez} onChange={(o) => merkezYaz(o.target.value)}
          bosSecenek="İş merkezi seçin" secenekler={secenekler} ipucu="İstasyon makinenin kodu ve adıyla açılır."
          {...(eksik ? { hata: 'İş merkezi seçin.' } : {})} />
      )}
    </>
  );
}

// Tek aktif iş merkezi varsa o seçili gelir.
export function ilkMerkez(v: TesisVerisi): string {
  const aktif = v.merkezler.filter((m) => m.aktif);
  return aktif.length === 1 ? String(aktif[0]!.id) : '';
}
