import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Dugme, Orb, OrbGrubu, Simge, type MakineDurumu } from '../../../../ortak/arayuz/index.ts';
import { adimTuru } from '../../../../../../arkon/web/src/data/adim-turu.ts';
import { bitenleriAyir } from '../../../../../../arkon/web/src/data/biten-is.ts';
import { siraAnahtari } from '../../../../../../arkon/web/src/data/is-gecisi.ts';
import { numuneSeridi, type SeritDurumu, type SeritGirdisi, type SeritIlerlemesi } from '../../../../../../arkon/web/src/data/numune-seridi.ts';
import { parcaEtiketi } from '../../../../../../arkon/web/src/data/parca.ts';
import { istasyondakiKartlar, kartDoldu, sinirMetni, type RefakatKarti } from '../../../../../../arkon/web/src/data/refakat-karti.ts';
import { sayacGosterimi } from '../../../../../../arkon/web/src/data/sayac-halkasi.ts';
import { tmiEmirId } from '../../../../../../arkon/web/src/data/tmi-adim.ts';
import { topluGirisHatasi, topluGirisSayilari } from '../../../../../../arkon/web/src/data/toplu-giris.ts';
import { iki, sayi, sure } from '../cekirdek/bicim.ts';
import { IS_DURUMLARI, type IsDurumu } from '../cekirdek/sabitler.ts';
import type { ScrapReason } from '../cekirdek/tipler.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import type { DurusGerceklesmesi } from '../cekirdek/vardiya.ts';
import { yerel } from '../cekirdek/yerel.ts';
import { useSimdi } from '../veri/baglam.ts';
import { CAGRI_ASAMALARI, cagriTonu, durumDugmeleri, hazirlikSayisi, tonDurumu, type DurumDugmesi } from './kurallar.ts';
import type { Cagri, Gorev, GorevEylemi, Is } from './tipler.ts';

// Operatör ekranının parçaları (bilesenler.ts Queue, EtkinKart, Dial, Orbs; operator-parcalar.ts TaskCard, PlanBanner, TopluPanel,
// CallChip). Renk durum adıyla (data-durum) seçilir; her durum metniyle de yazılır.

const durumAdi = (s: string): string => IS_DURUMLARI[s as IsDurumu]?.etiket ?? s;
const durumRengi = (s: string) => IS_DURUMLARI[s as IsDurumu]?.durum ?? 'sirada';

function IsEtiketleri({ is }: { is: Is }) {
  const pe = parcaEtiketi(is.pkg);
  const at = adimTuru(is.pkg);
  return (
    <>
      {pe ? <div className="tc-ay1-adimtur"><span className="tc-ay1-etiket">{pe}</span></div> : null}
      {at ? <div className="tc-ay1-adimtur"><span className="tc-ay1-etiket">{at.etiket}</span>{at.aciklama ? <span className="tc-ay1-soluk">{at.aciklama}</span> : null}</div> : null}
    </>
  );
}
export { IsEtiketleri };

// 685: telefonda iş alanları tek satır özettir (emir · op · parça no); dokununca bütün alanlar açılır, sayaç ilk ekranda kalır.
export function IsOzeti({ is, acik, degistir }: { is: Is; acik: boolean; degistir: () => void }) {
  const ust = <span className="tc-ay1-ust-yazi">Aktif iş {is.urgent ? '· ACİL' : ''}</span>;
  if (is.empty) return <div className="tc-ay1-is-ozet"><span>{ust}<IsAlanlari is={is} /></span></div>;
  return (
    <button type="button" className="tc-ay1-is-ozet" aria-expanded={acik} onClick={degistir}>
      <span>{ust}{acik ? <IsAlanlari is={is} /> : <b className="tc-ay1-is-ozet-satir">{[is.no, is.op, is.pkg?.partNo].filter(Boolean).join(' · ')}</b>}</span>
      <Simge ad={acik ? 'up' : 'down'} boyut="k" />
    </button>
  );
}

/* ── işin başlığı (664, 673 a): etiketli alanlar, terminalin her boyutunda aynı sıra; geniş düzende emir no başlıktır ── */
export function IsAlanlari({ is, baslik = false }: { is: Is; baslik?: boolean }) {
  const pkg = is.pkg;
  // İşsiz istasyonda alan yok: "atanmış iş yok" ve istasyon satırı eskisi gibi düz yazılır.
  if (is.empty) return baslik ? <><h2 className="tc-ay1-is-baslik">{is.no}</h2><p>{is.part} · {is.op}</p></> : <><b>{is.no}</b><small>{is.part} · {is.op}</small></>;
  const alan = (etiket: string, deger: string | null | undefined, sinif?: string) => (
    <span className={sinif ? `tc-ay1-is-alan ${sinif}` : 'tc-ay1-is-alan'}>
      <span className="tc-ay1-ust-yazi">{etiket}</span>
      <b>{deger || '—'}</b>
    </span>
  );
  return (
    <span className="tc-ay1-is-alanlari">
      {alan('Proje', pkg?.proje)}
      <span className="tc-ay1-is-alan tc-ay1-is-alan-emir">
        <span className="tc-ay1-ust-yazi">Üretim emri</span>
        {baslik ? <h2 className="tc-ay1-is-baslik">{is.no}</h2> : <b className="tc-ay1-mono">{is.no}</b>}
      </span>
      {alan('Op', is.op)}
      {alan('Parça no', pkg?.partNo, 'tc-ay1-mono')}
      {alan('Parça adı', is.part)}
      {alan('Rev', pkg?.rev)}
    </span>
  );
}

/* ── "Şimdi" kartı ── */
export function GorevKarti({ gorev, eylem, ertele, izinli, ek }: {
  gorev: Gorev | null; eylem: (a: GorevEylemi, g: Gorev) => void; ertele: (g: Gorev) => void; izinli: (a: GorevEylemi) => boolean; ek?: ReactNode;
}) {
  if (!gorev) return null;
  const sinif = ['tc-ay1-gorev', gorev.pulse && 'tc-ay1-gorev-nabiz', gorev.quiet && 'tc-ay1-gorev-sessiz'].filter(Boolean).join(' ');
  return (
    <div key={gorev.t} className={sinif} data-durum={tonDurumu(gorev.tone)} role="status">
      <span className="tc-ay1-gorev-simge"><Simge ad={gorev.icon} /></span>
      <div className="tc-ay1-gorev-metin"><span className="tc-ay1-ust-yazi">Şimdi</span><b>{gorev.t}</b><small>{gorev.d}</small>{ek}</div>
      {gorev.act2 && gorev.btn2 && izinli(gorev.act2) ? <Dugme tur="ikincil" onClick={() => eylem(gorev.act2!, gorev)}>{gorev.btn2}</Dugme> : null}
      {gorev.btn && gorev.act && izinli(gorev.act) ? <Dugme simge="next" onClick={() => eylem(gorev.act!, gorev)}>{gorev.btn}</Dugme> : null}
      {gorev.dismiss ? (
        <button type="button" className="tc-ay1-gorev-ertele" onClick={() => ertele(gorev)} aria-label="Sonra hatırlat" title="10 dk sonra hatırlat"><Simge ad="x" /></button>
      ) : null}
    </div>
  );
}

/* ── numune planı şeridi (566): "Şimdi" kartının altında, Hazırlık'ın numune planı kural kural ve ilerlemesi ── */
const SERIT_GORUNUMU: Readonly<Record<SeritDurumu, { durum: MakineDurumu; simge: SimgeAdi }>> = {
  kalitede: { durum: 'bitti', simge: 'target' }, zamani: { durum: 'ayar', simge: 'alert' }, red: { durum: 'durdu', simge: 'x' },
  tamam: { durum: 'calisiyor', simge: 'check' }, siradaki: { durum: 'sirada', simge: 'clock' }, bekliyor: { durum: 'sirada', simge: 'clock' },
};

export function NumuneSeridi({ girdi }: { girdi: SeritGirdisi }) {
  const parcalar = numuneSeridi(girdi);
  if (!parcalar.length) return null;
  return (
    <ul className="tc-ay1-numune-serit" aria-label="Numune planı">
      {parcalar.map((p) => (
        <li key={p.id} className="tc-ay1-numune-serit-parca" data-durum={SERIT_GORUNUMU[p.durum].durum} data-cizgili={p.ilerleme ? '' : undefined}>
          <Simge ad={SERIT_GORUNUMU[p.durum].simge} boyut="k" />
          <span className="tc-ay1-numune-serit-metin">
            <b>{p.etiket}</b>
            <small>{p.olcen} · {p.gecen}/{p.toplam} ölçü</small>
            {p.ilerleme && (p.durum === 'siradaki' || p.durum === 'bekliyor') ? null : <small className="tc-ay1-numune-serit-durum">{p.metin}</small>}
          </span>
          {p.ilerleme ? <NumuneCizgisi i={p.ilerleme} durum={p.durum} /> : null}
        </li>
      ))}
    </ul>
  );
}

// Numuneye yaklaşma (664): sol uç önceki numune, sağ uç sıradaki; işaret şimdiki parçadır. Son onda birde ve zamanı gelince renk değişir.
// Çizgiler ölçeksiz kalınlıktadır: çizgi genişliğe uzar, kalınlığı değişmez.
function NumuneCizgisi({ i, durum }: { i: SeritIlerlemesi; durum: SeritDurumu }) {
  const x = Math.round(i.oran * 1000) / 10;
  const dolu = durum === 'zamani' || durum === 'kalitede';
  const metin = dolu
    ? (durum === 'kalitede' ? 'Numune kalitede' : 'Numune zamanı')
    : i.hedef !== null ? `Sıradaki numune ${i.hedef}. parça · ${i.kalan} parça kaldı` : `Sıradaki numune ${i.kalan} dk sonra`;
  return (
    <span className="tc-ay1-numune-cizgi" data-yakin={!dolu && i.oran >= 0.9 ? '' : undefined} data-dolu={dolu ? '' : undefined}>
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label={metin}>
        <line className="tc-ay1-numune-cizgi-yol" x1="0" y1="5" x2="100" y2="5" vectorEffect="non-scaling-stroke" />
        <line className="tc-ay1-numune-cizgi-dolu" x1="0" y1="5" x2={x} y2="5" vectorEffect="non-scaling-stroke" />
        <line className="tc-ay1-numune-cizgi-uc" x1="100" y1="0" x2="100" y2="10" vectorEffect="non-scaling-stroke" />
        <line className="tc-ay1-numune-cizgi-isaret" x1={x} y1="1" x2={x} y2="9" vectorEffect="non-scaling-stroke" />
      </svg>
      <small aria-hidden="true">{metin}</small>
    </span>
  );
}

/* ── planlı duruş bildirimi: şu an takvimde planlı duruş var ya da 30 dk içinde başlayacak ── */
export function PlanBandi({ simdiki, siradaki, simdi, nedenAdi, durduruldu, gec }: {
  simdiki: DurusGerceklesmesi | null; siradaki: DurusGerceklesmesi | null; simdi: number; nedenAdi: (kod: string) => string | null;
  durduruldu: boolean; gec: ((kod: string) => void) | null;
}) {
  const w = simdiki || siradaki;
  if (!w) return null;
  const sa = (t: number) => `${iki(new Date(t).getHours())}:${iki(new Date(t).getMinutes())}`;
  return (
    <div className="tc-ay1-bant" data-durum={simdiki ? 'bitti' : 'sirada'} role="status">
      <Simge ad="clock" />
      <div>
        <span className="tc-ay1-ust-yazi">{simdiki ? 'Şu an planlı duruş' : `${Math.max(1, Math.round((w.s - simdi) / 60000))} dk sonra planlı duruş`}</span>
        <b>{w.d.title || nedenAdi(w.d.reason) || 'Planlı duruş'} · {sa(w.s)}–{sa(w.e)}</b>
      </div>
      {simdiki && !durduruldu && w.d.reason && gec ? <Dugme tur="ikincil" onClick={() => gec(w.d.reason)}>Duruşa geç</Dugme> : null}
    </div>
  );
}

/* ── refakat kartı: etkin kart ve "sayılan / sınır" (yumuşak kilit: dolunca söylenir, sayım durmaz) ── */
export function EtkinKart({ is, kartlar }: { is: Is; kartlar: readonly RefakatKarti[] }) {
  if (!is.kart) return null;
  const k = kartlar.find((x) => x.id === is.kart);
  const sinir = k ? sinirMetni(k) : null;
  const dolu = !!k && kartDoldu(k);
  return (
    <div className="tc-ay1-etkin-kart" data-durum={dolu ? 'durdu' : undefined} role="status">
      <Simge ad="tag" /><span className="tc-ay1-ust-yazi">Refakat kartı</span><b>{k ? k.etiket : `#${is.kart}`}</b>
      {k && k.lotNo === null ? <small>Lot bekliyor</small> : null}
      {sinir ? <span className="tc-ay1-sinir">{sinir}</span> : null}
      {dolu ? <small>Kart doldu; sıradaki kartı açın</small> : null}
    </div>
  );
}

/* ── iş emirleri listesi: bitmemiş işlerin altında bu istasyonda satırı olan refakat kartları, "Aç" işi o kartla açar ── */
function MiniHalka({ oran }: { oran: number }) {
  const r = 21;
  const C = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, oran));
  return (
    <span className="tc-ay1-halka">
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle className="tc-ay1-halka-yol" cx="26" cy="26" r={r} fill="none" strokeWidth="4" />
        <circle className="tc-ay1-halka-yay" cx="26" cy="26" r={r} fill="none" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - v)} transform="rotate(-90 26 26)" />
      </svg>
      <span>{Math.round(v * 100)}%</span>
    </span>
  );
}
export { MiniHalka };

export function IsKuyrugu({ isler, aktif, sec, siradaki, onde, kartlar, kartla }: {
  isler: readonly Is[]; aktif: number; sec: (i: number) => void; siradaki: string | undefined; onde: string | null;
  kartlar: readonly RefakatKarti[]; kartla: ((i: number, k: RefakatKarti) => void) | null;
}) {
  const { acik, biten } = bitenleriAyir(isler);
  const kart = ([o, i]: [Is, number]) => {
    const liste = kartla && o.state !== 'done' ? istasyondakiKartlar(kartlar, tmiEmirId(o.pkg)) : [];
    const at = adimTuru(o.pkg);
    const pe = parcaEtiketi(o.pkg);
    const dugme = (
      <button key={siraAnahtari(o)} type="button" className="tc-ay1-is" data-durum={durumRengi(o.state)} aria-pressed={i === aktif} onClick={() => sec(i)}>
        <MiniHalka oran={o.target > 0 ? o.good / o.target : 0} />
        <span className="tc-ay1-is-govde">
          <span className="tc-ay1-is-no">{o.no}{o.pkg ? <span className="tc-ay1-rev">Rev {o.pkg.rev}</span> : null}{o.fresh ? <span className="tc-ay1-etiket" data-durum="ayar">Yeni</span> : null}</span>
          <span className="tc-ay1-is-parca">{o.part}{o.urgent ? <span className="tc-ay1-etiket" data-durum="durdu">Acil</span> : null}</span>
          <span className="tc-ay1-is-ayrinti"><span>{o.op}</span><span>Termin {o.due}</span></span>
          {pe ? <span className="tc-ay1-adimtur"><span className="tc-ay1-etiket">{pe}</span></span> : null}
          {at ? <span className="tc-ay1-adimtur"><span className="tc-ay1-etiket">{at.etiket}</span>{at.aciklama ? <span className="tc-ay1-soluk">{at.aciklama}</span> : null}</span> : null}
          <span className="tc-ay1-is-rozetler">
            <span className="tc-ay1-cip" data-durum={durumRengi(o.state)}><i aria-hidden="true" />{durumAdi(o.state)}</span>
            {siraAnahtari(o) === siradaki ? <span className="tc-ay1-cip" data-durum="bitti"><i aria-hidden="true" />Sıradaki · hazırlık {hazirlikSayisi(o)}/4</span> : null}
            {siraAnahtari(o) === onde ? <span className="tc-ay1-cip" data-durum="ayar"><i aria-hidden="true" />Öne alındı</span> : null}
          </span>
        </span>
      </button>
    );
    if (!liste.length || !kartla) return dugme;
    return (
      <div key={siraAnahtari(o)} className="tc-ay1-is-sarmal">
        {dugme}
        <div className="tc-ay1-kartlar" role="list" aria-label={`${o.no} refakat kartları`}>
          {liste.map((k) => {
            const acikMi = i === aktif && o.kart === k.id;
            const s = sinirMetni(k);
            return (
              <div key={k.id} role="listitem" className="tc-ay1-kart" aria-current={o.kart === k.id ? 'true' : undefined}>
                <Simge ad="tag" boyut="k" />
                <div className="tc-ay1-kart-govde"><b>{k.etiket}</b><small>{k.lotNo ?? 'Lot bekliyor'}{k.malzemeKod ? ` · ${k.malzemeKod}` : ''}</small></div>
                {s ? <span className="tc-ay1-sinir" data-durum={kartDoldu(k) ? 'durdu' : undefined}>{s}</span> : null}
                <button type="button" className="tc-ay1-kart-ac" onClick={() => kartla(i, k)} disabled={acikMi} aria-label={`${k.etiket} kartıyla aç`}>{acikMi ? 'Açık' : 'Aç'}</button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  return (
    <section className="tc-ay1-kuyruk" aria-label="İş emirleri">
      <header className="tc-ay1-kuyruk-ust"><b>İş emirleri</b><span className="tc-ay1-ust-yazi">{isler.filter((o) => o.state !== 'done').length} açık</span></header>
      <div className="tc-ay1-kuyruk-liste">
        {acik.map(kart)}
        {biten.length ? <div className="tc-ay1-ust-yazi tc-ay1-kuyruk-alt">Biten işler · {biten.length}</div> : null}
        {biten.map(kart)}
      </div>
    </section>
  );
}

/* ── sayaç: iyi ve hurda payı, kalan adet işlenen parçaya göre (hurda da ham parçayı tüketir) ── */
export interface CevrimOlcer { gecen(): number; son(): number; sayac(): number }
const CIZGILER = Array.from({ length: 120 }, (_, i) => {
  const a = (i / 120) * Math.PI * 2 - Math.PI / 2;
  const buyuk = i % 10 === 0;
  const r1 = buyuk ? 196 : 202;
  return { i, buyuk, x1: 220 + r1 * Math.cos(a), y1: 220 + r1 * Math.sin(a), x2: 220 + 214 * Math.cos(a), y2: 220 + 214 * Math.sin(a) };
});

// Dönen çevrim ışığı (bilesenler.ts CycAnim, CycRing): bir tur bir parçanın planlı çevrim süresidir; parça sayılınca baştan,
// duraklayınca durur, süre aşılınca gecikme rengine döner. Süre ve başlangıç CSS değişkeniyle verilir (animasyon kaymasın diye
// başlangıç yalnız ilk çizimde okunur).
function CevrimIsigi({ is, gecen, gec }: { is: Is; gecen: number; gec: boolean }) {
  const [baslangic] = useState(() => -(gecen / 1000));
  const R = 158;
  const C = 2 * Math.PI * R;
  const ayarla = (el: HTMLElement | SVGElement | null) => {
    el?.style.setProperty('--tc-ay1-cevrim-sure', `${is.cycle}s`);
    el?.style.setProperty('--tc-ay1-cevrim-baslangic', `${baslangic}s`);
    el?.style.setProperty('--tc-ay1-cevrim-adim', String(Math.max(1, Math.round(is.cycle * 2))));
    el?.style.setProperty('--tc-ay1-cevrim-cevre', String(C));
  };
  return (
    <>
      <div ref={ayarla} className="tc-ay1-tarama" data-gec={gec || undefined} aria-hidden="true" />
      <svg className="tc-ay1-cevrim" viewBox="0 0 440 440" aria-hidden="true">
        <circle className="tc-ay1-cevrim-yol" cx="220" cy="220" r={R} fill="none" strokeWidth="3" />
        <circle ref={ayarla} className="tc-ay1-cevrim-yay" data-gec={gec || undefined} cx="220" cy="220" r={R} fill="none" strokeWidth="3" strokeDasharray={C} transform="rotate(-90 220 220)" />
        <g ref={ayarla} className="tc-ay1-cevrim-nokta" data-gec={gec || undefined}><circle cx="220" cy="62" r="7" /></g>
      </svg>
    </>
  );
}
function CevrimHalkasi({ is, cevrim }: { is: Is; cevrim: CevrimOlcer }) {
  useSimdi(500);
  if (!(is.cycle > 0)) return null;
  const e = cevrim.gecen();
  const gec = is.state === 'running' && e > is.cycle * 1000 * 1.08;
  return <CevrimIsigi key={`${is.no}:${cevrim.sayac()}`} is={is} gecen={e} gec={gec} />;
}

// İş bitince düşen konfeti (operator-parcalar.ts DoneOv); yeri, süresi ve dönüşü her parça için bir kez seçilir.
const KONFETI_RENKLERI = ['hazard', 'run', 'done', 'hold'] as const;
export function Konfeti() {
  const parcalar = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    sol: Math.random() * 100, gecikme: Math.random() * 0.8, sure: 2.2 + Math.random() * 1.8, aci: Math.random() * 360, renk: KONFETI_RENKLERI[i % 4],
  })), []);
  return createPortal(
    <div className="tc-ay1-konfeti" aria-hidden="true">
      {parcalar.map((b, i) => (
        <i
          key={i}
          data-renk={b.renk}
          ref={(el) => {
            el?.style.setProperty('--x', `${b.sol}%`);
            el?.style.setProperty('--gecikme', `${b.gecikme}s`);
            el?.style.setProperty('--sure', `${b.sure}s`);
            el?.style.setProperty('--aci', `${b.aci}deg`);
          }}
        />
      ))}
    </div>,
    document.body,
  );
}

export function SayacKadrani({ is, etiket, birim, duzelt, cevrim }: { is: Is; etiket: string; birim: string; duzelt: (() => void) | null; cevrim: CevrimOlcer }) {
  const { iyi, hurda, hedef, kalan } = sayacGosterimi(is);
  const yanan = Math.round(120 * iyi);
  const R = 180;
  const C = 2 * Math.PI * R;
  const [sira, siraYaz] = useState(0);
  const onceki = useRef(is.good);
  useEffect(() => { if (onceki.current !== is.good) { onceki.current = is.good; siraYaz((x) => x + 1); } }, [is.good]);
  const ic = (
    <>
      <span className="tc-ay1-ust-yazi">{etiket}</span>
      <span key={sira} className={sira ? 'tc-ay1-kadran-sayi tc-ay1-zipla' : 'tc-ay1-kadran-sayi'}>{sayi(is.good)}</span>
      <span className="tc-ay1-kadran-hedef">/ {hedef === null ? '—' : sayi(hedef)} {birim}</span>
      <span className="tc-ay1-kadran-yuzde">{kalan === null ? '—' : `%${Math.floor(iyi * 100)} · ${sayi(kalan)} kaldı`}</span>
    </>
  );
  return (
    <div className="tc-ay1-kadran" data-calisiyor={is.state === 'running' || undefined}>
      <svg viewBox="0 0 440 440" aria-hidden="true">
        {CIZGILER.map((t) => <line key={t.i} className={`tc-ay1-cizgi${t.i < yanan ? ' tc-ay1-cizgi-yanik' : ''}${t.buyuk ? ' tc-ay1-cizgi-buyuk' : ''}`} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />)}
        <circle className="tc-ay1-kadran-yol" cx="220" cy="220" r={R} fill="none" strokeWidth="12" />
        <circle className="tc-ay1-kadran-yay" cx="220" cy="220" r={R} fill="none" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${C * iyi} ${C}`} transform="rotate(-90 220 220)" />
        {is.scrap ? <circle className="tc-ay1-kadran-hurda" cx="220" cy="220" r={R} fill="none" strokeWidth="12" strokeDasharray={`0 ${C * iyi + 6} ${Math.max(4, C * hurda)} ${C}`} transform="rotate(-90 220 220)" /> : null}
      </svg>
      <CevrimHalkasi is={is} cevrim={cevrim} />
      {duzelt
        ? <button type="button" className="tc-ay1-kadran-cekirdek" onClick={duzelt} title="Dokun: sayıyı düzelt" aria-label={`${etiket} ${sayi(is.good)}, sayıyı düzelt`}>{ic}</button>
        : <div className="tc-ay1-kadran-cekirdek">{ic}</div>}
      <div className="tc-ay1-kadran-yan tc-ay1-kadran-sol">
        <span className="tc-ay1-kadran-etiket" data-durum="durdu">Hurda<b>{is.scrap}</b></span>
      </div>
    </div>
  );
}

export interface SayimTusu { etiket: string; simge: 'plus' | 'minus' | 'trash' | 'layers'; ton: 'iyi' | 'hurda' | 'duz'; kapali: boolean; aria?: string; bas: () => void }
export function SayimTuslari({ tuslar }: { tuslar: readonly SayimTusu[] }) {
  if (!tuslar.length) return null;
  return (
    <div className="tc-ay1-tuslar" role="group" aria-label="Sayaç">
      {tuslar.map((t) => (
        <button key={t.etiket} type="button" className="tc-ay1-tus" data-tur={t.ton} data-duzeltme={t.simge === 'minus' || undefined} disabled={t.kapali} onClick={t.bas} aria-label={t.aria}>
          <Simge ad={t.simge} />{t.etiket}
        </button>
      ))}
    </div>
  );
}

/* ── toplu giriş: sağlam ve hurda adedi bir seferde; hurda varsa nedeni seçilir; ekranda hep açıktır ── */
// 1044 a: TMI işinde ikinci alan "Hatalı"dır (parça kaliteye ayrılır, hurdayı kalite yazar); öteki işte "Hurda".
export function TopluGiris({ kalan, kapali, kaydet, nedenler, hurdaEtiketi = 'Hurda' }: {
  kalan: number; kapali: boolean; kaydet: (g: { saglam: number; hurda: number; neden: string | null }) => boolean; nedenler: readonly ScrapReason[];
  hurdaEtiketi?: 'Hurda' | 'Hatalı';
}) {
  const [sg, sgYaz] = useState('');
  const [hr, hrYaz] = useState('');
  const [neden, nedenYaz] = useState<string | null>(() => yerel.oku<string>('lastScrap'));
  const n = topluGirisSayilari(sg, hr);
  const g = { saglam: n.saglam, hurda: n.hurda, neden: n.hurda > 0 ? neden : null };
  const hata = topluGirisHatasi(g, kalan);
  const bos = sg.trim() === '' && hr.trim() === '';
  const nedenRef = useRef<HTMLDivElement>(null);
  const hurdali = n.hurda > 0;
  // Dar ekranda neden listesi kaydırma alanının altında kalmasın.
  useEffect(() => { if (hurdali) nedenRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [hurdali]);
  const kaydi = () => { if (hata || kapali) return; if (!kaydet(g)) return; if (g.neden) yerel.yaz('lastScrap', g.neden); sgYaz(''); hrYaz(''); };
  const alan = (l: string, v: string, yaz: (s: string) => void, tur: 'iyi' | 'hurda') => (
    <label className="tc-ay1-toplu-alan" data-tur={tur}>
      <span className="tc-ay1-ust-yazi">{l}</span>
      <input className="tc-ay1-mono" inputMode="numeric" pattern="[0-9]*" value={v} placeholder="0" disabled={kapali}
        aria-label={`Toplu ${l.toLocaleLowerCase('tr-TR')}`} onChange={(e) => yaz(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') kaydi(); }} />
    </label>
  );
  const L = nedenler.filter((r) => r.active !== false);
  return (
    <div className="tc-ay1-toplu" role="group" aria-label="Toplu giriş">
      <div className="tc-ay1-toplu-ust"><Simge ad="layers" boyut="k" /><span className="tc-ay1-ust-yazi">Toplu giriş</span><small className="tc-ay1-soluk">Sağlam en çok {sayi(Math.max(0, kalan))}</small></div>
      <div className="tc-ay1-toplu-satir">
        {alan('Sağlam', sg, sgYaz, 'iyi')}{alan(hurdaEtiketi, hr, hrYaz, 'hurda')}
        <Dugme simge="check" disabled={kapali || bos || !!hata} onClick={kaydi}>Kaydet</Dugme>
      </div>
      {hurdali ? (
        <div ref={nedenRef} className="tc-ay1-nedenler tc-ay1-nedenler-kucuk" role="radiogroup" aria-label={`${hurdaEtiketi} nedeni`}>
          {L.map((r) => (
            <button key={r.code} type="button" role="radio" aria-checked={neden === r.code} className="tc-ay1-neden" data-durum="durdu" onClick={() => nedenYaz(r.code)}>
              <span className="tc-ay1-neden-simge"><Simge ad="trash" boyut="k" /></span><b>{r.l}</b>
            </button>
          ))}
        </div>
      ) : null}
      {hata && !bos ? <small className="tc-ay1-hata">{hata}</small> : null}
    </div>
  );
}

/* ── durum düğmeleri: geri alması zor olan (Durdur, Bitir) 1,2 sn basılı tutulur ── */
export function DurumDugmeleri({ durum, eylem, erken, pasif = false }: { durum: string; eylem: (d: DurumDugmesi) => void; erken: (etiket: string) => void; pasif?: boolean }) {
  return (
    <OrbGrubu etiket="İş durumu">
      {durumDugmeleri(durum).map((d) => (
        <Orb key={d.key} simge={d.simge} etiket={d.etiket} ton={tonDurumu(d.ton)} ana={!!d.ana} disabled={pasif} {...(d.tut ? { basiliTutMs: 1200 } : {})}
          tetikle={() => eylem(d)} erkenBirakinca={() => erken(d.etiket)} />
      ))}
    </OrbGrubu>
  );
}

/* ── çağrı takibi çipi (üst şeritte) ── */
export function CagriCipi({ cagri, ac }: { cagri: Cagri | null; ac: () => void }) {
  const simdi = useSimdi(1000);
  if (!cagri) return null;
  return (
    <button type="button" className="tc-ay1-cagri-cip" data-durum={tonDurumu(cagriTonu(cagri.k))} onClick={ac}>
      <i aria-hidden="true" /><b>{cagri.l}</b><span>{CAGRI_ASAMALARI[cagri.stage] ?? ''}</span><span className="tc-ay1-mono">{sure((simdi - cagri.t0) / 1000).slice(3)}</span>
    </button>
  );
}

export function Satir({ simge, baslik, alt, tikla }: { simge: 'chart' | 'user' | 'expand' | 'ruler' | 'cpu'; baslik: string; alt: string; tikla: () => void }): ReactNode {
  return <button type="button" className="tc-ay1-menu-satir" onClick={tikla}><Simge ad={simge} /><span><b>{baslik}</b><small>{alt}</small></span></button>;
}

export { durumAdi, durumRengi };
