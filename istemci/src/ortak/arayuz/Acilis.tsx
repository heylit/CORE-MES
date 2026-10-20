import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AcilisTuru } from '#paylasilan/sozlesme/ayarlar.ts';
import { acilisSec, performansOku, useGosteri, type Gosteri, type OynanacakAcilis } from '../veri/gorunum.ts';
import { acilisOynat, renkleriOku, resimYukle, tmiResmi } from './acilis-oyunlari.ts';
import './acilis.css';

// Hareket dili kapalıyken de gösteri oynamaz (kök öğe, gorunum.ts useHareketUygula).
const hareketAzMi = (): boolean => {
  if (document.documentElement.getAttribute('data-hareket') === 'kapali') return true;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

// Gösterinin sahnesi: verilen oyunu logoyla bir kez oynatır; bitince, dokununca ya da bir tuşa basılınca çekilir ve
// bitti çağrılır. Oturum açılışı ve Sistem Ayarları'ndaki önizleme aynı sahneyi kullanır.
function AcilisSahnesi({ oyun, logo, sure, bitti, kabukGirer }: {
  oyun: OynanacakAcilis; logo: string | null | undefined; sure: number | null; bitti: () => void; kabukGirer: boolean;
}) {
  const [durum, durumYaz] = useState<'oynuyor' | 'cikiyor'>('oynuyor');
  const tuval = useRef<HTMLCanvasElement>(null);
  const yazi = useRef<HTMLParagraphElement>(null);
  const durdur = useRef<() => void>(() => undefined);

  useEffect(() => {
    let iptal = false;
    const bitir = () => { if (!iptal) durumYaz('cikiyor'); };
    const kaynak = logo ?? tmiResmi(renkleriOku(document.documentElement));
    resimYukle(kaynak)
      .catch(() => resimYukle(tmiResmi(renkleriOku(document.documentElement))))
      .then((img) => {
        if (iptal || tuval.current === null) return;
        durdur.current = acilisOynat(oyun, tuval.current, img, renkleriOku(document.documentElement), (m) => {
          if (yazi.current) yazi.current.textContent = m;
        }, bitir, sure === null ? null : sure * 1000);
      })
      .catch(bitir);
    return () => { iptal = true; durdur.current(); };
    // Oyun bir kez kurulur; logo sonradan gelse de baştan başlamaz (bağımlılıkta logo yoktur).
  }, [oyun]);

  useEffect(() => {
    if (durum !== 'oynuyor') return undefined;
    const tus = () => { durdur.current(); durumYaz('cikiyor'); };
    document.addEventListener('keydown', tus);
    return () => { document.removeEventListener('keydown', tus); };
  }, [durum]);

  useEffect(() => {
    if (durum !== 'cikiyor') return undefined;
    if (kabukGirer) document.documentElement.setAttribute('data-acilis-bitti', '');
    const zaman = window.setTimeout(bitti, 400);
    const temizle = window.setTimeout(() => { document.documentElement.removeAttribute('data-acilis-bitti'); }, 900);
    return () => { window.clearTimeout(zaman); window.clearTimeout(temizle); };
  }, [durum, bitti, kabukGirer]);

  return createPortal(
    <div
      className="tc-acilis-gosterisi"
      data-cikiyor={durum === 'cikiyor' ? '' : undefined}
      role="presentation"
      onClick={() => { durdur.current(); durumYaz('cikiyor'); }}
    >
      <canvas ref={tuval} className="tc-acilis-tuval" aria-hidden="true" />
      <p ref={yazi} className="tc-acilis-kod mono" aria-hidden="true" />
      <p className="tc-acilis-atla">Geçmek için dokunun</p>
    </div>,
    document.body,
  );
}

// Kurum logosu bir imalat işlemiyle ortaya çıkar, altına uygulamanın adı CORE kazınır (Sistem Ayarları'ndan seçilir).
// Girişte ve çıkışta tam o anda oynar (gorunum.ts); girişi ve çıkışı bekletmez. Dokunmak, tık ya da herhangi bir tuş geçer.
// Performans modunda, hareket azaltılmışken ya da kapalıyken hiç oynamaz; logo yoksa TMI yazısı işlenir.
// Uygulamada tek yerde, oturum değişse de yerinde kalan bir konumda kurulur: girişten kabuğa geçerken gösteri kesilmez.
export function AcilisGosterisi() {
  const [gosteri, bitir] = useGosteri();
  if (gosteri === null) return null;
  return <GosteriOynat key={gosteri.sira} gosteri={gosteri} bitti={bitir} />;
}

function GosteriOynat({ gosteri, bitti }: { gosteri: Gosteri; bitti: () => void }) {
  const [oyun] = useState(() => (hareketAzMi() ? null : acilisSec(gosteri.tur, performansOku())));
  useEffect(() => { if (oyun === null) bitti(); }, [oyun, bitti]);
  if (oyun === null) return null;
  return <AcilisSahnesi oyun={oyun} logo={gosteri.logo} sure={gosteri.sure} bitti={bitti} kabukGirer={gosteri.kabukGirer} />;
}

// Sistem Ayarları'ndaki önizleme: oturum işaretine ve performans moduna bakmadan seçilen gösteriyi bir kez oynatır.
// Rastgele her önizlemede altısından birini seçer.
export function AcilisOnizleme({ tur, sure, logo, bitti }: {
  tur: AcilisTuru; sure: number | null; logo: string | null | undefined; bitti: () => void;
}) {
  const [oyun] = useState(() => acilisSec(tur, false));
  useEffect(() => { if (oyun === null) bitti(); }, [oyun, bitti]);
  if (oyun === null) return null;
  return <AcilisSahnesi oyun={oyun} logo={logo} sure={sure} bitti={bitti} kabukGirer={false} />;
}
