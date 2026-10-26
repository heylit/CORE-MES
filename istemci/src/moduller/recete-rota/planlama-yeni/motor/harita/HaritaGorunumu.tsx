import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { DonemOlcegi, PlanlamaSecimi } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { saatYaz, type Derleme, type OkunanPlan } from '../kurallar.ts';
import { degisken, yuzde } from '../ortak.tsx';
import { Harita, type HaritaBagi, type HaritaKomutu, type HaritaSecimi, type KareDinleyicisi } from './Harita.tsx';
import {
  bitisIzleri, gecMetin, haritaGruplari, sahneKur, seritEtiketleri, yerlesim, zamanSinirla, type Aralik,
} from './kurallar.ts';
import { KilavuzKarti } from './Kilavuz.tsx';
import { HaritaOkuma } from './Okuma.tsx';

// Harita görünümü (y-atolye sAtolye, zm-ozet ozHarita, zo-kontrol, zj-gorunum sgHtml): bütün alanı kaplayan harita; üstünde görünüm çubuğu ve
// "Haritayı okuma", sağda kılavuz kartı, sağ altta yakınlık, altta oynatıcı ve zaman şeridi.
const HIZLAR = [1, 4, 24];
const hizAdi = (h: number) => (h === 24 ? '1 gün' : `${h} sa`);

interface Ozellikler {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; olcek: DonemOlcegi; r: Aralik; now: number;
  secim: PlanlamaSecimi; sec: (s: Partial<PlanlamaSecimi>) => void; mercek: 'durum' | 'etki';
  kilavuz: boolean; ornek: string | null; kilavuzAc: (v: boolean) => void; ciftTik: (m: string) => void;
  ust: ReactNode; komut?: (k: HaritaKomutu | null) => void;
  fark?: OkunanPlan | null;
  // Haritanın üstündeki kart katmanı (zc-tahta tkKatman); bağla birlikte kurulur.
  katman?: (b: HaritaBagi) => ReactNode;
}

export function HaritaGorunumu(o: Ozellikler) {
  const { c, p, cx, r, now } = o;
  const harita = useRef<HaritaKomutu | null>(null);
  const kok = useRef<HTMLElement>(null); const ustEl = useRef<HTMLDivElement>(null); const altEl = useRef<HTMLDivElement>(null);
  const [oynat, setOynat] = useState(false);
  const [hiz, setHiz] = useState(4);
  const [okuma, setOkuma] = useState(false);
  const [altPay, setAltPay] = useState(80);
  const sahne = useMemo(() => sahneKur(c.D, p, cx, yerlesim(haritaGruplari(c.D, p, cx), 1000, 600), r, now), [c, p, cx, r, now]);
  const son = sahne.son;
  const t = zamanSinirla(o.secim.zaman, now, son);
  const [canli, setCanli] = useState(t);
  useEffect(() => { if (!oynat) setCanli(t); }, [t, oynat]);
  const sj = o.secim.adim && p.ops[o.secim.adim] ? p.ops[o.secim.adim]?.job ?? null : o.secim.siparis;

  const komutKur = useCallback((k: HaritaKomutu | null) => { harita.current = k; o.komut?.(k); }, [o]);
  // Kılavuz kendiliğinden açılmaz: eski sayfa taze tarayıcıda da Özet'te ve Harita'da açmadı (denetim 2, A8); Başka menüsünden açılır.
  // Alttaki oynatıcının boyu yerleşimden düşülür.
  useEffect(() => {
    const el = altEl.current; if (!el || typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => setAltPay(el.offsetHeight || 80)); ro.observe(el); setAltPay(el.offsetHeight || 80); return () => ro.disconnect();
  }, []);
  const paylar = useCallback((): [number, number] => {
    const k = kok.current?.getBoundingClientRect(); if (!k) return [0, 0];
    const u = ustEl.current ? Math.max(0, ustEl.current.getBoundingClientRect().bottom - k.top) : 0;
    let a = altEl.current?.offsetHeight ? Math.max(0, k.bottom - altEl.current.getBoundingClientRect().top) : 0; if (a > k.height / 2) a = 0;
    return [u, a];
  }, []);

  const dinleyici = useRef(new Set<KareDinleyicisi>());
  const kare = useCallback<KareDinleyicisi>((...a) => { for (const f of dinleyici.current) f(...a); }, []);
  const bag = useMemo((): HaritaBagi => ({
    abone: (f) => { dinleyici.current.add(f); return () => { dinleyici.current.delete(f); }; }, komut: () => harita.current, paylar,
  }), [paylar]);

  // Sona gelmiş imleç oynatınca baştan başlar; durunca imlecin yeri ortak seçime yazılır.
  const oynatDegistir = useCallback(() => {
    if (oynat) { setOynat(false); o.sec({ zaman: canli }); return; }
    if (canli >= son - 0.25) { setCanli(now); o.sec({ zaman: now }); }
    setOynat(true);
  }, [oynat, canli, son, now, o]);
  const bitti = useCallback((z: number) => { setOynat(false); o.sec({ zaman: z }); }, [o]);
  const secHarita = useCallback((s: HaritaSecimi) => { o.sec(s); }, [o]);
  const sipSec = (j: string) => {
    o.kilavuzAc(false); const yeni = sj === j ? null : j; o.sec({ siparis: yeni, adim: null, tezgah: null }); if (yeni) harita.current?.odakla(yeni);
  };
  const iz = useMemo(() => bitisIzleri(c.D, sahne, cx), [c, sahne, cx]);
  const etiketler = useMemo(() => seritEtiketleri(c.D, o.olcek, now, son), [c, o.olcek, now, son]);
  const W = son - now; const secIz = sj ? iz.ic.find((x) => x.id === sj) : undefined;

  return (
    <section ref={kok} className="tc-pym-at" aria-label="Tezgâh haritası">
      <Harita
        ref={komutKur} bicim="harita" c={c} p={p} cx={cx} olcek={o.olcek} r={r} now={now} t={t} oynat={oynat} hiz={hiz}
        secim={o.secim} mercek={o.mercek} kilavuz={o.kilavuz ? o.ornek : null} altPay={altPay} paylar={paylar}
        sec={secHarita} ciftTik={o.ciftTik} oynatDegistir={oynatDegistir} kilavuzKapat={() => o.kilavuzAc(false)}
        zamanAkti={setCanli} oynatBitti={bitti} fark={o.fark} kare={kare}
        etiket="Atölye haritası: istasyonlar tezgâhlar, halkalar yedi günlük doluluk, yaylar parça akışı, noktalar akan parçalar. Tıklayarak seçin, çipleri başka istasyona sürükleyerek taşıyın."
      />
      {o.katman?.(bag)}
      <div ref={ustEl} className="tc-pym-at-ust">{o.ust}</div>
      <div className="tc-pym-hl" data-acik={okuma ? '' : undefined}>
        <button type="button" aria-expanded={okuma} onClick={() => setOkuma((x) => !x)}><Simge ad="help" boyut="k" /><span>Haritayı okuma</span><Simge ad="down" boyut="k" /></button>
        {okuma && <HaritaOkuma />}
      </div>
      {o.kilavuz && <KilavuzKarti ornek={o.ornek} kapat={() => o.kilavuzAc(false)} />}
      <div className="tc-pym-sg-zum" role="group" aria-label="Yakınlık">
        <button type="button" aria-label="Uzaklaş (-)" title="Uzaklaş (-)" onClick={() => harita.current?.yakinlas(0.8)}><Simge ad="minus" boyut="k" /></button>
        <button type="button" aria-label="Sığdır (F)" title="Sığdır (F)" onClick={() => harita.current?.sigdir()}><Simge ad="fit" boyut="k" /></button>
        <button type="button" aria-label="Yakınlaş (+)" title="Yakınlaş (+)" onClick={() => harita.current?.yakinlas(1.25)}><Simge ad="plus" boyut="k" /></button>
      </div>
      <div ref={altEl} className="tc-pym-at-alt">
        <div className="tc-pym-at-oynat">
          <button type="button" className="tc-dugme tc-dugme-birincil tc-pym-kucuk tc-pym-simge-d" aria-label={oynat ? 'Durdur' : 'Oynat'} title={oynat ? 'Durdur' : 'Oynat'} onClick={oynatDegistir}>
            <Simge ad={oynat ? 'pause' : 'play'} boyut="k" />
          </button>
          <button type="button" className="tc-dugme tc-pym-kucuk" title={`Oynatma hızı: saniyede ${hizAdi(hiz)}; değiştirmek için basın`}
            onClick={() => setHiz((h) => HIZLAR[(HIZLAR.indexOf(h) + 1) % HIZLAR.length] ?? 4)}>{hizAdi(hiz)}/sn</button>
          <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet" onClick={() => { setCanli(now); o.sec({ zaman: now }); }}><Simge ad="first" boyut="k" />Şimdi</button>
          <b className="tc-pym-mono tc-pym-at-saat">{saatYaz(c.D, canli)}</b>
        </div>
        <div className="tc-pym-at-serit">
          <div className="tc-pym-at-gunler-s" aria-hidden="true">
            {etiketler.map(([x, e]) => <span key={`${x}-${e}`} ref={degisken({ '--x': yuzde(x) })}>{e}</span>)}
          </div>
          <div className="tc-pym-at-iz">
            {iz.ic.map((b) => (
              <button key={b.id} type="button" className="tc-pym-at-bit" ref={degisken({ '--x': yuzde(b.x), '--ln': b.ln })}
                data-gec={b.gec ? '' : undefined} data-secili={sj === b.id ? '' : undefined} onClick={() => sipSec(b.id)}
                title={`${b.id} bitiş ${saatYaz(c.D, b.C)}${b.gec ? ` · ${gecMetin(b.T)} geç` : ' · termine yetişiyor'}`}>
                <span className="tc-gizli-etiket">{b.id}</span>
              </button>
            ))}
            {secIz && secIz.due != null && secIz.due > now && secIz.due < now + W && (
              <i className="tc-pym-at-termin" data-secili="" ref={degisken({ '--x': yuzde((secIz.due - now) / W) })} />
            )}
            {iz.ote.length > 0 && <span className="tc-pym-at-ote tc-pym-mono" title={`${iz.ote.join(', ')} seçili dönemden sonra bitiyor`}>+{iz.ote.length}</span>}
          </div>
          <input type="range" min={now} max={son} step={0.25} value={canli} aria-label="Zaman imleci"
            onChange={(e) => { const z = Number(e.target.value); setOynat(false); setCanli(z); o.sec({ zaman: z }); }} />
        </div>
      </div>
    </section>
  );
}
