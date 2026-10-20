import { useCallback, useEffect, useRef, useState } from 'react';

// Tam ekran (atölye ekranı): sayfa tarayıcının tam ekranına alınır, harita sınıfla bütün ekranı kaplar. Tam ekran
// belgenin kendisine istenir: pencere, onay ve bildirimler (gövdeye açılan katmanlar) tam ekranda da görünür.
// Tarayıcı izin vermezse (iOS, gömülü görünüm) yalnız sınıf kalır; Escape iki durumda da çıkar. Ekran açıkken
// ekranın kararmaması istenir (destekleyen tarayıcıda).

interface UyanikKilit { release: () => Promise<void> }
interface UyanikKilitSaglayici { request: (tur: 'screen') => Promise<UyanikKilit> }

export function useTamEkran(): { acik: boolean; ac: () => void; kapat: () => void } {
  const [acik, acikYaz] = useState(false);
  const kilit = useRef<UyanikKilit | null>(null);

  const kapat = useCallback(() => {
    acikYaz(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  const ac = useCallback(() => {
    acikYaz(true);
    const kok = document.documentElement;
    if (typeof kok.requestFullscreen === 'function' && !document.fullscreenElement) {
      void kok.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
    }
  }, []);

  // Tarayıcının kendi çıkışı (Escape, F11) haritayı da tam ekrandan çıkarır.
  useEffect(() => {
    const degisti = () => { if (!document.fullscreenElement) acikYaz(false); };
    document.addEventListener('fullscreenchange', degisti);
    return () => document.removeEventListener('fullscreenchange', degisti);
  }, []);

  useEffect(() => {
    if (!acik) return undefined;
    const tus = (o: KeyboardEvent) => { if (o.key === 'Escape' && !document.fullscreenElement) acikYaz(false); };
    window.addEventListener('keydown', tus);
    const saglayici = (navigator as Navigator & { wakeLock?: UyanikKilitSaglayici }).wakeLock;
    saglayici?.request('screen').then((k) => { kilit.current = k; }, () => undefined);
    return () => {
      window.removeEventListener('keydown', tus);
      void kilit.current?.release().catch(() => undefined);
      kilit.current = null;
    };
  }, [acik]);

  // Sayfadan çıkılırken tam ekran bırakılır.
  useEffect(() => () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); }, []);

  return { acik, ac, kapat };
}

// Otomatik tur: sırayla her istasyona gidilir (sorunlu olan önce). Sıra her adımda yeniden okunur; durum değişince
// tur yeni sırayı izler. İleri ve geri elle de gidilir; elle adımdan sonra süre baştan başlar. Durdurulunca yer korunur.
export interface TurDenetimi {
  ileri: () => void;
  geri: () => void;
  // Gidilen istasyonun sıradaki yeri (1'den) ve sıranın uzunluğu; tur kapalıysa null.
  konum: { no: number; toplam: number; anahtar: string } | null;
}

export function useOtomatikTur(acik: boolean, durdu: boolean, sira: () => readonly string[], git: (anahtar: string) => void, aralikMs = 12_000): TurDenetimi {
  const adim = useRef(-1);
  const sirayiOku = useRef(sira);
  sirayiOku.current = sira;
  const gitmek = useRef(git);
  gitmek.current = git;
  const [konum, konumYaz] = useState<TurDenetimi['konum']>(null);
  const [saat, saatYaz] = useState(0);

  const adimla = useCallback((yon: 1 | -1) => {
    const s = sirayiOku.current();
    if (s.length === 0) return;
    adim.current = (((adim.current + yon) % s.length) + s.length) % s.length;
    const anahtar = s[adim.current];
    if (!anahtar) return;
    gitmek.current(anahtar);
    konumYaz({ no: adim.current + 1, toplam: s.length, anahtar });
  }, []);

  useEffect(() => {
    if (!acik) { adim.current = -1; konumYaz(null); return; }
    if (adim.current === -1) adimla(1);
  }, [acik, adimla]);

  // Süre her adımda (elle de) baştan kurulur.
  useEffect(() => {
    if (!acik || durdu) return undefined;
    const z = setTimeout(() => { adimla(1); saatYaz((n) => n + 1); }, aralikMs);
    return () => clearTimeout(z);
  }, [acik, durdu, aralikMs, adimla, saat, konum]);

  const ileri = useCallback(() => { adimla(1); saatYaz((n) => n + 1); }, [adimla]);
  const geri = useCallback(() => { adimla(-1); saatYaz((n) => n + 1); }, [adimla]);
  return { ileri, geri, konum };
}
