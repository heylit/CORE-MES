import { useMemo } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { degisken, HAZIRLANIYOR } from '../ortak.tsx';
import { Bekleme, Canli, Gostergeler, Pano, Sure, Yaris, Yorumlar, Yuk } from './bolumler.tsx';
import { cevap, gostergeler, konum, secim, yorumlar, type BolgeKimligi, type OzetVerisi, type Yorum } from './veri.ts';

// Özet görünümü (zm-ozet.betik, zo-kontrol): altı bölüm ve tezgâh haritası bir ızgarada. Bölüm sırası ve ızgara yerleri eski sayfanınkidir;
// harita hücresi haritayla gelir (P1b), yeri ve başlığı şimdiden durur.
const HARITA_OKUMA: [string, string, string][] = [
  ['yay', 'Çizgi', 'iş bir tezgâhtan sonrakine geçer; kalın çizgi daha çok iş'],
  ['akis', 'Akan noktalar', 'akışın yönü'],
  ['parca', 'Renkli top', 'iki adım arasında yolda olan parça, siparişin renginde; kırmızı halka geç sipariş'],
  ['fark', 'Sarı kesik', 'önceki plana göre değişen akış'],
  ['serit', 'Kartın üst şeridi', 'yeşil çalışıyor, gri boşta ya da fason, kırmızı arıza'],
  ['nabiz', 'Kırmızı parıltı', "tezgâh bugün %97'den çok dolu (darboğaz)"],
  ['gun', 'Yedi çubuk', 'haftanın günlerinde doluluk: yeşil, sarı %75 üstü, kırmızı %97 üstü; altı çizili gün bugün'],
  ['sira', 'SIRA', 'tezgâhta bekleyen işler, siparişin renginde'],
];

export interface OzetDurumu {
  nasil: BolgeKimligi | null; acikGrup: string | null; secJob: string | null; secTez: string | null; zaman: number;
}
interface Ozellikler {
  c: PlanlamaCalismasi; v: OzetVerisi; d: OzetDurumu; tezGrup: (m: string) => string;
  nasilAc: (id: BolgeKimligi) => void; grupAc: (g: string) => void; sipSec: (j: string, birak?: boolean) => void; tezSec: (m: string, birak?: boolean) => void;
  gunSec: (d: number) => void; buyut: () => void;
}

export function Ozet(o: Ozellikler) {
  const { c, v, d } = o;
  const yor = useMemo(() => yorumlar(c, v, o.tezGrup), [c, v, o.tezGrup]);
  const sec = useMemo(() => secim(v, d.secJob, d.secTez, o.tezGrup), [v, d.secJob, d.secTez, o.tezGrup]);
  const kpi = useMemo(() => gostergeler(c, v, o.tezGrup), [c, v, o.tezGrup]);
  const t = d.zaman; const gun = Math.min(v.gun - 1, Math.floor((t - v.T0) / 24 / v.kova));
  // "Yakından bak": bölüm görünür alana gelir ve odağı alır (eski sayfada tahtanın kamerası bölgeye uçardı).
  const yakindan = (el: HTMLElement | null) => { el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); el?.querySelector<HTMLElement>('.tc-pym-br-soru')?.focus(); };
  const pano = (id: BolgeKimligi) => ({ id, cevap: cevap(c, v, id, yor), nasil: d.nasil === id, nasilAc: () => o.nasilAc(id), yakindan });
  // Yorumun bağlantısı: sipariş ve tezgâh seçilir; Reçete ve Rota kartı kartlarla gelir.
  const eylem = (e: NonNullable<Yorum['eylem']>) => {
    const hedef = e.v;
    if (e.tur === 'br-git-sip' && hedef) return () => o.sipSec(hedef, false);
    if (e.tur === 'br-git-tez' && hedef) return () => o.tezSec(hedef, false);
    return null;
  };
  return (
    <div className="tc-pym-oz" data-vurgu={sec ? '' : undefined} ref={degisken({ '--f': konum(v, t).toFixed(4) })}>
      <Pano {...pano('ozet')} ek={<Canli c={c} v={v} t={t} />}><Gostergeler l={kpi} /></Pano>
      <Pano {...pano('bekle')}><Bekleme c={c} v={v} sec={sec} acikGrup={d.acikGrup} grupAc={o.grupAc} sipSec={o.sipSec} /></Pano>
      <Pano {...pano('yorum')}><Yorumlar l={yor} eylem={eylem} /></Pano>
      <Pano {...pano('yuk')}><Yuk c={c} v={v} sec={sec} gun={gun} gunSec={o.gunSec} tezSec={o.tezSec} tezGrup={o.tezGrup} /></Pano>
      <Pano {...pano('yaris')}><Yaris c={c} v={v} sec={sec} sipSec={o.sipSec} /></Pano>
      <Pano {...pano('sure')}><Sure v={v} sipSec={o.sipSec} /></Pano>
      <section className="tc-pym-oz-harita" data-b="harita" aria-label="Tezgâh haritası">
        <header>
          <Simge ad="cpu" boyut="k" /><b>Tezgâh haritası</b><small>Ctrl + tekerlek ya da iki parmakla yakınlaşır; tezgâha dokun, seç</small>
          <span className="tc-pym-oz-zum" role="group" aria-label="Yakınlık">
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-disabled="true" title={`Uzaklaş: ${HAZIRLANIYOR}`} aria-label="Uzaklaş"><Simge ad="minus" boyut="k" /></button>
            <b className="tc-pym-mono" title="Bütün atölyeye göre yakınlık">%100</b>
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-disabled="true" title={`Yakınlaş: ${HAZIRLANIYOR}`} aria-label="Yakınlaş"><Simge ad="plus" boyut="k" /></button>
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-disabled="true" title={`Sığdır: ${HAZIRLANIYOR}`} aria-label="Sığdır"><Simge ad="fit" boyut="k" /></button>
          </span>
          <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet" onClick={o.buyut}><Simge ad="fit" boyut="k" />Büyüt</button>
        </header>
        <details className="tc-pym-oz-lj">
          <summary><Simge ad="help" boyut="k" />Haritayı okuma: çizgiler, hareket ve renkler</summary>
          <ul className="tc-pym-lj" aria-label="Haritanın açıklaması">
            {HARITA_OKUMA.map(([k, ad, m]) => <li key={k}><i className="tc-pym-lj-i" data-lj={k} aria-hidden="true" /><b>{ad}</b><span>{m}</span></li>)}
          </ul>
        </details>
        <div className="tc-pym-oz-yer"><p className="tc-pym-oz-hazir"><Simge ad="cpu" boyut="o" />Tezgâh haritası: {HAZIRLANIYOR}</p></div>
      </section>
    </div>
  );
}
