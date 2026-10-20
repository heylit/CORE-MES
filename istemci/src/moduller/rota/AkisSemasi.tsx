import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { Adim, RevizyonAyrintisi, UrunOzeti } from '#paylasilan/sozlesme/rota.ts';
import { araya, bagimlilikDegistir, kaydir, sil, tasi, yeniAdim, type KatalogTipi } from './duzenleme.ts';
import { DURUM_ETIKETI, adimSuresiMetni, araHalAdi, birimMetni, istasyonRengi, kaynakAdi, kaynakKisa, sayiMetni, sureMetni, turKisa } from './gorunum.ts';
import type { Secim } from './secim.ts';
import type { Degisiklik, Dugum } from './useRotaCalisma.ts';

export const YAKINLIK = [30, 40, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200] as const;
type Yakinlik = (typeof YAKINLIK)[number];

interface Ortak {
  dugumler: readonly Dugum[];
  ayrintilar: ReadonlyMap<string, RevizyonAyrintisi>;
  duzenlenebilir: (urunId: number) => boolean;
  // Revizyon listesi gelmiş ve boşsa ürünün rotası yoktur; yoksa ayrıntı beklenir.
  rotasiz?: (urunId: number) => boolean;
  varsayilanTip: KatalogTipi | null;
  secim: Secim | null;
  sec: (s: Secim | null) => void;
  degistir: (urunId: number, d: Degisiklik) => void;
  bilesenEkleAc: (urunId: number, opNo: number, tur: 'bilesen' | 'yan') => void;
  kapali: ReadonlySet<string>;
  kapaliDegistir: (nid: string) => void;
  z?: number;
}

const anahtar = (nid: string, opNo: number) => `${nid}|${opNo}`;

export function Cip({ tur, urun, baslik, alt, miktar, birim, rozet, secili, besler, cikan, sec, arahal }: {
  tur: 'giren' | 'onceki' | 'sonraki' | 'ana' | 'yan';
  urun: UrunOzeti; baslik: string; alt: string; miktar: string; birim: string; rozet: ReactNode;
  secili: boolean; besler?: string; cikan?: string; sec: () => void; arahal?: boolean;
}) {
  return (
    <span className="tc-cipw">
      <button
        type="button"
        className={`tc-cip tc-cip-${tur}${arahal ? ' tc-cip-arahal' : ''}${secili ? ' tc-secili' : ''}`}
        data-besler={besler}
        data-cikan={cikan}
        onClick={sec}
      >
        <span className={`tc-slot${arahal ? ' tc-slot-arahal' : ''} tc-slot-${urun.tur}`}>{arahal ? <><em>{turKisa(urun.tur)}</em><i>S</i></> : turKisa(urun.tur)}</span>
        <span className="tc-ci"><b>{baslik}</b><small>{alt}</small>{rozet}</span>
        <span className="tc-cq">{sayiMetni(miktar)}<small>{birim}</small></span>
      </button>
    </span>
  );
}

export function OpKutusu({ a, d, urun, sonraki, secili, duzen, sec, birakildi }: {
  a: Adim; d: Dugum; urun: UrunOzeti; sonraki: Adim | undefined; secili: boolean; duzen: boolean; sec: () => void; birakildi: (kaynak: string) => void;
}) {
  const [ustunde, ustundeYaz] = useState(false);
  return (
    <button
      type="button"
      className={`tc-opbox ${istasyonRengi(a.kaynak?.istasyon?.id ?? null)}${secili ? ' tc-secili' : ''}${ustunde ? ' tc-birak' : ''}`}
      data-uc={anahtar(d.nid, a.opNo)}
      data-sonraki={sonraki ? anahtar(d.nid, sonraki.opNo) : undefined}
      data-bag={sonraki?.bagimlilik}
      draggable={duzen}
      onDragStart={(o) => { o.dataTransfer.setData('text/plain', `${d.urunId}|${a.opNo}`); o.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={(o) => { if (duzen) { o.preventDefault(); ustundeYaz(true); } }}
      onDragLeave={() => ustundeYaz(false)}
      onDrop={(o) => { o.preventDefault(); ustundeYaz(false); birakildi(o.dataTransfer.getData('text/plain')); }}
      onClick={sec}
      aria-label={`OP ${a.opNo} ${a.ad}`}
    >
      <span className="tc-obar"><span className="tc-abbr">{a.operasyonTipi.kod}</span><span className="tc-oseq">OP {a.opNo}</span></span>
      <b className="tc-oname">{a.ad}</b>
      <span className="tc-ost">{a.kaynak ? kaynakKisa(a.kaynak) : 'Makine ya da kişi atanmadı'}</span>
      <span className="tc-otime">{adimSuresiMetni(a)}{a.firePayiYuzde !== '0.00' && `, fire payı %${sayiMetni(a.firePayiYuzde)}`}</span>
      <span className="tc-ostat2">→ <b>{a.akis.cikti.tur === 'urun' ? 'ürün' : araHalAdi(urun, a)}</b></span>
      {a.adaylar.length > 0 && <span className="tc-oalt">Aday: {a.adaylar.map((x) => kaynakAdi(x.kaynak)).join(' / ')}</span>}
    </button>
  );
}

export const DEP_METNI = (a: Adim) => (a.bagimlilik === 'akisli' ? `akışlı: ${a.devirAdedi ?? 1} adet birikince` : a.bagimlilik === 'bagimsiz' ? 'bağımsız: beklemez' : 'bekleyen: önceki bitince');

function Kolon({ d, ust, o }: { d: Dugum; ust: string | null; o: Ortak }) {
  const a = o.ayrintilar.get(d.nid);
  const duzen = o.duzenlenebilir(d.urunId);
  const altlar = o.dugumler.filter((x) => x.nid.startsWith(`${d.nid}/`) && x.nid.split('/').length === d.nid.split('/').length + 2);
  if (!a) return <div className="tc-rcol tc-rcol-alt"><p className="tc-rota-bos">{o.rotasiz?.(d.urunId) ? 'Bu mamulün rotası yok' : 'Rota yükleniyor…'}</p></div>;
  const urun = a.urun;
  const kok = ust === null;
  const r = a.revizyon;
  const basSecili = o.secim?.tur === 'urun' && o.secim.nid === d.nid;
  const adimlar = a.adimlar;
  const ilkEkle = () => { if (o.varsayilanTip) o.degistir(d.urunId, araya(null, yeniAdim(o.varsayilanTip))); };
  return (
    <div className={`tc-rcol ${kok ? 'tc-rcol-kok' : 'tc-rcol-alt'}`}>
      <div className="tc-g3">
        <div className="tc-cin" />
        <div className="tc-cop">
          <div className="tc-rhd-wrap">
            {!kok && <button type="button" className="tc-ib" onClick={() => o.kapaliDegistir(d.nid)} aria-label="Alt akışı gizle">▾</button>}
            <button type="button" className={`tc-rhd${basSecili ? ' tc-secili' : ''}`} onClick={() => o.sec({ tur: 'urun', nid: d.nid, urunId: d.urunId })}>
              <span className={`tc-slot tc-slot-${urun.tur}`}>{turKisa(urun.tur)}</span>
              <span className="tc-ci">
                <b>{urun.stokKodu ?? urun.ad} rotası <span className={`tc-rvchip tc-rv-${r.durum}`}>Rev {r.harf} {DURUM_ETIKETI[r.durum].toLocaleLowerCase('tr-TR')}</span></b>
                <small>{urun.ad}</small>
              </span>
              <span className="tc-cq">{sayiMetni(a.miktar)}<small>{birimMetni(urun.stokBirimi)}</small></span>
            </button>
          </div>
        </div>
        <div className="tc-cout" />
        {adimlar.map((adim, i) => {
          const uc = anahtar(d.nid, adim.opNo);
          const sonraki = adimlar[i + 1];
          const secili = (t: Secim['tur'], m?: number) => o.secim !== null && o.secim.tur === t && o.secim.nid === d.nid && o.secim.opNo === adim.opNo
            && (m === undefined || ('malzemeId' in o.secim && o.secim.malzemeId === m));
          return [
            <div key={`i${adim.opNo}`} className="tc-cin">
              {adim.akis.tuketir.map((op) => {
                const kaynak = adimlar.find((x) => x.opNo === op);
                return (
                  <Cip key={`f${op}`} tur="onceki" arahal urun={urun} baslik={kaynak ? araHalAdi(urun, kaynak) : `OP ${op}`}
                    alt={`${urun.stokKodu ?? ''} ${urun.ad}`} miktar={adim.adimMiktari} birim={birimMetni(urun.stokBirimi)}
                    rozet={<span className="tc-kb tc-kb-in">önceki adımdan, tüketilir</span>} besler={uc}
                    secili={false} sec={() => o.sec({ tur: 'adim', nid: d.nid, urunId: d.urunId, opNo: op })} />
                );
              })}
              {adim.bilesenler.map((b) => {
                const alt = altlar.find((x) => x.urunId === b.malzeme.id && x.nid.includes(`/${adim.opNo}/`));
                if (alt && !o.kapali.has(alt.nid)) return <div key={b.malzeme.id} className="tc-subwrap"><Kolon d={alt} ust={uc} o={o} /></div>;
                return (
                  <span key={b.malzeme.id} className="tc-cipw">
                    <Cip tur="giren" urun={b.malzeme} baslik={b.malzeme.stokKodu ?? b.malzeme.ad} alt={b.malzeme.ad} miktar={b.toplamMiktar}
                      birim={birimMetni(b.malzeme.stokBirimi)} besler={uc}
                      rozet={b.fireYuzde !== '0.00' ? <span className="tc-kb">fire %{sayiMetni(b.fireYuzde)}</span> : null}
                      secili={secili('bilesen', b.malzeme.id)}
                      sec={() => o.sec({ tur: 'bilesen', nid: d.nid, urunId: d.urunId, opNo: adim.opNo, malzemeId: b.malzeme.id })} />
                    {alt && <button type="button" className="tc-exp" onClick={() => o.kapaliDegistir(alt.nid)} aria-label={`${b.malzeme.ad} alt akışını göster`}>▸ akış</button>}
                  </span>
                );
              })}
              {duzen && <button type="button" className="tc-add" onClick={() => o.bilesenEkleAc(d.urunId, adim.opNo, 'bilesen')}>+ Giren</button>}
            </div>,
            <div key={`o${adim.opNo}`} className="tc-cop">
              {i > 0 && (
                <button type="button" className={`tc-deppill tc-dep-${adim.bagimlilik}`} disabled={!duzen}
                  title="Önceki adımla ilişki: dokununca değişir (bekleyen → akışlı → bağımsız)"
                  onClick={() => o.degistir(d.urunId, bagimlilikDegistir(adim.opNo))}>{DEP_METNI(adim)}</button>
              )}
              <OpKutusu a={adim} d={d} urun={urun} sonraki={sonraki} duzen={duzen} secili={secili('adim')}
                sec={() => o.sec({ tur: 'adim', nid: d.nid, urunId: d.urunId, opNo: adim.opNo })}
                birakildi={(kaynak) => {
                  const [u, op] = kaynak.split('|').map(Number);
                  if (u === d.urunId && op !== undefined && op !== adim.opNo) o.degistir(d.urunId, tasi(op, adim.opNo));
                }} />
              {duzen && (
                <div className="tc-stepbar">
                  <button type="button" className="tc-ib" disabled={i === 0} onClick={() => o.degistir(d.urunId, kaydir(adim.opNo, -1))} title="Yukarı taşı (Alt+Shift+↑)" aria-label={`OP ${adim.opNo} yukarı taşı`}>↑</button>
                  <button type="button" className="tc-ib" disabled={i === adimlar.length - 1} onClick={() => o.degistir(d.urunId, kaydir(adim.opNo, 1))} title="Aşağı taşı (Alt+Shift+↓)" aria-label={`OP ${adim.opNo} aşağı taşı`}>↓</button>
                  <button type="button" className="tc-add tc-add-between" disabled={!o.varsayilanTip}
                    onClick={() => { if (o.varsayilanTip) o.degistir(d.urunId, araya(adim.opNo, yeniAdim(o.varsayilanTip))); }}>+ Araya adım</button>
                  <button type="button" className="tc-ib tc-ib-sil" onClick={() => o.degistir(d.urunId, sil(adim.opNo))} title="Adımı sil" aria-label={`OP ${adim.opNo} sil`}>✕</button>
                </div>
              )}
            </div>,
            <div key={`c${adim.opNo}`} className="tc-cout">
              {adim.akis.cikti.tur === 'urun'
                ? <Cip tur="ana" urun={urun} baslik={urun.stokKodu ?? urun.ad} alt={urun.ad} miktar={a.miktar} birim={birimMetni(urun.stokBirimi)}
                    rozet={<span className="tc-kb tc-kb-ana">{kok ? 'Ana çıktı' : 'Çıktı, üst akışa'}</span>}
                    cikan={uc} besler={ust ?? undefined} secili={basSecili} sec={() => o.sec({ tur: 'urun', nid: d.nid, urunId: d.urunId })} />
                : <Cip tur="sonraki" arahal urun={urun} baslik={araHalAdi(urun, adim)} alt={`${urun.stokKodu ?? ''} ${urun.ad}`}
                    miktar={sonraki?.adimMiktari ?? adim.adimMiktari} birim={birimMetni(urun.stokBirimi)}
                    rozet={<span className="tc-kb tc-kb-ana">sonraki adıma</span>} cikan={uc} secili={false}
                    sec={() => o.sec({ tur: 'adim', nid: d.nid, urunId: d.urunId, opNo: adim.opNo })} />}
              {adim.yanUrunler.map((y) => (
                <Cip key={y.malzeme.id} tur="yan" urun={y.malzeme} baslik={y.malzeme.stokKodu ?? y.malzeme.ad} alt={y.malzeme.ad} miktar={y.miktar}
                  birim={birimMetni(y.malzeme.stokBirimi)} rozet={<span className="tc-kb tc-kb-yan">yan ürün</span>} cikan={uc}
                  secili={secili('yan', y.malzeme.id)} sec={() => o.sec({ tur: 'yan', nid: d.nid, urunId: d.urunId, opNo: adim.opNo, malzemeId: y.malzeme.id })} />
              ))}
              {duzen && <button type="button" className="tc-add" onClick={() => o.bilesenEkleAc(d.urunId, adim.opNo, 'yan')}>+ Yan ürün</button>}
            </div>,
          ];
        })}
      </div>
      {adimlar.length === 0 && (
        <div className="tc-noroute">
          <p>Bu ürünün rotasında adım yok.</p>
          {duzen && <button type="button" className="tc-add" onClick={ilkEkle}>+ İlk adımı ekle</button>}
        </div>
      )}
    </div>
  );
}

interface Kenar { d: string; tur: 'ef' | 'ef-akisli' | 'ef-bagimsiz' | 'ei' | 'eo' }

// Kenarlar kutuların gerçek yerinden ölçülür; koordinatlar yakınlaştırılmamış içerik birimindedir (SVG de içerikle ölçeklenir).
function kenarlariOlc(ic: HTMLElement, olcek: number): { kenarlar: Kenar[]; en: number; boy: number } {
  const kok = ic.getBoundingClientRect();
  const kutu = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: (r.left - kok.left) / olcek, y: (r.top - kok.top) / olcek, w: r.width / olcek, h: r.height / olcek };
  };
  const uclar = new Map<string, Element>();
  ic.querySelectorAll('[data-uc]').forEach((el) => uclar.set(el.getAttribute('data-uc') ?? '', el));
  const kenarlar: Kenar[] = [];
  const egri = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = Math.max(24, (x2 - x1) / 2);
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  };
  uclar.forEach((el) => {
    const hedef = uclar.get(el.getAttribute('data-sonraki') ?? '');
    if (!hedef) return;
    const a = kutu(el); const b = kutu(hedef);
    const bag = el.getAttribute('data-bag');
    kenarlar.push({ d: `M${a.x + a.w / 2},${a.y + a.h} L${b.x + b.w / 2},${b.y}`, tur: bag === 'akisli' ? 'ef-akisli' : bag === 'bagimsiz' ? 'ef-bagimsiz' : 'ef' });
  });
  ic.querySelectorAll('[data-besler]').forEach((el) => {
    const op = uclar.get(el.getAttribute('data-besler') ?? '');
    if (!op) return;
    const a = kutu(el); const b = kutu(op);
    kenarlar.push({ d: egri(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2), tur: 'ei' });
  });
  ic.querySelectorAll('[data-cikan]').forEach((el) => {
    const op = uclar.get(el.getAttribute('data-cikan') ?? '');
    if (!op) return;
    const a = kutu(op); const b = kutu(el);
    kenarlar.push({ d: egri(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2), tur: 'eo' });
  });
  return { kenarlar, en: kok.width / olcek, boy: kok.height / olcek };
}

export function AkisSemasi(props: Ortak & { tamEkran: boolean; tamEkranDegistir: () => void }) {
  const vp = useRef<HTMLDivElement>(null);
  const ic = useRef<HTMLDivElement>(null);
  const [z, zYaz] = useState<Yakinlik>(100);
  const [yardim, yardimYaz] = useState(false);
  const [cizim, cizimYaz] = useState<{ kenarlar: Kenar[]; en: number; boy: number }>({ kenarlar: [], en: 0, boy: 0 });
  const capa = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const surukle = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const kok = props.dugumler[0];

  const sonCizim = useRef('');
  // Ölçü değişmediyse durum yazılmaz: her çizim yeni nesne üretir, koşulsuz yazmak sonsuz döngü olur.
  const olc = useCallback(() => {
    if (!ic.current) return;
    const yeni = kenarlariOlc(ic.current, z / 100);
    const imza = JSON.stringify(yeni);
    if (imza !== sonCizim.current) { sonCizim.current = imza; cizimYaz(yeni); }
  }, [z]);
  useLayoutEffect(() => {
    olc();
    // İmleç altındaki nokta yakınlaştırmada yerinde kalır.
    const c = capa.current; const v = vp.current;
    if (c && v) { v.scrollLeft = c.cx * (z / 100) - c.x; v.scrollTop = c.cy * (z / 100) - c.y; capa.current = null; }
  });
  useEffect(() => {
    if (!ic.current || typeof ResizeObserver === 'undefined') return undefined;
    const g = new ResizeObserver(() => olc());
    g.observe(ic.current);
    return () => g.disconnect();
  }, [olc]);

  const yakinlas = useCallback((yon: 1 | -1, nokta?: { x: number; y: number }) => {
    const v = vp.current; if (!v) return;
    dokundu.current = kok?.nid ?? null;
    const i = YAKINLIK.indexOf(z);
    const yeni = YAKINLIK[Math.min(YAKINLIK.length - 1, Math.max(0, i + yon))] ?? z;
    if (yeni === z) return;
    const p = nokta ?? { x: v.clientWidth / 2, y: v.clientHeight / 2 };
    capa.current = { x: p.x, y: p.y, cx: (v.scrollLeft + p.x) / (z / 100), cy: (v.scrollTop + p.y) / (z / 100) };
    zYaz(yeni);
  }, [z]);

  // Görünür çalışma alanı: şemanın üstünde yüzen araç katmanı düşülür (tam sayfa tahtada); yan panel şemanın dışında olduğundan görünür genişliği zaten daraltır.
  const gorunurAlan = (v: HTMLElement) => {
    const vr = v.getBoundingClientRect();
    const sayfa = v.closest('.tc-sch2-sema');
    const kat = sayfa?.querySelector('.tc-ust-katman');
    const yuzen = (el: Element | null | undefined) => el && getComputedStyle(el).position === 'absolute';
    const ust = yuzen(kat) ? Math.max(0, kat!.getBoundingClientRect().bottom - vr.top + 8) : 0;
    return { sol: 0, ust, en: Math.max(100, vr.width), boy: Math.max(100, vr.height - ust) };
  };

  // Sığdır: kök rota görünür alana ortalanır (Home: genişliğe sığar, üstten başlar). Tahta sınırsızdır; boşluk içeriğin çevresindedir.
  const sigdir = useCallback((yalnizGenislik: boolean) => {
    const v = vp.current; const i = ic.current;
    const hedef = i?.querySelector('.tc-rcol-kok');
    if (!v || !i || !hedef) return;
    const olcek = z / 100;
    const ir = i.getBoundingClientRect(); const hr = hedef.getBoundingClientRect();
    const x = (hr.left - ir.left) / olcek; const y = (hr.top - ir.top) / olcek; const w = hr.width / olcek; const h = hr.height / olcek;
    if (w === 0) return;
    const alan = gorunurAlan(v);
    const oran = Math.min(alan.en / w, yalnizGenislik ? Infinity : alan.boy / h, 1) * 95;
    const yeni = [...YAKINLIK].reverse().find((t) => t <= oran) ?? 30;
    const nokta = { x: alan.sol + alan.en / 2, y: yalnizGenislik ? alan.ust + 16 : alan.ust + alan.boy / 2 };
    const merkez = { cx: x + w / 2, cy: yalnizGenislik ? y : y + h / 2 };
    if (yeni === z) { v.scrollLeft = merkez.cx * olcek - nokta.x; v.scrollTop = merkez.cy * olcek - nokta.y; capa.current = null; return; }
    capa.current = { ...nokta, ...merkez };
    zYaz(yeni);
  }, [z]);

  // Seçilen adım araç katmanının altında ya da panel açılınca daralan alanın dışında kalırsa görünür alana kaydırılır (panel açıldıktan sonraki karede).
  const secimAnahtari = props.secim ? `${props.secim.nid}|${props.secim.opNo ?? 'u'}|${props.secim.tur}` : null;
  useEffect(() => {
    if (secimAnahtari === null) return undefined;
    const kare = requestAnimationFrame(() => {
      const v = vp.current;
      // Adım kutusu (eşleşme öznitelik değeriyle, seçici kaçışı gerekmez).
      const anahtar = secimAnahtari.split('|').slice(0, 2).join('|');
      const el = [...(v?.querySelectorAll('[data-uc]') ?? [])].find((x) => x.getAttribute('data-uc') === anahtar);
      if (!v || !el) return;
      const vr = v.getBoundingClientRect(); const r = el.getBoundingClientRect(); const alan = gorunurAlan(v);
      const sol = r.left - vr.left; const ust = r.top - vr.top;
      const icinde = sol >= alan.sol && sol + r.width <= alan.sol + alan.en && ust >= alan.ust && ust + r.height <= alan.ust + alan.boy;
      if (!icinde) { v.scrollLeft += sol + r.width / 2 - (alan.sol + alan.en / 2); v.scrollTop += ust + r.height / 2 - (alan.ust + alan.boy / 2); }
    });
    return () => cancelAnimationFrame(kare);
  }, [secimAnahtari]);

  // Açılışta akış yüklendikçe bütünü sığdırılır; kullanıcı yakınlaştırınca ya da gezinince görünümü korunur.
  const dokundu = useRef<string | null>(null);
  const kokNid = kok?.nid ?? null;
  useEffect(() => {
    if (kokNid === null || cizim.en === 0 || dokundu.current === kokNid) return;
    sigdir(false);
  }, [kokNid, cizim.en, cizim.boy, sigdir]);
  const elle = () => { dokundu.current = kokNid; };

  useEffect(() => {
    const v = vp.current; if (!v) return undefined;
    // Fare tekerleği imlecin olduğu yere yakınlaştırır ya da uzaklaştırır; şema üzerindeyken sayfa kaymaz.
    // Gezinme sürükleyerek ve ok tuşlarıyladır.
    let son = 0;
    const tekerlek = (o: WheelEvent) => {
      o.preventDefault();
      // Dokunmatik yüzey bir hareketle çok sayıda olay yollar; adım adım yakınlaşsın diye kısa aralıklar yok sayılır.
      const simdi = performance.now();
      if (Math.abs(o.deltaY) < 1 || simdi - son < 70) return;
      son = simdi;
      const r = v.getBoundingClientRect();
      yakinlas(o.deltaY < 0 ? 1 : -1, { x: o.clientX - r.left, y: o.clientY - r.top });
    };
    v.addEventListener('wheel', tekerlek, { passive: false });
    return () => v.removeEventListener('wheel', tekerlek);
  }, [yakinlas]);

  const tus = (o: KeyboardEvent<HTMLDivElement>) => {
    const v = vp.current; if (!v || (o.target as HTMLElement).closest('input, select, textarea')) return;
    const adim = o.shiftKey ? 240 : 60;
    const harita: Record<string, () => void> = {
      ArrowLeft: () => { v.scrollLeft -= adim; }, ArrowRight: () => { v.scrollLeft += adim; },
      ArrowUp: () => { v.scrollTop -= adim; }, ArrowDown: () => { v.scrollTop += adim; },
      '+': () => yakinlas(1), '=': () => yakinlas(1), '-': () => yakinlas(-1), '0': () => sigdir(false), Home: () => sigdir(true),
      f: () => props.tamEkranDegistir(), F: () => props.tamEkranDegistir(),
    };
    if (o.altKey || o.ctrlKey || o.metaKey) return;
    const is = harita[o.key];
    if (is) { o.preventDefault(); elle(); is(); }
  };

  const basla = (o: PointerEvent<HTMLDivElement>) => {
    elle();
    if ((o.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    const v = vp.current; if (!v) return;
    surukle.current = { x: o.clientX, y: o.clientY, sl: v.scrollLeft, st: v.scrollTop };
    v.setPointerCapture(o.pointerId);
  };
  const tasima = (o: PointerEvent<HTMLDivElement>) => {
    const s = surukle.current; const v = vp.current; if (!s || !v) return;
    v.scrollLeft = s.sl - (o.clientX - s.x);
    v.scrollTop = s.st - (o.clientY - s.y);
  };
  const birak = () => { surukle.current = null; };

  return (
    <div className="tc-canvas-kap">
      <div
        ref={vp}
        className="tc-canvas"
        tabIndex={0}
        role="region"
        aria-label="Akış şeması. Tekerlek yakınlaştırır, sürükleyerek gezersin, ok tuşları kaydırır."
        onKeyDown={tus}
        onPointerDown={basla}
        onPointerMove={tasima}
        onPointerUp={birak}
        onPointerCancel={birak}
      >
        <div ref={ic} className={`tc-inner tc-z-${z}`}>
          <svg className="tc-edges" width={cizim.en} height={cizim.boy} aria-hidden="true">
            <defs>
              <marker id="tc-ok-f" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path className="tc-mf" d="M0,0 L10,5 L0,10 z" /></marker>
              <marker id="tc-ok-i" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path className="tc-mi" d="M0,0 L10,5 L0,10 z" /></marker>
              <marker id="tc-ok-o" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path className="tc-mo" d="M0,0 L10,5 L0,10 z" /></marker>
            </defs>
            {cizim.kenarlar.map((k, i) => (
              <path key={i} d={k.d} className={`tc-e-${k.tur}`} markerEnd={k.tur.startsWith('ef') ? 'url(#tc-ok-f)' : k.tur === 'ei' ? 'url(#tc-ok-i)' : 'url(#tc-ok-o)'} />
            ))}
          </svg>
          {kok && <Kolon d={kok} ust={null} o={{ ...props, z }} />}
        </div>
      </div>
      <div className="tc-cv-ctrl" role="group" aria-label="Görünüm">
        <button type="button" className="tc-ib" onClick={() => yakinlas(1)} title="Yakınlaştır (+)" aria-label="Yakınlaştır">+</button>
        <span className="tc-zl">{z}%</span>
        <button type="button" className="tc-ib" onClick={() => yakinlas(-1)} title="Uzaklaştır (−)" aria-label="Uzaklaştır">−</button>
        <button type="button" className="tc-ib" onClick={() => { elle(); sigdir(false); }} title="Tümünü sığdır (0)" aria-label="Tümünü sığdır">⤢</button>
        <button type="button" className="tc-ib" onClick={() => { elle(); sigdir(true); }} title="Genişliğe sığdır, başa git (Home)" aria-label="Genişliğe sığdır">↥</button>
        <button type="button" className="tc-ib" aria-pressed={props.tamEkran} onClick={props.tamEkranDegistir} title="Tam ekran (F)" aria-label="Tam ekran">⛶</button>
        <button type="button" className="tc-ib" aria-pressed={yardim} onClick={() => yardimYaz(!yardim)} title="Gezinme yardımı" aria-label="Gezinme yardımı">?</button>
        <small className="tc-cv-ipucu">Tekerlek yakınlaştırır · sürükleyerek gezin</small>
      </div>
      {yardim && (
        <div className="tc-cv-help">
          <b>Gezinme</b>
          <ul>
            <li><b>Tekerlek:</b> imlecin olduğu yere yakınlaştırır ya da uzaklaştırır.</li>
            <li><b>Sürükle:</b> boş alanı tutup çek.</li>
            <li><b>Klavye:</b> oklar kaydırır (Shift ile hızlı), + / − yakınlaştırır, 0 tümünü sığdırır, Home başa döner, F tam ekran.</li>
            <li><b>Adım:</b> Alt+↑/↓ önceki/sonraki adım, Alt+Shift+↑/↓ adımı taşır, Ctrl+Z / Ctrl+Y geri al / yinele.</li>
            <li><b>Taşıma:</b> operasyon kutusunu başka bir adımın üstüne sürükle; aşağı taşırken onun altına, yukarı taşırken üstüne yerleşir.</li>
          </ul>
        </div>
      )}
      <div className="tc-cv-legend" aria-hidden="true">
        <span><i className="tc-lg tc-lg-in" />Giren</span>
        <span><i className="tc-lg tc-lg-st" />Ara hal kartı</span>
        <span><i className="tc-lg tc-lg-flow" />Rota akışı</span>
        <span><i className="tc-lg tc-lg-out" />Çıkan</span>
      </div>
    </div>
  );
}
