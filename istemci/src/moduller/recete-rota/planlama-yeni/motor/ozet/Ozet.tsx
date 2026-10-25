import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { DonemOlcegi, PlanlamaSecimi } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { Harita, type HaritaKomutu, type HaritaSecimi } from '../harita/Harita.tsx';
import type { Aralik } from '../harita/kurallar.ts';
import { HaritaOkuma } from '../harita/Okuma.tsx';
import type { Derleme, OkunanPlan } from '../kurallar.ts';
import { degisken } from '../ortak.tsx';
import { Bekleme, Canli, Gostergeler, Pano, Sure, Yaris, Yorumlar, Yuk } from './bolumler.tsx';
import { cevap, gostergeler, konum, secim, yorumlar, type BolgeKimligi, type OzetVerisi, type Yorum } from './veri.ts';

// Özet görünümü (zm-ozet.betik, zo-kontrol): altı bölüm ve tezgâh haritası bir ızgarada. Bölüm sırası ve ızgara yerleri eski sayfanınkidir;
// harita hücresinde tekerlek sayfayı kaydırır, harita Ctrl ile yakınlaşır.

export interface OzetDurumu {
  nasil: BolgeKimligi | null; acikGrup: string | null; secJob: string | null; secTez: string | null; zaman: number;
}
interface Ozellikler {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; v: OzetVerisi; d: OzetDurumu; tezGrup: (m: string) => string;
  r: Aralik; olcek: DonemOlcegi; now: number; secim: PlanlamaSecimi; sec: (s: Partial<PlanlamaSecimi>) => void; mercek: 'durum' | 'etki';
  komut: (k: HaritaKomutu | null) => void; ciftTik: (m: string) => void;
  kilavuz: string | null; kilavuzKapat: () => void;
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
      <HaritaHucresi {...o} />
    </div>
  );
}

// Tezgâh haritası hücresi (zm-ozet brKatman, zo-kontrol): başlık, yakınlık, Büyüt, okuma açıklaması ve tuval; oynatıcı yok, zaman imleci Özet'inki.
function HaritaHucresi(o: Ozellikler) {
  const harita = useRef<HaritaKomutu | null>(null);
  const [yuzde, setYuzde] = useState(100);
  const [ipucu, setIpucu] = useState(false);
  const z = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (z.current) clearTimeout(z.current); }, []);
  const ipucuGoster = useCallback(() => { setIpucu(true); if (z.current) clearTimeout(z.current); z.current = setTimeout(() => setIpucu(false), 1400); }, []);
  const { komut, sec } = o;
  const komutKur = useCallback((k: HaritaKomutu | null) => { harita.current = k; komut(k); }, [komut]);
  const secHarita = useCallback((s: HaritaSecimi) => sec(s), [sec]);
  const paylar = useCallback((): [number, number] => [0, 0], []);
  return (
    <section className="tc-pym-oz-harita" data-b="harita" aria-label="Tezgâh haritası">
      <header>
        <Simge ad="cpu" boyut="k" /><b>Tezgâh haritası</b><small>Ctrl + tekerlek ya da iki parmakla yakınlaşır; tezgâha dokun, seç</small>
        <span className="tc-pym-oz-zum" role="group" aria-label="Yakınlık">
          <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Uzaklaş" aria-label="Uzaklaş" onClick={() => harita.current?.yakinlas(0.8)}><Simge ad="minus" boyut="k" /></button>
          <b className="tc-pym-mono" title="Bütün atölyeye göre yakınlık">%{yuzde}</b>
          <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Yakınlaş" aria-label="Yakınlaş" onClick={() => harita.current?.yakinlas(1.25)}><Simge ad="plus" boyut="k" /></button>
          <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Sığdır" aria-label="Sığdır" onClick={() => harita.current?.sigdir()}><Simge ad="fit" boyut="k" /></button>
        </span>
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet" onClick={o.buyut}><Simge ad="fit" boyut="k" />Büyüt</button>
      </header>
      <details className="tc-pym-oz-lj">
        <summary><Simge ad="help" boyut="k" />Haritayı okuma: çizgiler, hareket ve renkler</summary>
        <HaritaOkuma />
      </details>
      <div className="tc-pym-oz-yer" data-ipucu={ipucu ? '' : undefined}>
        <Harita
          ref={komutKur} bicim="ozet" c={o.c} p={o.p} cx={o.cx} olcek={o.olcek} r={o.r} now={o.now} t={o.d.zaman} oynat={false} hiz={4}
          secim={o.secim} mercek={o.mercek} kilavuz={o.kilavuz} altPay={80} paylar={paylar} sec={secHarita} ciftTik={o.ciftTik}
          oynatDegistir={() => undefined} kilavuzKapat={o.kilavuzKapat} yakinlikDegisti={setYuzde} ipucuZum={ipucuGoster}
          etiket="Atölye haritası: istasyonlar tezgâhlar, halkalar yedi günlük doluluk, yaylar parça akışı, noktalar akan parçalar. Tıklayarak seçin, çipleri başka istasyona sürükleyerek taşıyın."
        />
        <span className="tc-pym-oz-ipucu" aria-hidden="true">Yakınlaştırmak için Ctrl + tekerlek</span>
      </div>
    </section>
  );
}
