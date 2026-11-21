import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as FareOlayi, type PointerEvent as ImlecOlayi } from 'react';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { emirKuyrugu } from '../ortak/emir-no.ts';
import type { Derleme } from '../motor/kurallar.ts';
import type { IsTasiOnizlemesi } from '../motor/atolye/gonder.ts';
import {
  SAAT_ENI, adimBaglari, agacAdimBasligi, aralikYuku, durumYazisi, DURDURMA_BEKLIYOR, durusYazisi, ekMesaiYazisi, okUcu, okYolu, planliDurusYazisi, satirKimligi, suAndakiDurus, sureYaz, tasimaSaati, tasinabilir, uzakMi, yukSinifi, yukYuzdesi,
  type AdimBagi, type KokpitEmri, type KokpitIsi, type KokpitModeli, type KokpitOlcegi, type TurAdayi,
} from './kurallar.ts';
import { MalzemeSeridi, malzemeCubuklari } from './MalzemeCubugu.tsx';
import type { EmirMalzemeleri } from './malzeme.ts';
import type { YerlestirmeHedefi } from './Yerlestirme.tsx';

// Kokpit tahtası: tezgâh ya da emir başına bir satır, satırda saat eksenli işler. İş bir düğmedir; yeri CSS değişkeniyle verilir
// (satır içi stil yok), bu yüzden plan değişince işler yeni yerine akarak gider. Taşıma (3365): fareyle basılıp sürüklenir, bırakılan yer sonuçtur;
// klavyede Space (ya da çift tık) işi tutar, tıklanan yere bırakır. Esc vazgeçer. Sürüklerken imleç durunca sunucu önizlemesi (is-tasi-onizlemesi)
// itilecek işleri işaretler; bırakılan yeri yine sunucu denetler. Dokunmatikte basılı tutup sürüklemek sayfayı kaydırır; orada Space/çift dokunuş kalır.
// Kısa iş (3365 a): okunmayacak kadar dar iş okunur genişlikte çizilir, gerçek süresi dolu kısımdır; çakışan kutular satırda alt alta iner.
// Ay ve Yıl'da satırlar yük hücrelerine döner; hücre o güne iner.

export type TahtaGozu = 'T' | 'S';
export interface CanliYer { m: string; S: number; C: number }
export interface TahtaOzellikleri {
  m: KokpitModeli; cx: Derleme; goz: TahtaGozu; olcek: KokpitOlcegi;
  // Süzgeçten geçen emirler (sipariş gözünün satırları ve tepsi).
  emirler: readonly KokpitEmri[];
  uyar: (job: string) => boolean;
  secEmir: string | null; secIs: string | null;
  sec: (job: string | null, isId: string | null) => void;
  zaman: (t: number) => string;
  // Yazamayan kişide null: tutma kapalıdır.
  tasi: ((isId: string, tezgah: string, S: number) => void) | null;
  // Tepsiden tutulan plansız emrin bırakıldığı yer (ilk adımın tezgâhı ve saati); yazamayan kişide null.
  planaAl: ((emirId: string, tezgah: string, S: number) => void) | null;
  // Önce / sonra açıkken işlerin onaylı plandaki yerleri; iş orada çizilir, üstünde taslakta ne kadar kaydığı yazar.
  once: Record<string, CanliYer> | null;
  gunAc: (gun: number) => void;
  uyari: (ileti: string) => void;
  // Görünüme getirilecek iş (matristen, turdan, ayrıntıdan).
  goster: string | null;
  // Ölçek değişince görünüme gelecek saat (yük hücresinden güne inişte); null şimdidir.
  odak: number | null;
  // Turun öne çıkan hamlesi: işin gideceği yer kesik çerçeveyle gösterilir ve görünüme getirilir.
  oneri: TurAdayi | null;
  // Seç-yerleştir (3297): seçili adımı yapabilen tezgâh satırları öne çıkar, boş yerler basılabilir çerçevedir; yalnız Tezgâh gözünde.
  yerlestirme?: YerlestirmeHedefi | null;
  // 3330: seçili kartın (siparişin) emirleri. Verilince o emirlerin işleri parlak, ötekiler soluktur ve adımlar arasına bağ oku çizilir.
  yanan?: ReadonlySet<string> | null;
  // Boş tahta alanına tıklanınca seçim kalkar.
  secimiKaldir?: () => void;
  // Tezgâhta sorun bildir (3335 a): tezgâh adına basınca o tezgâhın arıza ve bakım formu açılır; yalnız Tezgâh gözünde, fason satırında yok.
  sorunBildir?: ((tezgah: string) => void) | null;
  // Sürüklerken taşımanın etkisi (3365); yazamayan kişide ya da önizleme yokken null.
  onizle?: ((isId: string, tezgah: string, S: number) => Promise<IsTasiOnizlemesi | null>) | null;
  // Bağ okları (3365): is = üstüne gelinen ya da seçili işin önceki ve sonraki adımı; siparis = seçili siparişin (yoksa işin emrinin) bütün bağları.
  okKipi?: OkKipi;
  // Çoklu seçim (3365): Ctrl, Cmd ya da Shift ile tıklanan işler. Seçilenlerden biri sürüklenince hepsi aynı süre kayar (tezgâhları kalır).
  coklu?: ReadonlySet<string>;
  cokluSec?: ((isId: string) => void) | null;
  grupKaydir?: ((dS: number) => void) | null;
  // Sürekli yakınlaştırma (3365): verilirse saat eni ölçeğin sabit eni yerine budur (yalnız Gün, 3 gün, Hafta).
  saatEni?: number | null;
  // Emirlerin malzemesi (3369): verilince gelişi beklenen malzeme tahtanın üstünde "Malzeme" satırında çubuk olur.
  malzeme?: EmirMalzemeleri | null;
  // 3493 b: emir satırlı Gantt ağacı (yalnız Sipariş gözünde). Verilince plansız emirler de satırdır (tepsi yok); emir adına basınca
  // satır açılır, adımları alt satır olur: emrin satırında özet çubuğu kalır, adımın çubuğu kendi satırındadır.
  // notlar: açık emrin adım satırlarının üstündeki not satırının yazıları (kurallar.ts agacNotlari); boşsa satır çizilmez.
  agac?: { acik: ReadonlySet<string>; ac: (emirId: string) => void; notlar?: (e: KokpitEmri) => readonly string[] } | null;
}
export type OkKipi = 'is' | 'siparis' | 'yok';
// Odaklanan saat görünümün sol kenarından bu kadar içeride durur (px).
export const ODAK_PAYI = 80;
interface Ok extends AdimBagi { yol: string; uc: string }

const SAATLER = [4, 8, 12, 16, 20] as const;
// Saat yazısının sığması için iki çizgi arasında gereken en az genişlik (px; yazı iki hane).
const SAAT_YAZISI = 26;
const yerYaz = (el: HTMLElement | null, x: number, w?: number): void => {
  if (!el) return;
  el.style.setProperty('--x', `${String(Math.round(x * 10) / 10)}px`);
  if (w !== undefined) el.style.setProperty('--w', `${String(Math.max(6, Math.round(w * 10) / 10))}px`);
};
// Tırnaklı öznitelik seçicisinde yalnız tırnak ve ters bölü kaçırılır (jsdom'da CSS.escape yoktur).
const tirnakIci = (s: string): string => s.replace(/["\\]/g, '\\$&');
const FIS = 'fis:';
// Sürükleme bu kadar px kıpırdayınca başlar; altında basış tıktır.
const SURUKLE_ESIGI = 4;
// İmleç bu kadar ms durunca sürüklenen yerin etkisi sorulur.
const ETKI_BEKLE = 150;
// Bu genişlikten (px) dar iş okunur genişlikte çizilir; satır en çok bu kadar şeride açılır.
const KISA_IS = 40, OKUNUR_EN = 64, EN_COK_SERIT = 4;
// Önizlemede yeni bitişi emrin terminini aşan işler; yalnız henüz gecikmemiş emirde (emrin bitişi terminde ya da önce). Emir başına bir kez,
// termine göre sıralı. Zaten geç emrin işi kayınca yeniden "gecikir" denmez.
export function gecikenler(isler: readonly { isId: string; C: number }[], eski: Readonly<Record<string, KokpitIsi>>, emir: ReadonlyMap<string, KokpitEmri>): Etki['geciken'] {
  const ids = new Set<string>(), em = new Map<string, number>();
  for (const y of isler) {
    const x = eski[y.isId], e = x ? emir.get(x.job) : undefined;
    if (!x || !e || e.termin === null || y.C <= e.termin + 1e-6 || (e.bitis !== null && e.bitis > e.termin + 1e-6)) continue;
    ids.add(y.isId); em.set(e.no, e.termin);
  }
  return { isler: ids, emirler: [...em].map(([no, termin]) => ({ no, termin })).sort((a, b) => a.termin - b.termin) };
}
// Bırakılan taşımanın onay cümlesinin başı: hangi iş, hangi tezgâh, hangi saat ve eski yerine göre ne kadar erken ya da geç.
export function onayCumlesi(is: string, tezgah: string, saat: string, fark: number): string {
  return `${is} · ${tezgah}, ${saat} (${Math.abs(fark) < 0.01 ? 'aynı saat' : `${sureYaz(fark)} ${fark < 0 ? 'erken' : 'geç'}`})`;
}
// Sürüklerken ipucu satırına eklenen neden cümlesi: kaç iş itilir ya da çekilir, hangi emir termini kaçırır.
// Termin bugünse yalnız saat, değilse gün ve saat yazılır; ikiden çok geciken emir "+N emir daha gecikir" diye toplanır.
export function etkiCumlesi(e: Pick<Etki, 'kayan' | 'geciken'> | null, zaman: (t: number) => string, simdi: number): string {
  if (!e) return '';
  const kayan = Object.values(e.kayan), it = kayan.filter((d) => d > 0).length, cek = kayan.length - it;
  const parca = [it > 0 ? `aynı tezgâhta ${String(it)} iş arkaya itilir` : '', cek > 0 ? `${String(cek)} iş öne çekilir` : ''].filter(Boolean);
  const gun = (t: number): string => zaman(t).slice(0, 5);
  const saat = (t: number): string => (gun(t) === gun(simdi) ? zaman(t).slice(-5) : zaman(t).slice(6));
  const g = e.geciken.emirler;
  if (g.length > 0) parca.push(g.slice(0, 2).map((x) => `${x.no} termini ${saat(x.termin)}, gecikir`).join('; ') + (g.length > 2 ? `; +${String(g.length - 2)} emir daha gecikir` : ''));
  return parca.length ? ` · ${parca.join(' · ')}` : '';
}
const yazimda = (): boolean => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');

// fis: tepsiden tutulan plansız emir; id o emrin ilk adımıdır (planda yeri yoktur).
interface Tasinan { id: string; tut: number; fis?: string; suruk?: boolean }
// Plansız emrin süresi plana alınmadan bilinmez; bırakma çerçevesi bu genişlikte çizilir.
const FIS_SAATI = 2;
interface Hedef { satir: string; S: number; gecerli: boolean }
const BOS_KUME: ReadonlySet<string> = new Set();
// kayan: itilen ya da çekilen işin kayma süresi; yeni: o işin önizlemedeki yeri (iş oraya akar); geciken: yeni bitişi emrin terminini ilk kez aşan
// işler ve emir numaraları (3531).
interface Etki { anahtar: string; gecerli: boolean; ileti: string | null; kayan: Record<string, number>; yeni: Record<string, { S: number; C: number }>; geciken: { isler: ReadonlySet<string>; emirler: readonly { no: string; termin: number }[] } }

export function Tahta(o: TahtaOzellikleri) {
  const { m, cx, goz, olcek, emirler, uyar, secEmir, secIs, sec, zaman, tasi, planaAl, once, gunAc, uyari, goster, odak, oneri } = o;
  const yerlestirme = o.goz === 'T' ? o.yerlestirme ?? null : null;
  const yanan = o.yanan ?? null, secimiKaldir = o.secimiKaldir, onizle = o.onizle ?? null, okKipi = o.okKipi ?? 'is';
  const sorunBildir = goz === 'T' ? o.sorunBildir ?? null : null;
  const fasonlar = useMemo(() => new Set(m.tezgahlar.filter((t) => t.fason).map((t) => t.id)), [m.tezgahlar]);
  const coklu = o.coklu ?? BOS_KUME, cokluSec = o.cokluSec ?? null, grupKaydir = o.grupKaydir ?? null;
  const px = !uzakMi(olcek) && o.saatEni != null ? o.saatEni : SAAT_ENI[olcek];
  const en = (m.son - m.bas) * px;
  const kap = useRef<HTMLDivElement | null>(null);
  const [tasinan, setTasinan] = useState<Tasinan | null>(null);
  const [hedef, setHedef] = useState<Hedef | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; tut: number; fis?: boolean } | null>(null);
  const imlecteki = useRef<string | null>(null);
  const ic = useRef<HTMLDivElement | null>(null);
  const [oklar, setOklar] = useState<Ok[]>([]);
  const [ustteki, setUstteki] = useState<string | null>(null);
  const [etki, setEtki] = useState<Etki | null>(null);
  // 3531 b: bırakılan iş hemen taşınmaz; hayalet, itilen işler ve neden cümlesi yerinde durur, Uygula yazar, Vazgeç (ya da Esc) bırakır.
  const [onay, setOnay] = useState(false);
  // Fareyle basılan iş: kıpırdayınca sürükleme başlar; sürükleyerek tutulanı bırakmak imleci kaldırmaktır.
  const basilan = useRef<{ id: string; x: number; y: number; tut: number } | null>(null);
  const surukleniyor = useRef(false);
  // Bağlar saatli ölçekte çizilir; onaylı plan gösterilirken (önce / sonra) çizilmez. Varsayılan yalnız odaktaki işin (üstüne gelinen, yoksa
  // seçili) bir önceki ve bir sonraki adımıdır (3365): bütün siparişin okları birden örgü olur.
  const odakIs = tasinan ? null : ustteki ?? secIs;
  const baglar = useMemo((): AdimBagi[] => {
    if (once || uzakMi(olcek) || okKipi === 'yok') return [];
    const x = odakIs ? m.isler[odakIs] : undefined;
    if (okKipi === 'is') {
      const e = x ? m.emirler.find((y) => y.id === x.job) : undefined;
      return e && x ? adimBaglari([e], m.isler).filter((b) => b.kimden === x.id || b.kime === x.id) : [];
    }
    const kume = yanan ?? (x ? new Set([x.job]) : null);
    return kume ? adimBaglari(m.emirler.filter((e) => kume.has(e.id)), m.isler) : [];
  }, [yanan, once, olcek, m, okKipi, odakIs]);
  // Kısa işin çizim genişliği ve şeridi; satırın şerit sayısı. Fason satırı (sınırsız kapasite) şeride açılmaz.
  const yerlesim = useMemo(() => {
    const is = new Map<string, { en: number; serit: number }>(), satir = new Map<string, number>();
    if (uzakMi(olcek)) return { is, satir };
    const gruplar = new Map<string, KokpitIsi[]>();
    for (const x of Object.values(m.isler)) { const k = goz === 'T' ? satirKimligi(x) : x.job; gruplar.set(k, [...(gruplar.get(k) ?? []), x]); }
    for (const [k, l] of gruplar) {
      const yer = (x: KokpitIsi) => once?.[x.id] ?? x;
      const sonlar: number[] = [];
      for (const x of [...l].sort((a, b) => yer(a).S - yer(b).S)) {
        const { S, C } = yer(x), sol = (S - m.bas) * px, gercek = (C - S) * px, en = gercek < KISA_IS ? OKUNUR_EN : gercek;
        let i = goz === 'T' && fasonlar.has(k) ? 0 : sonlar.findIndex((s) => s <= sol + 0.5);
        if (i < 0) { if (sonlar.length < EN_COK_SERIT) { sonlar.push(0); i = sonlar.length - 1; } else i = sonlar.indexOf(Math.min(...sonlar)); }
        sonlar[i] = Math.max(sonlar[i] ?? 0, sol + en);
        is.set(x.id, { en, serit: i });
      }
      satir.set(k, Math.max(1, sonlar.length));
    }
    return { is, satir };
  }, [m, goz, olcek, px, once, fasonlar]);
  // Yatay yer modelden (iş yeni yerine akarken ok hedefte durur), satırın yeri ekrandan okunur.
  useLayoutEffect(() => {
    const kok = ic.current;
    if (!kok || baglar.length === 0) { setOklar((l) => (l.length ? [] : l)); return undefined; }
    const ciz = (): void => {
      const satirlar = new Map([...kok.querySelectorAll<HTMLElement>('[data-satir]')].map((el) => [el.dataset.satir ?? '', el]));
      const kutu = (id: string) => {
        // Ağaçta açık emrin işi adım satırındadır: satır işin kutusundan bulunur.
        const x = m.isler[id], satir = kok.querySelector<HTMLElement>(`[data-is="${tirnakIci(id)}"]`)?.closest<HTMLElement>('[data-satir]') ?? (x ? satirlar.get(goz === 'T' ? satirKimligi(x) : x.job) : undefined);
        if (!x || !satir) return null;
        const sol = satir.querySelector<HTMLElement>('.tc-pyq-alan')?.offsetLeft ?? 0;
        // Düşey yer işin kutusundan okunur (kutu yalnız yatayda akar); kutu yoksa satırın ortası.
        const k = satir.querySelector<HTMLElement>(`[data-is="${id}"]`)?.getBoundingClientRect(), ust = kok.getBoundingClientRect().top;
        return { x1: sol + (x.S - m.bas) * px, x2: sol + (x.S - m.bas) * px + (yerlesim.is.get(id)?.en ?? (x.C - x.S) * px), y: k ? k.top - ust + k.height / 2 : satir.offsetTop + satir.offsetHeight / 2, h: k?.height ?? satir.offsetHeight, satir: satir.offsetHeight };
      };
      // Ok, aradaki satırlarda başka işin üstünden dikey geçmesin diye tahtadaki bütün işlerin yerini bilir.
      const engeller = Object.keys(m.isler).flatMap((id) => { const g = kutu(id); return g ? [g] : []; });
      setOklar(baglar.flatMap((b) => { const a = kutu(b.kimden), c = kutu(b.kime); return a && c ? [{ ...b, yol: okYolu(a, c, b.tur, engeller), uc: okUcu(c) }] : []; }));
    };
    ciz();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const izleyen = new ResizeObserver(ciz);
    izleyen.observe(kok);
    return () => { izleyen.disconnect(); };
  }, [baglar, m, goz, px, yerlesim]);
  const emir = useMemo(() => new Map(m.emirler.map((e) => [e.id, e])), [m]);
  const adaylar = useCallback((x: KokpitIsi): string[] => emir.get(x.job)?.adimlar.find((a) => a.id === x.id)?.adaylar ?? [], [emir]);

  const tut = useCallback((id: string, tutma = 0): void => {
    const x = m.isler[id];
    if (!x || !tasi) return;
    const neden = tasinabilir(x);
    if (neden) { uyari(neden); return; }
    setMenu(null); setTasinan({ id, tut: tutma }); setHedef({ satir: goz === 'T' ? satirKimligi(x) : x.job, S: x.S, gecerli: true });
  }, [m, tasi, goz, uyari]);
  const fisAdaylari = useCallback((emirId: string): string[] => (emir.get(emirId)?.adimlar[0]?.adaylar ?? []).filter((t) => !t.startsWith('@')), [emir]);
  const tutFis = useCallback((emirId: string): void => {
    const e = emir.get(emirId), ilk = e?.adimlar[0];
    if (!e || !ilk || !planaAl) return;
    if (goz !== 'T') { uyari('Planlamak için Tezgâh görünümüne geçin'); return; }
    if (e.adimlar.some((a) => m.isler[a.id])) { uyari('Bu emrin bir adımı planda; öteki adımları planlanınca yerleşir'); return; }
    if (!fisAdaylari(emirId).length) { uyari('Bu emrin ilk adımı tezgâhta yapılmıyor'); return; }
    setMenu(null); setTasinan({ id: ilk.id, tut: 0, fis: emirId }); setHedef(null);
  }, [emir, m, planaAl, goz, uyari, fisAdaylari]);
  // vazgecer: sürükleyerek tutulan iş geçersiz yere bırakılınca tutma biter (yapışarak tutmada iş elde kalır, kişi başka yere tıklar).
  const birak = useCallback((vazgecer = false): void => {
    if (onay) return;
    const birakma = (ileti: string): void => { uyari(ileti); if (vazgecer) { setTasinan(null); setHedef(null); } };
    if (tasinan?.fis !== undefined) {
      if (!hedef) { birakma('Emri bir tezgâh satırına bırakın'); return; }
      if (!hedef.gecerli) { birakma('Bu emrin ilk adımı bu tezgâhta yapılamaz'); return; }
      const emirId = tasinan.fis;
      setTasinan(null); setHedef(null);
      planaAl?.(emirId, hedef.satir, hedef.S);
      return;
    }
    const x = tasinan ? m.isler[tasinan.id] : undefined;
    if (!x || !hedef || !tasi) { setTasinan(null); setHedef(null); return; }
    if (!hedef.gecerli) { birakma('Bu adım bu tezgâhta yapılamaz'); return; }
    const tezgah = goz === 'T' ? hedef.satir : x.m;
    setTasinan(null); setHedef(null);
    // Çoklu seçimin bir işi bırakılınca hepsi aynı süre kayar; tezgâh değişmez (her iş kendi satırında kalır).
    if (grupKaydir && coklu.size > 1 && coklu.has(x.id)) { if (Math.abs(hedef.S - x.S) > 0.01) grupKaydir(hedef.S - x.S); return; }
    if (tezgah === x.m && Math.abs(hedef.S - x.S) <= 0.01) return;
    // Tek iş: önizleme durur, kişi Uygula ya da Vazgeç der (3531 b).
    setTasinan(tasinan); setHedef(hedef); setOnay(true);
  }, [onay, tasinan, hedef, m, tasi, planaAl, goz, uyari, grupKaydir, coklu]);
  const vazgec = useCallback((): void => { surukleniyor.current = false; setOnay(false); setTasinan(null); setHedef(null); }, []);
  const uygula = useCallback((): void => {
    const x = tasinan ? m.isler[tasinan.id] : undefined;
    if (x && hedef && tasi) tasi(x.id, goz === 'T' ? hedef.satir : x.m, hedef.S);
    setOnay(false); setTasinan(null); setHedef(null);
  }, [tasinan, hedef, m, tasi, goz]);

  // Tutulan iş imleci izler: satır imlecin altındaki satırdır, saat imlecin yeri eksi tutulan noktadır (çeyrek saate oturur).
  const izle = (ev: ImlecOlayi<HTMLDivElement>): void => {
    const b = basilan.current;
    if (!tasinan && b) {
      if (Math.hypot(ev.clientX - b.x, ev.clientY - b.y) < SURUKLE_ESIGI) return;
      basilan.current = null; surukleniyor.current = true;
      if (b.id.startsWith(FIS)) tutFis(b.id.slice(FIS.length)); else tut(b.id, b.tut);
      setTasinan((t) => (t ? { ...t, suruk: true } : t));
      return;
    }
    if (!tasinan || onay) return;
    const x = m.isler[tasinan.id];
    const satir = (ev.target as Element).closest<HTMLElement>('[data-satir]');
    const alan = satir?.querySelector<HTMLElement>('.tc-pyq-alan');
    if (tasinan.fis !== undefined) {
      if (!satir || !alan) { setHedef(null); return; }
      const t = satir.dataset.satir ?? '';
      setHedef({ satir: t, S: tasimaSaati(m.bas + (ev.clientX - alan.getBoundingClientRect().left) / px, m.simdi), gecerli: fisAdaylari(tasinan.fis).includes(t) });
      return;
    }
    if (!x || !satir || !alan) return;
    const kimlik = satir.dataset.satir ?? '';
    const S = tasimaSaati(m.bas + (ev.clientX - alan.getBoundingClientRect().left) / px - tasinan.tut, m.simdi);
    const adimSatiri = `${x.job}>${x.id}`;
    const gecerli = goz === 'T' ? adaylar(x).includes(kimlik) : kimlik === x.job || kimlik === adimSatiri;
    setHedef({ satir: goz === 'T' || kimlik === adimSatiri ? kimlik : x.job, S, gecerli });
  };

  const birakSon = useRef(birak);
  useEffect(() => { birakSon.current = birak; });
  useEffect(() => {
    const kaldir = (): void => {
      basilan.current = null;
      if (!surukleniyor.current) return;
      surukleniyor.current = false;
      birakSon.current(true);
    };
    document.addEventListener('pointerup', kaldir);
    return () => { document.removeEventListener('pointerup', kaldir); };
  }, []);

  // Sürüklenen işin etkisi: imleç durunca sunucuya sorulur; cevap geldiğinde yer değiştiyse atılır.
  const tasinanId = tasinan && tasinan.fis === undefined ? tasinan.id : null;
  const etkiAnahtari = tasinanId && hedef?.gecerli && onizle ? `${tasinanId}|${hedef.satir}|${String(hedef.S)}` : null;
  const etkiSon = useRef<string | null>(null);
  useEffect(() => {
    etkiSon.current = etkiAnahtari;
    if (!etkiAnahtari || !onizle || !tasinanId || !hedef) { setEtki(null); return undefined; }
    const x = m.isler[tasinanId];
    if (!x) return undefined;
    const tezgah = goz === 'T' ? hedef.satir : x.m, S = hedef.S, anahtar = etkiAnahtari;
    const t = setTimeout(() => {
      void onizle(tasinanId, tezgah, S).then((oz) => {
        if (etkiSon.current !== anahtar || !oz) return;
        const kayan: Record<string, number> = {}, yeni: Record<string, { S: number; C: number }> = {};
        for (const y of oz.isler) if (y.tur !== 'tasinan' && y.tezgah === y.eskiTezgah && Math.abs(y.S - y.eskiS) > 0.01) { kayan[y.isId] = y.S - y.eskiS; yeni[y.isId] = { S: y.S, C: y.C }; }
        setEtki({ anahtar, gecerli: oz.gecerli, ileti: oz.ileti, kayan, yeni, geciken: gecikenler(oz.isler, m.isler, emir) });
      });
    }, ETKI_BEKLE);
    return () => { clearTimeout(t); };
  }, [etkiAnahtari]);
  const etkiNe = etki && etki.anahtar === etkiAnahtari ? etki : null;

  useEffect(() => {
    const tus = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape' && (tasinan || menu)) { ev.stopPropagation(); surukleniyor.current = false; setOnay(false); setTasinan(null); setHedef(null); setMenu(null); return; }
      if (onay) return;
      if (yazimda() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key !== ' ' || uzakMi(olcek)) return;
      if (tasinan) { ev.preventDefault(); birak(); return; }
      // Odak başka bir düğmedeyken Space o düğmenindir; imleç bir işin üstündeyse iş tutulur.
      const odakDugme = /^(BUTTON|A|SUMMARY)$/.test(document.activeElement?.tagName ?? '') && !document.activeElement?.closest('.tc-pyq-is, .tc-pyq-fis');
      const id = imlecteki.current ?? (odakDugme ? null : secIs);
      if (id?.startsWith(FIS)) { ev.preventDefault(); tutFis(id.slice(FIS.length)); return; }
      if (id && m.isler[id]) { ev.preventDefault(); tut(id); return; }
      // Seçili plansız emir de Space ile tutulur.
      if (!id && !odakDugme && planaAl && secEmir && emir.get(secEmir)?.durum === 'plansiz') { ev.preventDefault(); tutFis(secEmir); }
    };
    document.addEventListener('keydown', tus, true);
    return () => { document.removeEventListener('keydown', tus, true); };
  }, [tasinan, menu, onay, tut, tutFis, birak, secIs, secEmir, emir, planaAl, m, olcek]);

  // Açılışta şimdi görünür; istenen iş görünüme gelir.
  useEffect(() => {
    const k = kap.current; if (!k || typeof k.scrollTo !== 'function') return;
    k.scrollTo({ left: Math.max(0, ((odak ?? m.simdi) - m.bas) * px - ODAK_PAYI) });
    // Ölçek değişince şimdiye (ya da istenen güne) dönülür; plan yenilenince kaydırma korunur.
  }, [px, odak]);
  useEffect(() => {
    const el = goster ? kap.current?.querySelector<HTMLElement>(`[data-is="${CSS.escape(goster)}"]`) : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [goster, goz, olcek]);
  const oneriAnahtari = oneri ? `${oneri.isId}|${oneri.tezgah}|${String(oneri.baslangic)}` : null;
  useEffect(() => {
    const el = oneriAnahtari ? kap.current?.querySelector<HTMLElement>('[data-oneri]') : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [oneriAnahtari, goz, olcek]);

  const bosYerAnahtari = yerlestirme ? JSON.stringify(yerlestirme.yerler) : null;
  useEffect(() => {
    const el = bosYerAnahtari ? kap.current?.querySelector<HTMLElement>('[data-bos-yer][data-ilk]') : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [bosYerAnahtari, olcek]);

  // Tezgâhın kapalı saatleri (açık pencerelerin tümleyeni) taralı çizilir; penceresi bilinmeyen tezgâh ve fason satırı çizilmez.
  const kapali = useMemo(() => {
    const k = new Map<string, [number, number][]>();
    if (goz !== 'T' || uzakMi(olcek)) return k;
    for (const t of m.tezgahlar) {
      const acik = m.acik[t.id];
      if (t.fason || !acik || acik.length === 0) continue;
      const l: [number, number][] = []; let son = m.bas;
      for (const [a, b] of acik) { if (b <= m.bas) continue; if (a >= m.son) break; if (a > son + 0.01) l.push([son, Math.min(a, m.son)]); son = Math.max(son, b); }
      if (son < m.son - 0.01) l.push([son, m.son]);
      k.set(t.id, l);
    }
    return k;
  }, [m, goz, olcek]);
  // Tezgâh adının altındaki çubuk: önümüzdeki yedi günün yükü (plan saati / açık saat).
  const yuk = useMemo(() => {
    const k = new Map<string, { oran: number; sinif: string | undefined; yazi: string }>();
    if (goz !== 'T' || uzakMi(olcek)) return k;
    const isler = Object.values(m.isler);
    for (const t of m.tezgahlar) {
      if (t.fason) continue;
      const y = aralikYuku(cx, isler, t.id, m.bas, m.bas + 7 * 24), yuzde = yukYuzdesi(y);
      if (yuzde !== null) k.set(t.id, { oran: Math.min(1, yuzde / 100), sinif: yukSinifi(y), yazi: ` · 7 günde %${String(yuzde)} dolu` });
    }
    return k;
  }, [m, cx, goz, olcek]);
  const gunSayisi = Math.round((m.son - m.bas) / 24);
  // Saat çizgileri yalnız yazısı sığan ölçekte: Gün'de dört saatte bir, 3 gün'de sekiz saatte bir.
  const saatAdimi = uzakMi(olcek) ? 0 : px * 4 >= SAAT_YAZISI ? 4 : px * 8 >= SAAT_YAZISI ? 8 : 0;
  const gunler = Array.from({ length: gunSayisi }, (_, g) => g);
  const eksen = (
    <div className="tc-pyq-satir tc-pyq-eksen" data-saatli={saatAdimi > 0 ? '' : undefined}>
      <div className="tc-pyq-bas">{goz === 'T' || uzakMi(olcek) ? 'Tezgâh' : 'Emir'}</div>
      <div className="tc-pyq-alan">
        {gunler.filter((g) => olcek !== 'Y' || g % 7 === 0).filter((g) => olcek !== 'A' || g % 7 === 0).map((g) => (
          <button
            type="button" key={g} className="tc-pyq-gun" ref={(el) => { yerYaz(el, g * 24 * px, (uzakMi(olcek) ? 7 : 1) * 24 * px); }}
            title="Bu güne yakınlaş" onDoubleClick={() => { gunAc(g); }} onClick={() => { if (uzakMi(olcek)) gunAc(g); }}
          >{zaman(m.bas + g * 24).slice(0, olcek === 'G' || olcek === '3' ? 9 : 5)}</button>
        ))}
        {saatAdimi > 0 && gunler.flatMap((g) => SAATLER.filter((h) => h % saatAdimi === 0).map((h) => (
          <span className="tc-pyq-saat" key={`${String(g)}.${String(h)}`} ref={(el) => { yerYaz(el, (g * 24 + h) * px); }}>{String(h).padStart(2, '0')}</span>
        )))}
        <span className="tc-pyq-simdi-et" ref={(el) => { yerYaz(el, (m.simdi - m.bas) * px); }}>Şimdi {zaman(m.simdi).slice(-5)}</span>
      </div>
    </div>
  );

  if (uzakMi(olcek)) {
    const adim = olcek === 'Y' ? 7 : 1, isler = Object.values(m.isler);
    const hucreler = gunler.filter((g) => g % adim === 0);
    return (
      <div className="tc-pyq-tahta" data-olcek={olcek} ref={kap}>
        <div className="tc-pyq-ic" ref={(el) => { el?.style.setProperty('--en', `${String(en)}px`); }}>
          {eksen}
          {m.tezgahlar.map((t) => (
            <div className="tc-pyq-satir" key={t.id} data-satir={t.id}>
              <div className="tc-pyq-bas"><b>{t.kod}</b><small>{t.ad}</small></div>
              <div className="tc-pyq-alan">
                {t.fason ? <span className="tc-pyq-not">fason · dış atölye, kapasite izlenmez</span> : hucreler.map((g) => {
                  const y = aralikYuku(cx, isler, t.id, m.bas + g * 24, m.bas + (g + adim) * 24), yuzde = yukYuzdesi(y);
                  const ad = `${t.kod} · ${zaman(m.bas + g * 24).slice(0, 9)}${adim > 1 ? ' haftası' : ''} · ${yuzde === null ? 'kapalı' : `%${String(yuzde)} dolu (${String(Math.round(y.plan))} / ${String(Math.round(y.acik))} sa)`}`;
                  return (
                    <button
                      type="button" key={g} className="tc-pyq-hucre" data-yuk={yukSinifi(y)} disabled={yuzde === null} title={ad} aria-label={ad}
                      ref={(el) => { yerYaz(el, g * 24 * px + 1, adim * 24 * px - 2); }} onClick={() => { gunAc(g); }}
                    ><i ref={(el) => { el?.style.setProperty('--oran', String(Math.min(1, yuzde === null ? 0 : yuzde / 100))); }} /></button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const tezgahKodu = new Map(m.tezgahlar.map((t) => [t.id, t.kod]));
  type Satir = { kimlik: string; bas: string; alt: string; isler: KokpitIsi[]; durum?: string; tam?: string; termin?: number | null; durus?: string; agacEmir?: string; acik?: boolean; adim?: true; ozet?: [number, number]; notlar?: readonly string[] };
  const agac = goz !== 'T' ? o.agac ?? null : null;
  const satirlar0: Satir[] = goz === 'T'
    ? m.tezgahlar.map((t) => ({ kimlik: t.id, bas: t.kod, alt: t.ad, ...(suAndakiDurus(m, t.id) ? { durus: durusYazisi(suAndakiDurus(m, t.id)!, zaman) } : {}), isler: Object.values(m.isler).filter((x) => satirKimligi(x) === t.id) }))
    : emirler.filter((e) => agac !== null || e.durum !== 'plansiz').map((e) => ({ kimlik: e.id, bas: `${emirKuyrugu(e.no)} · ${e.urun}`, alt: `${String(e.adet)} adet · ${durumYazisi(e)}`, tam: e.no, termin: e.termin, isler: e.adimlar.flatMap((a) => m.isler[a.id] ?? []), durum: e.durum }));
  // Ağaçta açık emrin çubukları adım satırlarına iner; emrin satırında ilk başlangıçtan son bitişe özet çubuğu kalır.
  const satirlar: Satir[] = agac === null ? satirlar0 : satirlar0.flatMap((r): Satir[] => {
    const e = emir.get(r.kimlik);
    if (!e) return [r];
    const acik = agac.acik.has(e.id);
    const ana: Satir = { ...r, agacEmir: e.id, acik };
    if (!acik) return [ana];
    const yer = r.isler.map((x) => once?.[x.id] ?? x);
    const ozet: [number, number] | undefined = yer.length > 0 ? [Math.min(...yer.map((x) => x.S)), Math.max(...yer.map((x) => x.C))] : undefined;
    const notlar = agac.notlar?.(e) ?? [];
    return [{ ...ana, isler: [], ...(ozet ? { ozet } : {}) }, ...(notlar.length ? [{ kimlik: `${e.id}>not`, bas: '', alt: '', isler: [], notlar }] : []), ...e.adimlar.map((a, i): Satir => {
      const x = m.isler[a.id];
      return { kimlik: `${e.id}>${a.id}`, bas: agacAdimBasligi(i, a), alt: x ? `${x.fason ? 'Fason' : tezgahKodu.get(x.m) ?? x.m} · ${zaman(x.S).slice(6)}` : 'planda yeri yok', isler: x ? [x] : [], adim: true, ...(r.durum ? { durum: r.durum } : {}) };
    })];
  });
  const plansiz = agac !== null ? [] : emirler.filter((e) => e.durum === 'plansiz');
  const cubuklar = once ? [] : malzemeCubuklari(o.malzeme, { simdi: m.simdi, bas: m.bas, emirler }, zaman);
  const tasinanIs = tasinan ? m.isler[tasinan.id] : undefined;
  const oneriIsi = oneri ? m.isler[oneri.isId] : undefined;
  const adaySatirlari = goz !== 'T' ? null : tasinan?.fis !== undefined ? new Set(fisAdaylari(tasinan.fis)) : tasinanIs ? new Set(adaylar(tasinanIs)) : yerlestirme ? new Set(yerlestirme.tezgahlar) : null;
  const secili = secEmir ? emir.get(secEmir) : undefined;

  const isDugmesi = (x: KokpitIsi, tek = false) => {
    const e = emir.get(x.job), canli = once?.[x.id];
    const S = canli ? canli.S : x.S, C = canli ? canli.C : x.C;
    const kayma = canli ? x.S - canli.S : 0;
    const neden = tasinabilir(x);
    const cizim = yerlesim.is.get(x.id), gercek = (C - S) * px, kisa = cizim !== undefined && cizim.en > gercek + 0.5;
    // Sürüklenen işin etkisiyle itilen ya da çekilen iş (3365): çerçevesi kesik, kayma süresi yazılır.
    const itilen = tasinan?.id !== x.id ? etkiNe?.kayan[x.id] : undefined;
    // 3531: itilen iş önizlemedeki yerine akar (geçiş CSS'te); bırakınca ya da vazgeçince plandaki yerine döner.
    const cizS = itilen !== undefined ? etkiNe?.yeni[x.id]?.S ?? S : S;
    const gecikir = etkiNe?.geciken.isler.has(x.id) === true;
    const ad = `${e?.no ?? x.job} · ${x.ad} · ${zaman(x.S)} – ${zaman(x.C).slice(-5)}${e ? ` · ${durumYazisi(e)}` : ''}${x.basladi && !x.bitti && tasi ? ' · sürüyor, taşınırsa durdurulur' : ''}${x.durdurmaBekliyor ? ` · ${DURDURMA_BEKLIYOR}` : ''}`;
    return (
      <button
        type="button" key={x.id} className="tc-pyq-is" data-is={x.id} data-d={e?.durum ?? 'iyi'} title={ad} aria-label={ad}
        aria-pressed={secIs === x.id} data-suruyor={x.basladi ? '' : undefined} data-emir-secili={secEmir === x.job ? '' : undefined} data-yanan={yanan?.has(x.job) ? '' : undefined} data-sonuk={uyar(x.job) && (!yanan || yanan.has(x.job)) ? undefined : ''}
        data-sabit={neden ? '' : undefined} data-durdurma-bekliyor={x.durdurmaBekliyor ? '' : undefined} data-tasinan={tasinan?.id === x.id ? '' : undefined} data-kaydi={(canli && Math.abs(kayma) > 0.25) || itilen !== undefined ? '' : undefined}
        data-kisa={kisa ? '' : undefined} data-gecikir={gecikir ? '' : undefined}
        ref={(el) => {
          yerYaz(el, (cizS - m.bas) * px, cizim?.en ?? gercek);
          el?.style.setProperty('--serit', String(tek ? 0 : cizim?.serit ?? 0));
          if (kisa) el?.style.setProperty('--gercek', `${String(Math.max(2, Math.round(gercek)))}px`);
        }}
        onPointerDown={(ev) => {
          if (ev.button > 0 || ev.pointerType === 'touch' || !tasi || tasinan) return;
          basilan.current = { id: x.id, x: ev.clientX, y: ev.clientY, tut: (ev.clientX - ev.currentTarget.getBoundingClientRect().left) / px };
        }}
        data-coklu={coklu.has(x.id) ? '' : undefined}
        onClick={(ev) => {
          if (tasinan) return;
          if (cokluSec && (ev.ctrlKey || ev.metaKey || ev.shiftKey)) { cokluSec(x.id); return; }
          sec(x.job, x.id);
        }}
        onDoubleClick={(ev) => { ev.preventDefault(); tut(x.id, (ev.clientX - ev.currentTarget.getBoundingClientRect().left) / px); }}
        onContextMenu={(ev: FareOlayi<HTMLButtonElement>) => {
          if (!tasi || tasinan) return;
          ev.preventDefault();
          const k = kap.current?.getBoundingClientRect();
          setMenu({ id: x.id, x: ev.clientX - (k?.left ?? 0) + (kap.current?.scrollLeft ?? 0), y: ev.clientY - (k?.top ?? 0) + (kap.current?.scrollTop ?? 0), tut: (ev.clientX - ev.currentTarget.getBoundingClientRect().left) / px });
        }}
        onPointerEnter={() => { imlecteki.current = x.id; if (okKipi !== 'yok') setUstteki(x.id); }}
        onPointerLeave={() => { if (imlecteki.current === x.id) imlecteki.current = null; setUstteki((u) => (u === x.id ? null : u)); }}
      >
        {x.kilitli && <Simge ad="lock" boyut="k" />}
        <b>{goz === 'T' ? emirKuyrugu(e?.no ?? x.job) : tezgahKodu.get(x.m) ?? x.m}</b>
        <span>{itilen !== undefined ? `${gecikir ? 'gecikir · ' : ''}${itilen > 0 ? '+' : '−'}${sureYaz(itilen)}` : canli && Math.abs(kayma) > 0.25 ? `${kayma > 0 ? '+' : '−'}${sureYaz(kayma)}` : kisa ? sureYaz(C - S) : goz === 'T' ? e?.urun ?? x.ad : x.ad}</span>
        {x.basladi && <i className="tc-pyq-ilerleme" ref={(el) => { el?.style.setProperty('--oran', String(Math.min(1, Math.max(0, (m.simdi - S) / Math.max(0.01, C - S))))); }} />}
      </button>
    );
  };

  return (
    <div
      className="tc-pyq-tahta" data-olcek={olcek} data-tasima={tasinan ? '' : undefined} ref={kap}
      onPointerMove={izle} onClickCapture={(ev) => { if (tasinan && !onay) { ev.preventDefault(); ev.stopPropagation(); birak(); } else if (menu && !(ev.target as Element).closest('.tc-pyq-menu')) setMenu(null); }}
    >
      <div className="tc-pyq-ic" ref={(el) => { ic.current = el; el?.style.setProperty('--en', `${String(en)}px`); el?.style.setProperty('--gun', `${String(24 * px)}px`); }}>
        {eksen}
        {plansiz.length > 0 && (
          <div className="tc-pyq-satir tc-pyq-tepsi">
            <div className="tc-pyq-bas"><b>Yerleştirilecek</b><small>{plansiz.length} emir{planaAl && goz === 'T' ? ' · sürükleyip tezgâha bırakın' : ''}</small></div>
            <div className="tc-pyq-alan tc-pyq-fisler"><div>
              {plansiz.map((e) => (
                <button
                  type="button" key={e.id} className="tc-pyq-fis" data-fis={e.id} aria-pressed={secEmir === e.id} data-tasinan={tasinan?.fis === e.id ? '' : undefined}
                  onClick={() => { if (!tasinan) sec(e.id, null); }} onDoubleClick={(ev) => { ev.preventDefault(); tutFis(e.id); }}
                  onPointerDown={(ev) => { if (ev.button > 0 || ev.pointerType === 'touch' || !planaAl || tasinan || goz !== 'T') return; basilan.current = { id: FIS + e.id, x: ev.clientX, y: ev.clientY, tut: 0 }; }}
                  onContextMenu={(ev: FareOlayi<HTMLButtonElement>) => {
                    if (!planaAl || tasinan || goz !== 'T') return;
                    ev.preventDefault();
                    const k = kap.current?.getBoundingClientRect();
                    setMenu({ id: e.id, fis: true, tut: 0, x: ev.clientX - (k?.left ?? 0) + (kap.current?.scrollLeft ?? 0), y: ev.clientY - (k?.top ?? 0) + (kap.current?.scrollTop ?? 0) });
                  }}
                  onPointerEnter={() => { imlecteki.current = FIS + e.id; }} onPointerLeave={() => { if (imlecteki.current === FIS + e.id) imlecteki.current = null; }}
                >
                  <b>{emirKuyrugu(e.no)}</b><span>{e.urun}</span><small>{e.termin === null ? 'termin yok' : `termin ${zaman(e.termin).slice(6)}`}</small>
                </button>
              ))}
            </div></div>
          </div>
        )}
        <MalzemeSeridi cubuklar={cubuklar} bas={m.bas} px={px} zaman={zaman} secEmir={secEmir} sec={(e) => { if (!tasinan) sec(e, null); }} yanan={yanan} uyar={uyar} />
        {satirlar.map((r) => (
          <div
            className="tc-pyq-satir" key={r.kimlik} data-satir={r.kimlik} data-d={r.durum} data-seritli={!r.adim && !r.ozet && (yerlesim.satir.get(r.kimlik) ?? 1) > 1 ? '' : undefined}
            data-agac-adim={r.adim ? '' : undefined} data-agac-not={r.notlar ? '' : undefined}
            ref={(el) => { el?.style.setProperty('--seritler', String(r.adim || r.ozet ? 1 : yerlesim.satir.get(r.kimlik) ?? 1)); }}
            data-aday={adaySatirlari ? (adaySatirlari.has(r.kimlik) ? 'evet' : 'hayir') : undefined}
          >
            <div className="tc-pyq-bas" data-durus={r.durus ? '' : undefined} title={r.notlar ? undefined : `${r.tam ?? r.bas} · ${r.durus ?? r.alt}${yuk.get(r.kimlik)?.yazi ?? ''}`}>
              {r.agacEmir !== undefined && agac
                ? <button type="button" className="tc-pyq-agac-ac" data-agac={r.agacEmir} aria-expanded={r.acik} title={`${r.tam ?? r.bas} · ${r.acik ? 'adımları gizle' : 'adımları göster'}`} onClick={() => { agac.ac(r.agacEmir!); }}><Simge ad="chev-right" boyut="k" /><b>{r.bas}</b><small>{r.alt}</small></button>
                : sorunBildir && !fasonlar.has(r.kimlik)
                ? <button type="button" className="tc-pyq-sorun" data-sorun-bildir={r.kimlik} aria-label={`${r.bas} için sorun bildir`} title={`${r.bas} · sorun bildir: arıza ya da bakım`} onClick={() => { sorunBildir(r.kimlik); }}><b>{r.bas}<Simge ad="wrench" boyut="k" /></b><small>{r.durus ?? r.alt}</small></button>
                : <><b>{r.bas}</b><small>{r.durus ?? r.alt}</small></>}
              {goz === 'T' && m.mesai?.[r.kimlik]?.length ? <i className="tc-pyq-mesai-isaret" title={ekMesaiYazisi(m.mesai[r.kimlik]!, zaman)}>+ ek mesai</i> : null}
              {yuk.has(r.kimlik) && <i className="tc-pyq-yukcubuk" data-yuk={yuk.get(r.kimlik)!.sinif} ref={(el) => { el?.style.setProperty('--oran', String(yuk.get(r.kimlik)!.oran)); }} />}
            </div>
            <div className="tc-pyq-alan" onClick={(ev) => { if (!(ev.target as Element).closest('button') && !tasinan && yanan) secimiKaldir?.(); }}>
              {(kapali.get(r.kimlik) ?? []).map(([a, b]) => <span className="tc-pyq-kapali" key={a} ref={(el) => { yerYaz(el, (a - m.bas) * px, (b - a) * px); }} />)}
              {goz === 'T' && (m.durus[r.kimlik] ?? []).map((d) => <span className="tc-pyq-durus" key={`${String(d.a)}-${String(d.b)}`} data-plan={d.ariza ? undefined : d.neden} title={d.ariza ? durusYazisi(d, zaman) : planliDurusYazisi(d, zaman)} ref={(el) => { yerYaz(el, (Math.max(d.a, m.bas) - m.bas) * px, (Math.min(d.b, m.son) - Math.max(d.a, m.bas)) * px); }} />)}
              {r.termin !== undefined && r.termin !== null && <span className="tc-pyq-satir-termin" data-d={r.durum} title={`Termin ${zaman(r.termin)}`} ref={(el) => { yerYaz(el, (r.termin! - m.bas) * px); }} />}
              {r.ozet && <span className="tc-pyq-ozet-cubuk" data-ozet={r.agacEmir} title={`${r.tam ?? r.bas} · adımlar ${zaman(r.ozet[0])} – ${zaman(r.ozet[1])}`} ref={(el) => { yerYaz(el, (r.ozet![0] - m.bas) * px, (r.ozet![1] - r.ozet![0]) * px); }} />}
              {r.agacEmir !== undefined && !r.ozet && r.isler.length === 0 && <span className="tc-pyq-agac-bos" data-agac-bos>planda yeri yok</span>}
              {r.notlar?.map((y) => <p className="tc-pyq-not" key={y}>{y}</p>)}
              {r.isler.map((x) => isDugmesi(x, r.adim))}
              {oneriIsi && oneri && !tasinanIs && (goz === 'T' ? oneri.tezgah : oneriIsi.job) === r.kimlik && (
                <span className="tc-pyq-hayalet" data-oneri="" ref={(el) => { yerYaz(el, (oneri.baslangic - m.bas) * px, (oneriIsi.C - oneriIsi.S) * px); }}>
                  {goz === 'T' ? '' : `${m.tezgahlar.find((t) => t.id === oneri.tezgah)?.kod ?? ''} · `}{zaman(oneri.baslangic).slice(6)} · −{sureYaz(oneriIsi.S - oneri.baslangic)}
                </span>
              )}
              {oneri?.planaAl !== undefined && !tasinan && goz === 'T' && oneri.tezgah === r.kimlik && (
                <span className="tc-pyq-hayalet" data-oneri="" ref={(el) => { yerYaz(el, (oneri.baslangic - m.bas) * px, FIS_SAATI * px); }}>{zaman(oneri.baslangic).slice(6)} · planla</span>
              )}
              {!tasinan && yerlestirme?.yerler.filter((b) => b.tezgah === r.kimlik).map((b) => {
                const ad = `${r.bas} · ${zaman(b.S).slice(6)} → ${zaman(b.C).slice(-5)} · ${b.enErken ? 'en erken biten yer' : 'boş yer'} · ${yerlestirme.fiil === 'tasi' ? 'taşı' : 'yerleştir'}`;
                return (
                  <button
                    type="button" key={`bos-${b.adimId}`} className="tc-pyq-hayalet tc-pyq-bosyer" data-bos-yer={b.tezgah} data-ilk={b.enErken ? '' : undefined} title={ad} aria-label={ad}
                    ref={(el) => { yerYaz(el, (b.S - m.bas) * px, (b.C - b.S) * px); }} onClick={() => { yerlestirme.yerlestir(b.tezgah); }}
                  >{b.enErken ? 'En erken' : yerlestirme.fiil === 'tasi' ? 'Taşı' : 'Buraya'} · {zaman(b.S).slice(-5)}</button>
                );
              })}
              {tasinan?.fis !== undefined && hedef?.satir === r.kimlik && (
                <span className="tc-pyq-hayalet" data-gecersiz={hedef.gecerli ? undefined : ''} ref={(el) => { yerYaz(el, (hedef.S - m.bas) * px, FIS_SAATI * px); }}>
                  {hedef.gecerli ? `${zaman(hedef.S).slice(6)} · planla` : 'buraya olmaz'}
                </span>
              )}
              {tasinanIs && hedef?.satir === r.kimlik && (
                <span className="tc-pyq-hayalet" data-gecersiz={hedef.gecerli && etkiNe?.gecerli !== false ? undefined : ''} title={etkiNe?.gecerli === false ? etkiNe.ileti ?? undefined : undefined} ref={(el) => { yerYaz(el, (hedef.S - m.bas) * px, Math.max((tasinanIs.C - tasinanIs.S) * px, OKUNUR_EN)); }}>
                  <span>{!hedef.gecerli || etkiNe?.gecerli === false ? 'buraya olmaz' : `${zaman(hedef.S).slice(6)} · ${hedef.S === tasinanIs.S ? 'yerinde' : `${hedef.S > tasinanIs.S ? '+' : '−'}${sureYaz(hedef.S - tasinanIs.S)}`}${etkiNe && Object.keys(etkiNe.kayan).length > 0 ? ` · ${String(Object.keys(etkiNe.kayan).length)} iş kayar` : ''}`}</span>
                </span>
              )}
            </div>
          </div>
        ))}
        {oklar.length > 0 && (
          <svg className="tc-pyq-oklar" aria-hidden="true">
            {oklar.map((k) => (
              <g key={`${k.kimden}>${k.kime}`} data-ok={`${k.kimden}>${k.kime}`} data-tur={k.tur} data-ters={k.ters ? '' : undefined}><path d={k.yol} /><path className="tc-pyq-ok-ucu" d={k.uc} /></g>
            ))}
          </svg>
        )}
        <div className="tc-pyq-simdi" ref={(el) => { yerYaz(el, (m.simdi - m.bas) * px); }} />
        {secili && secili.termin !== null && goz === 'T' && (
          <div className="tc-pyq-termin" ref={(el) => { yerYaz(el, (secili.termin! - m.bas) * px); }}><span>Termin {secili.no} · {zaman(secili.termin).slice(6)}</span></div>
        )}
        {menu && (
          <div className="tc-pyq-menu" role="menu" aria-label={emir.get(menu.fis ? menu.id : m.isler[menu.id]?.job ?? '')?.no ?? 'İş'} ref={(el) => { el?.style.setProperty('--x', `${String(menu.x)}px`); el?.style.setProperty('--y', `${String(menu.y)}px`); el?.querySelector('button')?.focus(); }}>
            <button type="button" role="menuitem" onClick={() => { const x = m.isler[menu.id]; setMenu(null); if (menu.fis) sec(menu.id, null); else if (x) sec(x.job, x.id); }}><Simge ad="list" boyut="k" /><span>Ayrıntı</span></button>
          </div>
        )}
      </div>
      {onay && tasinanIs && hedef && (
        <div className="tc-pyq-ipucu tc-pyq-tasima-onayi" role="group" aria-label="Taşımayı onayla">
          <span role="status">{`${onayCumlesi(
            emirKuyrugu(emir.get(tasinanIs.job)?.no ?? tasinanIs.job),
            goz !== 'T' || hedef.satir === satirKimligi(tasinanIs) ? (tasinanIs.fason ? 'Fason' : tezgahKodu.get(tasinanIs.m) ?? tasinanIs.m) : tezgahKodu.get(hedef.satir) ?? hedef.satir,
            zaman(hedef.S).slice(6), hedef.S - tasinanIs.S,
          )}${etkiNe?.gecerli !== false ? etkiCumlesi(etkiNe, zaman, m.simdi) : ''}`}</span>
          <Dugme onClick={vazgec}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={etkiNe?.gecerli === false} onClick={uygula} autoFocus>Uygula</Dugme>
        </div>
      )}
      {tasinan && !onay && <p className="tc-pyq-ipucu" role="status">{tasinan.suruk ? 'Bırakın: iş taşınır' : 'Bırakmak için tıklayın ya da Space'}{grupKaydir && coklu.size > 1 && coklu.has(tasinan.id) ? ` · seçili ${String(coklu.size)} iş aynı süre kayar` : ''}{etkiNe?.gecerli === false && etkiNe.ileti ? ` · ${etkiNe.ileti}` : ''}{etkiNe?.gecerli !== false ? etkiCumlesi(etkiNe, zaman, m.simdi) : ''} · Esc vazgeçer</p>}
      {once && <p className="tc-pyq-ipucu" role="status">Onaylı plan gösteriliyor · işlerin üzerinde sizin değişikliğinizle ne kadar kaydığı yazar</p>}
    </div>
  );
}
