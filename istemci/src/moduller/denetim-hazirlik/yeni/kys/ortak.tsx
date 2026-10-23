import { createContext, useContext, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { CokSatir, Dugme, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { rolAdi } from '../kurallar/kys.ts';
import type { Kys, KysSekmesi } from '../tipler.ts';
import type { RolSatiri } from './semalar.ts';

// KYS sekmelerinin ortak küçük parçaları: alt sekme bağlantısı, olgunluk halkası, oran çubuğu, kişi önerisi listesi.

export const KISI_LISTESI = 'tc-dhk-kisiler';

// Yüzde tonu (prototip pctColor): 85 ve üstü iyi, 70 ve üstü uyarı, altı kötü; değer yoksa soluk.
export type YuzdeTonu = 'iyi' | 'uyari' | 'kotu' | 'soluk';
export const yuzdeTonu = (p: number | null): YuzdeTonu => (p === null ? 'soluk' : p >= 85 ? 'iyi' : p >= 70 ? 'uyari' : 'kotu');

const ALT_SEKME_ADI: Record<string, string> = {
  gorev: 'Görev tanımları', surec: 'Süreçler', dosya: 'Dosyalama', rutin: 'Rutin görevler', blok: 'Yapı taşları', yol: 'Yol haritası',
};
const GORUNUM_ADI: Record<string, string> = { kontrol: 'Öz değerlendirme', takvim: 'Takvim', hazirlik: 'Hazırlık', kalib: 'Kalibrasyon' };

// kLink: "go:<görünüm>" başka bölüme, düz ad KYS alt sekmesine gider.
export function KysBaglantisi({ hedef }: { hedef: string }) {
  const d = useDenetim();
  if (!hedef) return null;
  if (hedef.startsWith('go:')) {
    const v = hedef.slice(3) as 'kontrol' | 'takvim' | 'hazirlik' | 'kalib';
    return <Dugme className="tc-dhk-baglanti" onClick={() => { d.git(v); }}>{GORUNUM_ADI[v] ?? v}<Simge ad="chev-right" boyut="k" /></Dugme>;
  }
  return <Dugme className="tc-dhk-baglanti" onClick={() => { d.git('kys', { kys: hedef as KysSekmesi }); }}>{ALT_SEKME_ADI[hedef] ?? hedef}<Simge ad="chev-right" boyut="k" /></Dugme>;
}

const CEVRE = 2 * Math.PI * 40;
export function Halka({ yuzde, etiket }: { yuzde: number | null; etiket: string }) {
  const oran = yuzde === null ? 0 : Math.max(0, Math.min(100, yuzde)) / 100;
  return (
    <svg className="tc-dhk-halka" viewBox="0 0 100 100" role="img" aria-label={etiket} data-ton={yuzdeTonu(yuzde)}>
      <circle className="tc-dhk-halka-yol" cx="50" cy="50" r="40" fill="none" strokeWidth="9" />
      {oran > 0 && <circle className="tc-dhk-halka-yay" cx="50" cy="50" r="40" fill="none" strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${String(CEVRE * oran)} ${String(CEVRE)}`} transform="rotate(-90 50 50)" />}
      <text x="50" y="50" textAnchor="middle" dominantBaseline="middle" className="tc-dhk-halka-metin">{yuzde === null ? '–' : `%${String(yuzde)}`}</text>
    </svg>
  );
}

// Oran çubuğu: ardışık parçalar (iyi, uyarı, vurgu, kötü); genişlik SVG koordinatıdır, satır içi stil yazılmaz.
export function OranCubugu({ parcalar, etiket }: { parcalar: readonly { oran: number; ton: 'iyi' | 'uyari' | 'vurgu' | 'kotu' }[]; etiket: string }) {
  let x = 0;
  return (
    <svg className="tc-dhk-cubuk" viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label={etiket}>
      <rect className="tc-dhk-cubuk-yol" x="0" y="0" width="100" height="4" />
      {parcalar.map((p, i) => {
        const w = Math.max(0, Math.min(100 - x, p.oran * 100));
        const r = <rect key={i} className={`tc-dhk-cubuk-${p.ton}`} x={x} y="0" width={w} height="4" />;
        x += w;
        return r;
      })}
    </svg>
  );
}

export function Nokta({ st }: { st: 0 | 1 | 2 }) {
  return <i className={`tc-dhk-nokta tc-dhk-nokta-${String(st)}`} aria-hidden="true" />;
}

export function KisiOnerileri() {
  const d = useDenetim();
  return <datalist id={KISI_LISTESI}>{d.kisiler.map((k) => <option key={k.id} value={k.ad} />)}</datalist>;
}

export function Bolum({ baslik, simge, sag, children, sinif }: { baslik: string; simge: Parameters<typeof Simge>[0]['ad']; sag?: ReactNode; children: ReactNode; sinif?: string }) {
  return (
    <section className={`tc-dhk-kart${sinif ? ` ${sinif}` : ''}`}>
      <header className="tc-dhk-kart-ust">
        <h3><Simge ad={simge} />{baslik}</h3>
        {sag && <div className="tc-dhk-arac">{sag}</div>}
      </header>
      {children}
    </section>
  );
}

// Yazdırma ve Word için işaret: ekrandaki bileşen ayrık bir köke çizilir, HTML'i alınır. React metni kendisi kaçırır.
export function htmlUret(dugum: ReactNode): string {
  const kap = document.createElement('div');
  const kok = createRoot(kap);
  flushSync(() => { kok.render(dugum); });
  const html = kap.innerHTML;
  kok.unmount();
  return html;
}

// copyText: pano kapalıysa (düz http, izin yok) metin seçili hâlde pencerede gösterilir; kişi elle kopyalar.
export function useKopyala(): [(metin: string, tamam: string) => void, ReactNode] {
  const d = useDenetim();
  const [yedek, yedekYaz] = useState<string | null>(null);
  const kopyala = (metin: string, tamam: string) => {
    const ac = () => { yedekYaz(metin); };
    try {
      navigator.clipboard.writeText(metin).then(() => { d.bildir(tamam); }, ac);
    } catch {
      ac();
    }
  };
  const pencere = (
    <Pencere acik={yedek !== null} kapat={() => { yedekYaz(null); }} baslik="Metni kopyalayın">
      <CokSatir etiket="Metin" readOnly rows={12} value={yedek ?? ''} onFocus={(e) => { e.currentTarget.select(); }} autoFocus />
    </Pencere>
  );
  return [kopyala, pencere];
}

// Süzgeç çipleri (prototip fchip; ortak Tablo aracının çip kalıbı).
export function Cipler<D extends string>({ etiket, secenekler, secili, sec }: { etiket: string; secenekler: readonly { deger: D; baslik: string }[]; secili: D; sec: (d: D) => void }) {
  return (
    <div className="tc-dhk-suzgec" role="group" aria-label={etiket}>
      {secenekler.map((c) => <Dugme key={c.deger} aria-pressed={c.deger === secili} onClick={() => { sec(c.deger); }}>{c.baslik}</Dugme>)}
    </div>
  );
}

// Sekmeler arası geçişte açılacak öğe (prototip kysOpen, pedit, docOpen): yol haritasından taşa, şemadan sürece, ana listeden dokümana.
export interface KysGecisi { tas: string; surec: string; dokuman: string }
const Gecis = createContext<[KysGecisi, (y: Partial<KysGecisi>) => void]>([{ tas: '', surec: '', dokuman: '' }, () => undefined]);
export function KysGecisSaglayici({ children }: { children: ReactNode }) {
  const [g, yaz] = useState<KysGecisi>({ tas: '', surec: '', dokuman: '' });
  return <Gecis.Provider value={[g, (y) => { yaz((o) => ({ ...o, ...y })); }]}>{children}</Gecis.Provider>;
}
export const useKysGecisi = () => useContext(Gecis);

// roleLine: şemalardaki rol şeridi; rolün adı ve atanmış kişi.
export const rolSatiri = (k: Kys) => (rk: string): RolSatiri => ({ n: rolAdi(rk), p: k.roles[rk]?.kisi ?? '' });

// Öğeye kaydırma; jsdom gibi desteklemeyen ortamda sessizce geçer.
export function kaydir(id: string): void {
  const el = document.getElementById(id);
  if (el && 'scrollIntoView' in el) el.scrollIntoView({ block: 'center' });
}
