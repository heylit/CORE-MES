import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent as TusOlayi, type PointerEvent as ImlecOlayi } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import {
  EN_ENAZ, SIRALAMA_ADI, SUTUNLAR, ayarOku, ayarYaz, bolmeSinirla, farkEnAz, farkKisaParcalari, farkParcalari, ilerlemeYazisi, sutunlariDuzenle, varsayilanSutunlar,
  type Fark, type Ilerleme, type Siralama, type SutunKimligi, type SutunOlcumu, type TabloAyari,
} from './tablo.ts';

// 3533: Kokpit tablosunun durumu (sıralama, sütunlar, bölme eni), tablo başındaki araçlar, tamamlanma dairesi ve fark rozeti.

// Tablet ve altında varsayılan sütunlar azalır (Tahta bu genişlikte ancak dört sütun taşır).
const DAR_SORGU = '(max-width: 1279px)';
const darMi = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DAR_SORGU).matches;
// Ok tuşuyla bölme bu kadar px oynar.
const OK_ADIMI = 24;

export interface TabloDurumu {
  sira: Siralama; siraSec: (s: Siralama) => void;
  sutunlar: readonly SutunKimligi[]; sutunDegistir: (id: SutunKimligi) => void;
  // null: sütunların doğal eni.
  en: number | null; enYaz: (en: number | null, kalici: boolean) => void;
  // Sütunlar ve genişlik kişinin ayarı mı (sıfırla düğmesi).
  ozel: boolean; sifirla: () => void;
}

export function useTablo(): TabloDurumu {
  const [ayar, setAyar] = useState<TabloAyari>(ayarOku);
  const [sira, siraSec] = useState<Siralama>('plan');
  const [dar, setDar] = useState<boolean>(darMi);
  // Sürükleme sürerken genişlik yalnız ekranda değişir; bırakılınca saklanır.
  const [gecici, setGecici] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const q = window.matchMedia(DAR_SORGU), degisti = (): void => { setDar(q.matches); };
    q.addEventListener('change', degisti);
    return () => { q.removeEventListener('change', degisti); };
  }, []);
  const sutunlar = ayar.sutunlar ?? varsayilanSutunlar(dar);
  const yaz = useCallback((y: TabloAyari): void => { setAyar(y); ayarYaz(y); }, []);
  const sutunDegistir = useCallback((id: SutunKimligi): void => {
    if (id === 'emir') return;
    const simdiki = ayar.sutunlar ?? varsayilanSutunlar(dar), y = new Set(simdiki);
    if (y.has(id)) y.delete(id); else y.add(id);
    yaz({ ...ayar, sutunlar: sutunlariDuzenle(y) });
  }, [ayar, dar, yaz]);
  const enYaz = useCallback((en: number | null, kalici: boolean): void => {
    if (kalici) { setGecici(null); yaz({ ...ayar, en }); } else setGecici(en);
  }, [ayar, yaz]);
  const sifirla = useCallback((): void => { setGecici(null); yaz({ sutunlar: null, en: null }); }, [yaz]);
  return { sira, siraSec, sutunlar, sutunDegistir, en: gecici ?? ayar.en, enYaz, ozel: ayar.sutunlar !== null || ayar.en !== null, sifirla };
}

// Tablo başındaki araçlar: tek Sıralama seçici ve Sütunlar menüsü. Sütunlar telefonda yoktur (orada tablo değil kart listesi var).
export function TabloAraci({ tablo }: { tablo: TabloDurumu }) {
  const [acik, setAcik] = useState(false);
  const dugme = useRef<HTMLButtonElement | null>(null), kap = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!acik) return undefined;
    const bas = (ev: PointerEvent): void => { if (!kap.current?.contains(ev.target as Node)) setAcik(false); };
    const tus = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') { ev.stopPropagation(); setAcik(false); dugme.current?.focus(); } };
    document.addEventListener('pointerdown', bas, true); document.addEventListener('keydown', tus, true);
    return () => { document.removeEventListener('pointerdown', bas, true); document.removeEventListener('keydown', tus, true); };
  }, [acik]);
  return (
    <div className="tc-pyq-tablo-arac" role="group" aria-label="Tablo">
      <label className="tc-pyq-siralama">
        <Simge ad="sort" boyut="k" /><span>Sıralama</span>
        <select value={tablo.sira} onChange={(ev) => { tablo.siraSec(ev.target.value === 'gecikme' ? 'gecikme' : 'plan'); }}>
          {(Object.keys(SIRALAMA_ADI) as Siralama[]).map((k) => <option key={k} value={k}>{SIRALAMA_ADI[k]}</option>)}
        </select>
      </label>
      <span className="tc-pyq-sutun-kap" ref={kap}>
        <button type="button" className="tc-pyq-ok" ref={dugme} aria-expanded={acik} aria-haspopup="true" aria-controls="tc-pyq-sutun-menu" onClick={() => { setAcik(!acik); }}>
          <Simge ad="grid" boyut="k" /><span>Sütunlar</span><b>{tablo.sutunlar.length}</b>
        </button>
        {acik && (
          <div className="tc-pyq-sutun-menu" id="tc-pyq-sutun-menu" role="group" aria-label="Sütunlar">
            {SUTUNLAR.map((s) => (
              <label key={s.id}>
                <input type="checkbox" checked={tablo.sutunlar.includes(s.id)} disabled={s.id === 'emir'} onChange={() => { tablo.sutunDegistir(s.id); }} />
                <span>{s.ad}{s.id === 'emir' ? <small>hep açık</small> : null}</span>
              </label>
            ))}
            <p>Seçiminiz bu tarayıcıda saklanır</p>
            <button type="button" className="tc-pyq-ok" disabled={!tablo.ozel} onClick={() => { tablo.sifirla(); }}>Sütunları ve genişliği varsayılana döndür</button>
          </div>
        )}
      </span>
    </div>
  );
}

// Tamamlanma dairesi: dolu kısım biten adım / toplam adım; ortada yüzde, emir bittiyse onay. Kısa yazı ekran okuyucuya ve ipucuna gider.
const R = 13, ET = 2 * Math.PI * R;
export function Halka({ i, kucuk = false }: { i: Ilerleme; kucuk?: boolean }) {
  const yazi = ilerlemeYazisi(i);
  return (
    <svg className="tc-pyq-halka" data-tam={i.tam ? '' : undefined} data-kucuk={kucuk ? '' : undefined} viewBox="0 0 32 32" role="img" aria-label={yazi}>
      <title>{yazi}</title>
      <circle className="tc-pyq-halka-z" cx="16" cy="16" r={R} />
      {i.oran > 0 && <circle className="tc-pyq-halka-d" cx="16" cy="16" r={R} strokeDasharray={`${String(ET * i.oran)} ${String(ET)}`} />}
      {i.tam ? <path className="tc-pyq-halka-onay" d="M11 16.5l3.6 3.6 6.4-7.2" /> : <text x="16" y="16" textAnchor="middle" dominantBaseline="central" fontSize={10}>{String(Math.round(i.oran * 100))}</text>}
    </svg>
  );
}

// Veri yok: sıfır uydurulmaz, çizgi yazılır; ekran okuyucu ne olmadığını duyar.
export function Bos({ ad }: { ad: string }) {
  return <span className="tc-pyq-bos" title={ad}><span aria-hidden="true">—</span><span className="tc-gizli-etiket">{ad}</span></span>;
}
// Yazı kesilmez: dar sütunda rozet satır kırar, ama "4 gün" gibi sayı ve birim ayrılmaz (her parça kırılmaz bir kutu).
export function FarkRozeti({ f, ipucu, kisa = false }: { f: Fark | null; ipucu?: string; kisa?: boolean }) {
  if (f === null) return <Bos ad="Fark yok: termin ya da plan yok" />;
  const p = (kisa ? farkKisaParcalari : farkParcalari)(f.yazi), parcalar = p.map((x, i) => <Fragment key={i}>{i > 0 ? ' ' : ''}<span>{x}</span></Fragment>);
  if (!kisa || p.join(' ') === f.yazi) return <span className="tc-pyq-fark" data-ton={f.ton} data-kisa={kisa ? '' : undefined} title={ipucu}>{parcalar}</span>;
  return <span className="tc-pyq-fark" data-ton={f.ton} data-kisa="" title={ipucu}><span aria-hidden="true">{parcalar}</span><span className="tc-gizli-etiket">{f.yazi}</span></span>;
}

// Tablo ile gantt arasındaki ayraç: sürüklenir, ok tuşlarıyla oynar, çift tıkta doğal ene döner. Satırlardaki kopyalar yalnız fare tutamağıdır
// (erisilir yok); başlıktaki gerçek ayraçtır.
export function Ayrac({ tablo, erisilir = false, deger }: { tablo: Pick<TabloDurumu, 'enYaz'>; erisilir?: boolean; deger?: number }) {
  const surukle = (ev: ImlecOlayi<HTMLElement>): void => {
    if (ev.button > 0) return;
    ev.preventDefault();
    const tahta = ev.currentTarget.closest<HTMLElement>('.tc-pyq-tahta'), bas = ev.currentTarget.closest<HTMLElement>('.tc-pyq-bas');
    if (!tahta || !bas) return;
    const x0 = ev.clientX, en0 = bas.getBoundingClientRect().width, kap = tahta.clientWidth;
    const hedef = ev.currentTarget;
    hedef.setAttribute('data-surukle', '');
    let son = en0;
    const tasi = (e: PointerEvent): void => { son = bolmeSinirla(en0 + e.clientX - x0, kap); tablo.enYaz(son, false); };
    const birak = (): void => {
      document.removeEventListener('pointermove', tasi); document.removeEventListener('pointerup', birak); document.removeEventListener('pointercancel', birak);
      hedef.removeAttribute('data-surukle');
      tablo.enYaz(son, true);
    };
    document.addEventListener('pointermove', tasi); document.addEventListener('pointerup', birak); document.addEventListener('pointercancel', birak);
  };
  const tus = (ev: TusOlayi<HTMLElement>): void => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    const bas = ev.currentTarget.closest<HTMLElement>('.tc-pyq-bas'), kap = ev.currentTarget.closest<HTMLElement>('.tc-pyq-tahta')?.clientWidth ?? 0;
    if (!bas) return;
    tablo.enYaz(bolmeSinirla(bas.getBoundingClientRect().width + (ev.key === 'ArrowRight' ? OK_ADIMI : -OK_ADIMI), kap), true);
  };
  const ortak = { className: 'tc-pyq-ayrac', onPointerDown: surukle, onDoubleClick: () => { tablo.enYaz(null, true); } } as const;
  return erisilir
    ? <span {...ortak} role="separator" aria-orientation="vertical" aria-valuenow={deger} aria-valuemin={EN_ENAZ} aria-label="Tablo genişliği" title="Sürükleyin ya da ok tuşlarını kullanın; çift tık varsayılan genişlik" tabIndex={0} onKeyDown={tus} />
    : <span {...ortak} aria-hidden="true" />;
}

// 3570: sütunların içerik eni. Verilen satırların tablo hücreleri tahtanın içinde gizli, kendi düzeni kapalı (contain) bir ölçü kabına
// kopyalanır; orada her hücre kendi içerik enindedir (tek satır; CSS .tc-pyq-olcu). Enler okunur, kap kalkar. Asıl tablo ölçüm için
// yeniden dizilmez (800 emirde bütün tabloyu yeniden dizmek tıklamayı dondurur). Fark rozetinin en dar hali: yan yana iki parça ve
// çerçeve. Ölçülecek bir şey yoksa null.
// Her sütunda yazısı en uzun görünen birkaç satır seçilir; yalnız onlar düzenle ölçülür. Metin eni tuvalle (düzen hesabı yapmadan)
// sütunun yazı tipiyle kestirilir; tuval yoksa (test ortamı) harf sayısı kullanılır. Hücrenin yazı dışı payı (ikon, boşluk) sütunda sabittir.
export function olcuAdaylari(satirlar: readonly HTMLElement[], adet = 3, sutunlar?: ReadonlySet<string>): HTMLElement[] {
  if (satirlar.length <= adet) return [...satirlar];
  const tuval = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1).getContext('2d') : null;
  const yazi = new Map<string, string>(), enIyi = new Map<string, { s: HTMLElement; p: number }[]>();
  let sonYazi = '';
  const cocuk = (e: Element | null | undefined, sinif: string): Element | undefined => (e ? [...e.children].find((x) => x.classList.contains(sinif)) : undefined);
  for (const s of satirlar) {
    const izgara = cocuk(cocuk(s, 'tc-pyq-bas'), 'tc-pyq-tablo-satir');
    if (!izgara) continue;
    for (const h of izgara.children) {
      if (!(h instanceof HTMLElement)) continue;
      const id = h.dataset['sutun'];
      if (id === undefined || (sutunlar && !sutunlar.has(id))) continue;
      const t = h.textContent ?? '';
      let p = t.length;
      if (tuval) {
        let f = yazi.get(id);
        if (f === undefined) { f = getComputedStyle(h.firstElementChild ?? h).font; yazi.set(id, f); }
        if (f !== sonYazi) { tuval.font = f; sonYazi = f; }
        p = tuval.measureText(t).width;
      }
      const l = enIyi.get(id) ?? [];
      if (l.length < adet || p > (l[l.length - 1]?.p ?? 0)) {
        l.push({ s, p }); l.sort((x, y) => y.p - x.p); if (l.length > adet) l.pop();
        enIyi.set(id, l);
      }
    }
  }
  const secilen = new Set<HTMLElement>();
  for (const l of enIyi.values()) for (const x of l) secilen.add(x.s);
  return satirlar.filter((s) => secilen.has(s));
}

// 3660: açık emrin adım satırları yalnız bu sütunlarda ölçülür; Durum ve Süre yazısı ("Bekliyor", "4 gün 7 sa 30 dk") sütunu açar. Adım adı (Emir
// sütunu) ve Tezgâh eskisi gibi ölçülmez: uzun ad sütunu şişirmez, "…" ile kısalır.
export const ADIM_OLCULEN: ReadonlySet<string> = new Set(['adet', 'bitis', 'ilerleme']);

export function sutunlariOlc(kap: HTMLElement, satirlar: readonly HTMLElement[]): SutunOlcumu | null {
  const en: Record<string, number> = {}, baslik: Record<string, number> = {};
  let fark: number | null = null;
  const olcu = document.createElement('div');
  olcu.className = 'tc-pyq-olcu';
  olcu.setAttribute('aria-hidden', 'true');
  // Satır ve bölmenin kendisi boş kopyalanır (seçiciler aynı tutsun), yalnız hücre ızgarası içeriğiyle.
  for (const s of satirlar) {
    const izgara = s.querySelector(':scope > .tc-pyq-bas > .tc-pyq-tablo-satir'), bas = izgara?.parentElement;
    if (!izgara || !bas) continue;
    const s2 = s.cloneNode(false) as HTMLElement, b2 = bas.cloneNode(false);
    s2.removeAttribute('data-satir');
    const g2 = izgara.cloneNode(true) as HTMLElement;
    // 3681: bölünmüş adımın satırında adım adı da ölçülür (pay satırları aynı sütunda "Pay 1/2" yazar, ad "…" ile kaybolmasın).
    if (s.hasAttribute('data-agac-adim')) for (const h of [...g2.children]) if (!ADIM_OLCULEN.has((h as HTMLElement).dataset['sutun'] ?? '') && !((h as HTMLElement).dataset['sutun'] === 'emir' && h.querySelector('[data-pay-ac]'))) h.remove();
    b2.appendChild(g2);
    s2.appendChild(b2);
    olcu.appendChild(s2);
  }
  kap.appendChild(olcu);
  try {
    for (const h of olcu.querySelectorAll<HTMLElement>('.tc-pyq-tablo-satir > .tc-pyq-h[data-sutun]')) {
      const id = h.dataset['sutun'] ?? '', k = h.getBoundingClientRect(), w = Math.ceil(k.width);
      en[id] = Math.max(en[id] ?? 0, w);
      if (h.getAttribute('role') === 'columnheader') baslik[id] = Math.max(baslik[id] ?? 0, w);
      const r = id === 'fark' ? h.querySelector<HTMLElement>('.tc-pyq-fark') : null;
      if (!r) continue;
      const p = r.hasAttribute('data-kisa') ? [] : [...r.children].filter((x): x is HTMLElement => x instanceof HTMLElement && x.tagName === 'SPAN').map((x) => x.getBoundingClientRect());
      const ilk = p[0], son = p[p.length - 1], ikinci = p[1];
      const aday = ilk && son ? farkEnAz(p.map((x) => x.width), ikinci ? ikinci.left - ilk.right : 0, k.width - (son.right - ilk.left)) : w;
      fark = Math.max(fark ?? 0, aday);
    }
  } finally { olcu.remove(); }
  return Object.values(en).some((x) => x > 0) ? { en, baslik, fark } : null;
}
