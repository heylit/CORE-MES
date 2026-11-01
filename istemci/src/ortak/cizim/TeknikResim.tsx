import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as TepkiTusu, type PointerEvent as TepkiIsaretci, type ReactNode } from 'react';
import { ESKI_CIZIM, type EskiCizim } from './cekirdek/cizim-merkezi.ts';
import { ALET_ZORUNLU_ILETISI, aletSecimAnahtari, olcumAletDamgasi, seciliAlet } from './cekirdek/olcum-aleti.ts';
import { DurumKutusu, Dugme, Girdi, Secim, Simge, useBildirim, type BildirimTonu } from '../arayuz/index.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { useTema } from '../veri/tema.ts';
import { bellegeKoy, cihazAyari, PDF_BELLEGI, saklanacak, type PdfKaydi } from './bellek.ts';
import { AKTol } from './cekirdek.ts';
import { bekle, tesseract } from './kitaplik.ts';
import { BALON_BOYLARI, BALON_KIPI_ADI, BALON_KIPLERI, balonDizimi, kilavuzCizgisi, type BalonKipi, type DizimKonumu } from './balon-dizimi.ts';
import {
  ayarDuzelt, ayarImzasi, balonCogalt, balonlariCikar, balonYazisi, dosyaBicimi, duzenlemeMetni, enYakinYazi, gdtdenCevir, GDT_SEMBOLLERI, gdtYazimi,
  gdtYazimiMetni, gdtyeCevir, gecmisGeri, gecmisIleri, gecmisKaydet, GORUNUS_ANAHTARLARI, KONTROL_SIKLIKLARI, modelAdiMi, noktaAlanlari, numaraDegistir,
  numaralariUygula, numaraSirasi, ocrGerekir, OLCU_ALETLERI, OLCU_TURLERI, olcuTuru, olcuTuruSec, olcuYazimi, olcuYazimiMetni, olcumDegerlendir,
  olcumRaporu, onerileriEkle, SIRA_YOLU_ADI, TOL_KIPI_ADI, tolKipiSec, toleransKonumu, yeniOneriler, yontem, YONTEM_ADI,
  type Balon, type CalismaDosyasi, type Gecmis, type NumaraYolu, type Oneri, type Olcum, type OlcumYontemi, type OkumaAyari, type SiraYolu, type TolKipi,
} from './kurallar.ts';
import { dosyaOzeti, modelIsle, type Gorunum3B, type ModelKaydi } from './model.ts';
import { Model3B } from './Model3B.tsx';
import { ocrGoruntu, ocrPdfSayfasi } from './ocr.ts';
import { olcuBirlestir, olcuOnerileri, onayIster, tabloBul, type MetinOgesi, type OkumaIstatistigi, type OlcuListesi } from './okuma.ts';
import { useCizimOrtami } from './ortam.tsx';
import { pdfAc, pdfBolge, pdfCiz, pdfGoruntu, renklendir, type PdfBelgesi } from './pdf.ts';
import { pdfKaydiAnahtari, saklananiAc, sayfaKaydi } from './pdf-hazir.ts';
import './cizim.css';

// Teknik resim görüntüleyicisi (teknik-resim.ts Blueprint): PDF sayfası ya da 3B modelden üretilen resim, yakınlaşma ve kaydırma, ölçü
// önerileri (metin katmanı ve OCR), balonlar, ölçüm, operatör notları ve 3B görünüm. Her kullanan (Hazırlık, Operatör, Kalite, Çizim
// stüdyosu) bir `kontrol` verir: dosyalar, balonlar ve ölçümler kullananındır, görüntüleyici yalnız gösterir ve değişikliği bildirir.

export interface ResimNotu { id: string | number; x: number; y: number; text: string; status?: string; by?: string; at: number; reply?: string }
export interface TaniBilgisi {
  C?: PdfKaydi; dims?: OlcuListesi; diag?: PdfKaydi['diag']; ocrDiag?: PdfKaydi['ocrDiag']; needOcr?: boolean; model?: ModelKaydi; ms?: number;
}
export interface ResimBelgesi {
  kind: 'pdf' | 'step' | 'bos'; key: string; name: string; w: number; h: number; sub?: string; rev?: string; file?: string; mk?: string;
  ck?: string; baseKey?: string; page?: number; pages?: number; cls?: string; textless?: boolean; svg?: string; data?: Gorunum3B; fa?: number;
}

// Eski ctl alanlarının karşılığı yanlarında.
export interface TeknikResimKontrolu {
  anahtar: string; // key: değişince ana doküman yeniden açılır
  dosyalar: readonly CalismaDosyasi[]; // files
  anaResim: string | null; // primary
  balonlar: readonly Balon[]; // bal
  balonlarYaz: (b: Balon[]) => void; // setBal
  olcumler: Readonly<Record<number, Olcum>>; // meas
  olcumlerYaz: (m: Record<number, Olcum>) => void; // setMeas
  ayar?: unknown; // cfg (paketin readCfg'si); yoksa cihazın ayarı
  saltOkunur?: boolean; // readOnly
  hazirVeri?: Record<string, unknown> | null; // derived
  ac?: { bytes: Uint8Array; ad: string; n: number; taze: boolean } | null; // open (Çizim stüdyosu)
  tani?: (d: TaniBilgisi) => void; // lab
  katman?: (doc: ResimBelgesi, U: number) => ReactNode; // overlay
  odak?: { id: number; n: number } | null; // focus
  odakKipi?: (acik: boolean) => void; // onFocusMode
  aletZorunlu?: boolean;
  // Ölçü aleti seçici (A4 AletSecimi); verilmezse yer tutucu görünür.
  aletSecimi?: (tool: string | undefined) => ReactNode;
  olcumYok?: boolean; // noMeasure
  operatorOlcer?: readonly number[]; // opIds
  ozellikGizli?: boolean; // hideSpec
  // Ölçüm bildirimini kullanan verir (operatör ekranı kendi bildirimine "Geri al" ekler); verilmezse görüntüleyici bildirir.
  olcumBildir?: (mesaj: string, uygun: boolean) => void;
  siradaki?: readonly number[]; // due
  secildi?: (id: number) => void; // onSelect
  notlar?: readonly ResimNotu[]; // pins
  notBirak?: (n: { x: number; y: number; text: string }) => void; // onPin
  notCoz?: (id: ResimNotu['id']) => void; // onPinResolve
  eskiCizim?: EskiCizim | null;
  retGerekcesi?: string | null;
  // Balon boyutu ve yerleşimi (894 a). Verilmezse cihaz kaydındaki 'balonAyari', o da yoksa okuma ayarındaki boyut ve Karma geçerlidir.
  balonAyari?: BalonAyari | null;
  balonAyariYaz?: (a: BalonAyari) => void;
  // Balonun elle konan yeri ve istenen yerleşimi. Verilmezse balon listesine yazılır (balonlarYaz).
  balonYeriYaz?: (id: number, yer: Balon['yer'], yerKipi: Balon['yerKipi']) => void;
}
export interface BalonAyari { carpan: number; kip: BalonKipi }

interface Mesgul { t: string; steps: string[]; i: number; pct?: number }
// Düzenleme formu (967 a): ölçü yazımı ve etiketin yanında numara (çakışırsa yer değiştir ya da araya al), elle seçilen alet, yöntem,
// kritiklik, sıklık ve not. `kaynak` balonun bağlı olduğu resim yazısıdır.
interface Duzenleme {
  isNew?: boolean; id?: number; x?: number; y?: number; ar?: Balon['ar']; text: string; label: string;
  no?: string; yol?: NumaraYolu | null; tool?: string; aletElle?: boolean; m?: OlcumYontemi; crit?: boolean; freq?: string; not?: string; kaynak?: string;
}
interface GecmisDurumu { bal: readonly Balon[]; olcum?: Readonly<Record<number, Olcum>> }
const BOS_GECMIS: Gecmis<GecmisDurumu> = { geri: [], ileri: [] };
type OneriListesi = Oneri[] & { stats?: OkumaIstatistigi };

const PDF_ADIMLARI = ['Dosya okunuyor', 'Sayfa vektörden çiziliyor', 'Ölçü yazıları aranıyor'];
const SEVIYELER = [['high', 'Yüksek güven'], ['mid', 'Kontrol et'], ['low', 'Düşük güven']] as const;
const NOT_ETIKETLERI = ['Ölçü okunmuyor', 'Tolerans hatalı görünüyor', 'Revizyon farklı', 'Ölçü aleti uygun değil', 'Adım eksik / yanlış'];
const ALTIGEN = 'M17 0L8.5 14.7H-8.5L-17 0-8.5-14.7H8.5Z';
const DISA_AKTARIM_STILI = '.ln{stroke:#000;fill:none;stroke-width:1.4}.hid{stroke:#666;fill:none;stroke-width:.8;stroke-dasharray:5 3}.ctr{stroke:#c00;fill:none;stroke-width:.6;stroke-dasharray:14 3 2 3}.dim{stroke:#000;fill:none;stroke-width:.6}.dimt{fill:#000;font:13px monospace}.arw{fill:#000}.tb{stroke:#000;fill:none;stroke-width:.8}.tbt{fill:#444;font:10px monospace}.tbv{fill:#000;font:bold 14px sans-serif}.bl circle{fill:#fff;stroke:#1f5fd0;stroke-width:1.5}.bl text{fill:#1f5fd0;font:bold 12px sans-serif;text-anchor:middle;dominant-baseline:central}';
const BOS_BELGE: ResimBelgesi = { kind: 'bos', key: 'bos', name: 'Doküman yok', sub: 'Hazırlıkta teknik resim eklenmemiş', w: 1000, h: 640 };

// Eski ekranın renkli bildirimleri TMI bildirim tonuna.
const TON: Readonly<Record<string, BildirimTonu>> = { run: 'tamam', done: 'bilgi', hold: 'bilgi', stop: 'hata' };

// Ekranda değişen ölçü ve konumlar CSS değişkeniyle verilir (satır içi stil yazılmaz).
const degiskenler = (d: Readonly<Record<string, string | number>>) => (el: HTMLElement | SVGElement | null) => {
  if (el) for (const [k, v] of Object.entries(d)) el.style.setProperty(k, String(v));
};

function indir(ad: string, veri: string, tur: string): void {
  const url = URL.createObjectURL(new Blob([veri], { type: tur })), a = document.createElement('a');
  a.href = url; a.download = ad; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

function TeknikResimGovdesi({ kontrol }: { kontrol: TeknikResimKontrolu }) {
  const { onbellek, aletler, ayarlar: cihaz, ses: bip } = useCizimOrtami();
  const depo = useMemo(() => ({ Cache: onbellek }), [onbellek]);
  const { bildir: bildirim } = useBildirim();
  const say = useCallback((m: string, renk: keyof typeof TON = 'run') => bildirim(TON[renk] ?? 'bilgi', m), [bildirim]);
  const { tema } = useTema();
  const koyu = tema !== 'light';
  const ctl = kontrol;
  const RO = !!ctl.saltOkunur;
  const bal = ctl.balonlar, meas = ctl.olcumler;
  const setBal = ctl.balonlarYaz, setMeas = ctl.olcumlerYaz;
  const cfgOf = useCallback((): OkumaAyari => (ctl.ayar ? ayarDuzelt(ctl.ayar) : cihazAyari(cihaz)), [ctl.ayar, cihaz]);
  const gorunusImzasi = ctl.ayar ? ayarImzasi(ayarDuzelt(ctl.ayar), GORUNUS_ANAHTARLARI) : '';

  const [doc, setDoc] = useState<ResimBelgesi>(BOS_BELGE);
  const [mode3d, setMode3d] = useState(false);
  const [busy, setBusy] = useState<Mesgul | null>(null);
  const [drawer, setDrawer] = useState<'lib' | 'insp' | 'balon' | null>(null);
  const [tasinan, setTasinan] = useState<{ id: number; x: number; y: number } | null>(null);
  const tasima = useRef<{ id: number; dx: number; dy: number; x: number; y: number; oynadi: boolean } | null>(null), tasindi = useRef(false);
  const [z, setZ] = useState({ k: 1, x: 0, y: 0 });
  const [dims, setDims] = useState(true), [showB, setShowB] = useState(true), [grid, setGrid] = useState(true), [hidden, setHidden] = useState(true);
  const [adding, setAdding] = useState(false);
  const [model3d, setModel3d] = useState<{ data: Gorunum3B; fa: number } | null>(null);
  const [fs, setFs] = useState(false);
  const [suggest, setSuggest] = useState<{ v: number; alt: number } | null>(null), [pinMode, setPinMode] = useState(false);
  const [pinEdit, setPinEdit] = useState<{ x: number; y: number; text: string; tags: string[] } | null>(null), [pinSel, setPinSel] = useState<ResimNotu['id'] | null>(null);
  const [props, setProps] = useState<OneriListesi | null>(null);
  const [sel, setSel] = useState<number | null>(null), [val, setVal] = useState(''), [edit, setEdit] = useState<Duzenleme | null>(null);
  const [drag, setDrag] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null), [loUrl, setLoUrl] = useState<string | null>(null);
  const [regMode, setRegMode] = useState(false), [regRect, setRegRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [pwAsk, setPwAsk] = useState<{ again: boolean; v: string } | null>(null), [lowOn, setLowOn] = useState(false), [pageTick, setPageTick] = useState(0);
  const [selMode, setSelMode] = useState(false), [msel, setMsel] = useState<number[]>([]);
  const [deep, setDeep] = useState<{ url: string; x: number; y: number; w: number; h: number } | null>(null);
  const [gecmis, setGecmis] = useState(BOS_GECMIS);
  const [onizleme, setOnizleme] = useState<{ yol: SiraYolu; harita: Record<number, number> } | null>(null);
  const [ucYeri, setUcYeri] = useState<{ id: number; x: number; y: number } | null>(null);
  const [oneriAktif, setOneriAktif] = useState(0);
  const regRef = useRef<[number, number] | null>(null), selRef = useRef<[number, number] | null>(null);
  const pageRef = useRef<{ items: MetinOgesi[]; w: number; h: number; ink: Uint8Array; scale: number; n: number; dims: OlcuListesi; ck: string; junk: boolean } | null>(null);
  const pwRef = useRef<((pw: string | null) => void) | null>(null);
  const st = useRef<HTMLDivElement>(null), svgRef = useRef<SVGSVGElement | null>(null), dr = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const pts = useRef<Record<number, [number, number]>>({});
  const pdfRef = useRef<PdfBelgesi | null>(null), imgRef = useRef<ImageData | null>(null), pdfSrc = useRef<{ bytes: Uint8Array; hash: string } | null>(null);
  const freshRef = useRef(false), ckSeen = useRef<string | null>(null);
  const U = doc.w / 1000;
  const [balonAyariCihaz, setBalonAyariCihaz] = useState<BalonAyari | null>(() => cihaz.oku<BalonAyari>('balonAyari'));
  const balonAyari: BalonAyari = ctl.balonAyari ?? balonAyariCihaz ?? { carpan: +cfgOf().balS || 1, kip: 'karma' };
  const balonAyariYaz = (a: BalonAyari) => { if (ctl.balonAyariYaz) ctl.balonAyariYaz(a); else { cihaz.yaz('balonAyari', a); setBalonAyariCihaz(a); } };
  const BK = balonAyari.carpan;
  const pkgModel = ctl.dosyalar.find((f) => modelAdiMi(f.name)) ?? null;
  const needProps = () => !RO && !bal.length;

  useEffect(() => {
    ctl.odakKipi?.(fs);
    if (!fs) return undefined;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setFs(false); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [fs]); // kullananın odak işlevi her çizimde yenidir; yalnız kip değişince bildirilir (eskisi gibi)
  useEffect(() => {
    if (ctl.odak) { setMode3d(false); setSel(ctl.odak.id); setVal(''); setEdit(null); setDrawer(null); setSuggest(null); }
  }, [ctl.odak?.n]); // odak numarası değişince açılır
  useEffect(() => { setSel(null); setEdit(null); setZ({ k: 1, x: 0, y: 0 }); setGecmis(BOS_GECMIS); setOnizleme(null); }, [doc.key]);

  useEffect(() => () => { void pdfRef.current?.loadingTask.destroy(); pdfRef.current = null; }, []);

  const askPw = (again: boolean) => new Promise<string | null>((res) => { setBusy(null); pwRef.current = res; setPwAsk({ again, v: '' }); });
  const ensurePdf = async () => {
    if (pdfRef.current) return pdfRef.current;
    if (!pdfSrc.current) return null;
    pdfRef.current = await pdfAc(pdfSrc.current.bytes, askPw);
    return pdfRef.current;
  };
  const ensureImg = async () => {
    if (imgRef.current) return imgRef.current;
    const P = pageRef.current, pdf = await ensurePdf(); if (!pdf || !P) return null;
    const R = await pdfCiz(pdf, P.n || 1, cfgOf()); imgRef.current = R.img; return R.img;
  };
  const kaydiSakla = (ck: string, C: PdfKaydi) => { void depo.Cache.put(ck, saklanacak(C)); };

  // PDF görüntüsü: ekrana sığarken ekran çözünürlüğünde vektörden çizilmiş net görüntü (lo), yakınlaşınca yüksek çözünürlüklü görüntü (hi).
  // Büyük görüntüyü küçültmek ince yazı ve çizgileri soldurur.
  const hiWant = z.k > 1.12;
  useEffect(() => {
    if (doc.kind !== 'pdf' || !doc.ck) return undefined;
    let ok = true;
    const ck = doc.ck;
    if (ckSeen.current !== ck) {
      ckSeen.current = ck;
      setImgUrl((o) => { if (o) URL.revokeObjectURL(o); return null; }); setLoUrl((o) => { if (o) URL.revokeObjectURL(o); return null; });
    }
    (async () => {
      const C = PDF_BELLEGI.get(ck); if (!C) return;
      const cf = cfgOf(), pkey = tema + '~v4' + ayarImzasi(cf, GORUNUS_ANAHTARLARI);
      const dpr = window.devicePixelRatio || 1, L = Math.round(Math.min(C.w, Math.max(1200, window.innerWidth * dpr * 0.85)));
      if (L < C.w * 0.8) {
        const lk = pkey + '@' + L;
        let lb = C.pngLo?.[lk];
        if (!lb) {
          const pdf = await ensurePdf(); if (!ok || !pdf) return;
          const img = await pdfGoruntu(pdf, doc.page || 1, L / C.w * C.scale); if (!ok) return;
          lb = await renklendir(img, koyu, cf, true); C.pngLo = { ...C.pngLo, [lk]: lb }; if (!C.enc) kaydiSakla(ck, C);
        }
        const b = lb;
        if (ok) setLoUrl((o) => { if (o) URL.revokeObjectURL(o); return URL.createObjectURL(b); });
      } else if (ok) setLoUrl((o) => { if (o) URL.revokeObjectURL(o); return null; });
      // Yüksek çözünürlük hemen değil, ekran boşalınca hazırlanır.
      await bekle(L < C.w * 0.8 ? 400 : 0); if (!ok) return;
      let blob = C.png[pkey];
      if (!blob) {
        const img = await ensureImg(); if (!ok || !img) return;
        blob = await renklendir(img, koyu, cf); C.png = { ...C.png, [pkey]: blob }; if (!C.enc) kaydiSakla(ck, C);
      }
      const b = blob;
      if (ok) setImgUrl((o) => { if (o) URL.revokeObjectURL(o); return URL.createObjectURL(b); });
    })().catch((e: unknown) => console.warn(e));
    return () => { ok = false; };
  }, [doc.key, doc.ck, tema, gorunusImzasi]); // eskisiyle aynı tetikleyiciler

  const zoomAt = (f: number, px: number, py: number) => setZ((o) => { const k = Math.max(0.5, Math.min(12, o.k * f)), r = k / o.k; return { k, x: px - (px - o.x) * r, y: py - (py - o.y) * r }; });
  const ctr = (): [number, number] => { const b = st.current?.getBoundingClientRect(); return b ? [b.width / 2, b.height / 2] : [0, 0]; };
  useEffect(() => {
    const el = st.current; if (!el) return undefined;
    const w = (e: WheelEvent) => { e.preventDefault(); const b = el.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - b.left, e.clientY - b.top); };
    el.addEventListener('wheel', w, { passive: false }); return () => el.removeEventListener('wheel', w);
  }, [mode3d, doc.key]);
  const toVB = (cx: number, cy: number): [number, number] | null => {
    const s = svgRef.current; if (!s) return null;
    const m = s.getScreenCTM(); if (!m) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse()); return [p.x, p.y];
  };
  // Derin yakınlaşma: yüksek çözünürlüklü görüntü de büyütülmeye başlayınca görünen bölge PDF'ten (vektör) ekran çözünürlüğünde yeniden çizilir.
  useEffect(() => { setDeep(null); }, [doc.ck]);
  useEffect(() => {
    if (doc.kind !== 'pdf' || mode3d || !doc.ck || z.k < 1.12) { if (deep) setDeep(null); return undefined; }
    let ok = true;
    const ck = doc.ck;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const C = PDF_BELLEGI.get(ck), el = st.current; if (!C || !el) return;
          const r = el.getBoundingClientRect(), a = toVB(r.left, r.top), b = toVB(r.right, r.bottom); if (!a || !b) return;
          const x0 = Math.max(0, Math.floor(a[0])), y0 = Math.max(0, Math.floor(a[1])), x1 = Math.min(doc.w, Math.ceil(b[0])), y1 = Math.min(doc.h, Math.ceil(b[1]));
          if (x1 - x0 < 8 || y1 - y0 < 8) return;
          const zoomCss = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('zoom')) || 1;
          let f = (r.width / Math.max(1, b[0] - a[0])) * (window.devicePixelRatio || 1) * zoomCss;
          if (f < 1.05) { if (ok) setDeep(null); return; }
          f = Math.min(f, 6, Math.sqrt(9e6 / ((x1 - x0) * (y1 - y0))));
          const pdf = await ensurePdf(); if (!ok || !pdf) return;
          const R = await pdfBolge(pdf, doc.page || 1, C.scale, [x0, y0, x1 - x0, y1 - y0], f); if (!ok) return;
          const blob = await renklendir(R.img, koyu, cfgOf(), true); if (!ok) return;
          const url = URL.createObjectURL(blob);
          setDeep((o) => { if (o) URL.revokeObjectURL(o.url); return { url, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; });
        } catch (e) { console.warn(e); }
      })();
    }, 220);
    return () => { ok = false; clearTimeout(t); };
  }, [z.k, z.x, z.y, doc.ck, mode3d, tema, gorunusImzasi]); // eskisiyle aynı tetikleyiciler

  const yakala = (e: TepkiIsaretci<HTMLDivElement>) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* yakalanamayan işaretçi */ } };
  const pd = (e: TepkiIsaretci<HTMLDivElement>) => {
    const h = e.target as Element;
    if (h.closest('.tc-ay5-balon') || h.closest('.tc-ay5-oneri') || h.closest('.tc-ay5-uc')) return;
    if (selMode || regMode) {
      const p = toVB(e.clientX, e.clientY);
      if (p) { (selMode ? selRef : regRef).current = p; setRegRect({ x: p[0], y: p[1], w: 0, h: 0 }); yakala(e); }
      return;
    }
    pts.current[e.pointerId] = [e.clientX, e.clientY]; yakala(e);
    dr.current = { x: e.clientX, y: e.clientY, ox: z.x, oy: z.y, moved: false }; setDrag(true);
  };
  const pm = (e: TepkiIsaretci<HTMLDivElement>) => {
    const cerceve = selMode ? selRef.current : regMode ? regRef.current : null;
    if (cerceve) {
      const p = toVB(e.clientX, e.clientY), o = cerceve;
      if (p) setRegRect({ x: Math.min(o[0], p[0]), y: Math.min(o[1], p[1]), w: Math.abs(p[0] - o[0]), h: Math.abs(p[1] - o[1]) });
      return;
    }
    if (!pts.current[e.pointerId]) return;
    const ids = Object.keys(pts.current).map(Number);
    if (ids.length === 2) {
      const a0 = pts.current[ids[0]!]!, b0 = pts.current[ids[1]!]!, d0 = Math.hypot(a0[0] - b0[0], a0[1] - b0[1]);
      pts.current[e.pointerId] = [e.clientX, e.clientY];
      const a1 = pts.current[ids[0]!]!, b1 = pts.current[ids[1]!]!, d1 = Math.hypot(a1[0] - b1[0], a1[1] - b1[1]);
      const bb = st.current?.getBoundingClientRect();
      if (d0 && bb) zoomAt(d1 / d0, (a1[0] + b1[0]) / 2 - bb.left, (a1[1] + b1[1]) / 2 - bb.top);
      if (dr.current) dr.current.moved = true;
      return;
    }
    pts.current[e.pointerId] = [e.clientX, e.clientY];
    const d = dr.current;
    if (d) { if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true; setZ((q) => ({ k: q.k, x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y })); }
  };
  const pu = (e: TepkiIsaretci<HTMLDivElement>) => {
    if (selMode && selRef.current) {
      const r = regRect; selRef.current = null; setRegRect(null);
      if (r && r.w > doc.w * 0.004) {
        const ids = bal.filter((x) => { const q = LB.pos[x.id] || x; return q.x >= r.x && q.x <= r.x + r.w && q.y >= r.y && q.y <= r.y + r.h; }).map((x) => x.id);
        setMsel((m) => Array.from(new Set(m.concat(ids))));
      }
      return;
    }
    if (regMode && regRef.current) {
      const r = regRect; regRef.current = null; setRegRect(null); setRegMode(false);
      if (r && r.w > doc.w * 0.01 && r.h > doc.w * 0.006) void readRegion([r.x, r.y, r.w, r.h]);
      return;
    }
    const d = dr.current; delete pts.current[e.pointerId]; dr.current = null; setDrag(false);
    if (pinMode && d && !d.moved) { const p = toVB(e.clientX, e.clientY); if (p) { setPinEdit({ x: p[0], y: p[1], text: '', tags: [] }); setSel(null); setPinMode(false); } return; }
    if (adding && d && !d.moved) {
      const p = toVB(e.clientX, e.clientY); if (!p) return;
      // Ölçü yazısına dokunulduysa değerler yazıdan dolar.
      const yz = doc.kind === 'pdf' ? enYakinYazi(pageRef.current?.dims ?? [], p[0], p[1], doc.w * 0.012) : null;
      setEdit(yz ? { isNew: true, x: yz.x, y: yz.y, ar: yz.ar, text: yz.raw, label: yz.l.replace(/ \(.*\)$/, ''), kaynak: yz.raw } : { isNew: true, x: p[0], y: p[1], text: '', label: '' });
      setSel(null); setAdding(false);
    }
  };

  /* ── Dosya açma ── */
  const openBytes = async (bytes: Uint8Array, name: string, src?: 'pkg' | 'lab') => {
    const bicim = dosyaBicimi(name, new TextDecoder().decode(bytes.slice(0, 64)));
    const key = name + ':' + bytes.length;
    setDrawer(null); setMode3d(false); setProps(null);
    try {
      if (bicim === 'pdf') {
        setBusy({ t: 'PDF açılıyor', steps: PDF_ADIMLARI, i: 0 }); await bekle(60);
        // Önceki belge çalışanda da bırakılır: pdf.js ayrı çalışanda belgeyi kendisi atmaz (731).
        void pdfRef.current?.loadingTask.destroy(); pdfRef.current = null; imgRef.current = null; pdfSrc.current = { bytes, hash: await dosyaOzeti(bytes) };
        await showPdfPage(1, name, key);
      } else if (bicim) {
        const kindName = bicim === 'stl' ? 'STL' : bicim === 'iges' ? 'IGES' : 'STEP';
        setBusy({
          t: kindName + ' işleniyor', i: 0,
          steps: ['Geometri çekirdeği yükleniyor', 'Model okunuyor ve üçgenleniyor', 'Kenar ve yüz topolojisi kuruluyor', 'Görünüşler izdüşürülüyor · gizli çizgiler ayıklanıyor', 'Delik ve çaplar tanınıyor · ölçülendiriliyor'],
        });
        const tM = performance.now();
        const R = await modelIsle(depo, bytes, name, (i) => setBusy((b) => b && { ...b, i }), { need: 'draw', derived: ctl.hazirVeri ?? null, cfg: cfgOf(), fresh: freshRef.current });
        ctl.tani?.({ model: R, ms: Math.round(performance.now() - tM) });
        const D = R.D;
        if (!D) throw new Error('Teknik resim üretilemedi');
        setDoc({
          kind: 'step', mk: R.kind, key, name: name.replace(/\.(step|stp|p21|igs|iges|stl)$/i, ''), file: name,
          sub: 'Ölçek ' + D.info.scale + ' · ' + D.info.size.join(' × ') + ' mm · ' + D.info.tris.toLocaleString('tr-TR') + ' üçgen', w: D.w, h: D.h, svg: D.svg, data: R.V, fa: R.fa,
        });
        if (needProps() && D.balloons.length) setProps(D.balloons.map((b): Oneri => ({ on: true, ...b, tx: b.x, ty: b.y, raw: b.nom, unknown: false, note: '', kind: '', ref: false, conf: 1, lvl: 'high', why: '' })));
        if (src !== 'pkg') say('Teknik resim oluşturuldu · ' + D.balloons.length + ' ölçü önerisi', 'done');
      } else throw new Error('Desteklenen biçimler: PDF, STEP (.step/.stp), IGES, STL');
    } catch (err) { console.error(err); say('Açılamadı: ' + (err instanceof Error ? err.message : String(err)), 'stop'); }
    setBusy(null);
  };
  const showPdfPage = async (n: number, name: string, key: string) => {
    const src = pdfSrc.current; if (!src) return;
    const cf = cfgOf(), ck = pdfKaydiAnahtari(src.hash, n, cf);
    imgRef.current = null;
    let C = freshRef.current ? undefined : PDF_BELLEGI.get(ck);
    // Sıra: bellek, paketle gelen hazır okuma (731), cihaz önbelleği, hesap.
    if (!C && !freshRef.current) {
      const hazir = saklananiAc(ctl.hazirVeri?.[ck]) ?? saklananiAc(await depo.Cache.get(ck));
      if (hazir) { C = hazir; bellegeKoy(ck, C); }
    }
    if (!C) {
      setBusy((b) => ({ ...(b || { t: 'PDF açılıyor', steps: PDF_ADIMLARI }), i: 1 })); await bekle();
      const pdf = await ensurePdf();
      if (!pdf) return;
      setBusy((b) => b || { t: 'PDF açılıyor', steps: PDF_ADIMLARI, i: 1 });
      const R = await pdfCiz(pdf, n, cf);
      setBusy((b) => b && { ...b, i: 2 }); await bekle();
      imgRef.current = R.img;
      C = sayfaKaydi(R, cf, !!pdf.arkonEnc, !!ctl.tani);
      bellegeKoy(ck, C);
    }
    const K = C;
    const dims: OlcuListesi = K.dims || [];
    if (K.stats && !dims.stats) dims.stats = K.stats;
    pageRef.current = { items: K.items, w: K.w, h: K.h, ink: K.ink, scale: K.scale, n, dims, ck, junk: K.junk }; setPageTick((t) => t + 1);
    const pk = key + '#' + n;
    setDoc({
      kind: 'pdf', key: pk, ck, baseKey: key, name: name.replace(/\.pdf$/i, ''), file: name,
      sub: 'Sayfa ' + n + '/' + K.pages + ' · ' + K.w + '×' + K.h + ' px · ' + (K.textless ? 'metin katmanı yok · OCR' : K.items.length + ' yazı') + ' · ISO 2768-' + K.cls,
      w: K.w, h: K.h, page: n, pages: K.pages, cls: K.cls, textless: K.textless,
    });
    // Metin katmanı yoksa ya da ölçüler çizgiye dönmüşse (karışık PDF: antet yazı, ölçüler çizgi) görüntüden tamamlanır.
    const needOcr = ocrGerekir(cf, K.textless, dims.length);
    if (needProps() || ctl.tani) {
      let found: OlcuListesi = dims.map((d) => ({ ...d })); found.stats = dims.stats;
      if (needOcr) {
        if (!K.ocrDims) {
          say(K.textless
            ? (K.items.length ? 'PDF yazıları okunamayan fontta · görüntüden okunuyor' : 'PDF\'te metin yok (yazılar çizgiye dönüştürülmüş) · görüntüden okunuyor')
            : 'Ölçü yazıları çizgiye dönüştürülmüş · görüntüden tamamlanıyor', 'done');
          const t1 = performance.now();
          const r = await runOcr(null, K.cls, !K.textless);
          K.ocrDims = r; if (r.stats) K.ocrStats = r.stats; if (r.diag) K.ocrDiag = r.diag; K.ms = { ...K.ms, ocr: Math.round(performance.now() - t1) };
          if (!K.enc && K.png && Object.keys(K.png).length) kaydiSakla(ck, K);
        }
        const od: OlcuListesi = (K.ocrDims ?? []).map((d) => ({ ocr: true, ...d }));
        if (K.textless) { found = od; found.stats = K.ocrStats; } else found = olcuBirlestir(found, od, K.w, K.ocrStats);
      }
      if (ctl.tani) {
        if (!K.diag && !K.textless) { const d = olcuOnerileri(K.items, K.cls, { w: K.w, h: K.h, ink: K.ink, ex: cf.ex, auto: cf.auto, diag: true }).diag; if (d) K.diag = d; }
        ctl.tani({ C: K, dims: found, ...(K.diag ? { diag: K.diag } : {}), ...(K.ocrDiag ? { ocrDiag: K.ocrDiag } : {}), needOcr });
      }
      if (!needProps()) return;
      if (found.length) setProps(found);
      else say(needOcr ? 'Görüntüden de ölçü okunamadı · ◎ ile noktaları ekleyebilirsin' : 'Ölçü yazısı tanınmadı · "Görüntüden oku" ya da ◎ ile ekle', 'hold');
    }
  };
  // OCR: bütün sayfa ya da seçili bölge.
  const runOcr = async (box: number[] | null, cls?: string | null, mask?: boolean): Promise<OlcuListesi> => {
    const P = pageRef.current;
    if (!P) return [];
    setBusy({ t: box ? 'Bölge görüntüden okunuyor' : 'Görüntüden okunuyor (OCR)', steps: ['OCR motoru yükleniyor (çevrimdışı)', 'Yazılar tanınıyor · yatay + dikey', 'Ölçüler ayrıştırılıyor'], i: 0, pct: 0 });
    await bekle(60);
    try {
      await tesseract();
      setBusy((b) => b && { ...b, i: 1 }); await bekle();
      const onProgress = (p: number) => setBusy((b) => b && { ...b, pct: p });
      let items: MetinOgesi[];
      const pdf = await ensurePdf();
      if (box && pdf && P.scale) {
        const C = await pdfBolge(pdf, P.n || 1, P.scale, box);
        items = (await ocrGoruntu(C.img, { onProgress })).map((o) => Object.assign(o, { x: box[0]! + o.x / C.f, y: box[1]! + o.y / C.f, h: o.h / C.f, w: o.w / C.f }));
      } else if (!box && pdf && P.scale) {
        const cf = cfgOf(), f = cf.dpi / P.scale;
        items = await ocrPdfSayfasi(pdf, P.n || 1, P, { img: f < 1.2 ? await ensureImg() : null, mask: mask && !P.junk ? P.items : null, dpi: cf.dpi, onProgress });
      } else { const img = await ensureImg(); if (!img) return []; items = await ocrGoruntu(img, { box, onProgress }); }
      setBusy((b) => b && { ...b, i: 2, pct: 1 }); await bekle();
      const cf = cfgOf();
      return olcuOnerileri(items, cls || doc.cls || 'm', { w: P.w, h: P.h, ink: P.ink, ocr: true, region: !!box, ex: cf.ex, auto: cf.auto, diag: !!ctl.tani });
    } catch (e) { console.error(e); say('OCR çalışmadı: ' + (e instanceof Error ? e.message : String(e)), 'stop'); return []; } finally { setBusy(null); }
  };
  const mergeProps = (list: OlcuListesi, label: string) => {
    const cur: OneriListesi = props || [];
    const add = yeniOneriler(list, cur, bal, doc.w);
    if (!add.length) { say(label + ': yeni ölçü bulunamadı', 'hold'); return; }
    const merged: OneriListesi = cur.concat(add);
    merged.stats = { ...(props?.stats || {}), found: merged.length, added: add.length, ...(props?.stats?.ocr || list.stats?.ocr ? { ocr: true } : {}) };
    setProps(merged); say(label + ': ' + add.length + ' ölçü eklendi', 'run');
  };
  const ocrPage = async () => { const r = await runOcr(null, null, !doc.textless); mergeProps(r, 'Görüntüden okuma'); };
  // Bölge oku: önce bölgedeki PDF yazıları, yoksa görüntüden.
  const readRegion = async (box: number[]) => {
    const P = pageRef.current; if (!P) return;
    const [x0, y0, w, h] = box as [number, number, number, number];
    const inside = P.items.filter((o) => o.x >= x0 - 2 && o.x <= x0 + w + 2 && o.y >= y0 - 2 && o.y <= y0 + h + o.h);
    let r: OlcuListesi = inside.length && !doc.textless ? olcuOnerileri(inside, doc.cls || 'm', { w: P.w, h: P.h, ink: P.ink, region: true }) : [];
    if (!r.length) r = await runOcr(box);
    r.forEach((p) => { p.on = !p.ref && !onayIster(p); }); if (r.some((p) => p.lvl === 'low')) setLowOn(true);
    if (r.length === 1 && !props) {
      const p = r[0]!;
      setEdit({ isNew: true, x: p.x, y: p.y, ar: p.ar, text: p.raw, label: p.l.replace(/ \(.*\)$/, '') }); setSel(null);
      say('Bölgede 1 ölçü okundu · kontrol edip kaydet', 'run'); return;
    }
    mergeProps(r, 'Bölge okuma');
  };
  // İş paketi: ana doküman kendiliğinden açılır.
  useEffect(() => {
    setModel3d(null); setMode3d(false);
    const f = ctl.dosyalar.find((x) => x.name === ctl.anaResim) || ctl.dosyalar[0];
    if (f) void openBytes(f.bytes, f.name, 'pkg'); else setDoc({ ...BOS_BELGE, key: 'empty:' + ctl.anahtar });
  }, [ctl.anahtar]); // anahtar değişince açılır (eskisi gibi)
  // Çizim stüdyosu: dosya dışarıdan açılır, ayar değişince yeniden işlenir.
  useEffect(() => {
    const o = ctl.ac; if (!o || !o.bytes) return;
    freshRef.current = !!o.taze; setSel(null); setEdit(null); setModel3d(null);
    void openBytes(o.bytes, o.ad, 'lab').finally(() => { freshRef.current = false; });
  }, [ctl.ac?.n]); // açma numarası değişince açılır
  const open3d = async () => {
    if (doc.kind === 'step') { setMode3d(true); return; }
    if (!pkgModel) return;
    try {
      setBusy({ t: '3B model hazırlanıyor', steps: ['Geometri çekirdeği yükleniyor', 'Model okunuyor', 'Topoloji', 'Görünüşler', 'Hazır'], i: 0 });
      const tM = performance.now();
      const R = await modelIsle(depo, pkgModel.bytes, pkgModel.name, (i) => setBusy((b) => b && { ...b, i }), { need: '3d', derived: ctl.hazirVeri ?? null, cfg: cfgOf() });
      setModel3d({ data: R.V, fa: R.fa }); setMode3d(true);
      ctl.tani?.({ model: R, ms: Math.round(performance.now() - tM) });
    } catch (e) { say('3B açılamadı: ' + (e instanceof Error ? e.message : String(e)), 'stop'); }
    setBusy(null);
  };

  /* ── Balonlar ── */
  const b = bal.find((x) => x.id === sel), m = b ? meas[b.id] : undefined;
  const nextId = () => bal.reduce((a, x) => Math.max(a, x.id), 0) + 1;
  // Elle yapılan her değişiklik geri alınabilir; ölçüm de değişiyorsa (silme) birlikte saklanır.
  const balYaz = (nb: Balon[], olcum?: Record<number, Olcum>) => {
    setGecmis((g) => gecmisKaydet(g, olcum ? { bal, olcum: meas } : { bal }));
    setBal(nb); if (olcum) setMeas(olcum);
  };
  const gecmisUygula = (ileri: boolean) => {
    const r = (ileri ? gecmisIleri : gecmisGeri)(gecmis, { bal, olcum: meas });
    if (!r) return;
    setGecmis(r.gecmis); setBal([...r.durum.bal]); if (r.durum.olcum && r.durum.olcum !== meas) setMeas({ ...r.durum.olcum });
    setEdit(null); setOnizleme(null); if (sel != null && !r.durum.bal.some((x) => x.id === sel)) setSel(null);
    say(ileri ? 'Yinelendi' : 'Geri alındı', 'done');
  };
  const olcumVar = Object.keys(meas).length > 0;
  // Balonun bağlı olduğu resim yazısı (sayfa okumasındaki ölçü).
  const yaziBul = (ar: Balon['ar']) => (ar ? pageRef.current?.dims.find((d) => Math.abs(d.ar[0] - ar[0]) < 1 && Math.abs(d.ar[1] - ar[1]) < 1) : undefined);
  const duzenle = (x: Balon, ek?: Partial<Duzenleme>) => {
    const text = duzenlemeMetni(x), p = AKTol.parse(text, { cls: doc.cls || 'm' });
    setEdit({
      id: x.id, text, label: x.l ?? '', no: String(x.id), yol: null, tool: x.tool ?? '', aletElle: !!x.tool && !!p && p.tool !== x.tool,
      m: yontem(x), crit: !!x.crit, freq: x.freq ?? '', not: x.not ?? '', kaynak: yaziBul(x.ar)?.raw ?? '', ...ek,
    });
  };
  const saveMeasure = (forced?: 'ok' | 'nok' | null, override?: number | null) => {
    if (!b) return;
    const alet = ctl.aletZorunlu ? seciliAlet(aletler, b.tool, cihaz.oku(aletSecimAnahtari(b.tool)), Date.now()) : null;
    if (ctl.aletZorunlu && !alet) { bip('nok'); say(ALET_ZORUNLU_ILETISI + (b.tool ? ' · ' + b.tool : ''), 'stop'); return; }
    const k = olcumDegerlendir(b, val, forced, override);
    if (k.tur === 'yok') return;
    if (k.tur === 'oneri') { setSuggest({ v: k.v, alt: k.alt }); bip('nok'); return; }
    setSuggest(null); bip(k.ok ? 'ok' : 'nok');
    const nm = { ...meas, [b.id]: { v: k.v, ok: k.ok, at: Date.now(), ...(alet ? olcumAletDamgasi(alet) : {}) } };
    setMeas(nm); setVal('');
    const mesaj = (k.ok ? 'Uygun · ' : 'Tolerans dışı! ') + b.nom + ' = ' + k.v;
    if (ctl.olcumBildir) ctl.olcumBildir(mesaj, k.ok); else say(mesaj, k.ok ? 'run' : 'stop');
    const nx = bal.find((x) => !nm[x.id]); if (nx && k.ok) setTimeout(() => setSel(nx.id), 500);
  };
  const hedefNo = (e: Duzenleme) => { const h = Math.round(Number(e.no)); return !e.isNew && e.id != null && h >= 1 && h !== e.id ? h : null; };
  const noCakisir = (e: Duzenleme) => { const h = hedefNo(e); return h != null && bal.some((x) => x.id === h); };
  const applyEdit = () => {
    if (!edit) return;
    const fields = noktaAlanlari(edit.text, edit.label, doc.cls || 'm');
    if (!fields) { say('Ölçü anlaşılamadı · örn. Ø40 H7, 18 ±0.05, M8x1.25', 'hold'); return; }
    if (noCakisir(edit) && !edit.yol) { say('Numara ' + edit.no + ' başka balonda · yer değiştir ya da araya al', 'hold'); return; }
    const ek = {
      ...fields, tool: edit.aletElle && edit.tool ? edit.tool : fields.tool, m: edit.m ?? (fields.tool === 'CMM' ? 'cmm' as const : 'man' as const),
      crit: edit.crit || undefined, freq: edit.freq || undefined, not: edit.not?.trim() || undefined,
    };
    let nb: Balon[], secilen: number | undefined;
    if (edit.isNew) { secilen = nextId(); nb = [...bal, { id: secilen, x: edit.x ?? 0, y: edit.y ?? 0, ...(edit.ar ? { ar: edit.ar } : {}), ...ek }]; }
    else {
      nb = bal.map((x) => (x.id === edit.id ? { ...x, ...ek } : x)); secilen = edit.id;
      const h = hedefNo(edit);
      if (h != null && edit.id != null) { nb = numaraDegistir(nb, edit.id, h, edit.yol ?? 'araya'); secilen = Math.min(h, Math.max(nb.length, ...nb.map((x) => x.id))); }
    }
    balYaz(nb); setEdit(null); if (secilen != null) setSel(secilen);
  };
  const removeBalloons = (ids: readonly number[]) => {
    if (!ids.length) return;
    const r = balonlariCikar(bal, meas, ids); balYaz(r.bal, olcumVar ? r.olcum : undefined); setSel(null); setEdit(null); setMsel([]);
    say((ids.length === 1 ? 'Balon ' + ids[0] : ids.length + ' balon') + ' silindi · geri almak için Ctrl+Z', 'done');
  };
  const removeBalloon = (id: number) => removeBalloons([id]);
  const cogalt = (x: Balon) => {
    const q = konum(x), id = nextId();
    balYaz(balonCogalt(bal, x.id, [Math.min(doc.w - LB.R, q.x + LB.R * 2.4), q.y])); setEdit(null); setSel(id);
  };
  const acceptProps = () => {
    if (!props) return;
    const n = props.filter((p) => p.on).length;
    balYaz(onerileriEkle(bal, props)); setProps(null); say(n + ' kontrol noktası eklendi', 'run');
  };
  const topluYaz = (ids: readonly number[], f: (x: Balon) => Balon, mesaj: string) => {
    if (!ids.length) return;
    balYaz(bal.map((x) => (ids.includes(x.id) ? f(x) : x))); say(ids.length + ' balon · ' + mesaj, 'done');
  };
  const numaralaUygula = () => {
    if (!onizleme) return;
    balYaz(numaralariUygula(bal, onizleme.harita)); setOnizleme(null); setSel(null); say('Numaralar güncellendi · ' + SIRA_YOLU_ADI[onizleme.yol], 'done');
  };
  const satirYaz = (x: Balon, metin: string) => {
    if (metin.trim() === duzenlemeMetni(x)) return;
    const f = noktaAlanlari(metin, x.l ?? '', doc.cls || 'm');
    if (!f) { say('Balon ' + x.id + ': ölçü anlaşılamadı', 'hold'); return; }
    balYaz(bal.map((y) => (y.id === x.id ? { ...y, ...f } : y)));
  };
  const exportCsv = () => indir((doc.file || doc.name) + '-olcum-raporu.csv', olcumRaporu(bal, meas, (t) => new Date(t).toLocaleString('tr-TR')), 'text/csv');
  const exportSvg = () => {
    const bl = bal.map((x) => {
      const p = LB.pos[x.id] || { ...x, lead: null }, L = p.lead;
      return (L ? '<line x1="' + L[0].toFixed(1) + '" y1="' + L[1].toFixed(1) + '" x2="' + L[2].toFixed(1) + '" y2="' + L[3].toFixed(1) + '" stroke="#1f5fd0" stroke-width="1"/>' : '')
        + '<g class="bl" transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') scale(' + (LB.R / 13).toFixed(3) + ')"><circle r="13"/><text>' + x.id + '</text></g>';
    }).join('');
    indir(doc.name + '-teknik-resim.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + doc.w + ' ' + doc.h + '" width="420mm" height="297mm"><style>' + DISA_AKTARIM_STILI
      + '</style><rect width="100%" height="100%" fill="#fff"/>' + (doc.svg ?? '') + bl + '</svg>', 'image/svg+xml');
  };
  const setMeth = (ids: readonly number[], mm: OlcumYontemi) => topluYaz(ids, (x) => ({ ...x, m: mm }), YONTEM_ADI[mm] + ' ölçüm');

  const nMeas = Object.keys(meas).length, nBad = Object.values(meas).filter((x) => !x.ok).length;
  const onPrimary = doc.file === ctl.anaResim;
  const pop = useRef({ key: '', t: 0 }); if (pop.current.key !== doc.key) pop.current = { key: doc.key, t: Date.now() };
  const pdfSayfasi = doc.kind === 'pdf' && pageRef.current && pageRef.current.w === doc.w ? pageRef.current : null;
  const antet = useMemo(() => (pdfSayfasi ? tabloBul(pdfSayfasi.ink, pdfSayfasi.w, pdfSayfasi.h) : []), [pdfSayfasi]);
  const LB = useMemo(() => balonDizimi(bal.map((x) => balonYazisi(x, pdfSayfasi?.dims, doc.w)), {
    W: doc.w, H: doc.h, carpan: BK, kip: balonAyari.kip, ink: pdfSayfasi?.ink ?? null, yazilar: pdfSayfasi?.dims.map((d) => d.ar), yasak: antet,
  }), [bal, doc.key, doc.w, doc.h, pageTick, BK, balonAyari.kip, antet]); // sayfa okuması pageTick ile tazelenir
  // Sürüklenen balon bırakılana kadar yalnız ekranda yer değiştirir.
  const konum = (x: Balon): DizimKonumu => {
    const p = LB.pos[x.id];
    if (tasinan && tasinan.id === x.id) return { x: tasinan.x, y: tasinan.y, lead: kilavuzCizgisi(balonYazisi(x, pdfSayfasi?.dims, doc.w), tasinan.x, tasinan.y, LB.R), yer: 'sabit' };
    return p ?? { x: x.x, y: x.y, lead: null, yer: 'yakin' };
  };
  const BS = LB.R / 16;
  const balonYeriYaz = (id: number, yer: Balon['yer'], yerKipi: Balon['yerKipi']) => {
    if (ctl.balonYeriYaz) ctl.balonYeriYaz(id, yer, yerKipi);
    else balYaz(bal.map((x) => (x.id === id ? { ...x, yer, yerKipi } : x)));
  };
  // Yeniden diz tek balon isteklerini, "Sabitleri çöz" elle konan yerleri de kaldırır.
  const hepsiniDiz = (sabitlerDe: boolean) => {
    const yeni = (x: Balon): Balon => ({ ...x, yer: sabitlerDe ? null : x.yer ?? null, yerKipi: null });
    const degisen = bal.filter((x) => (sabitlerDe && x.yer) || x.yerKipi);
    if (ctl.balonYeriYaz) for (const x of degisen) ctl.balonYeriYaz(x.id, yeni(x).yer, null);
    else if (degisen.length) balYaz(bal.map((x) => (degisen.includes(x) ? yeni(x) : x)));
  };
  const tasiBasla = (e: TepkiIsaretci<SVGGElement>, x: Balon) => {
    if (RO || selMode || e.button !== 0) return;
    const p = toVB(e.clientX, e.clientY), q = konum(x); if (!p) return;
    tasima.current = { id: x.id, dx: q.x - p[0], dy: q.y - p[1], x: q.x, y: q.y, oynadi: false }; tasindi.current = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* yakalanamayan işaretçi */ }
  };
  const tasi = (e: TepkiIsaretci<SVGGElement>) => {
    const t = tasima.current; if (!t) return;
    const p = toVB(e.clientX, e.clientY); if (!p) return;
    const x = Math.max(LB.R, Math.min(doc.w - LB.R, p[0] + t.dx)), y = Math.max(LB.R, Math.min(doc.h - LB.R, p[1] + t.dy));
    if (!t.oynadi && Math.hypot(x - t.x, y - t.y) < LB.R * 0.3) return;
    t.oynadi = true; t.x = x; t.y = y; setTasinan({ id: t.id, x, y });
  };
  const tasiBitir = () => {
    const t = tasima.current; tasima.current = null;
    if (!t || !t.oynadi) return;
    tasindi.current = true;
    balonYeriYaz(t.id, [Math.round(t.x * 10) / 10, Math.round(t.y * 10) / 10], null);
  };
  // Bırakılan balon yeni balon listesi gelene dek bırakıldığı yerde görünür (yazım sunucuya gidebilir).
  useEffect(() => { setTasinan(null); }, [bal]);
  // Kılavuz ucu (elmas) başka ölçü yazısına bırakılınca balon o yazıya bağlanır; değerler kullanıcı "Yazıdan al" deyince değişir.
  const ucBasla = (e: TepkiIsaretci<SVGRectElement>, x: Balon) => {
    if (RO || e.button !== 0) return;
    e.stopPropagation();
    const p = toVB(e.clientX, e.clientY); if (!p) return;
    setUcYeri({ id: x.id, x: p[0], y: p[1] });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* yakalanamayan işaretçi */ }
  };
  const ucTasi = (e: TepkiIsaretci<SVGRectElement>) => { if (!ucYeri) return; const p = toVB(e.clientX, e.clientY); if (p) setUcYeri({ ...ucYeri, x: p[0], y: p[1] }); };
  const ucBirak = () => {
    const u = ucYeri; setUcYeri(null); if (!u) return;
    const x = bal.find((y) => y.id === u.id), yz = enYakinYazi(pageRef.current?.dims ?? [], u.x, u.y, doc.w * 0.015);
    if (!x || !yz || (x.ar && yz.ar[0] === x.ar[0] && yz.ar[1] === x.ar[1])) return;
    balYaz(bal.map((y) => (y.id === x.id ? { ...y, ar: yz.ar, x: yz.x, y: yz.y } : y)));
    duzenle({ ...x, ar: yz.ar }, { kaynak: yz.raw });
    say('Kılavuz "' + yz.raw + '" yazısına bağlandı · değerler için "Yazıdan al"', 'done');
  };
  // Klavye: B balon ekle, R bölge oku, V ya da Esc seçime dön, Tab sıradaki balon, oklar balonu kaydırır, Del siler, Ctrl+Z / Ctrl+Y.
  const tusa = (e: TepkiTusu<HTMLDivElement>) => {
    const t = e.target as HTMLElement, yazida = /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName), k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) {
      if (RO || yazida) return;
      e.preventDefault(); gecmisUygula(k === 'y' || e.shiftKey); return;
    }
    if (yazida || e.ctrlKey || e.metaKey || e.altKey || RO || mode3d || !onPrimary) return;
    if (!(t === e.currentTarget || st.current?.contains(t))) return;
    const kaydir = (dx: number, dy: number) => {
      if (!b) return;
      const q = konum(b), d = (e.shiftKey ? 10 : 2) * U;
      balonYeriYaz(b.id, [Math.round((q.x + dx * d) * 10) / 10, Math.round((q.y + dy * d) * 10) / 10], null);
    };
    if (k === 'escape') { setAdding(false); setRegMode(false); setSelMode(false); setPinMode(false); setOnizleme(null); setSel(null); setEdit(null); }
    else if (k === 'v') { setAdding(false); setRegMode(false); setPinMode(false); }
    else if (k === 'b') { setAdding(!adding); setRegMode(false); setPinMode(false); setSel(null); }
    else if (k === 'r' && doc.kind === 'pdf') { setRegMode(!regMode); setAdding(false); setPinMode(false); setSel(null); }
    else if ((k === 'delete' || k === 'backspace') && (b || msel.length)) removeBalloons(selMode && msel.length ? msel : b ? [b.id] : []);
    else if (k === 'tab' && bal.length) {
      const l = [...bal].sort((p, q) => p.id - q.id), i = b ? l.indexOf(b) : -1, s2 = l[(i + (e.shiftKey ? -1 : 1) + l.length) % l.length];
      if (s2) { setSel(s2.id); setVal(''); setEdit(null); }
    } else if (k === 'arrowleft') kaydir(-1, 0);
    else if (k === 'arrowright') kaydir(1, 0);
    else if (k === 'arrowup') kaydir(0, -1);
    else if (k === 'arrowdown') kaydir(0, 1);
    else return;
    e.preventDefault();
  };
  const svgDegiskeni = useMemo(() => degiskenler({ '--u': U, '--bs': BS }), [U, BS]);
  const tuvalRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { degiskenler({ '--z-x': z.x + 'px', '--z-y': z.y + 'px', '--z-k': z.k })(tuvalRef.current); });

  const arac = (simge: SimgeAdi, acik: boolean, f: () => void, etiket: string) => (
    <button type="button" className={`tc-ay5-arac${acik ? ' tc-ay5-acik' : ''}`} onClick={f} aria-label={etiket} aria-pressed={acik} title={etiket}><Simge ad={simge} /></button>
  );
  const balonSinifi = (x: Balon) => {
    const mm = meas[x.id];
    return ['tc-ay5-balon', yontem(x) === 'cmm' && 'tc-ay5-cmm', msel.includes(x.id) && 'tc-ay5-cokluda', sel === x.id && 'tc-ay5-secili',
      ctl.siradaki?.includes(x.id) && 'tc-ay5-sirada', mm && (mm.ok ? (mm.edge ? 'tc-ay5-uygun tc-ay5-sinirda' : 'tc-ay5-uygun') : 'tc-ay5-red')].filter(Boolean).join(' ');
  };
  const leadLayer = showB && onPrimary ? (
    <g className="tc-ay5-kilavuzlar">
      {bal.map((x) => {
        const p = konum(x); if (!p.lead) return null;
        const L = p.lead, mm = meas[x.id];
        const s = ['tc-ay5-kilavuz', yontem(x) === 'cmm' && 'tc-ay5-cmm', sel === x.id && 'tc-ay5-secili', mm && (mm.ok ? 'tc-ay5-uygun' : 'tc-ay5-red')].filter(Boolean).join(' ');
        return <g key={'l' + x.id} className={s}><line x1={L[0]} y1={L[1]} x2={L[2]} y2={L[3]} /><circle cx={L[2]} cy={L[3]} r={2.6 * BS} /></g>;
      })}
      {b && !RO && doc.kind === 'pdf' && (() => {
        const p = konum(b), uc = ucYeri && ucYeri.id === b.id ? [ucYeri.x, ucYeri.y] : p.lead ? [p.lead[2], p.lead[3]] : b.ar ? [b.ar[0], b.ar[1]] : [b.x, b.y];
        const [ux, uy] = uc as [number, number], r = 5 * BS;
        return (
          <g className="tc-ay5-uc-katman">
            {ucYeri && ucYeri.id === b.id && <line className="tc-ay5-uc-cizgi" x1={p.x} y1={p.y} x2={ux} y2={uy} />}
            <rect className="tc-ay5-uc" x={ux - r} y={uy - r} width={2 * r} height={2 * r} transform={'rotate(45 ' + ux + ' ' + uy + ')'} role="button" tabIndex={-1}
              aria-label={'Balon ' + b.id + ' kılavuz ucu · başka yazıya sürükle'} onPointerDown={(e) => ucBasla(e, b)} onPointerMove={ucTasi} onPointerUp={ucBirak}
              onPointerCancel={() => setUcYeri(null)} />
          </g>
        );
      })()}
    </g>
  ) : null;
  const balloonsLayer = showB && onPrimary ? bal.map((x, i) => {
    const ps = konum(x), cm = yontem(x) === 'cmm';
    const gecikme = (Date.now() - pop.current.t < 2500 ? (doc.kind === 'pdf' ? 0.1 : 1.2) + Math.min(i * 0.08, 1.2) : 0) + 's';
    return (
      <g key={doc.key + x.id} transform={'translate(' + ps.x + ' ' + ps.y + ') scale(' + BS + ')'}>
        <g
          className={balonSinifi(x)} ref={degiskenler({ '--gecikme': gecikme })} role="button" tabIndex={0} aria-label={'Kontrol ' + x.id + ' ' + x.nom}
          onPointerDown={(e) => tasiBasla(e, x)} onPointerMove={tasi} onPointerUp={tasiBitir} onPointerCancel={() => { tasima.current = null; setTasinan(null); }}
          onClick={(e) => {
            e.stopPropagation();
            if (tasindi.current) { tasindi.current = false; return; }
            if (selMode || e.shiftKey || e.ctrlKey || e.metaKey) {
              if (!RO) { setSelMode(true); setMsel((q) => (q.includes(x.id) ? q.filter((y) => y !== x.id) : q.concat([x.id]))); setSel(null); }
              return;
            }
            setSel(sel === x.id ? null : x.id); setVal(''); setEdit(null); setSuggest(null); setPinSel(null); ctl.secildi?.(x.id);
            if (e.detail === 2 && !RO) duzenle(x);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(sel === x.id ? null : x.id); setVal(''); setEdit(null); } }}
        >
          {cm ? <><path className="tc-ay5-halka" d={ALTIGEN} /><path className="tc-ay5-dis" d={ALTIGEN} /></> : <><circle className="tc-ay5-halka" r="16" /><circle className="tc-ay5-dis" r="16" /></>}
          <text className={onizleme && onizleme.harita[x.id] !== x.id ? 'tc-ay5-onizleme' : undefined}>{onizleme?.harita[x.id] ?? x.id}</text>
          {ps.yer === 'sabit' && <circle className="tc-ay5-pim" cx="12" cy="-12" r="4" />}
        </g>
      </g>
    );
  }) : null;

  const pin = pinSel != null ? ctl.notlar?.find((p) => p.id === pinSel) : undefined;
  const sayfaGec = (n: number) => { if (doc.file && doc.baseKey) void showPdfPage(n, doc.file, doc.baseKey).then(() => setBusy(null)); };
  const kok = ['tc-ay5-resim', fs && 'tc-ay5-tam', !dims && 'tc-ay5-olcusuz', !hidden && 'tc-ay5-gizlisiz', (adding || regMode) && 'tc-ay5-ekliyor'].filter(Boolean).join(' ');
  const tolKonumu = b && m && typeof m.v === 'number' ? toleransKonumu(b, m.v) : null;

  return (
    <div className={kok} role="region" aria-label="Teknik resim" onKeyDown={tusa}>
      {grid && <div className="tc-ay5-izgara" aria-hidden="true" />}
      {mode3d && (doc.kind === 'step' || model3d) ? (
        doc.kind === 'step' && doc.data ? <Model3B data={doc.data} fa={doc.fa ?? 2} /> : model3d ? <Model3B data={model3d.data} fa={model3d.fa} /> : null
      ) : (
        <div
          ref={st} tabIndex={-1} className={`tc-ay5-sahne${drag ? ' tc-ay5-surukle' : ''}`} onPointerDown={pd} onPointerMove={pm} onPointerUp={pu} onPointerCancel={pu}
          onDoubleClick={(e) => { if (adding || (e.target as Element).closest('.tc-ay5-balon')) return; const r = st.current?.getBoundingClientRect(); if (r) zoomAt(1.6, e.clientX - r.left, e.clientY - r.top); }}
        >
          <div ref={tuvalRef} className="tc-ay5-tuval">
            {doc.kind === 'pdf' && (imgUrl || loUrl) && <img className="tc-ay5-pdf" src={((hiWant || !loUrl) && imgUrl ? imgUrl : loUrl || imgUrl) ?? undefined} alt="" draggable={false} />}
            <svg ref={(el) => { svgRef.current = el; svgDegiskeni(el); }} key={doc.key} viewBox={'0 0 ' + doc.w + ' ' + doc.h} preserveAspectRatio="xMidYMid meet" role="img" aria-label={'Teknik resim ' + doc.name}>
              {doc.kind === 'pdf' && deep && z.k >= 1.12 && (
                <g className="tc-ay5-derin"><rect x={deep.x} y={deep.y} width={deep.w} height={deep.h} /><image href={deep.url} x={deep.x} y={deep.y} width={deep.w} height={deep.h} preserveAspectRatio="none" /></g>
              )}
              {doc.kind === 'step' && <g dangerouslySetInnerHTML={{ __html: doc.svg ?? '' }} />}
              {props && !RO && doc.kind === 'pdf' && (
                <g className="tc-ay5-oneriler">
                  {props.map((p, i) => (p.ar && (lowOn || p.lvl !== 'low' || p.on) ? (
                    <g
                      key={'h' + i} className={`tc-ay5-oneri tc-ay5-${p.lvl}${p.on ? ' tc-ay5-on' : ''}${i === oneriAktif ? ' tc-ay5-aktif' : ''}`} transform={'translate(' + p.ar[0] + ' ' + p.ar[1] + ') rotate(' + (p.ar[4] * 180 / Math.PI) + ')'}
                      onClick={(e) => { e.stopPropagation(); setOneriAktif(i); setProps(Object.assign(props.map((q, j) => (j === i ? { ...q, on: !q.on } : q)), { stats: props.stats })); }}
                    >
                      <rect x={-p.ar[2] - p.ar[3] * 0.4} y={-p.ar[3] * 1.25} width={2 * p.ar[2] + p.ar[3] * 0.8} height={p.ar[3] * 2.5} rx={p.ar[3] * 0.4} />
                    </g>
                  ) : null))}
                </g>
              )}
              {ctl.katman && onPrimary ? ctl.katman(doc, U) : null}
              {leadLayer}
              {balloonsLayer}
              {regRect && <rect className="tc-ay5-cerceve" x={regRect.x} y={regRect.y} width={regRect.w} height={regRect.h} />}
              {onPrimary && ctl.notlar?.map((p) => (
                <g key={'pin' + p.id} transform={'translate(' + p.x + ' ' + p.y + ') scale(' + U + ')'}>
                  <g className={`tc-ay5-not${p.status === 'done' ? ' tc-ay5-cozuldu' : ''}`} role="button" tabIndex={0} aria-label="Operatör notu"
                    onClick={(e) => { e.stopPropagation(); setPinSel(p.id); setSel(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { setPinSel(p.id); setSel(null); } }}>
                    <path d="M0 0C-15 -15 -15 -38 0 -38C15 -38 15 -15 0 0Z" /><text y="-22">{p.status === 'done' ? '✓' : '!'}</text>
                  </g>
                </g>
              ))}
              {pinEdit && <g transform={'translate(' + pinEdit.x + ' ' + pinEdit.y + ') scale(' + U + ')'}><g className="tc-ay5-not tc-ay5-hayalet"><path d="M0 0C-15 -15 -15 -38 0 -38C15 -38 15 -15 0 0Z" /></g></g>}
              {edit && edit.isNew && <g transform={'translate(' + (edit.x ?? 0) + ' ' + (edit.y ?? 0) + ') scale(' + U + ')'}><circle r="16" className="tc-ay5-yeni" /></g>}
            </svg>
          </div>
        </div>
      )}
      <div className="tc-ay5-ust">
        <div className="tc-ay5-baslik">
          <b>
            {doc.name}{doc.rev && <span className="tc-ay5-rev">REV {doc.rev}</span>}
            {(doc.mk || doc.kind !== 'bos') && <span className="tc-ay5-kaynak">{doc.mk || (doc.kind === 'pdf' ? 'PDF' : 'STEP')}</span>}
            {RO && ctl.eskiCizim ? <span className="tc-ay5-kaynak tc-ay5-eski"><Simge ad="alert" boyut="k" /> {ESKI_CIZIM[ctl.eskiCizim].rozet}</span>
              : RO ? <span className="tc-ay5-kaynak tc-ay5-kilitli"><Simge ad="check" boyut="k" /> KALİTE ONAYLI</span> : null}
          </b>
          <span className="tc-ay5-alt">{doc.sub}</span>
          {(doc.kind === 'step' || pkgModel) && (
            <div className="tc-ay5-dilimler">
              <button type="button" className={`tc-ay5-dilim${!mode3d ? ' tc-ay5-acik' : ''}`} aria-pressed={!mode3d} onClick={() => setMode3d(false)}><Simge ad="ruler" boyut="k" />Teknik resim</button>
              <button type="button" className={`tc-ay5-dilim${mode3d ? ' tc-ay5-acik' : ''}`} aria-pressed={mode3d} onClick={() => { void open3d(); }}><Simge ad="cube" boyut="k" />3B model</button>
            </div>
          )}
          {doc.kind === 'pdf' && (doc.pages ?? 1) > 1 && (
            <div className="tc-ay5-dilimler">
              <button type="button" className="tc-ay5-dilim" aria-label="Önceki sayfa" disabled={(doc.page ?? 1) <= 1} onClick={() => sayfaGec((doc.page ?? 1) - 1)}>‹</button>
              <span className="tc-ay5-mono">{doc.page} / {doc.pages}</span>
              <button type="button" className="tc-ay5-dilim" aria-label="Sonraki sayfa" disabled={(doc.page ?? 1) >= (doc.pages ?? 1)} onClick={() => sayfaGec((doc.page ?? 1) + 1)}>›</button>
            </div>
          )}
        </div>
        <div className="tc-ay5-araclar" role="toolbar" aria-label="Teknik resim araçları">
          {arac(fs ? 'x' : 'expand', fs, () => setFs(!fs), fs ? 'Odak modundan çık' : 'Odak modu · tam ekran')}
          {arac('layers', drawer === 'lib', () => setDrawer(drawer === 'lib' ? null : 'lib'), 'Dokümanlar')}
          {!mode3d && (
            <>
              <span className="tc-ay5-ayrac" aria-hidden="true" />
              {ctl.notBirak && onPrimary && arac('flag', pinMode, () => { setPinMode(!pinMode); setAdding(false); setSel(null); }, 'Resim üzerine geri bildirim')}
              {!RO && onPrimary && arac('target', adding, () => { setAdding(!adding); setRegMode(false); setSel(null); }, 'Kontrol noktası ekle (B)')}
              {!RO && onPrimary && bal.length > 0 && arac('clipboard-check', selMode, () => { setSelMode(!selMode); setMsel([]); setAdding(false); setRegMode(false); setPinMode(false); setSel(null); }, 'Çoklu seç · CMM / Elle')}
              {!RO && onPrimary && doc.kind === 'pdf' && arac('scan', regMode, () => { setRegMode(!regMode); setAdding(false); setPinMode(false); setSel(null); }, 'Bölge oku · ölçüyü çerçeve içine al (R)')}
              {!RO && onPrimary && gecmis.geri.length > 0 && arac('chev-left', false, () => gecmisUygula(false), 'Geri al (Ctrl+Z)')}
              {!RO && onPrimary && gecmis.ileri.length > 0 && arac('chev-right', false, () => gecmisUygula(true), 'Yinele (Ctrl+Y)')}
              {arac('list', drawer === 'insp', () => setDrawer(drawer === 'insp' ? null : 'insp'), 'Ölçüm listesi')}
              {arac('eye', showB, () => setShowB(!showB), 'Balonları göster')}
              {onPrimary && bal.length > 0 && arac('gear', drawer === 'balon', () => setDrawer(drawer === 'balon' ? null : 'balon'), 'Balon boyutu ve yerleşimi')}
              {doc.kind !== 'pdf' && arac('ruler', dims, () => setDims(!dims), 'Ölçüler')}
              {doc.kind === 'step' && arac('dash', hidden, () => setHidden(!hidden), 'Gizli çizgiler')}
              {arac('grid', grid, () => setGrid(!grid), 'Izgara')}
              <span className="tc-ay5-ayrac" aria-hidden="true" />
              {arac('zin', false, () => { const c = ctr(); zoomAt(1.3, c[0], c[1]); }, 'Yakınlaştır')}
              {arac('zout', false, () => { const c = ctr(); zoomAt(1 / 1.3, c[0], c[1]); }, 'Uzaklaştır')}
              {arac('fit', false, () => setZ({ k: 1, x: 0, y: 0 }), 'Sığdır')}
              {doc.kind === 'step' && arac('download', false, exportSvg, 'Teknik resmi SVG indir')}
            </>
          )}
        </div>
      </div>
      {!mode3d && (
        <span className="tc-ay5-durum" role="status">
          {Math.round(z.k * 100)}% · {nMeas}/{bal.length} ölçüldü{nBad > 0 && <> · <b className="tc-ay5-kirmizi">{nBad} red</b></>}
          {nBad > 0 && ctl.retGerekcesi && <> · <span className="tc-ay5-ret">{ctl.retGerekcesi}</span></>}
        </span>
      )}
      {pinMode && <div className="tc-ay5-ipucu"><Simge ad="flag" />Notu bırakmak istediğin yere dokun<Dugme onClick={() => setPinMode(false)}>Vazgeç</Dugme></div>}
      {selMode && (
        <div className="tc-ay5-ipucu tc-ay5-coklu" onPointerDown={(e) => e.stopPropagation()}>
          <Simge ad="clipboard-check" /><span><b>{msel.length}</b> balon seçili<small>Balona dokun ya da çerçeve çiz</small></span>
          <Dugme onClick={() => setMsel(msel.length === bal.length ? [] : bal.map((x) => x.id))}>{msel.length === bal.length ? 'Hiçbiri' : 'Tümü'}</Dugme>
          <Dugme simge="ruler" disabled={!msel.length} onClick={() => setMeth(msel, 'man')}>Elle</Dugme>
          <Dugme simge="box" disabled={!msel.length} onClick={() => setMeth(msel, 'cmm')}>CMM</Dugme>
          <Dugme simge="alert" disabled={!msel.length} onClick={() => { const hepsi = msel.every((id) => bal.find((x) => x.id === id)?.crit); topluYaz(msel, (x) => ({ ...x, crit: hepsi ? undefined : true }), hepsi ? 'kritik değil' : 'kritik'); }}>Kritik</Dugme>
          <Secim etiket="Ölçü aleti" value="" disabled={!msel.length} bosSecenek="Seç" secenekler={OLCU_ALETLERI.map((a) => ({ deger: a, baslik: a }))}
            onChange={(e) => { const a = e.target.value; if (a) topluYaz(msel, (x) => ({ ...x, tool: a, ...(a === 'CMM' ? { m: 'cmm' as const } : {}) }), a); }} />
          <Secim etiket="Sıklık" value="" disabled={!msel.length} bosSecenek="Seç" secenekler={KONTROL_SIKLIKLARI.map((a) => ({ deger: a, baslik: a }))}
            onChange={(e) => { const a = e.target.value; if (a) topluYaz(msel, (x) => ({ ...x, freq: a }), a); }} />
          <Dugme simge="trash" tur="tehlike" disabled={!msel.length} onClick={() => removeBalloons(msel)}>Sil</Dugme>
          <Dugme tur="birincil" onClick={() => { setSelMode(false); setMsel([]); }}>Bitti</Dugme>
        </div>
      )}
      {regMode && <div className="tc-ay5-ipucu"><Simge ad="scan" />Okunacak ölçüyü parmağınla çerçeve içine al<Dugme onClick={() => { setRegMode(false); setRegRect(null); }}>Vazgeç</Dugme></div>}
      {adding && <div className="tc-ay5-ipucu"><Simge ad="target" />Resimde ölçünün yanına dokun<Dugme onClick={() => setAdding(false)}>Vazgeç</Dugme></div>}

      {drawer === 'lib' && (
        <div className="tc-ay5-cekmece" role="dialog" aria-label="Dokümanlar" onPointerDown={(e) => e.stopPropagation()}>
          <div className="tc-ay5-cekmece-ust"><b>Dokümanlar</b><button type="button" className="tc-ay5-kapat" onClick={() => setDrawer(null)} aria-label="Kapat"><Simge ad="x" /></button></div>
          <span className="tc-ay5-ust-yazi">İş paketi dosyaları</span>
          {ctl.dosyalar.map((f) => (
            <button key={f.name} type="button" className={`tc-ay5-satir${doc.file === f.name ? ' tc-ay5-guncel' : ''}`} onClick={() => { void openBytes(f.bytes, f.name, 'pkg'); }}>
              <span className={`tc-ay5-tur tc-ay5-tur-${f.kind === 'pdf' ? 'pdf' : 'model'}`}>{f.kind === 'pdf' ? 'PDF' : f.name.split('.').pop()?.toUpperCase().slice(0, 4)}</span>
              <span className="tc-ay5-metin"><b>{f.name}</b><small>{(f.bytes.length / 1024).toFixed(0)} KB{f.name === ctl.anaResim ? ' · ana resim' : ''}</small></span>
            </button>
          ))}
        </div>
      )}

      {drawer === 'balon' && (
        <div className="tc-ay5-cekmece" role="dialog" aria-label="Balon boyutu ve yerleşimi" onPointerDown={(e) => e.stopPropagation()}>
          <div className="tc-ay5-cekmece-ust"><b>Balonlar</b><button type="button" className="tc-ay5-kapat" onClick={() => setDrawer(null)} aria-label="Kapat"><Simge ad="x" /></button></div>
          <span className="tc-ay5-ust-yazi">Balon boyutu</span>
          <div className="tc-ay5-dilimler" role="group" aria-label="Balon boyutu">
            {BALON_BOYLARI.map(([v, ad]) => (
              <button key={ad} type="button" className={`tc-ay5-dilim${balonAyari.carpan === v ? ' tc-ay5-acik' : ''}`} aria-pressed={balonAyari.carpan === v}
                onClick={() => balonAyariYaz({ ...balonAyari, carpan: v })}>{ad}</button>
            ))}
          </div>
          <span className="tc-ay5-ust-yazi">Yerleşim</span>
          <div className="tc-ay5-dilimler" role="group" aria-label="Yerleşim">
            {BALON_KIPLERI.map((k) => (
              <button key={k} type="button" className={`tc-ay5-dilim${balonAyari.kip === k ? ' tc-ay5-acik' : ''}`} aria-pressed={balonAyari.kip === k}
                onClick={() => balonAyariYaz({ ...balonAyari, kip: k })}>{BALON_KIPI_ADI[k]}</button>
            ))}
          </div>
          <p className="tc-ay5-soluk">Balonu sürükle: yeri sabitlenir. Yeniden diz sabit balonlara dokunmaz.</p>
          {!RO && (
            <div className="tc-ay5-dugmeler">
              <Dugme simge="rotate" disabled={!bal.some((x) => x.yerKipi)} onClick={() => hepsiniDiz(false)}>Yeniden diz</Dugme>
              <Dugme simge="pin" disabled={!bal.some((x) => x.yer || x.yerKipi)} onClick={() => hepsiniDiz(true)}>Sabitleri çöz</Dugme>
            </div>
          )}
          {!RO && (
            <>
              <span className="tc-ay5-ust-yazi">Yeniden numarala</span>
              <div className="tc-ay5-dilimler" role="group" aria-label="Numara sırası">
                {(Object.keys(SIRA_YOLU_ADI) as SiraYolu[]).map((k) => (
                  <button key={k} type="button" className={`tc-ay5-dilim${onizleme?.yol === k ? ' tc-ay5-acik' : ''}`} aria-pressed={onizleme?.yol === k} disabled={olcumVar}
                    onClick={() => setOnizleme({ yol: k, harita: numaraSirasi(bal, k, doc.w, doc.h) })}>{SIRA_YOLU_ADI[k]}</button>
                ))}
              </div>
              {olcumVar ? <p className="tc-ay5-soluk">Ölçüm girilmiş resimde numaralar değişmez: ölçümler numaraya bağlıdır.</p>
                : onizleme ? (
                  <>
                    <p className="tc-ay5-soluk">{bal.filter((x) => onizleme.harita[x.id] !== x.id).length} balonun numarası değişecek; yeni numara resimde gösteriliyor.</p>
                    <div className="tc-ay5-dugmeler">
                      <Dugme onClick={() => setOnizleme(null)}>Vazgeç</Dugme>
                      <Dugme tur="birincil" simge="check" onClick={numaralaUygula}>Uygula</Dugme>
                    </div>
                  </>
                ) : <p className="tc-ay5-soluk">Sıra seç: önce resimde önizlenir.</p>}
            </>
          )}
        </div>
      )}

      {drawer === 'insp' && (
        <div className="tc-ay5-cekmece tc-ay5-genis" role="dialog" aria-label="Ölçüm listesi" onPointerDown={(e) => e.stopPropagation()}>
          <div className="tc-ay5-cekmece-ust"><b>Ölçüm listesi</b><span className="tc-ay5-ust-yazi">{nMeas}/{bal.length} · {nBad} red</span>
            <button type="button" className="tc-ay5-kapat" onClick={() => setDrawer(null)} aria-label="Kapat"><Simge ad="x" /></button></div>
          <div className="tc-ay5-olcumler">
            {bal.length ? bal.map((x) => {
              const r = meas[x.id];
              const no = <span className={`tc-ay5-no${yontem(x) === 'cmm' ? ' tc-ay5-cmm' : ''}${r ? (r.ok ? ' tc-ay5-uygun' : ' tc-ay5-red') : ''}`}>{x.id}</span>;
              const sonuc = <em className={r ? (r.ok ? 'tc-ay5-uygun' : 'tc-ay5-red') : ''}>{r ? r.v : '—'}</em>;
              // Düzenleyen için satır içi düzeltme: ölçü yazımı Enter ile balona geçer.
              if (!RO && onPrimary) return (
                <div key={x.id} className={`tc-ay5-olcum tc-ay5-satir-duzen${sel === x.id ? ' tc-ay5-guncel' : ''}`}>
                  <button type="button" className="tc-ay5-no-dugme" onClick={() => { setSel(x.id); setVal(''); }} aria-label={'Balon ' + x.id + ' seç'}>{no}</button>
                  <span className="tc-ay5-metin">
                    <input key={x.nom + '|' + (x.tol ?? '')} className="tc-alan-kutu tc-ay5-mono" defaultValue={duzenlemeMetni(x)} aria-label={'Balon ' + x.id + ' ölçü'}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); satirYaz(x, e.currentTarget.value); } if (e.key === 'Escape') e.currentTarget.value = duzenlemeMetni(x); }}
                      onBlur={(e) => satirYaz(x, e.currentTarget.value)} />
                    <small>{x.tol} · {x.min} – {x.max} · {x.tool} · {YONTEM_ADI[yontem(x)]}{x.crit ? ' · KRİTİK' : ''}</small>
                  </span>
                  {sonuc}
                </div>
              );
              return (
                <button key={x.id} type="button" className={`tc-ay5-olcum${sel === x.id ? ' tc-ay5-guncel' : ''}`} onClick={() => { setSel(x.id); setVal(''); }}>
                  {no}
                  <span className="tc-ay5-metin"><b className="tc-ay5-mono">{x.nom}</b><small>{x.tol} · {x.tool} · {YONTEM_ADI[yontem(x)]}</small></span>
                  {sonuc}
                </button>
              );
            }) : <p className="tc-ay5-soluk">Henüz kontrol noktası yok. <b>◎</b> ile resme dokunarak ekle.</p>}
          </div>
          <div className="tc-ay5-dugmeler">
            <Dugme simge="download" onClick={exportCsv} disabled={!bal.length}>CSV rapor</Dugme>
            <Dugme onClick={() => setMeas({})} disabled={!nMeas}>Sıfırla</Dugme>
          </div>
        </div>
      )}

      {props && !RO && <Oneriler props={props} setProps={setProps} doc={doc} lowOn={lowOn} setLowOn={setLowOn} acceptProps={acceptProps} aktif={oneriAktif} setAktif={setOneriAktif}
        bolgeOku={() => { setRegMode(true); setAdding(false); setPinMode(false); }} sayfaOku={() => { void ocrPage(); }} />}

      {pwAsk && (
        <div className="tc-ay5-sifre" role="dialog" aria-label="Şifreli PDF" onPointerDown={(e) => e.stopPropagation()}>
          <h3><Simge ad="lock" />Şifreli PDF</h3>
          <p className="tc-ay5-soluk">{pwAsk.again ? 'Şifre yanlış, tekrar dene.' : 'Bu teknik resim şifreyle korunuyor.'}</p>
          <Girdi etiket="PDF şifresi" type="password" autoFocus value={pwAsk.v} onChange={(e) => setPwAsk({ ...pwAsk, v: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { const r = pwRef.current; setPwAsk(null); r?.(pwAsk.v); } }} />
          <div className="tc-ay5-dugmeler">
            <Dugme onClick={() => { const r = pwRef.current; setPwAsk(null); r?.(null); }}>Vazgeç</Dugme>
            <Dugme tur="birincil" onClick={() => { const r = pwRef.current; setPwAsk(null); r?.(pwAsk.v); }}>Aç</Dugme>
          </div>
        </div>
      )}

      {b && !edit && !mode3d && !pinEdit && !ctl.ozellikGizli && (
        <div key={b.id} className="tc-ay5-ozellik" role="dialog" aria-label={'Kontrol ' + b.id} onPointerDown={(e) => e.stopPropagation()}>
          <h3>
            <span className="tc-ay5-no">{b.id}</span>{b.l}
            {!RO && <button type="button" className="tc-ay5-kapat tc-ay5-sag" onClick={() => duzenle(b)} aria-label="Düzenle"><Simge ad="edit" /></button>}
            <button type="button" className={`tc-ay5-kapat${RO ? ' tc-ay5-sag' : ''}`} onClick={() => setSel(null)} aria-label="Kapat"><Simge ad="x" /></button>
          </h3>
          <div className="tc-ay5-nom">{b.nom}<small>{b.tol}</small></div>
          {!b.gauge && (
            <div className="tc-ay5-tolcubugu" aria-hidden="true">
              <div className="tc-ay5-bant" />
              <span className="tc-ay5-sinir tc-ay5-alt-sinir">{b.min}</span><span className="tc-ay5-sinir tc-ay5-ust-sinir">{b.max}</span>
              {tolKonumu != null && <i className="tc-ay5-imlec" ref={degiskenler({ '--konum': tolKonumu + '%' })} />}
            </div>
          )}
          <div className="tc-ay5-bilgi"><span>Ölçü aleti</span>
            {ctl.aletZorunlu && (!ctl.olcumYok || (ctl.operatorOlcer || []).includes(b.id))
              ? (ctl.aletSecimi ? ctl.aletSecimi(b.tool) : <DurumKutusu durum="bos" mesaj="Bu bölüm hazırlanıyor" />)
              : <b>{b.tool}{m && m.gno ? ' · ' + m.gno : ''}</b>}
          </div>
          <div className="tc-ay5-bilgi"><span>Ölçüm yöntemi</span>
            {RO ? <b className={`tc-ay5-yontem-${yontem(b)}`}>{YONTEM_ADI[yontem(b)]}</b> : (
              <div className="tc-ay5-dilimler">
                {(['man', 'cmm'] as const).map((k) => <button key={k} type="button" className={`tc-ay5-dilim${yontem(b) === k ? ' tc-ay5-acik' : ''}`} aria-pressed={yontem(b) === k} onClick={() => setMeth([b.id], k)}>{YONTEM_ADI[k]}</button>)}
              </div>
            )}
          </div>
          {!RO && (
            <div className="tc-ay5-bilgi"><span>Balon yeri</span>
              <div className="tc-ay5-dilimler">
                {b.yer
                  ? <button type="button" className="tc-ay5-dilim tc-ay5-acik" aria-pressed="true" onClick={() => balonYeriYaz(b.id, null, null)}><Simge ad="pin" boyut="k" />Sabit · bırak</button>
                  : (['yakin', 'serit'] as const).map((k) => (
                    <button key={k} type="button" className={`tc-ay5-dilim${konum(b).yer === k ? ' tc-ay5-acik' : ''}`} aria-pressed={konum(b).yer === k}
                      onClick={() => balonYeriYaz(b.id, null, k)}>{k === 'yakin' ? 'Yakında' : 'Şeritte'}</button>
                  ))}
              </div>
            </div>
          )}
          {b.not && <div className="tc-ay5-bilgi"><span>Not</span><b>{b.not}</b></div>}
          {b.freq && <div className="tc-ay5-bilgi"><span>Kontrol sıklığı</span><b className={b.crit ? 'tc-ay5-kirmizi' : ''}>{b.freq}{b.crit ? ' · KRİTİK' : ''}</b></div>}
          {m && <div className={`tc-ay5-karar${m.ok ? ' tc-ay5-uygun' : ' tc-ay5-red'}`}><Simge ad={m.ok ? 'check' : 'alert'} />{m.ok ? 'Uygun' : 'Tolerans dışı'} · {m.v}</div>}
          {ctl.olcumYok && !(ctl.operatorOlcer || []).includes(b.id)
            ? <div className="tc-ay5-bilgi-kutu"><Simge ad="target" /><span>Bu ölçü <b>kalite istasyonunda</b> yapılır{b.freq ? ' · ' + b.freq : ''}.</span></div>
            : b.gauge
              ? <div className="tc-ay5-dugmeler"><Dugme simge="check" onClick={() => saveMeasure('ok')}>Geçer</Dugme><Dugme simge="x" tur="tehlike" onClick={() => saveMeasure('nok')}>Geçmez</Dugme></div>
              : suggest
                ? (
                  <>
                    <div className="tc-ay5-oneri-kutu" role="alert"><Simge ad="alert" /><div><b>{suggest.v} tolerans dışında</b><span><b className="tc-ay5-mono">{suggest.alt}</b> mi demek istedin? Virgül kaymış olabilir.</span></div></div>
                    <div className="tc-ay5-dugmeler"><Dugme tur="birincil" simge="check" onClick={() => saveMeasure(null, suggest.alt)}>{suggest.alt} kaydet</Dugme><Dugme onClick={() => saveMeasure(null, suggest.v)}>{suggest.v} doğru</Dugme></div>
                  </>
                )
                : (
                  <div className="tc-ay5-olc">
                    <Girdi etiket="Ölçülen değer" inputMode="decimal" placeholder="Değer" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveMeasure(); }} autoFocus />
                    <Dugme tur="birincil" simge="check" onClick={() => saveMeasure()}>Kaydet</Dugme>
                  </div>
                )}
        </div>
      )}

      {edit && !mode3d && (() => {
        const p = edit.text ? AKTol.parse(edit.text, { cls: doc.cls || 'm' }) : null;
        const g = gdtYazimi(edit.text), y = g ? null : olcuYazimi(edit.text), tur = g ? 'gdt' : y ? olcuTuru(y) : null;
        const yaz = (ek: Partial<Duzenleme>) => setEdit({ ...edit, ...ek });
        const yazim = (v: ReturnType<typeof olcuYazimi>) => { if (v) yaz({ text: olcuYazimiMetni(v) }); };
        const turSec = (k: string) => {
          if (k === 'gdt') { if (!g) yaz({ text: gdtyeCevir(edit.text) }); return; }
          const v = olcuYazimi(g ? gdtdenCevir(edit.text) : edit.text) ?? olcuYazimi('0');
          if (v) yazim(olcuTuruSec(v, k as Parameters<typeof olcuTuruSec>[1]));
        };
        const onerilenAlet = p?.tool ?? '', alet = edit.aletElle && edit.tool ? edit.tool : onerilenAlet;
        const aletler = Array.from(new Set<string>([...OLCU_ALETLERI, ...(alet ? [alet] : [])]));
        const siklik = Array.from(new Set<string>([...KONTROL_SIKLIKLARI, ...(edit.freq ? [edit.freq] : [])]));
        const cakisir = noCakisir(edit);
        return (
          <div className="tc-ay5-ozellik" role="dialog" aria-label={edit.isNew ? 'Yeni kontrol noktası' : 'Noktayı düzenle'} onPointerDown={(e) => e.stopPropagation()}>
            <h3><span className="tc-ay5-no">{edit.isNew ? '+' : edit.id}</span>{edit.isNew ? 'Yeni kontrol noktası' : 'Noktayı düzenle'}
              <button type="button" className="tc-ay5-kapat tc-ay5-sag" onClick={() => setEdit(null)} aria-label="Kapat"><Simge ad="x" /></button></h3>
            {edit.kaynak && edit.kaynak !== edit.text && (
              <div className="tc-ay5-bilgi-kutu tc-ay5-kaynak-kutu"><Simge ad="file" /><span>Resimde: <b className="tc-ay5-mono">{edit.kaynak}</b></span>
                <Dugme simge="rotate" onClick={() => yaz({ text: edit.kaynak ?? '', aletElle: false })}>Yazıdan al</Dugme></div>
            )}
            {!edit.isNew && (
              <Girdi etiket="Numara" type="number" min={1} inputMode="numeric" className="tc-ay5-mono" value={edit.no ?? ''} disabled={olcumVar}
                ipucu={olcumVar ? 'Ölçüm girilmiş resimde numara değişmez' : undefined} onChange={(e) => yaz({ no: e.target.value, yol: null })} />
            )}
            {cakisir && (
              <div className="tc-ay5-oneri-kutu" role="alert"><Simge ad="alert" /><div><b>{edit.no} numarası başka balonda</b>
                <div className="tc-ay5-dilimler">
                  {([['degis', 'Yer değiştir'], ['araya', 'Araya al · sonrakiler kayar']] as const).map(([k, ad]) => (
                    <button key={k} type="button" className={`tc-ay5-dilim${edit.yol === k ? ' tc-ay5-acik' : ''}`} aria-pressed={edit.yol === k} onClick={() => yaz({ yol: k })}>{ad}</button>
                  ))}
                </div></div></div>
            )}
            <div className="tc-ay5-dilimler" role="group" aria-label="Tür">
              {[...OLCU_TURLERI, ['gdt', 'GD&T'] as const].map(([k, ad]) => (
                <button key={k} type="button" className={`tc-ay5-dilim${tur === k ? ' tc-ay5-acik' : ''}`} aria-pressed={tur === k} onClick={() => turSec(k)}>{ad}</button>
              ))}
            </div>
            <Girdi etiket="Ölçü (resimde yazdığı gibi)" className="tc-ay5-mono" autoFocus placeholder="Ø40 H7 · 18 ±0.05 · M8x1.25" value={edit.text}
              onChange={(e) => yaz({ text: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') applyEdit(); }} />
            {g ? (
              <>
                <div className="tc-ay5-dilimler" role="group" aria-label="Geometrik tolerans">
                  {GDT_SEMBOLLERI.map((k) => (
                    <button key={k} type="button" className={`tc-ay5-dilim tc-ay5-mono${g.sembol === k ? ' tc-ay5-acik' : ''}`} aria-pressed={g.sembol === k}
                      onClick={() => yaz({ text: gdtYazimiMetni({ ...g, sembol: k }) })}>{k}</button>
                  ))}
                  <button type="button" className={`tc-ay5-dilim${g.cap ? ' tc-ay5-acik' : ''}`} aria-pressed={g.cap} onClick={() => yaz({ text: gdtYazimiMetni({ ...g, cap: !g.cap }) })}>Ø bölge</button>
                </div>
                <div className="tc-ay5-iki">
                  <Girdi etiket="Tolerans bölgesi" inputMode="decimal" className="tc-ay5-mono" value={g.deger} onChange={(e) => yaz({ text: gdtYazimiMetni({ ...g, deger: e.target.value.replace(',', '.') }) })} />
                  <Girdi etiket="Referans" placeholder="A B C · Ⓜ" className="tc-ay5-mono" value={g.kalan} onChange={(e) => yaz({ text: gdtYazimiMetni({ ...g, kalan: e.target.value }) })} />
                </div>
              </>
            ) : y && tur !== 'M' ? (
              <>
                <div className="tc-ay5-dilimler" role="group" aria-label="Tolerans">
                  {(Object.keys(TOL_KIPI_ADI) as TolKipi[]).map((k) => (
                    <button key={k} type="button" className={`tc-ay5-dilim${y.kip === k ? ' tc-ay5-acik' : ''}`} aria-pressed={y.kip === k} onClick={() => yazim(tolKipiSec(y, k))}>{TOL_KIPI_ADI[k]}</button>
                  ))}
                </div>
                {y.kip === 'sim' && <Girdi etiket="± sapma" inputMode="decimal" className="tc-ay5-mono" value={y.ust} onChange={(e) => yazim({ ...y, ust: e.target.value.replace(',', '.') })} />}
                {y.kip === 'sapma' && (
                  <div className="tc-ay5-iki">
                    <Girdi etiket="Üst sapma" inputMode="decimal" placeholder="+0.05" className="tc-ay5-mono" value={y.ust} onChange={(e) => yazim({ ...y, ust: e.target.value.replace(',', '.') })} />
                    <Girdi etiket="Alt sapma" inputMode="decimal" placeholder="-0.02" className="tc-ay5-mono" value={y.alt} onChange={(e) => yazim({ ...y, alt: e.target.value.replace(',', '.') })} />
                  </div>
                )}
                {y.kip === 'uyum' && <Girdi etiket="Uyum" placeholder="H7 · g6 · F8" className="tc-ay5-mono" value={y.uyum} onChange={(e) => yazim({ ...y, uyum: e.target.value.trim() })} />}
              </>
            ) : null}
            {p ? (
              <>
                <div className="tc-ay5-karar"><span className="tc-ay5-mono">{p.nomText}</span><span className="tc-ay5-mono tc-ay5-sag">{p.min} – {p.max}</span></div>
                <div className="tc-ay5-bilgi"><span>{p.tolText}</span></div>
                {p.unknownFit && <div className="tc-ay5-karar tc-ay5-red">Uyum tabloda yok · sınırları ± ya da + / − ile girin</div>}
              </>
            ) : edit.text ? <div className="tc-ay5-karar tc-ay5-red">Biçim tanınmadı</div>
              : <div className="tc-ay5-bilgi"><span>H7, g6 gibi geçmeler ISO 286'dan hesaplanır</span></div>}
            <Girdi etiket="Etiket (isteğe bağlı)" placeholder="örn. Merkez delik" value={edit.label} onChange={(e) => yaz({ label: e.target.value })} />
            <div className="tc-ay5-iki">
              <Secim etiket="Ölçü aleti" value={alet} secenekler={aletler.map((a) => ({ deger: a, baslik: a + (a === onerilenAlet ? ' · önerilen' : '') }))}
                onChange={(e) => yaz({ tool: e.target.value, aletElle: e.target.value !== onerilenAlet, ...(e.target.value === 'CMM' ? { m: 'cmm' as const } : {}) })} />
              <Secim etiket="Kontrol sıklığı" value={edit.freq ?? ''} bosSecenek="Belirtilmedi" secenekler={siklik.map((a) => ({ deger: a, baslik: a }))}
                onChange={(e) => yaz({ freq: e.target.value })} />
            </div>
            <div className="tc-ay5-bilgi"><span>Ölçüm yöntemi</span>
              <div className="tc-ay5-dilimler">
                {(['man', 'cmm'] as const).map((k) => <button key={k} type="button" className={`tc-ay5-dilim${(edit.m ?? 'man') === k ? ' tc-ay5-acik' : ''}`} aria-pressed={(edit.m ?? 'man') === k} onClick={() => yaz({ m: k })}>{YONTEM_ADI[k]}</button>)}
                <button type="button" className={`tc-ay5-dilim${edit.crit ? ' tc-ay5-acik' : ''}`} aria-pressed={!!edit.crit} onClick={() => yaz({ crit: !edit.crit })}><Simge ad="alert" boyut="k" />Kritik</button>
              </div>
            </div>
            <Girdi etiket="Not (isteğe bağlı)" placeholder="örn. boydan, iki yönde ölç" value={edit.not ?? ''} onChange={(e) => yaz({ not: e.target.value })} />
            <div className="tc-ay5-dugmeler">
              {!edit.isNew && edit.id != null && <Dugme tur="tehlike" simge="trash" aria-label="Sil" onClick={() => removeBalloon(edit.id!)} />}
              {!edit.isNew && edit.id != null && (() => { const x = bal.find((q) => q.id === edit.id); return x ? <Dugme simge="layers" onClick={() => cogalt(x)}>Çoğalt</Dugme> : null; })()}
              <Dugme tur="birincil" simge="check" disabled={cakisir && !edit.yol} onClick={applyEdit}>Kaydet</Dugme>
            </div>
          </div>
        );
      })()}

      {pinEdit && ctl.notBirak && (
        <div className="tc-ay5-ozellik" role="dialog" aria-label="Resim üzerine not" onPointerDown={(e) => e.stopPropagation()}>
          <h3><span className="tc-ay5-no tc-ay5-uyari">!</span>Resim üzerine not<button type="button" className="tc-ay5-kapat tc-ay5-sag" onClick={() => setPinEdit(null)} aria-label="Kapat"><Simge ad="x" /></button></h3>
          <div className="tc-ay5-hizli">
            {NOT_ETIKETLERI.map((t) => (
              <button key={t} type="button" className={`tc-ay5-dilim${pinEdit.tags.includes(t) ? ' tc-ay5-acik' : ''}`} aria-pressed={pinEdit.tags.includes(t)}
                onClick={() => setPinEdit({ ...pinEdit, tags: pinEdit.tags.includes(t) ? pinEdit.tags.filter((x) => x !== t) : pinEdit.tags.concat([t]) })}>{t}</button>
            ))}
          </div>
          <Girdi etiket="Açıklama (isteğe bağlı)" value={pinEdit.text} onChange={(e) => setPinEdit({ ...pinEdit, text: e.target.value })} placeholder="Kısaca yaz" />
          <Dugme tur="birincil" simge="next" disabled={!pinEdit.tags.length && !pinEdit.text}
            onClick={() => { ctl.notBirak?.({ x: pinEdit.x, y: pinEdit.y, text: pinEdit.tags.concat(pinEdit.text ? [pinEdit.text] : []).join(' · ') }); setPinEdit(null); }}>Hazırlığa gönder</Dugme>
        </div>
      )}
      {pin && (
        <div className="tc-ay5-ozellik" role="dialog" aria-label="Operatör notu" onPointerDown={(e) => e.stopPropagation()}>
          <h3><span className={`tc-ay5-no ${pin.status === 'done' ? 'tc-ay5-uygun-zemin' : 'tc-ay5-uyari'}`}>{pin.status === 'done' ? '✓' : '!'}</span>Operatör notu
            <button type="button" className="tc-ay5-kapat tc-ay5-sag" onClick={() => setPinSel(null)} aria-label="Kapat"><Simge ad="x" /></button></h3>
          <div className="tc-ay5-not-metni">{pin.text}</div>
          <div className="tc-ay5-bilgi"><span>{pin.by} · {new Date(pin.at).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span><b>{pin.status === 'done' ? 'Çözüldü' : 'Açık'}</b></div>
          {pin.reply && <div className="tc-ay5-karar tc-ay5-uygun">{pin.reply}</div>}
          {ctl.notCoz && pin.status !== 'done' && <Dugme tur="birincil" simge="check" onClick={() => { ctl.notCoz?.(pin.id); setPinSel(null); }}>Çözüldü olarak işaretle</Dugme>}
        </div>
      )}
      {busy && (
        <div className="tc-ay5-mesgul" role="status" aria-label={busy.t}>
          <span className="tc-ay5-tarama" aria-hidden="true" />
          <div className="tc-ay5-mesgul-kart">
            <b>{busy.t}</b>
            {busy.pct != null && <div className="tc-ay5-ilerleme"><i ref={degiskenler({ '--oran': Math.round(busy.pct * 100) + '%' })} /></div>}
            {busy.steps.map((s, i) => (
              <div key={i} className={`tc-ay5-adim${i < busy.i ? ' tc-ay5-bitti' : i === busy.i ? ' tc-ay5-suren' : ''}`}>
                <span>{i < busy.i ? <Simge ad="check" boyut="k" /> : i === busy.i ? <i className="tc-ay5-doner" /> : ''}</span>{s}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Öneri kuyruğu (967 a): oklar ya da S ile sıradaki, Enter seç ve geç, Del listeden çıkar; seçili öneri resimde de vurgulanır.
function Oneriler({ props, setProps, doc, lowOn, setLowOn, acceptProps, bolgeOku, sayfaOku, aktif, setAktif }: {
  props: OneriListesi; setProps: (p: OneriListesi | null) => void; doc: ResimBelgesi; lowOn: boolean; setLowOn: (v: boolean) => void;
  acceptProps: () => void; bolgeOku: () => void; sayfaOku: () => void; aktif: number; setAktif: (i: number) => void;
}) {
  const S = props.stats || {};
  const yaz = (l: Oneri[]) => setProps(Object.assign(l, { stats: props.stats }));
  const tog = (i: number) => { setAktif(i); yaz(props.map((q, j) => (j === i ? { ...q, on: !q.on } : q))); };
  const setAll = (f: (p: Oneri) => boolean, v: boolean) => yaz(props.map((q) => (f(q) ? { ...q, on: v } : q)));
  const elim = (S.table || 0) + (S.border || 0) + (S.notes || 0) + (S.prose || 0);
  const kok = useRef<HTMLDivElement>(null);
  useEffect(() => { kok.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { kok.current?.querySelector('.tc-ay5-aktif')?.scrollIntoView?.({ block: 'nearest' }); }, [aktif]);
  // Görünen sıra: PDF'te güven grupları, düşük güven gizliyse onlar atlanır.
  const sira = props.map((p, i) => [p, i] as const).filter(([p]) => doc.kind !== 'pdf' || lowOn || (p.lvl || 'high') !== 'low')
    .sort((a, b) => (doc.kind !== 'pdf' ? 0 : SEVIYELER.findIndex(([k]) => k === (a[0].lvl || 'high')) - SEVIYELER.findIndex(([k]) => k === (b[0].lvl || 'high'))) || a[1] - b[1])
    .map(([, i]) => i);
  const komsu = (adim: number) => { const k = sira.indexOf(aktif); return sira[Math.max(0, Math.min(sira.length - 1, (k < 0 ? 0 : k + adim)))] ?? 0; };
  const tus = (e: TepkiTusu<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON' && e.key === 'Enter') return;
    const k = e.key.toLowerCase();
    if (k === 'arrowdown' || k === 's') setAktif(komsu(1));
    else if (k === 'arrowup') setAktif(komsu(-1));
    else if (k === 'enter') { const i = props[aktif] ? aktif : komsu(0); yaz(props.map((q, j) => (j === i ? { ...q, on: true } : q))); setAktif(komsu(1)); }
    else if (k === 'delete' || k === 'backspace') {
      if (!props[aktif]) return;
      const l = props.filter((_, j) => j !== aktif);
      if (!l.length) { setProps(null); return; }
      yaz(l); setAktif(Math.min(aktif, l.length - 1));
    } else return;
    e.preventDefault(); e.stopPropagation();
  };
  const satir = (p: Oneri, i: number) => (
    <label key={i} className={`tc-ay5-olcum tc-ay5-${p.lvl || 'high'}${i === aktif ? ' tc-ay5-aktif' : ''}`}>
      <input type="checkbox" checked={p.on} onChange={() => tog(i)} />
      <span className="tc-ay5-metin">
        <b className="tc-ay5-mono">{p.nom}</b>
        <small>{p.l} · {p.tol}{p.note ? ' · ' + p.note : ''}{p.unknown ? ' · tablo dışı geçme!' : ''}</small>
        {p.why && doc.kind === 'pdf' && <small>{p.why}</small>}
      </span>
      <em>{p.tool}</em>
    </label>
  );
  return (
    <div ref={kok} tabIndex={-1} className="tc-ay5-cekmece tc-ay5-genis" role="dialog" aria-label="Ölçü önerileri" onPointerDown={(e) => e.stopPropagation()} onKeyDown={tus}>
      <div className="tc-ay5-cekmece-ust">
        <div><span className="tc-ay5-ust-yazi">{doc.kind === 'step' ? 'Modelden çıkarıldı' : S.ocr ? 'Görüntüden okundu (OCR)' : 'PDF metninden okundu'}</span><b>{props.length} ölçü bulundu</b></div>
        <button type="button" className="tc-ay5-kapat" onClick={() => setProps(null)} aria-label="Kapat"><Simge ad="x" /></button>
      </div>
      {doc.kind === 'pdf' && S.items != null ? (
        <div className="tc-ay5-seviyeler">
          {SEVIYELER.map(([k, l]) => <span key={k} className={`tc-ay5-${k}`}><i />{S[k] || 0} {l.toLocaleLowerCase('tr-TR')}</span>)}
          {elim > 0 && <em>{elim} yazı elendi: {[S.table && S.table + ' antet/tablo', S.border && S.border + ' pafta kenarı', S.notes && S.notes + ' not', S.prose && S.prose + ' açıklama'].filter(Boolean).join(' · ')}</em>}
        </div>
      ) : <p className="tc-ay5-soluk">Kontrol noktası olacakları seç. Tolerans yazmayanlara genel tolerans uygulanır.</p>}
      <p className="tc-ay5-soluk tc-ay5-kisayol"><kbd>Enter</kbd> seç ve geç · <kbd>S</kbd> geç · <kbd>Del</kbd> listeden çıkar · toleranslılar seçilmemiş gelir</p>
      <div className="tc-ay5-olcumler">
        {doc.kind !== 'pdf' ? props.map(satir) : SEVIYELER.map(([k, l]) => {
          const rows = props.map((p, i) => [p, i] as const).filter(([p]) => (p.lvl || 'high') === k);
          if (!rows.length) return null;
          const hide = k === 'low' && !lowOn, hepsi = rows.every(([p]) => p.on);
          return (
            <div key={k} className="tc-ay5-grup">
              <div className={`tc-ay5-grup-ust tc-ay5-${k}`}><i />{l}<span>{rows.length}</span>
                {k === 'low' ? <button type="button" className="tc-ay5-bag" onClick={() => setLowOn(!lowOn)}>{lowOn ? 'Gizle' : 'Göster'}</button>
                  : <button type="button" className="tc-ay5-bag" onClick={() => setAll((p) => (p.lvl || 'high') === k, !hepsi)}>{hepsi ? 'Hiçbiri' : 'Tümü'}</button>}
              </div>
              {hide ? null : rows.map(([p, i]) => satir(p, i))}
            </div>
          );
        })}
      </div>
      {doc.kind === 'pdf' && (
        <div className="tc-ay5-dugmeler">
          <Dugme simge="scan" onClick={bolgeOku}>Bölge oku</Dugme>
          {!S.ocr && <Dugme simge="search" onClick={sayfaOku}>Görüntüden oku</Dugme>}
        </div>
      )}
      <div className="tc-ay5-dugmeler">
        <Dugme onClick={() => setAll(() => true, !props.every((q) => q.on))}>{props.every((q) => q.on) ? 'Hiçbiri' : 'Tümü'}</Dugme>
        <Dugme tur="birincil" simge="check" onClick={acceptProps} disabled={!props.some((p) => p.on)}>{props.filter((p) => p.on).length} noktayı ekle</Dugme>
      </div>
    </div>
  );
}

export const TeknikResim = memo(TeknikResimGovdesi);
