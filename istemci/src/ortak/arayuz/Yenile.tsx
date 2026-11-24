import { useEffect, useRef, useState } from 'react';
import { Dugme } from './Dugme.tsx';
import { useTelefon } from './telefon.ts';
import './yenile.css';

// Telefonda liste ekranının üstündeki "Güncellendi" satırı, yenile düğmesi ve aşağı çekince yenile (kart 3676). Yeniden çizimde
// kaydırma konumu, arama ve süre seçimi sorgu önbelleğinde kaldığı için korunur. Yenilenemezse eski liste durur.
export interface YenilenenSorgu {
  refetch: () => Promise<unknown>;
  isFetching: boolean;
  isError: boolean;
  dataUpdatedAt: number;
}

const CEKME_ESIGI_PX = 80;
const CEKME_ENCOK_PX = 120;

export function gecenMetni(ms: number): string {
  const sn = Math.max(0, Math.round(ms / 1000));
  if (sn < 10) return 'şimdi';
  if (sn < 60) return `${String(sn)} sn önce`;
  const dk = Math.floor(sn / 60);
  if (dk < 60) return `${String(dk)} dk önce`;
  return `${String(Math.floor(dk / 60))} sa önce`;
}

// Kaydırılan kap sayfanın içerik alanıdır; çekme yalnız en üstteyken sayılır.
function kaydirilanKap(e: Element | null): Element | null {
  return e?.closest('.tc-kabuk-icerik') ?? null;
}

// `ad`: bir sayfada birden çok liste varsa ekran okuyucu düğmeleri ayırt etsin ("Yenile: Toplama listeleri").
export function Yenile({ sorgu, ad }: { sorgu: YenilenenSorgu | readonly YenilenenSorgu[]; ad?: string }) {
  const telefon = useTelefon();
  const liste = Array.isArray(sorgu) ? (sorgu as readonly YenilenenSorgu[]) : [sorgu as YenilenenSorgu];
  const mesgul = liste.some((q) => q.isFetching);
  const hata = liste.some((q) => q.isError);
  const guncelleme = Math.max(0, ...liste.map((q) => q.dataUpdatedAt));
  const [simdi, simdiYaz] = useState(() => Date.now());
  const [cek, cekYaz] = useState(0);
  const yenileRef = useRef<() => void>(() => undefined);
  yenileRef.current = () => { if (!mesgul) void Promise.all(liste.map((q) => q.refetch())); };

  useEffect(() => {
    if (!telefon) return undefined;
    const zaman = setInterval(() => { simdiYaz(Date.now()); }, 15_000);
    return () => { clearInterval(zaman); };
  }, [telefon]);
  useEffect(() => { simdiYaz(Date.now()); }, [guncelleme]);

  useEffect(() => {
    if (!telefon) return undefined;
    let y0: number | null = null;
    let dy = 0;
    const basla = (o: TouchEvent) => {
      const kap = kaydirilanKap(o.target instanceof Element ? o.target : null);
      y0 = kap !== null && kap.scrollTop <= 0 && o.touches.length === 1 ? (o.touches[0]?.clientY ?? null) : null;
      dy = 0;
    };
    const kay = (o: TouchEvent) => {
      if (y0 === null) return;
      dy = Math.max(0, Math.min(CEKME_ENCOK_PX, (o.touches[0]?.clientY ?? y0) - y0));
      cekYaz(dy);
    };
    const bit = () => {
      if (y0 !== null && dy > CEKME_ESIGI_PX) yenileRef.current();
      y0 = null; dy = 0; cekYaz(0);
    };
    document.addEventListener('touchstart', basla, { passive: true });
    document.addEventListener('touchmove', kay, { passive: true });
    document.addEventListener('touchend', bit);
    document.addEventListener('touchcancel', bit);
    return () => {
      document.removeEventListener('touchstart', basla);
      document.removeEventListener('touchmove', kay);
      document.removeEventListener('touchend', bit);
      document.removeEventListener('touchcancel', bit);
    };
  }, [telefon]);

  if (!telefon) return null;
  // Hata varken zaman son başarılı güncellemeyi söyler ("Son güncelleme"), düğme "Tekrar dene" olur; ikisi aynı satırdadır, alt çubuğun
  // altında kalıp kaybolmaz. Veri hiç gelmediyse liste kendi hata kutusunu gösterir.
  const hatali = hata && guncelleme > 0;
  const zaman = gecenMetni(simdi - guncelleme);
  return (
    <div className="tc-yenile">
      {cek > 0 && <div className="tc-yenile-cek" role="presentation">{cek > CEKME_ESIGI_PX ? 'Bırakın, yenilensin' : 'Yenilemek için çekin'}</div>}
      <div className="tc-yenile-satir" data-hata={hatali ? '' : undefined}>
        {hatali
          ? <span className="tc-yenile-son" role="alert"><b>Güncellenemedi.</b> Son güncelleme: {zaman}</span>
          : <span className="tc-yenile-son" role="status" aria-live="polite">{guncelleme > 0 ? `Güncellendi: ${zaman}` : 'Yükleniyor'}</span>}
        {hatali
          ? <Dugme tur="ikincil" simge="rotate" onClick={() => { yenileRef.current(); }} yukleniyor={mesgul} {...(ad ? { 'aria-label': `Tekrar dene: ${ad}` } : {})}>Tekrar dene</Dugme>
          : <Dugme tur="ikincil" simge="rotate" onClick={() => { yenileRef.current(); }} yukleniyor={mesgul} aria-label={ad ? `Yenile: ${ad}` : 'Yenile'} className="tc-yenile-dugme" />}
      </div>
    </div>
  );
}
