import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { sayi, miktar as miktarMetni } from '../bicim.ts';
import {
  adimAdi, adimBirlesen, adimCarpani, adimDali, bagimlilikYaz, dalBilgileri, dalEtiketi, dalYerlesimi, fasonMu, islemSuresiBos, kolaEkle, seritteYerlestir, sirali,
  sonrakiBagimlilik, statuNo, turKisa, yeniAdim, type Adim, type Dugum,
} from './kurallar.ts';
import { SURUKLE_TURU, surukleAdim, surukleCoz } from './AkisSemasi.tsx';
import { yeniKimlik } from './useRotaDuzeni.ts';
import { bagMetni, fasonAdi, renkSinifi, type RotaEkrani } from './ortak.tsx';
import { SablonSecici } from './SablonSecici.tsx';
import { SureSeridi, sureGirdisi, type YmSatiri } from './SureSeridi.tsx';
import { ANA_HAT, hatYerlesimi, zamanCizelgesi, type AdimZamani } from './yatayHat.ts';

// 3248: yatay hat. Rota soldan sağa akar; ana hat üst şeritte, her dal kendi şeridindedir. Dal ayrıldığı adımın altından iner,
// birleştiği adımın altına çıkar. Her adım sütununda üstte girenler, ortada adım, altta çıkanlar durur; hat yalnız yana kayar.
// Hücrenin ızgaradaki yeri veriden gelir ve çizimde yazılır (ekran ölçü yazmaz).

// Kimlik seçiciye yazılmaz (kaçışsız kimlik seçiciyi bozar): kartlar taranır.
const hkBul = (ic: HTMLElement, id: string): HTMLElement | null =>
  [...ic.querySelectorAll<HTMLElement>('[data-hk]')].find((el) => el.dataset.hk === id) ?? null;

interface Yol { d: string; tur: Adim['dep'] | 'ym' }

// Bağlantılar kartların gerçek yerinden ölçülür. Aynı şeritte düz ok; alt şeride inen (dal ayrılır) kaynağın altından iner,
// üst şeride çıkan (dal birleşir) hedefin altına varır.
function yollariOlc(ic: HTMLElement, l: readonly Adim[], onculler: Map<string, Adim[]>, serit: (a: Adim) => number): Yol[] {
  const k0 = ic.getBoundingClientRect();
  const kutu = (id: string) => {
    const el = hkBul(ic, id);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { l: b.left - k0.left, r: b.right - k0.left, t: b.top - k0.top, b: b.bottom - k0.top, cx: (b.left + b.right) / 2 - k0.left, cy: (b.top + b.bottom) / 2 - k0.top };
  };
  const n = (v: number) => String(Math.round(v * 10) / 10);
  const yollar: Yol[] = [];
  for (const a of l) {
    const B = kutu(a.id);
    if (!B) continue;
    for (const p of onculler.get(a.id) ?? []) {
      const A = kutu(p.id);
      if (!A) continue;
      const sa = serit(a); const sp = serit(p);
      if (sa === sp) yollar.push({ d: `M${n(A.r)},${n(A.cy)} H${n(B.l - 2)}`, tur: a.dep });
      else if (sa > sp) yollar.push({ d: `M${n(A.cx)},${n(A.b)} V${n(B.cy - 8)} Q${n(A.cx)},${n(B.cy)} ${n(A.cx + 8)},${n(B.cy)} H${n(B.l - 2)}`, tur: a.dep });
      else yollar.push({ d: `M${n(A.r)},${n(A.cy)} H${n(B.cx - 8)} Q${n(B.cx)},${n(A.cy)} ${n(B.cx)},${n(A.cy - 8)} V${n(B.b + 2)}`, tur: 'bagimli' });
    }
  }
  // 3248-2: açılan yarı mamul akışının son adımından, tükettiği adımın üstündeki yarı mamul kutusuna inen ok.
  const hedefler = [...ic.querySelectorAll<HTMLElement>('[data-ymhedef]')];
  for (const k of ic.querySelectorAll<HTMLElement>('[data-ymkaynak]')) {
    const h = hedefler.find((e) => e.dataset.ymhedef === k.dataset.ymkaynak);
    if (!h) continue;
    const A = k.getBoundingClientRect(); const B = h.getBoundingClientRect();
    const ax = (A.left + A.right) / 2 - k0.left; const ay = A.bottom - k0.top; const bx = (B.left + B.right) / 2 - k0.left; const by = B.top - k0.top;
    const orta = (ay + by) / 2;
    yollar.push({ d: `M${n(ax)},${n(ay)} V${n(orta)} H${n(bx)} V${n(by - 2)}`, tur: 'ym' });
  }
  return yollar;
}

// 3248-2: mini harita. Bütün rota küçük kutular olarak, hattın görünen bölümü çerçeve olarak durur; tıklayınca, sürükleyince ya da ok
// tuşlarıyla hat yana kayar. Kutunun yeri veriden (sütun, şerit) gelir; çerçeve hat kaydıkça ölçülür. Telefonda gizlidir (rotalar.css).
interface HaritaKutusu { id: string; x: number; y: number; ym: boolean; renk: string; secili: boolean }
function HatHaritasi({ hat, hatId, kutular, kolon, satir, imza }: {
  hat: RefObject<HTMLDivElement | null>; hatId: string; kutular: HaritaKutusu[]; kolon: number; satir: number; imza: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tut = useRef(false);
  const guncelle = useRef<() => void>(() => undefined);
  guncelle.current = () => {
    const h = hat.current; const m = ref.current;
    if (!h || !m) return;
    const en = Math.max(1, h.scrollWidth);
    m.style.setProperty('--tc-rr1-hrt-x', `${String((h.scrollLeft / en) * 100)}%`);
    m.style.setProperty('--tc-rr1-hrt-en', `${String(Math.min(1, h.clientWidth / en) * 100)}%`);
    m.classList.toggle('tc-rr1-hrt-sigiyor', h.scrollWidth <= h.clientWidth + 1);
    m.setAttribute('aria-valuenow', String(Math.round((h.scrollLeft / Math.max(1, h.scrollWidth - h.clientWidth)) * 100)));
  };
  useLayoutEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>('[data-x]').forEach((el) => {
      el.style.setProperty('--tc-rr1-hrt-kx', `${String((Number(el.dataset.x) / kolon) * 100)}%`);
      el.style.setProperty('--tc-rr1-hrt-ky', `${String((Number(el.dataset.y) / satir) * 100)}%`);
      el.style.setProperty('--tc-rr1-hrt-kw', `${String((0.8 / kolon) * 100)}%`);
      el.style.setProperty('--tc-rr1-hrt-kh', `${String((0.7 / satir) * 100)}%`);
    });
    guncelle.current();
  });
  useEffect(() => {
    const h = hat.current;
    if (!h) return undefined;
    const f = () => { guncelle.current(); };
    h.addEventListener('scroll', f, { passive: true });
    window.addEventListener('resize', f);
    return () => { h.removeEventListener('scroll', f); window.removeEventListener('resize', f); };
  }, [hat, imza]);
  const kaydir = (x: number) => {
    const h = hat.current; const m = ref.current;
    if (!h || !m) return;
    const b = m.getBoundingClientRect();
    if (b.width <= 0) return;
    h.scrollLeft = ((x - b.left) / b.width) * h.scrollWidth - h.clientWidth / 2;
    guncelle.current();
  };
  return (
    <div
      ref={ref} className="tc-rr1-hrt" role="scrollbar" tabIndex={0} aria-label="Mini harita: hattın görünen bölümü" aria-controls={hatId}
      aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}
      onPointerDown={(e) => { tut.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); kaydir(e.clientX); }}
      onPointerMove={(e) => { if (tut.current) kaydir(e.clientX); }}
      onPointerUp={() => { tut.current = false; }} onPointerCancel={() => { tut.current = false; }}
      onKeyDown={(e) => {
        const h = hat.current;
        if (!h) return;
        const adim = { ArrowLeft: -0.5, ArrowRight: 0.5, PageUp: -1, PageDown: 1 }[e.key];
        if (adim !== undefined) h.scrollLeft += adim * h.clientWidth;
        else if (e.key === 'Home') h.scrollLeft = 0;
        else if (e.key === 'End') h.scrollLeft = h.scrollWidth;
        else return;
        e.preventDefault();
        guncelle.current();
      }}
    >
      {kutular.map((k) => (
        <i key={k.id} className={`tc-rr1-hrt-k ${k.renk}${k.ym ? ' tc-rr1-hrt-ym' : ''}${k.secili ? ' tc-rr1-secili' : ''}`} data-x={String(k.x)} data-y={String(k.y)} />
      ))}
      <b className="tc-rr1-hrt-cer" />
    </div>
  );
}

function HatKarti({ r, d, a, t, secili, suruk }: {
  r: RotaEkrani; d: Dugum; a: Adim; t: AdimZamani | undefined; secili: boolean; suruk: { basla: (id: string) => void; bitir: () => void } | null;
}) {
  const { h } = r.duzen;
  const op = h.op.get(a.opId);
  const ist = a.stationId ? h.istasyon.get(a.stationId) : undefined;
  const fason = fasonMu(a);
  const miktar = d.adimlar.find((x) => x.a.id === a.id)?.miktar ?? d.miktar;
  const dk = sureGirdisi(r, d)(a).dk;
  return (
    <button
      type="button" data-hk={a.id}
      className={`tc-rr1-hk ${ist ? renkSinifi(ist.id) : 'tc-rr1-renk-yok'}${secili ? ' tc-rr1-secili' : ''}${t?.kritik ? ' tc-rr1-hk-kritik' : ''}${fason ? ' tc-rr1-hk-fason' : ''}`}
      onClick={() => { r.sec({ tur: 'adim', urunId: d.id, adimId: a.id, seq: a.seq, miktar }); }}
      aria-label={`${adimAdi(a)} ${op?.name ?? 'Operasyon seç'}`} aria-pressed={secili}
      draggable={suruk !== null}
      onDragStart={suruk ? (e) => { e.dataTransfer.setData(SURUKLE_TURU, surukleAdim(d.id, a.id)); e.dataTransfer.effectAllowed = 'move'; r.surukleBasla(); suruk.basla(a.id); } : undefined}
      onDragEnd={suruk ? () => { r.surukleBitti(); suruk.bitir(); } : undefined}
    >
      <span className="tc-rr1-hk-bar">
        <span className="tc-rr1-abbr">{op?.abbr ?? op?.code ?? '???'}</span>
        <span className="tc-rr1-oseq" title={a.opNo === null ? 'Yeni adım; numarayı sistem kayıtta verir' : undefined}>{a.opNo ?? 'yeni'}</span>
      </span>
      <b className="tc-rr1-hk-ad">{op?.name ?? 'Operasyon seç'}</b>
      <small className="tc-rr1-hk-ist">
        {fason ? <>Fason: {a.fasonId ? fasonAdi(r.duzen.durum.fasonFirms, a.fasonId) : 'firma seçilmedi'}</> : ist ? `${ist.code} ${ist.name}` : 'İstasyon seçilmedi'}
      </small>
      <small className="tc-rr1-hk-sure">
        {fason ? `Termin ${a.terminGun !== null && a.terminGun > 0 ? `${String(a.terminGun)} gün` : 'girilmedi'}`
          : dk !== null ? `${sayi(Math.round((dk / 60) * 10) / 10)} sa` : islemSuresiBos(a) ? 'Süre yok' : 'Süre yok: istasyon yok'}
        {a.rejectPct > 0 && `, ret %${sayi(a.rejectPct)}`}
      </small>
    </button>
  );
}

export function YatayHat({ r, kok }: { r: RotaEkrani; kok: Dugum }) {
  const { h } = r.duzen;
  const kap = useRef<HTMLDivElement>(null);
  const ic = useRef<HTMLDivElement>(null);
  const ok = useId().replace(/:/g, '');
  const hatId = `${ok}-hat`;
  const { bildir } = useBildirim();
  // 3248-2: hattan sürüklenen adım (yalnız kendi şeridine bırakılır) ve üstünde durulan bırakma yeri; açılan yarı mamul akışları (düğüm kimliği).
  const [suruklenen, setSuruklenen] = useState<string | null>(null);
  const [birakYeri, setBirakYeri] = useState<string | null>(null);
  const [acikYm, setAcikYm] = useState<ReadonlySet<string>>(new Set());
  const [yollar, setYollar] = useState<Yol[]>([]);
  const [olcu, setOlcu] = useState({ en: 0, boy: 0 });
  const m = h.malzeme.get(kok.id);
  const duzen = r.duzen.duzenlenebilir(kok.id);
  const liste = sirali(r.duzen.adimlar(kok.id));
  const y = hatYerlesimi(liste);
  const z = zamanCizelgesi(liste, sureGirdisi(r, kok));
  const seritNo = (a: Adim) => Math.max(0, y.seritler.indexOf(adimDali(a) ?? ANA_HAT));
  const bilgiler = dalBilgileri(liste);
  const acikUclar = liste.some((a) => adimDali(a) !== null) ? dalYerlesimi(liste).acikUclar : new Set<string>();
  const s = r.secim;
  const seciliAdim = s?.tur === 'adim' && s.urunId === kok.id ? s.adimId : null;
  const sonId = liste.at(-1)?.id ?? null;
  const sn = (a: Adim) => kok.adimlar.find((x) => x.a.id === a.id);
  const surukAdimi = suruklenen ? liste.find((x) => x.id === suruklenen) ?? null : null;
  // Açık yarı mamul akışları hattın üstünde birer satırdır; akış tükettiği adımın sütununda biter.
  const ymBantlari = liste.flatMap((a) => (sn(a)?.girenler ?? []).filter(({ dugum: alt }) => acikYm.has(alt.nid) && alt.adimlar.length > 0 && !alt.dongu)
    .flatMap(({ x, dugum: alt }) => { const gm = h.malzeme.get(x.itemId); return gm ? [{ a, alt, gm, c: y.kolon.get(a.id) ?? 0 }] : []; }));
  const ymSatirlari: YmSatiri[] = ymBantlari.map((b) => ({ kod: b.gm.code, hedef: b.a, dugum: b.alt }));
  const suruk = duzen ? { basla: (id: string) => { setSuruklenen(id); }, bitir: () => { setSuruklenen(null); setBirakYeri(null); } } : null;
  // Bırakma: hattın adımı yalnız kendi şeridinde yer değiştirir; paletteki operasyon bırakılan yerin ardına (o adımın şeridine) eklenir.
  const birak = (sonraId: string, v: string) => {
    r.surukleBitti(); setSuruklenen(null); setBirakYeri(null);
    const c = surukleCoz(v);
    const geriAl = { etiket: 'Geri al', yap: () => { r.duzen.geriAl(kok.id, 'geri'); } };
    if (c?.tur === 'adim' && c.urunId === kok.id) {
      const tasinan = liste.find((x) => x.id === c.adimId);
      const sonra = liste.find((x) => x.id === sonraId);
      if (!tasinan || !sonra || adimDali(tasinan) !== adimDali(sonra)) return;
      if (r.duzen.tasi(kok.id, (l) => seritteYerlestir(l, c.adimId, sonraId), 'Adım taşındı')) {
        bildir('tamam', `${adimAdi(tasinan)} ${adimAdi(sonra)} ardına taşındı.`, { eylem: geriAl });
      }
    } else if (c?.tur === 'op') {
      const op = h.op.get(c.opId);
      const yeni = yeniAdim(op, yeniKimlik());
      const l2 = kolaEkle(r.duzen.adimlar(kok.id), sonraId, yeni);
      if (r.duzen.degistir(kok.id, () => l2, `${op?.abbr ?? op?.code ?? 'Adım'} adımı eklendi`)) {
        r.sec({ tur: 'adim', urunId: kok.id, adimId: yeni.id, seq: l2.find((x) => x.id === yeni.id)?.seq ?? 0, miktar: kok.miktar });
        bildir('tamam', `${op?.name ?? 'Adım'} eklendi.`, { eylem: geriAl });
      }
    }
  };

  const sonImza = useRef('');
  const olc = useRef<() => void>(() => undefined);
  olc.current = () => {
    const el = ic.current;
    if (!el) return;
    el.querySelectorAll<HTMLElement>('[data-k]').forEach((c) => {
      c.style.gridColumn = c.dataset.k ?? 'auto';
      c.style.gridRow = c.dataset.s ?? 'auto';
    });
    el.style.setProperty('--tc-rr1-hat-kolon', String(Math.max(1, y.kolonSayisi)));
    const yeni = yollariOlc(el, liste, y.onculler, seritNo);
    const o = { en: el.scrollWidth, boy: el.scrollHeight };
    const imza = JSON.stringify([yeni, o]);
    // Ölçü değişmediyse durum yazılmaz: koşulsuz yazmak her çizimde yeniden çizim, sonsuz döngü olur.
    if (imza !== sonImza.current) { sonImza.current = imza; setYollar(yeni); setOlcu(o); }
  };
  useLayoutEffect(() => { olc.current(); });
  const hatVar = liste.length > 0;
  useEffect(() => {
    if (!hatVar || !ic.current || typeof ResizeObserver === 'undefined') return undefined;
    const g = new ResizeObserver(() => { olc.current(); });
    g.observe(ic.current);
    return () => { g.disconnect(); };
  }, [hatVar]);
  // Seçilen adım hattın görünen alanına kayar (süre şeridinden ya da sorun listesinden seçilince).
  useEffect(() => {
    if (seciliAdim === null) return;
    const el = ic.current ? hkBul(ic.current, seciliAdim) : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [seciliAdim]);

  if (!m) return null;
  // Izgara: her adım sütunu iki izdir (kart, ardına ekleme); her şerit üç satırdır (girenler, adım, çıkanlar).
  const sut = (c: number) => String(c * 2 + 1);
  const sat = (a: Adim, k: 0 | 1 | 2) => String(ymBantlari.length + seritNo(a) * 3 + 1 + k);
  const ymRenk = (x: Adim) => (x.stationId ? renkSinifi(x.stationId) : 'tc-rr1-renk-yok');
  const haritaKutulari: HaritaKutusu[] = [
    ...ymBantlari.flatMap((b, k) => b.alt.adimlar.map(({ a: x }, j) => ({
      id: `ym${String(k)}-${x.id}`, x: Math.max(0, b.c - b.alt.adimlar.length + 1) + j, y: k, ym: true, renk: ymRenk(x), secili: false,
    }))),
    ...liste.map((a) => ({
      id: a.id, x: y.kolon.get(a.id) ?? 0, y: ymBantlari.length + seritNo(a), ym: false, renk: a.stationId ? renkSinifi(a.stationId) : 'tc-rr1-renk-yok', secili: a.id === seciliAdim,
    })),
  ];
  const basSecili = s?.tur === 'urun' && s.urunId === kok.id;
  const V = r.duzen.gorulen(kok.id);

  return (
    <div className="tc-rr1-hatli-kap">
      <div className="tc-rr1-hat-bas">
        <button type="button" className={`tc-rr1-rhd${basSecili ? ' tc-rr1-secili' : ''}`} onClick={() => { r.sec({ tur: 'urun', urunId: kok.id, nid: kok.nid, miktar: kok.miktar }); }}>
          <span className={`tc-rr1-slot tc-rr1-slot-${m.type}`}>{turKisa(m.type)}</span>
          <span className="tc-rr1-ci">
            <b>{m.code} rotası {V && <span className={`tc-rr1-rvchip tc-rr1-rv-${V.status}`}>Rev {V.no}</span>}{r.duzen.taslakVar(kok.id) && <span className="tc-rr1-rvchip tc-rr1-rv-taslak">kaydediliyor</span>}</b>
            <small>{m.name}</small>
          </span>
          <span className="tc-rr1-cq">{miktarMetni(kok.miktar, m.unit)}</span>
        </button>
      </div>
      {liste.length > 0 && <SureSeridi r={r} d={kok} z={z} miktar={kok.miktar} ymler={ymSatirlari} />}
      {liste.length > 0 && !kok.dongu && (
        <div className="tc-rr1-hat-cubuk">
          {duzen && <span className="tc-rr1-ipucu tc-rr1-hat-surukipucu"><Simge ad="sort" boyut="k" /> Adımı tutup kendi şeridindeki artıya bırak; operasyonu paletten artıya sürükle.</span>}
          <HatHaritasi hat={kap} hatId={hatId} kutular={haritaKutulari} kolon={Math.max(1, y.kolonSayisi)} satir={Math.max(1, ymBantlari.length + y.seritler.length)}
            imza={`${String(liste.length)}|${String(ymBantlari.length)}`} />
        </div>
      )}
      {kok.dongu ? <div className="tc-rr1-noroute">Döngü: {m.code} kendi akışında tekrar geçiyor</div> : liste.length === 0 ? (
        <SablonSecici r={r} urunId={kok.id} />
      ) : (
        <div className="tc-rr1-hat" ref={kap} id={hatId} role="group" aria-label="Yatay hat">
          <div className={`tc-rr1-hat-ic${suruklenen !== null || r.surukleniyor ? ' tc-rr1-hat-suruk' : ''}`} ref={ic}>
            {ymBantlari.map((b, k) => {
              const n = b.alt.adimlar.length;
              const bas = Math.max(0, b.c - n + 1);
              return (
                <div key={`ym${b.alt.nid}`} className="tc-rr1-hat-ym" data-k={`${String(bas * 2 + 1)} / ${String(b.c * 2 + 2)}`} data-s={String(k + 1)}
                  role="group" aria-label={`${b.gm.code} yarı mamul akışı`}>
                  <div className="tc-rr1-hat-ymbas">
                    <span className="tc-rr1-hat-dalet tc-rr1-hat-ymet"><Simge ad="layers" boyut="k" /> {b.gm.code} (yarı mamul) · {adimAdi(b.a)} için · salt okunur</span>
                    <button type="button" className="tc-rr1-add" onClick={() => { r.kokSec(b.gm.id); r.sec(null); }}>
                      <Simge ad="chev-right" boyut="k" /> YM rotasını aç
                    </button>
                  </div>
                  <div className="tc-rr1-hat-ymsira">
                    {b.alt.adimlar.map(({ a: x }, j) => {
                      const op = h.op.get(x.opId);
                      const dk = sureGirdisi(r, b.alt)(x).dk;
                      return (
                        <div key={x.id} className={`tc-rr1-hk tc-rr1-hk-ym ${x.stationId ? renkSinifi(x.stationId) : 'tc-rr1-renk-yok'}`} {...(j === n - 1 ? { 'data-ymkaynak': b.alt.nid } : {})}>
                          <span className="tc-rr1-hk-bar"><span className="tc-rr1-abbr">{op?.abbr ?? op?.code ?? '???'}</span><span className="tc-rr1-oseq">{statuNo(x)}</span></span>
                          <b className="tc-rr1-hk-ad">{op?.name ?? 'Operasyon'}</b>
                          <small className="tc-rr1-hk-sure">{dk !== null ? `${sayi(Math.round((dk / 60) * 10) / 10)} sa` : 'Süre yok'}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {liste.map((a) => {
              const c = y.kolon.get(a.id) ?? 0;
              const dugum = sn(a);
              const dal = adimDali(a);
              const ilkDal = dal !== null && bilgiler.find((b) => b.dal === dal)?.adimlar[0]?.id === a.id;
              const b = ilkDal ? bilgiler.find((x) => x.dal === dal) : undefined;
              // Dal süresi adım süreleri toplamıdır; bir adımı hesaplanamayan dalın toplamı yazılmaz (sıfır uydurulmaz), fason eklenmez.
              const dalDk = b?.adimlar.reduce<number | null>((t, x) => {
                if (t === null || fasonMu(x)) return t;
                const v = sureGirdisi(r, kok)(x).dk;
                return v === null ? null : t + v;
              }, 0) ?? null;
              const oncul = y.onculler.get(a.id) ?? [];
              const ayniSeritte = oncul.some((p) => seritNo(p) === seritNo(a));
              const seciliKalem = (tur: 'giren' | 'yan', sira: number) => s !== null && s.tur === tur && 'sira' in s && s.adimId === a.id && s.urunId === kok.id && s.sira === sira;
              const sonSeritte = liste.filter((x) => seritNo(x) === seritNo(a)).at(-1)?.id === a.id;
              return [
                <div key={`u${a.id}`} className="tc-rr1-hat-ust" data-k={sut(c)} data-s={sat(a, 0)}>
                  {b && (
                    <span className={`tc-rr1-hat-dalet tc-rr1-dalserit-${String(Math.min(seritNo(a), 7))}`} title={dalEtiketi(b)}>
                      <Simge ad={b.bagimsiz ? 'up' : 'route'} boyut="k" /> Dal {b.dal}{b.bagimsiz && ` (bağımsız) · ana hatta ${b.birlesme ? `OP ${String(statuNo(b.birlesme))}'de katılır` : 'katılmıyor'}`}
                      {' '}· {String(adimCarpani(a))} adet / mamul{dalDk !== null && ` · ${sayi(Math.round((dalDk / 60) * 10) / 10)} sa`}
                    </span>
                  )}
                  {adimBirlesen(a).length > 0 && <span className="tc-rr1-daletiket"><Simge ad="layers" boyut="k" />birleşir: {adimBirlesen(a).join(', ')}</span>}
                  {/* Bağımlı (varsayılan) adımda etiket yoktur; çizgi düzdür. Örtülü ve bağımsız adım etiketini ve kesik çizgisini taşır. */}
                  {ayniSeritte && a.dep !== 'bagimli' && (
                    <button
                      type="button" className={`tc-rr1-deppill tc-rr1-dep-${a.dep}`} disabled={!duzen}
                      title="Önceki adımla ilişki: dokununca değişir (bağımlı → örtülü → bağımsız)"
                      onClick={() => { r.duzen.degistir(kok.id, (l) => l.map((x) => (x.id === a.id ? bagimlilikYaz(x, sonrakiBagimlilik(x.dep)) : x)), 'Bağlılık değişti'); }}
                    >{bagMetni(a)}</button>
                  )}
                  {dugum?.girenler.map(({ x, sira, dugum: alt }) => {
                    const gm = h.malzeme.get(x.itemId);
                    if (!gm) return null;
                    const akisli = alt.adimlar.length > 0 && !alt.dongu;
                    const acik = acikYm.has(alt.nid);
                    return (
                      <span key={`g${String(sira)}`} className="tc-rr1-hat-kalemw" {...(acik ? { 'data-ymhedef': alt.nid } : {})}>
                        <button type="button" className={`tc-rr1-hat-kalem tc-rr1-cip-giren${seciliKalem('giren', sira) ? ' tc-rr1-secili' : ''}`} title={`${gm.code} ${gm.name}`}
                          onClick={() => { r.sec({ tur: 'giren', urunId: kok.id, adimId: a.id, sira, nid: alt.nid, miktar: alt.miktar }); }}>
                          <i className={`tc-rr1-slot tc-rr1-slot-${gm.type}`}>{turKisa(gm.type)}</i><span>{gm.code}</span><em>{sayi(alt.miktar)} {gm.unit ?? ''}</em>
                        </button>
                        {akisli && (
                          <button type="button" className={`tc-rr1-exp${acik ? ' tc-rr1-exp-acik' : ''}`} aria-expanded={acik}
                            title={`${gm.code} akışını hattın üstünde ${acik ? 'gizle' : 'göster'}; alt ürünün kendi rotasında düzenlenir`}
                            onClick={() => { const y2 = new Set(acikYm); if (acik) y2.delete(alt.nid); else y2.add(alt.nid); setAcikYm(y2); }}>
                            <Simge ad="layers" boyut="k" /> {String(alt.adimlar.length)} adım
                          </button>
                        )}
                      </span>
                    );
                  })}
                  {duzen && (
                    <button type="button" className="tc-rr1-add" onClick={() => { r.sec({ tur: 'girenEkle', urunId: kok.id, adimId: a.id, yerine: null }); }}>
                      <Simge ad="plus" boyut="k" /> Giren
                    </button>
                  )}
                </div>,
                <div key={`k${a.id}`} className={`tc-rr1-hat-hucre tc-rr1-dalserit-${String(Math.min(seritNo(a), 7))}`} data-k={sut(c)} data-s={sat(a, 1)}>
                  <HatKarti r={r} d={kok} a={a} t={z.zaman.get(a.id)} secili={seciliAdim === a.id} suruk={suruk} />
                </div>,
                <div key={`c${a.id}`} className="tc-rr1-hat-alt" data-k={sut(c)} data-s={sat(a, 2)}>
                  {a.id === sonId && (
                    <span className="tc-rr1-hat-kalem tc-rr1-hat-cikti" title={`${m.code} ${m.name}`}>
                      <i className={`tc-rr1-slot tc-rr1-slot-${m.type}`}>{turKisa(m.type)}</i><span>{m.code}</span><em>{sayi(kok.miktar)} {m.unit ?? ''}</em>
                    </span>
                  )}
                  {dugum?.yanlar.map(({ y: yan, sira, miktar }) => {
                    const ym = h.malzeme.get(yan.itemId);
                    return ym ? (
                      <button key={`y${String(sira)}`} type="button" className={`tc-rr1-hat-kalem tc-rr1-cip-yan${seciliKalem('yan', sira) ? ' tc-rr1-secili' : ''}`} title={`${ym.code} ${ym.name}: yan ürün`}
                        onClick={() => { r.sec({ tur: 'yan', urunId: kok.id, adimId: a.id, sira, nid: kok.nid, miktar }); }}>
                        <i className={`tc-rr1-slot tc-rr1-slot-${ym.type}`}>{turKisa(ym.type)}</i><span>{ym.code}</span><em>{sayi(miktar)} {ym.unit ?? ''}</em>
                      </button>
                    ) : null;
                  })}
                  {duzen && (
                    <button type="button" className="tc-rr1-add" onClick={() => { r.sec({ tur: 'yanEkle', urunId: kok.id, adimId: a.id, yerine: null }); }}>
                      <Simge ad="plus" boyut="k" /> Yan ürün
                    </button>
                  )}
                  {acikUclar.has(a.id) && <span className="tc-rr1-dalacik" role="note"><Simge ad="alert" boyut="k" />Birleşmiyor</span>}
                </div>,
                duzen && (sonSeritte || liste.some((x) => seritNo(x) === seritNo(a) && (y.kolon.get(x.id) ?? 0) > c)) ? (
                  <div key={`e${a.id}`} data-k={String(c * 2 + 2)} data-s={sat(a, 1)}
                    className={`tc-rr1-hat-arti${surukAdimi && adimDali(surukAdimi) !== dal ? ' tc-rr1-hat-arti-disari' : ''}${birakYeri === a.id ? ' tc-rr1-hat-arti-ustunde' : ''}`}
                    onDragOver={(e) => {
                      if (surukAdimi && (surukAdimi.id === a.id || adimDali(surukAdimi) !== dal)) return;
                      e.preventDefault(); if (birakYeri !== a.id) setBirakYeri(a.id);
                    }}
                    onDragLeave={() => { if (birakYeri === a.id) setBirakYeri(null); }}
                    onDrop={(e) => { e.preventDefault(); birak(a.id, e.dataTransfer.getData(SURUKLE_TURU)); }}>
                    <button type="button" className="tc-rr1-hat-ekle" aria-label={`${adimAdi(a)} ardına adım ekle`} title={`${adimAdi(a)} ardına adım ekle`}
                      onClick={() => { r.sec({ tur: 'adimEkle', urunId: kok.id, sonraId: a.id }); r.paletAc(); }}>
                      <Simge ad="plus" boyut="k" />
                    </button>
                  </div>
                ) : null,
              ];
            })}
            <svg className="tc-rr1-hat-svg" width={olcu.en} height={olcu.boy} aria-hidden="true">
              <defs>
                <marker id={`${ok}-uc`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                  <path className="tc-rr1-hat-ucu" d="M0,0 L10,5 L0,10 z" />
                </marker>
              </defs>
              {yollar.map((p, i) => <path key={String(i)} className={`tc-rr1-hat-yol tc-rr1-hat-yol-${p.tur}`} d={p.d} markerEnd={`url(#${ok}-uc)`} />)}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
