import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { sayi, miktar as miktarMetni } from '../bicim.ts';
import {
  adimAdi, adimBirlesen, adimCarpani, adimDali, bagimlilikYaz, dalBilgileri, dalEtiketi, dalYerlesimi, fasonMu, islemSuresiBos, sirali, sonrakiBagimlilik,
  turKisa, type Adim, type Dugum,
} from './kurallar.ts';
import { bagMetni, fasonAdi, renkSinifi, type RotaEkrani } from './ortak.tsx';
import { SureSeridi, sureGirdisi } from './SureSeridi.tsx';
import { ANA_HAT, hatYerlesimi, zamanCizelgesi, type AdimZamani } from './yatayHat.ts';

// 3248: yatay hat. Rota soldan sağa akar; ana hat üst şeritte, her dal kendi şeridindedir. Dal ayrıldığı adımın altından iner,
// birleştiği adımın altına çıkar. Her adım sütununda üstte girenler, ortada adım, altta çıkanlar durur; hat yalnız yana kayar.
// Hücrenin ızgaradaki yeri veriden gelir ve çizimde yazılır (ekran ölçü yazmaz).

// Kimlik seçiciye yazılmaz (kaçışsız kimlik seçiciyi bozar): kartlar taranır.
const hkBul = (ic: HTMLElement, id: string): HTMLElement | null =>
  [...ic.querySelectorAll<HTMLElement>('[data-hk]')].find((el) => el.dataset.hk === id) ?? null;

interface Yol { d: string; tur: Adim['dep'] }

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
  return yollar;
}

function HatKarti({ r, d, a, t, secili }: { r: RotaEkrani; d: Dugum; a: Adim; t: AdimZamani | undefined; secili: boolean }) {
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
  const sat = (a: Adim, k: 0 | 1 | 2) => String(seritNo(a) * 3 + 1 + k);
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
      {liste.length > 0 && <SureSeridi r={r} d={kok} z={z} miktar={kok.miktar} />}
      {kok.dongu ? <div className="tc-rr1-noroute">Döngü: {m.code} kendi akışında tekrar geçiyor</div> : liste.length === 0 ? (
        <div className="tc-rr1-noroute">
          Rota yok. İlk adımı ekle{duzen ? ': + Adım ekle ile operasyon seç' : ''}.
          {duzen && (
            <button type="button" className="tc-rr1-add" onClick={() => { r.sec({ tur: 'adimEkle', urunId: kok.id, sonraId: null }); r.paletAc(); }}>
              <Simge ad="plus" boyut="k" /> Adım ekle
            </button>
          )}
        </div>
      ) : (
        <div className="tc-rr1-hat" ref={kap} role="group" aria-label="Yatay hat">
          <div className="tc-rr1-hat-ic" ref={ic}>
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
                      <Simge ad="route" boyut="k" /> Dal {b.dal} · {String(adimCarpani(a))} adet / mamul{dalDk !== null && ` · ${sayi(Math.round((dalDk / 60) * 10) / 10)} sa`}
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
                    return (
                      <span key={`g${String(sira)}`} className="tc-rr1-hat-kalemw">
                        <button type="button" className={`tc-rr1-hat-kalem tc-rr1-cip-giren${seciliKalem('giren', sira) ? ' tc-rr1-secili' : ''}`} title={`${gm.code} ${gm.name}`}
                          onClick={() => { r.sec({ tur: 'giren', urunId: kok.id, adimId: a.id, sira, nid: alt.nid, miktar: alt.miktar }); }}>
                          <i className={`tc-rr1-slot tc-rr1-slot-${gm.type}`}>{turKisa(gm.type)}</i><span>{gm.code}</span><em>{sayi(alt.miktar)} {gm.unit ?? ''}</em>
                        </button>
                        {akisli && (
                          <button type="button" className="tc-rr1-exp" title={`${gm.code} rotasını aç; alt ürünün kendi rotasında düzenlenir`} onClick={() => { r.kokSec(gm.id); r.sec(null); }}>
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
                  <HatKarti r={r} d={kok} a={a} t={z.zaman.get(a.id)} secili={seciliAdim === a.id} />
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
                  <div key={`e${a.id}`} className="tc-rr1-hat-arti" data-k={String(c * 2 + 2)} data-s={sat(a, 1)}>
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
