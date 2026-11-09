import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { MiniPano } from '../rota/mini-pano.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Simge } from './Simge.tsx';
import './mini-pano.css';

// Chromium'un belge resim-içinde-resim penceresi (Chrome ve Edge 116+): sekme küçültülse de öteki programların üstünde
// durur, sekme kapanınca kapanır, yalnız tıklamayla açılır. Türleri TypeScript'in DOM kitaplığında henüz yok.
interface ResimIcindeResim {
  requestWindow(secenek?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}
const rir = (): ResimIcindeResim | undefined =>
  (globalThis as unknown as { documentPictureInPicture?: ResimIcindeResim }).documentPictureInPicture;

export const miniPanoDestekli = (): boolean => rir() !== undefined;

const GENISLIK = 360;
const YUKSEKLIK = 440;

// Pencere boş belgeyle açılır: tema öznitelikleri ve stil sayfaları kopyalanır ki tasarım değişkenleri aynı çalışsın.
function belgeyiHazirla(pencere: Window): void {
  const hedef = pencere.document;
  for (const a of Array.from(document.documentElement.attributes)) hedef.documentElement.setAttribute(a.name, a.value);
  hedef.title = 'CORE MES · Mini pano';
  for (const sayfa of Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))) hedef.head.appendChild(sayfa.cloneNode(true));
  hedef.body.className = 'tc-mp-govde';
}

// Tema ya da hareket ayarı değişince pencere ana belgeyle aynı kalır.
function oznitelikleriIzle(pencere: Window): () => void {
  const g = new MutationObserver(() => {
    for (const a of Array.from(document.documentElement.attributes)) pencere.document.documentElement.setAttribute(a.name, a.value);
  });
  g.observe(document.documentElement, { attributes: true });
  return () => { g.disconnect(); };
}

export interface MiniPanoPenceresi {
  acik: boolean;
  // Yalnız tıklamanın hemen ardından çağrılır: tarayıcı pencereyi kullanıcı eylemi olmadan açmaz.
  ac: () => void;
  // Pencerenin içeriği; açanın ağacında çizilir ki sorgu, yönlendirme ve oturum bağlamı aynı kalsın.
  cizim: ReactNode;
}

export function useMiniPanoPenceresi(panolar: readonly MiniPano[]): MiniPanoPenceresi {
  const [pencere, pencereYaz] = useState<Window | null>(null);

  const ac = useCallback(() => {
    const api = rir();
    if (api === undefined) return;
    if (pencere !== null) { pencere.focus(); return; }
    api.requestWindow({ width: GENISLIK, height: YUKSEKLIK }).then((yeni) => {
      belgeyiHazirla(yeni);
      yeni.addEventListener('pagehide', () => { pencereYaz(null); }, { once: true });
      pencereYaz(yeni);
    }).catch(() => {
      // Tarayıcı tıklama dışında açmaya izin vermez; düğme yeniden denenebilir.
    });
  }, [pencere]);

  useEffect(() => (pencere === null ? undefined : oznitelikleriIzle(pencere)), [pencere]);
  // Açan kalkınca (çıkış) pencere de kapanır: oturumsuz sayı ekranda kalmaz.
  useEffect(() => () => { pencere?.close(); }, [pencere]);

  return {
    acik: pencere !== null,
    ac,
    cizim: pencere === null ? null : createPortal(<MiniPanoIcerigi panolar={panolar} />, pencere.document.body),
  };
}

function MiniPanoIcerigi({ panolar }: { panolar: readonly MiniPano[] }) {
  const [secili, seciliYaz] = useState(panolar[0]?.anahtar ?? '');
  const pano = panolar.find((p) => p.anahtar === secili) ?? panolar[0];
  if (pano === undefined) return <p className="tc-mp-bos">Size açık mini pano yok.</p>;
  return (
    <div className="tc-mp">
      {panolar.length > 1 && (
        <div className="tc-mp-sekmeler" role="tablist" aria-label="Mini panolar">
          {panolar.map((p) => (
            <button key={p.anahtar} type="button" role="tab" aria-selected={p.anahtar === pano.anahtar} className="tc-mp-sekme" onClick={() => seciliYaz(p.anahtar)}>
              <Simge ad={p.simge} boyut="k" />{p.baslik}
            </button>
          ))}
        </div>
      )}
      <h1 className="tc-mp-baslik"><Simge ad={pano.simge} boyut="k" />{pano.baslik}</h1>
      <pano.ekran />
    </div>
  );
}

export type MiniPanoTonu = 'dikkat' | 'uyari' | 'notr';

interface KutucukOzellikleri {
  baslik: string;
  simge: SimgeAdi;
  // undefined: yükleniyor; null: veri yok (sıfır uydurulmaz).
  sayi: number | null | undefined;
  altMetin: string;
  // Ton yalnız sayı sıfırdan büyükken görünür.
  ton?: MiniPanoTonu;
  // Ana pencerede açılacak adres.
  yol: string;
}

// Tıklanınca ana pencere o sayfaya gider; pencere yerinde kalır.
export function MiniPanoKutucugu({ baslik, simge, sayi, altMetin, ton = 'notr', yol }: KutucukOzellikleri) {
  const git = useNavigate();
  return (
    <button
      type="button"
      className="tc-mp-kutu"
      data-ton={typeof sayi === 'number' && sayi > 0 ? ton : undefined}
      data-bos={sayi === null ? '' : undefined}
      onClick={() => { void git(yol); window.focus(); }}
    >
      <span className="tc-mp-kutu-baslik"><Simge ad={simge} boyut="k" />{baslik}</span>
      <strong className="tc-mp-kutu-sayi">{sayi === undefined ? '…' : sayi === null ? '—' : sayi.toLocaleString('tr-TR')}</strong>
      <span className="tc-mp-kutu-alt">{sayi === null ? 'veri yok' : altMetin}</span>
    </button>
  );
}

export function MiniPanoIzgarasi({ children, guncelleme }: { children: ReactNode; guncelleme: number | undefined }) {
  const saat = guncelleme === undefined || guncelleme === 0
    ? null
    : new Date(guncelleme).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return (
    <>
      <div className="tc-mp-izgara">{children}</div>
      <p className="tc-mp-alt">
        <span>Kutucuğa tıklayınca ana pencerede açılır</span>
        {saat !== null && <span className="mono">{saat}</span>}
      </p>
    </>
  );
}
