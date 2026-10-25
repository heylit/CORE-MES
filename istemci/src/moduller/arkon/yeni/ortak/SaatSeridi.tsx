import { useEffect, useId, useState, type ReactNode } from 'react';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { useTema } from '../../../../ortak/veri/tema.ts';
import { saat } from '../cekirdek/bicim.ts';
import { anlikVardiya } from '../cekirdek/vardiya.ts';
import { useArkon, useSimdi } from '../veri/baglam.ts';
import { BaglantiDurumu } from './BaglantiDurumu.tsx';

// Eski sayfa üst çubuklarının sağ ucu (PrepTop, QTop, LabTop, PageShell): öteki Arkon sayfalarına kısayollar ve saat. Saatin altında
// sayfanın yazısı ya da (verilmezse) anlık vardiya yazar; saatin solunda bağlantı durumu. Kısayol, kişinin göremediği sayfa için çizilmez.
export interface Kisayol { sayfa: string; simge: SimgeAdi; metin: string; yalnizSimge?: boolean }

function Kisayollar({ kisayollar }: { kisayollar: readonly Kisayol[] }) {
  const { git, sayfaGorunur } = useArkon();
  return (
    <>
      {kisayollar.filter((k) => sayfaGorunur(k.sayfa)).map((k) => (
        <Dugme key={k.sayfa} simge={k.simge} onClick={() => git(k.sayfa)} title={k.metin} aria-label={k.yalnizSimge ? k.metin : undefined}>
          {k.yalnizSimge ? null : k.metin}
        </Dugme>
      ))}
    </>
  );
}

export function SaatSeridi({ kisayollar = [], alt }: { kisayollar?: readonly Kisayol[]; alt?: string }) {
  const { ayarlar } = useArkon();
  const simdi = useSimdi(30000);
  return (
    <>
      <Kisayollar kisayollar={kisayollar} />
      <BaglantiDurumu />
      <span className="tc-ay-saat"><b className="mono">{saat(simdi)}</b><small>{alt ?? anlikVardiya(simdi, ayarlar.vardiyalar, ayarlar.tatiller).label}</small></span>
    </>
  );
}

// Sayfa rozetinin rengi (eski PageShell `color`): yalnız durum değişkenleri; lab eski Çizim stüdyosunun moru (mavi ile kırmızının karışımı).
export type BantRengi = 'run' | 'stop' | 'done' | 'hazard' | 'ink' | 'lab';

// Eski üst bant (PageShell, PrepTop, LabTop, SettingsApp header.top, soru 497/4 a): "ÜRETİM HAZIRLIK" markası, renkli sayfa rozeti,
// sayfanın araçları, sağda kısayollar, bağlantı durumu, büyük saat ve tema düğmesi; altında rozet renginde ışık çizgisi.
// Tema TMI'nin tek temasıdır; Arkon'un ayrı teması yoktur.
// Dar ekranda (eski bant 360'ta yalnız marka, tema ve kullanıcıydı) bant tek satır kalır: kısayollar, tema ve `ekMenude` verilince
// sayfanın araçları "Diğer" menüsüne girer. Görünüm seçici gibi sayfanın ana aracı menüye girmez, alt satıra iner.
// Öğeler tek kez çizilir; geniş ekranda gruplar `display: contents` ile bandın öğesi olur.
// Eski Ayarlar bandında tema düğmesi yoktu (tema ayar kartındaydı): `temaDugmesi` false verilir.
export function ArkonBandi({ simge, baslik, renk = 'hazard', ek, ekMenude = false, kisayollar, alt, temaDugmesi = true }: {
  simge: SimgeAdi; baslik: string; renk?: BantRengi; ek?: ReactNode; ekMenude?: boolean; kisayollar?: readonly Kisayol[]; alt?: string; temaDugmesi?: boolean;
}) {
  const { tema, degistir } = useTema();
  const [acik, acikYaz] = useState(false);
  const menu = useId();
  const kisayolVar = (kisayollar?.length ?? 0) > 0;
  const menudeEk = ekMenude && Boolean(ek);
  const digerVar = menudeEk || kisayolVar || temaDugmesi;
  useEffect(() => {
    if (!acik) return undefined;
    const kapat = (e: KeyboardEvent) => { if (e.key === 'Escape') acikYaz(false); };
    window.addEventListener('keydown', kapat);
    return () => window.removeEventListener('keydown', kapat);
  }, [acik]);
  return (
    <header className="tc-ay-bant" data-renk={renk} data-acik={acik ? '' : undefined}>
      <span className="tc-ay-marka" aria-hidden="true"><i className="tc-ay-isaret" /><b>Üretim</b><small>Hazırlık</small></span>
      <span className="tc-ay-ayrac" aria-hidden="true" />
      <h2 className="tc-ay-rozet"><Simge ad={simge} />{baslik}</h2>
      {ek && !menudeEk ? <div className="tc-ay-bant-ek">{ek}</div> : null}
      {digerVar ? (
        <div id={menu} className="tc-ay-bant-araclar" onClick={() => acikYaz(false)}>
          {menudeEk ? ek : null}
          {kisayolVar ? <span className="tc-ay-bant-kisayol"><Kisayollar kisayollar={kisayollar ?? []} /></span> : null}
          {temaDugmesi ? <span className="tc-ay-bant-tema"><Dugme simge={tema === 'dark' ? 'sun' : 'moon'} onClick={degistir} aria-label="Tema değiştir" title="Tema değiştir" /></span> : null}
        </div>
      ) : null}
      <span className="tc-ay-bosluk" />
      <SaatSeridi {...(alt ? { alt } : {})} />
      {digerVar ? <span className="tc-ay-diger"><Dugme simge="more" aria-label="Diğer" title="Diğer" aria-expanded={acik} aria-controls={menu} onClick={() => acikYaz(!acik)} /></span> : null}
    </header>
  );
}
