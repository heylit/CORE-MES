import { useEffect, useState, type ReactNode } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { VERI_NOTU } from '../../motor/ortak.tsx';

// Bugünkü sayfanın dar ekran eşiği (00-baslangic.betik dar, kip()): altında tablolar karta döner.
const DAR = '(max-width: 767px)';
export function useDar(): boolean {
  const [dar, darYaz] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(DAR).matches === true);
  useEffect(() => {
    const m = window.matchMedia?.(DAR);
    if (!m) return undefined;
    const izle = (): void => { darYaz(m.matches); };
    m.addEventListener('change', izle);
    return () => { m.removeEventListener('change', izle); };
  }, []);
  return dar;
}

// Sayfanın kendi tablosu (td/kip): her hücre başlığını taşır, dar ekranda satır karta döner. Kayıt yoksa tek satırlık not.
export interface Sutun<S> { anahtar: string; baslik: string; hucre: (s: S) => ReactNode; sag?: boolean; gizliBaslik?: boolean; kirilmaz?: boolean }
// `sec` verilirse satıra basmak kaydı açar (tc-tablo-secilir); düğme ve girdiye basmak açmaz.
export function VeriTablosu<S>({ etiket, sutunlar, satirlar, anahtar, bos = 'Kayıt yok.', satirTonu, sec }: {
  etiket: string; sutunlar: readonly Sutun<S>[]; satirlar: readonly S[]; anahtar: (s: S, i: number) => string; bos?: string; satirTonu?: (s: S) => string | undefined;
  sec?: (s: S) => void;
}) {
  const dar = useDar();
  return (
    <div className="tc-tablo-kap" data-kip={dar ? 'kart' : undefined}>
      <table className="tc-tablo tc-pyi-tablo" aria-label={etiket}>
        <thead>
          <tr>
            {sutunlar.map((c) => (
              <th key={c.anahtar} scope="col" className={c.sag ? 'tc-tablo-sag' : undefined}>
                {c.gizliBaslik ? <span className="tc-gizli-etiket">{c.baslik}</span> : c.baslik}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {satirlar.length === 0 && <tr><td colSpan={sutunlar.length} className="tc-tablo-yok">{bos}</td></tr>}
          {satirlar.map((s, i) => (
            <tr
              key={anahtar(s, i)} data-ton={satirTonu?.(s)} className={sec ? 'tc-tablo-secilir' : undefined}
              onClick={sec ? (e) => { if (!(e.target as HTMLElement).closest('button,input,select,a')) sec(s); } : undefined}
            >
              {sutunlar.map((c) => (
                <td
                  key={c.anahtar} data-baslik={c.gizliBaslik ? undefined : c.baslik}
                  className={[c.sag ? 'tc-tablo-sag mono' : '', c.kirilmaz ? 'tc-tablo-kirilmaz' : ''].filter(Boolean).join(' ') || undefined}
                >
                  {c.hucre(s)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Veri sahibi ekranında değişen kaydın düğmesi: yerinde ve pasif (222 a; yeni ekranda yazma yok). Görünen metin kısaysa ("Yeni") adı
// erişilebilir addır; ad görünen metni içerir.
export function SahipDugmesi({ ad, simge, metin, birincil }: { ad: string; simge: SimgeAdi; metin?: string; birincil?: boolean }) {
  return (
    <button
      type="button" className={`tc-dugme ${birincil ? 'tc-dugme-birincil' : 'tc-dugme-ikincil'} tc-pyi-kucuk${metin ? '' : ' tc-pyi-hayalet'}`}
      aria-disabled="true" aria-label={metin === ad ? undefined : ad} title={`${ad}: ${VERI_NOTU}`}
    >
      <Simge ad={simge} boyut="k" />{metin}
    </button>
  );
}

// Planlamaya özgü kaydın küçük düğmesi (sil, düzenle). Simgeli düğmenin adı aria-label'dadır.
export function KucukDugme({ ad, simge, metin, yap, birincil, tehlike, kapali, not }: {
  ad: string; simge: SimgeAdi; metin?: string; yap: () => void; birincil?: boolean; tehlike?: boolean; kapali?: boolean; not?: string;
}) {
  const tur = birincil ? 'tc-dugme-birincil' : tehlike ? 'tc-dugme-tehlike' : 'tc-dugme-ikincil';
  return (
    <button
      type="button" className={`tc-dugme ${tur} tc-pyi-kucuk${metin ? '' : ' tc-pyi-hayalet'}`} aria-label={metin === ad ? undefined : ad}
      aria-disabled={kapali ? 'true' : undefined} title={kapali && not ? `${ad}. ${not}` : metin ? undefined : ad}
      onClick={() => { if (!kapali) yap(); }}
    >
      <Simge ad={simge} boyut="k" />{metin}
    </button>
  );
}

// Bugünkü sayfanın kartı (kart(baslik, govde, sag, alt)): başlık satırında sağda düğme ya da küçük not.
export function VeriKarti({ baslik, simge, ek, sag, children }: { baslik: ReactNode; simge?: SimgeAdi; ek?: ReactNode; sag?: ReactNode; children: ReactNode }) {
  return (
    <section className="tc-pyi-kart">
      <header className="tc-pyi-kart-ust">
        <h3>{simge && <Simge ad={simge} boyut="k" />}{baslik}{ek && <span className="tc-pyi-k">{ek}</span>}</h3>
        {sag && <div className="tc-pyi-dugmeler">{sag}</div>}
      </header>
      <div className="tc-pyi-kart-govde">{children}</div>
    </section>
  );
}

// Bilgi şeridi (pm-serit): simge, metin ve isteğe bağlı düğme.
export function Serit({ ton, simge, children, eylem }: { ton?: 'tamam' | 'uyari' | 'hata'; simge: SimgeAdi; children: ReactNode; eylem?: ReactNode }) {
  return (
    <div className="tc-pyi-serit" data-ton={ton}>
      <Simge ad={simge} boyut="k" /><span>{children}</span>{eylem}
    </div>
  );
}

// Sahibinden gelen verinin notu: neden yazılamadığını ve nerede değiştiğini söyler.
export function SahipNotu({ children }: { children?: ReactNode }) {
  return <p className="tc-pyi-sahip"><Simge ad="lock" boyut="k" /><span>{children ?? VERI_NOTU}</span></p>;
}

export const sayiYazi = (x: number | null | undefined, basamak = 0): string =>
  (x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: basamak }));
