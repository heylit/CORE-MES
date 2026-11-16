import { useState } from 'react';
import { CokSatir, Dugme, Girdi, Pencere } from '../../../../ortak/arayuz/index.ts';
import type { RefakatKarti } from '../../../../../../arkon/web/src/data/refakat-karti.ts';
import { terminalOkutmasi } from './el-okuyucu.ts';

// 3337-2 a: iş adımı refakat kartı okutularak ya da kart numarası girilerek başlar. Kart yoksa yalnız yetkili kişi
// (`uretim-emirleri.kartsiz-baslat`) gerekçeyle başlatır. Son söz sunucunundur: kartın bu emrin açık kartı olduğunu orada denetler.
export const KARTSIZ_BASLATMA_ISLEMI = 'uretim-emirleri.kartsiz-baslat';
export const GEREKCE_AZAMI = 500;
type Kart = Pick<RefakatKarti, 'id' | 'etiket'>;

// Okutulan karekod (RP:<id>), ekrandaki etiket (UE-000120-P1) ya da çıplak kart numarası; çözülemezse null.
export function kartGirdisiCoz(ham: string, kartlar: readonly Kart[]): number | null {
  const metin = ham.trim();
  if (metin === '') return null;
  const okutma = terminalOkutmasi(metin);
  if (okutma.tur === 'kart') return okutma.kartId;
  const etiketle = kartlar.find((k) => k.etiket.toUpperCase() === metin.toUpperCase());
  if (etiketle) return etiketle.id;
  return /^\d{1,9}$/.test(metin) ? Number(metin) : null;
}

// 3337 Arayüz bakışı: bu işin kartları yalnız bilgi olarak görünür; dokunarak başlatmak kartın elde olmasını aramazdı.
export function KartlaBaslat({ is, kartlar, yetkili, kartla, kartsiz, kamera, kapat }: {
  is: string; kartlar: readonly Kart[]; yetkili: boolean;
  kartla: (kartId: number) => void; kartsiz: (gerekce: string) => void; kamera: () => void; kapat: () => void;
}) {
  const [girdi, girdiYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const [gerekce, gerekceYaz] = useState('');
  const gonder = () => {
    const id = kartGirdisiCoz(girdi, kartlar);
    if (id === null) { hataYaz('Kart okunamadı; karekodu okutun ya da kart numarasını yazın.'); return; }
    kartla(id);
  };
  return (
    <Pencere acik kapat={kapat} baslik="Refakat kartını okut" alt={<Dugme tur="ikincil" onClick={kapat}>Vazgeç</Dugme>}>
      <p role="alert"><strong>Kart okutulmadan iş başlamaz.</strong></p>
      <p>{is}: kartı el okuyucuyla okutun ya da kartın üstündeki numarayı yazın.</p>
      <form onSubmit={(e) => { e.preventDefault(); gonder(); }}>
        <Girdi etiket="Kart" autoFocus autoComplete="off" placeholder="RP:120 ya da UE-000120-P1" value={girdi} hata={hata ?? undefined}
          onChange={(e) => { girdiYaz(e.target.value); hataYaz(null); }} />
        <Dugme type="submit" simge="play" disabled={girdi.trim() === ''}>Kartla başlat</Dugme>
        <Dugme type="button" tur="ikincil" simge="camera" onClick={kamera}>Kamerayla okut</Dugme>
      </form>
      {kartlar.length > 0 ? (
        <p className="tc-ay1-soluk">Bu işin kartları: {kartlar.map((k) => k.etiket).join(', ')}. Kart elde olmalı; listeden seçilmez.</p>
      ) : null}
      {yetkili ? (
        <form onSubmit={(e) => { e.preventDefault(); if (gerekce.trim() !== '') kartsiz(gerekce.trim()); }}>
          <CokSatir etiket="Kartsız başlatma gerekçesi" maxLength={GEREKCE_AZAMI} value={gerekce} onChange={(e) => gerekceYaz(e.target.value)}
            ipucu="Yalnız yetkili. Gerekçe kayda geçer, kart listesinde Gerekçeli görünür." />
          <Dugme type="submit" tur="ikincil" simge="alert" disabled={gerekce.trim() === ''}>Kartsız başlat</Dugme>
        </form>
      ) : <p className="tc-ay1-soluk">Kart yoksa yetkili kişi gerekçeyle başlatır.</p>}
    </Pencere>
  );
}
