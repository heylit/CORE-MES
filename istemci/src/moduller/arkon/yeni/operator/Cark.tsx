import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { IS_DURUMLARI, type IsDurumu } from '../cekirdek/sabitler.ts';
import type { Is } from './tipler.ts';
import './cark.css';

/* 790: iş ve makine çarkı (CNC Kurulum'un kart dizisi gibi). Tek çark, şerit başına bir liste. Çevirmek yalnız bakar: düğme, yana
   kaydırma, fare tekerleği (üstündeyken) ve ←/→ ekrandaki işi değiştirmez; geçiş ve seçim şeridin kendi eylemidir. Ekrandaki öğe
   verilen içerikle (iş kartı) çizilir; yandakiler kenardan görünür. Tekerlek sayfayı kaydırmasın diye dinleyici edilgen değildir. */

export interface CarkSeridi {
  anahtar: string;
  ad: string;
  simge: SimgeAdi;
  sayi: number;
  // Ekrandaki öğenin sırası; ekranda öğesi olmayan şeritte (makineler) -1.
  etkin: number;
  bak: number;
  bakYaz: (i: number) => void;
  ciz: (i: number, merkez: boolean) => ReactNode;
  eylem: (i: number) => ReactNode;
}

// Çizilen komşu sayısı: ötesi görünmez, DOM'a da girmez.
const KOMSU = 2;

export function TerminalCarki({ seritler, ilk = 0 }: { seritler: readonly CarkSeridi[]; ilk?: number }) {
  const [sec, secYaz] = useState(ilk);
  const s = seritler[Math.min(sec, seritler.length - 1)];
  const kok = useRef<HTMLDivElement>(null);
  const tutus = useRef<number | null>(null);
  const n = s ? s.sayi : 0;
  const bak = s ? Math.min(Math.max(s.bak, 0), Math.max(n - 1, 0)) : 0;
  const adim = (d: number) => { if (s && n > 0) s.bakYaz(Math.min(n - 1, Math.max(0, bak + d))); };
  const adimRef = useRef(adim);
  adimRef.current = adim;
  useEffect(() => {
    const el = kok.current;
    if (!el) return undefined;
    let son = 0;
    const teker = (e: WheelEvent) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      e.preventDefault();
      if (Math.abs(d) < 4 || e.timeStamp - son < 250) return;
      son = e.timeStamp;
      adimRef.current(d > 0 ? 1 : -1);
    };
    el.addEventListener('wheel', teker, { passive: false });
    return () => el.removeEventListener('wheel', teker);
  }, []);
  if (!s) return null;
  const sira: number[] = [];
  for (let i = Math.max(0, bak - KOMSU); i <= Math.min(n - 1, bak + KOMSU); i++) sira.push(i);
  const baska = s.etkin >= 0 && bak !== s.etkin;
  return (
    <section className="tc-ay1-tcark" aria-label="İş ve makine çarkı" data-baska={baska || undefined}>
      <div className="tc-ay1-tcark-ust">
        {seritler.length > 1 ? (
          <div className="tc-ay1-tcark-serit" role="group" aria-label="Çark şeridi">
            {seritler.map((x, i) => (
              <button key={x.anahtar} type="button" aria-pressed={x === s} onClick={() => secYaz(i)}><Simge ad={x.simge} boyut="k" />{x.ad} · {x.sayi}</button>
            ))}
          </div>
        ) : <span className="tc-ay1-ust-yazi">{s.ad}</span>}
        <span className="tc-ay1-bosluk" />
        <b className="tc-ay1-mono tc-ay1-tcark-konum">{n ? `${bak + 1} / ${n}` : '0'}</b>
      </div>
      <div
        ref={kok} className="tc-ay1-tcark-sahne" role="group" aria-roledescription="çark" aria-label={s.ad} tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); adim(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); adim(1); } else if (e.key === 'Escape' && s.etkin >= 0) s.bakYaz(s.etkin);
        }}
        onPointerDown={(e) => { tutus.current = e.clientX; }}
        onPointerUp={(e) => { const x = tutus.current; tutus.current = null; if (x !== null && Math.abs(e.clientX - x) > 40) adim(e.clientX < x ? 1 : -1); }}
        onPointerCancel={() => { tutus.current = null; }}
      >
        {sira.map((i) => {
          const fark = i - bak;
          return (
            <div key={i} className="tc-ay1-tcark-oge" data-fark={fark} aria-hidden={fark !== 0 || undefined} onClick={fark ? () => s.bakYaz(i) : undefined}>
              {s.ciz(i, fark === 0)}
            </div>
          );
        })}
      </div>
      <div className="tc-ay1-tcark-alt">
        <button type="button" className="tc-ay1-simge-dugme" aria-label={`Önceki: ${s.ad.toLocaleLowerCase('tr')}`} disabled={bak <= 0} onClick={() => adim(-1)}><Simge ad="chev-left" /></button>
        <div className="tc-ay1-tcark-eylem" aria-live="polite">{n ? s.eylem(bak) : null}</div>
        <button type="button" className="tc-ay1-simge-dugme" aria-label={`Sonraki: ${s.ad.toLocaleLowerCase('tr')}`} disabled={bak >= n - 1} onClick={() => adim(1)}><Simge ad="chev-right" /></button>
      </div>
    </section>
  );
}

const durumRengi = (s: string) => IS_DURUMLARI[s as IsDurumu]?.durum ?? 'sirada';
const durumAdi = (s: string): string => IS_DURUMLARI[s as IsDurumu]?.etiket ?? s;

// Çarkta ekranda olmayan iş: önizleme kartı. Ekrandaki işin kartı terminalin kendi iş kartıdır.
export function IsOnizKarti({ is, siradaki }: { is: Is; siradaki: boolean }) {
  return (
    <article className="tc-ay1-tcark-kart" data-durum={durumRengi(is.state)}>
      <span className="tc-ay1-tcark-etiketler">
        <span className="tc-ay1-cip" data-durum={durumRengi(is.state)}><i aria-hidden="true" />{durumAdi(is.state)}</span>
        {siradaki ? <span className="tc-ay1-etiket">Sıradaki</span> : null}
        {is.urgent ? <span className="tc-ay1-etiket" data-durum="durdu">Acil</span> : null}
      </span>
      <b className="tc-ay1-mono">{is.no}</b>
      <span className="tc-ay1-tcark-ad">{is.part || '—'}</span>
      <small>{[is.op, is.pkg?.partNo].filter(Boolean).join(' · ')}</small>
      {is.empty ? null : <small className="tc-ay1-mono">{is.good} / {is.target} adet</small>}
    </article>
  );
}

export interface CarkMakinesi { id: string; ad?: string | undefined; secili: boolean; plan: boolean; kilit: string | null }

export function MakineKarti({ makine }: { makine: CarkMakinesi }) {
  const durum = makine.kilit ? 'durdu' : makine.secili ? 'calisiyor' : 'sirada';
  return (
    <article className="tc-ay1-tcark-kart" data-durum={durum}>
      <span className="tc-ay1-tcark-etiketler">
        <span className="tc-ay1-cip" data-durum={durum}>{makine.kilit ? <Simge ad="lock" boyut="k" /> : <i aria-hidden="true" />}{makine.kilit ? 'Kilitli' : makine.secili ? 'Seçili' : 'Seçilebilir'}</span>
        {makine.plan ? <span className="tc-ay1-etiket">Plan</span> : null}
      </span>
      <b className="tc-ay1-mono">{makine.id}</b>
      <span className="tc-ay1-tcark-ad">{makine.ad || makine.id}</span>
      {makine.kilit ? <small>{makine.kilit}</small> : null}
    </article>
  );
}

// İş şeridinin eylemi: ekrandaki işte bilgi, başka işte önizleme notu, dönüş ve açık geçiş düğmesi.
export function IsEylemi({ ekranda, don, gec }: { ekranda: boolean; don: () => void; gec: (() => void) | null }) {
  if (ekranda) return <span className="tc-ay1-tcark-not"><i className="tc-ay1-tcark-nokta" aria-hidden="true" />Ekranda · sayaç ve eylemler bu işe yazılır</span>;
  return (
    <>
      <span className="tc-ay1-tcark-not"><Simge ad="eye" boyut="k" />Önizleme · ekrandaki iş değişmez</span>
      <span className="tc-ay1-tcark-dugmeler">
        <Dugme onClick={don}>Ekrandakine dön</Dugme>
        {gec ? <Dugme tur="birincil" simge="next" onClick={gec}>Bu işe geç</Dugme> : null}
      </span>
    </>
  );
}

// Makine şeridinin eylemi: seçim kuralı makine seçicininkidir (çalışan işte değişmez, ayrılmış makine seçilemez).
export function MakineEylemi({ makine, engel, ozet, degistir }: { makine: CarkMakinesi; engel: string | null; ozet: string; degistir: () => void }) {
  if (makine.kilit) return <span className="tc-ay1-tcark-not"><Simge ad="lock" boyut="k" />{makine.kilit}</span>;
  return (
    <>
      <span className="tc-ay1-tcark-not">{engel ?? ozet}</span>
      {engel ? null : (
        <span className="tc-ay1-tcark-dugmeler">
          <Dugme tur={makine.secili ? 'ikincil' : 'birincil'} simge={makine.secili ? 'x' : 'check'} aria-pressed={makine.secili} onClick={degistir}>
            {makine.secili ? 'Seçimden çıkar' : 'Bu makinede çalış'}
          </Dugme>
        </span>
      )}
    </>
  );
}

export interface CarkIstasyonu { id: string; ad: string; merkez: string; bu: boolean }

export function IstasyonKarti({ istasyon }: { istasyon: CarkIstasyonu }) {
  return (
    <article className="tc-ay1-tcark-kart" data-durum={istasyon.bu ? 'calisiyor' : 'sirada'}>
      <span className="tc-ay1-tcark-etiketler">
        {istasyon.bu ? <span className="tc-ay1-cip" data-durum="calisiyor"><i aria-hidden="true" />Bu cihaz</span> : <span className="tc-ay1-cip" data-durum="sirada"><i aria-hidden="true" />Yetkili</span>}
      </span>
      <b className="tc-ay1-mono">{istasyon.id}</b>
      <span className="tc-ay1-tcark-ad">{istasyon.ad || istasyon.id}</span>
      {istasyon.merkez ? <small>{istasyon.merkez}</small> : null}
    </article>
  );
}

// İstasyon şeridinin eylemi: geçiş istasyon seçicinin işini yapar (cihazın istasyonu değişir, ekran baştan kurulur). Öteki istasyonun
// işleri önizlenmez: dosyaları bu cihaza inmez (726 a).
export function IstasyonEylemi({ bu, gec }: { bu: boolean; gec: () => void }) {
  if (bu) return <span className="tc-ay1-tcark-not"><i className="tc-ay1-tcark-nokta" aria-hidden="true" />Bu cihazın istasyonu · kayıtlar buraya yazılır</span>;
  return (
    <>
      <span className="tc-ay1-tcark-not">Geçince cihazın istasyonu değişir; kayıtlar o istasyona yazılır</span>
      <span className="tc-ay1-tcark-dugmeler"><Dugme tur="birincil" simge="next" onClick={gec}>Bu istasyona geç</Dugme></span>
    </>
  );
}
