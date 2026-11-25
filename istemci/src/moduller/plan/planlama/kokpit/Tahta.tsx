import { createPortal } from 'react-dom';
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as FareOlayi, type PointerEvent as ImlecOlayi, type ReactNode, type KeyboardEvent as TusOlayi } from 'react';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { hizaCizgileri, hizaNoktalari, hizalaYakala, type HizaCizgisi, type Yakalanan } from './hiza.ts';
import { bolunemezNedeni } from './ElleBol.tsx';
import { AdimPanosu } from './AdimPanosu.tsx';
import { tahminCumlesi, tasimaTahmini, type AdimSayimi } from './pano.ts';
import { emirKuyrugu, emirNoParcalari } from '../ortak/emir-no.ts';
import type { Derleme } from '../motor/kurallar.ts';
import type { IsTasiOnizlemesi } from '../motor/atolye/gonder.ts';
import {
  SAAT_ENI, YAKIN_EN_AZ, adimBaglari, adimKimligi, adimPaylari, darPanoYani, agacAdimBasligi, aralikYuku, durumYazisi, DURDURMA_BEKLIYOR, durusYazisi, ekMesaiYazisi, okUcu, okYolu, payIlerlemeYazisi, payNedeni, payYazisi, payYonleri, planliDurusYazisi, satirKimligi, suAndakiDurus, sureYaz, tasimaSaati, tasinabilir, uzakMi, yukSinifi, yukYuzdesi,
  type AdimBagi, type KokpitEmri, type KokpitIsi, type KokpitModeli, type KokpitOlcegi, type TurAdayi,
} from './kurallar.ts';
import {
  bitenAdim, emirAraligi, etiketYeri, gorunenSatirSayisi, kademe, kumele, kumeYazisi, okKumesi, okunurGenislik, siparisCubukYazisi, siparisOzeti, ufukCizgisi, ufukYazisi,
  type EtiketYeri, type Kademe, type SatirBoyu, type SiparisGrubu, type SiparisOzeti,
  HUCRE_ROZET_EN, hucreAdi, hucreKipi, tezgahGunleri,
} from './yogunluk.ts';
import { BASLIK_ADI, GELEN_SIMGESI, type Degisiklik, type Gelenler } from './degisiklikler.ts';
import { MalzemeSeridi, malzemeCubuklari } from './MalzemeCubugu.tsx';
import type { EmirMalzemeleri } from './malzeme.ts';
import type { YerlestirmeHedefi } from './Yerlestirme.tsx';
import type { PencereDeposu } from './pencereDeposu.ts';
import { ADIM_OLCULEN, Ayrac, Bos, FarkRozeti, Halka, olcuAdaylari, sutunlariOlc, type TabloDurumu } from './Tablo.tsx';
import {
  ADIM_DURUMU_ADI, SUTUN_ADI, SU_AN_ADI, TEZGAH_SUTUNLARI, adimDurumu, bolmeEni, farkOlustur, ilerleme, olcumBirlestir, olcuSablonu, sablon, suAn, sutunToplamEni, tarihSaat, tezgahToplamEni,
  type AdimDurumu, type SutunKimligi, type SutunOlcumu,
} from './tablo.ts';

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
  // Planda böl (3661): işin menüsünde; yazamayan kişide ve turda null.
  bol?: ((isId: string) => void) | null;
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
  // 3532: gelen değişiklikler. Değişiklik gelen işin çubuğunun köşesinde türünün işareti (düğme) durur; basınca tek cümlelik balon açılır ve
  // gelenBas o işin değişikliklerinin emirlerini yakar. Emre bağlanamayan saha olayı yalnız tezgâh satırının başındadır.
  gelen?: Gelenler | null;
  gelenBas?: ((isId: string) => void) | null;
  // "Planı güncelle"den hemen önceki iş yerleri (3532, Risk R2): verilince iş yeni yerinde çizilir, eski yeri kesik hayalettir, çubukta kayma yazar.
  eskiYer?: Readonly<Record<string, CanliYer>> | null;
  // 3533: sol bölme sütunlu tablodur (Emirler gözünde agac ile, Tezgâhlar gözünde tek başına). Verilmezse bugünkü iki satırlık yazı.
  tablo?: TabloDurumu | null;
  // Gantt dilim 1 (T1): motorun ufkunun sonu (saat). Tahtanın içindeyse kesik çizgi ve "Plan ufku" yazısı, ötesi taralı.
  ufukSonu?: number | null;
  // Dilim 2 (T3): Hafta ve üstünde dar yan yana işler "N iş" kümesidir; basınca o aralık Gün ölçeğinde açılır. Verilmezse küme basılmaz.
  kumeAc?: ((S: number, C: number) => void) | null;
  // T4: Sıkı satırda çubuk içine yazı yazılmaz (yeri varsa yanında, yoksa ipucunda).
  satirBoyu?: SatirBoyu;
  // Dilim 3 (E, 3553 a): verilince Sipariş gözünde satır ve çubuk ölçeğe bağlı kademededir: Yıl ve Ay'da sipariş, Hafta'da emir, Gün ve 3 gün'de adım.
  // Çubuğa basınca kademeIn o sipariş ya da emre iner (Kokpit ölçeği ve süzgeci değiştirir).
  siparisler?: readonly SiparisGrubu[] | null;
  // Kademeye inilince (yol izi odağı) kademe ölçekten değil odaktan gelir: sipariş odağında emir, emir odağında adım (Arayüz Z1).
  kademeZorla?: Kademe | null;
  // Dilim 3b (F): görünen aralık genel bakış şeridine bildirilir; şerit pencereyi sürükleyince tahta o saate kayar (n her istekte artar).
  pencereDeposu?: PencereDeposu | null;
  kademeIn?: ((tur: 'siparis' | 'emir', id: string, S: number, C: number) => void) | null;
  // Dilim 3c (G): Tezgâh gözünde Ay ve Hafta'da satır tezgâh x gün doluluk hücresidir; basınca o gün yan panelde açılır (el: odağın döneceği hücre).
  hucreAc?: ((tezgah: string, a: number, el: HTMLElement) => void) | null;
  hucreSecili?: { tezgah: string; a: number } | null;
  // 3663: adımların sağlam adedi (sunucu durum okumasından); verilmezse panoda ilerleme plana göre yazılır.
  adimSayim?: Readonly<Record<string, AdimSayimi>> | null;
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
// Ay ve Yıl'da 1 saat 1,5 px'ten dar: elle taşıma saatler kaydırır, taşıma yalnız yakın ölçekte (Risk Y1).
const YAKINLASIN = 'Taşımak için yakınlaşın';
// Sürükleme bu kadar px kıpırdayınca başlar; altında basış tıktır.
const SURUKLE_ESIGI = 4;
// 3570: boyamadan önce ölçülen satır sayısı (ilk ekran ve biraz fazlası) ve boşta ölçülen parça.
// İmleç bu kadar ms durunca sürüklenen yerin etkisi sorulur.
const ETKI_BEKLE = 150;
// Bu genişlikten (px) dar iş okunur genişlikte çizilir; satır en çok bu kadar şeride açılır.
const PAY_DAR_EN = 96;
const KISA_IS = 40, OKUNUR_EN = 64, EN_COK_SERIT = 4, HUCRE_SAYI_EN = 28;
const hucreEtkin = (g: { yuzde: number | null; isSay: number }): boolean => g.yuzde !== null || g.isSay > 0;
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

// Yer daralınca emir no kademeli kısalır (kokpit.css .tc-pyq-emir-no): önce ortak ön ek "…" ile, sonra sıra parçası gider; ayırt eden son
// üç parça ("26-11-030") en sona kalır. Tam numara düğmenin ipucundadır.
function EmirNo({ no }: { no: string }): ReactNode {
  const [bas, kuyruk] = emirNoParcalari(no), i = kuyruk.indexOf('-') + 1;
  return <b className="tc-pyq-emir-no">{kuyruk === '' ? <span>{no}</span> : <><span>{bas}</span><span>{kuyruk.slice(0, i)}</span><span>{kuyruk.slice(i)}</span></>}</b>;
}
export function Tahta(o: TahtaOzellikleri) {
  const { m, cx, goz, olcek, emirler, uyar, secEmir, secIs, sec, zaman, tasi, planaAl, once, gunAc, uyari, goster, odak, oneri } = o;
  const yerlestirme = o.goz === 'T' ? o.yerlestirme ?? null : null;
  const yanan = o.yanan ?? null, secimiKaldir = o.secimiKaldir, onizle = o.onizle ?? null, okKipi = o.okKipi ?? 'is';
  const bol = o.bol ?? null;
  const sorunBildir = goz === 'T' ? o.sorunBildir ?? null : null;
  const gelen = o.gelen ?? null, gelenBas = o.gelenBas ?? null, eskiYer = once ? null : o.eskiYer ?? null;
  // 3533: tablo kipi. Emirler gözünde (agac) emir sütunları, Tezgâhlar gözünde tezgâh sütunları; Ay ve Yıl ölçeğinde bugünkü satır başı kalır.
  const tablo = o.tablo ?? null;
  const kad = goz !== 'T' && o.siparisler ? o.kademeZorla ?? kademe(olcek) : 'adim';
  // Yük hücreleri yalnız Tezgâh gözünün (ya da kademesiz tahtanın) Yıl ölçeğinde.
  const isi = olcek === 'Y' && kad === 'adim';
  const tabloKipi = tablo !== null && !isi && (goz === 'T' || (o.agac ?? null) !== null);
  const tabloKimligi = useId();
  // aria-owns yalnız o an çizilmiş satırları sayar (çizilmeyen kimliğe işaret etmez); her çizimden sonra DOM'dan kurulur.
  const tabloSahibi = useRef<HTMLDivElement>(null);
  const kolonlar: readonly { id: string; ad: string; en: number; sayi: boolean }[] = tablo === null ? [] : goz === 'T' ? TEZGAH_SUTUNLARI : tablo.sutunlar.map((x) => SUTUN_ADI[x]);
  // 3570: sütunlar içeriğin ölçülen enine göre açılır (yazı boyu büyükse kesilmesin); ölçüm yokken (ilk kare, test ortamı) sabit ağırlıklar.
  // Ölçü durumda değil: değişince yalnız tahtanın CSS değişkeni yazılır, satırlar yeniden çizilmez (800 emirde tam çizim pahalı).
  const olcum = useRef<SutunOlcumu | null>(null);
  const olcuDuzeni = tabloKipi ? olcuSablonu(kolonlar, olcum.current) : null;
  const sutunSablonu = tabloKipi ? olcuDuzeni?.sablon ?? sablon(kolonlar) : '';
  const dogalEn = olcuDuzeni?.dogal ?? (tablo === null ? 0 : goz === 'T' ? tezgahToplamEni() : sutunToplamEni(tablo.sutunlar));
  const bolmeGenisligi = tabloKipi && tablo ? bolmeEni(dogalEn, tablo.en, olcuDuzeni?.enAz) : '';
  // Açık balon: işaretin işi ve tahta içindeki yeri (px).
  const [balon, setBalon] = useState<{ id: string; x: number; y: number; alt: number; satir?: true } | null>(null);
  const fasonlar = useMemo(() => new Set(m.tezgahlar.filter((t) => t.fason).map((t) => t.id)), [m.tezgahlar]);
  const coklu = o.coklu ?? BOS_KUME, cokluSec = o.cokluSec ?? null, grupKaydir = o.grupKaydir ?? null;
  const px = !uzakMi(olcek) && o.saatEni != null ? o.saatEni : SAAT_ENI[olcek];
  // Uzak: saatte 1,5 px ya da daha dar (Ay, Yıl ya da kademeye inerken sığdırılan dar saat eni). Uzakta taşıma yoktur, gün yazısı haftalıktır.
  const uzak = uzakMi(olcek) || px < YAKIN_EN_AZ;
  const en = (m.son - m.bas) * px;
  const ufuk = ufukCizgisi(m, o.ufukSonu);
  const ufukDisi = ufuk === null ? null : <span className="tc-pyq-ufuk-disi" aria-hidden="true" ref={(el) => { yerYaz(el, (ufuk - m.bas) * px, (m.son - ufuk) * px); }} />;
  const ufukCizgi = ufuk === null ? null : <div className="tc-pyq-ufuk" aria-hidden="true" ref={(el) => { yerYaz(el, (ufuk - m.bas) * px); }} />;
  const kap = useRef<HTMLDivElement | null>(null);
  // 3681: panonun satır tıklamasıyla mı (tablo kipi) çubuğa basılarak mı açıldığı: yalnız çubuk yolunda "üste aç" kuralı işler.
  const satirSecimi = useRef<string | null>(null);
  const [tasinan, setTasinan] = useState<Tasinan | null>(null);
  const [hedef, setHedef] = useState<Hedef | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; tut: number; fis?: boolean } | null>(null);
  const imlecteki = useRef<string | null>(null);
  const ic = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const sahip = tabloSahibi.current, kok = ic.current;
    if (!sahip || !kok) return;
    const onek = `${tabloKimligi}-`;
    const idler = [...kok.querySelectorAll<HTMLElement>('[role="row"][id]')].map((x) => x.id).filter((x) => x.startsWith(onek)).join(' ');
    if (sahip.getAttribute('aria-owns') !== idler) sahip.setAttribute('aria-owns', idler);
  });
  const [oklar, setOklar] = useState<Ok[]>([]);
  const [ustteki, setUstteki] = useState<string | null>(null);
  // 3681: tabloda payları açılmış bölünmüş adımlar.
  const [acikPay, setAcikPay] = useState<ReadonlySet<string>>(new Set());
  // Son tıklanan pay: seçili adımın paylarından yalnız bu dolu çerçeve alır, kardeşleri kesik çerçeve alır (3681).
  const [tiklananPay, setTiklananPay] = useState<string | null>(null);
  const [etki, setEtki] = useState<Etki | null>(null);
  // 3663: kişinin kapattığı seçili adım panosu (hangi adım); başka adım seçilince yeniden açılır.
  const [panoKapali, setPanoKapali] = useState<string | null>(null);
  useEffect(() => { if (secIs === null) setPanoKapali(null); }, [secIs]);
  // 3531 b: bırakılan iş hemen taşınmaz; hayalet, itilen işler ve neden cümlesi yerinde durur, Uygula yazar, Vazgeç (ya da Esc) bırakır.
  const [onay, setOnay] = useState(false);
  // Fareyle basılan iş: kıpırdayınca sürükleme başlar; sürükleyerek tutulanı bırakmak imleci kaldırmaktır.
  const basilan = useRef<{ id: string; x: number; y: number; tut: number } | null>(null);
  const surukleniyor = useRef(false);
  // 3602: sürüklerken çizilen hiza çizgileri ve son yakalanan referans (histerezis için); yalnız çıkan saati etkiler.
  const [hiza, setHiza] = useState<HizaCizgisi[]>([]);
  const yakalanan = useRef<{ satir: string; y: Yakalanan } | null>(null);
  // Bağlar saatli ölçekte çizilir; onaylı plan gösterilirken (önce / sonra) çizilmez. Varsayılan yalnız odaktaki işin (üstüne gelinen, yoksa
  // seçili) bir önceki ve bir sonraki adımıdır (3365): bütün siparişin okları birden örgü olur.
  const odakIs = tasinan ? null : ustteki ?? secIs;
  const gorunenSatir = gorunenSatirSayisi(goz, m.tezgahlar.length, emirler, goz !== 'T' ? o.agac?.acik ?? null : null);
  const baglar = useMemo((): AdimBagi[] => {
    if (once || uzak || okKipi === 'yok' || kad !== 'adim') return [];
    const x = odakIs ? m.isler[odakIs] : undefined;
    if (okKipi === 'is') {
      const e = x ? m.emirler.find((y) => y.id === x.job) : undefined;
      return e && x ? adimBaglari([e], m.isler).filter((b) => b.kimden === x.id || b.kime === x.id) : [];
    }
    const kume = okKumesi(yanan, x?.job ?? null, secEmir, gorunenSatir);
    return kume ? adimBaglari(m.emirler.filter((e) => kume.has(e.id)), m.isler) : [];
  }, [yanan, once, olcek, m, okKipi, odakIs, secEmir, gorunenSatir, kad]);
  // Kısa işin çizim genişliği ve şeridi; satırın şerit sayısı. Fason satırı (sınırsız kapasite) şeride açılmaz.
  // sag: aynı şeritte sağdaki işe (yoksa tahtanın sonuna) kadar boş yer; çubuk yazısı içine sığmazsa orada durur (T5).
  const yerlesim = useMemo(() => {
    const is = new Map<string, { en: number; serit: number; sag: number }>(), satir = new Map<string, number>();
    // T3: kümedeki işin kimliği küme kimliğine (ilk işin kimliği) gider; kümenin yeri ve şeridi kumeler'dedir.
    const kumeOf = new Map<string, string>(), kumeler = new Map<string, { idler: string[]; S: number; C: number; en: number; serit: number; sag: number }>();
    const alanEni = (m.son - m.bas) * px, okunur = okunurGenislik(olcek), acikAgac = goz !== 'T' ? o.agac?.acik ?? null : null;
    if (isi) return { is, satir, kumeOf, kumeler };
    const gruplar = new Map<string, KokpitIsi[]>();
    for (const x of Object.values(m.isler)) { const k = goz === 'T' ? satirKimligi(x) : x.job; gruplar.set(k, [...(gruplar.get(k) ?? []), x]); }
    for (const [k, l] of gruplar) {
      const yer = (x: KokpitIsi) => once?.[x.id] ?? x;
      const sonlar: number[] = [], sonIs: (string | undefined)[] = [];
      // Okunur genişlikte kısa iş genişler (3365 a); Hafta ve üstünde gerçek boyundadır ve dar komşular kümelenir (açık ağaç emrinin adımları kendi satırındadır).
      const birimler = okunur || acikAgac?.has(k) ? l.map((x) => { const { S, C } = yer(x), gercek = (C - S) * px; return { idler: [x.id], sol: (S - m.bas) * px, en: okunur && gercek < KISA_IS ? OKUNUR_EN : gercek }; })
        : kumele(l.map((x) => { const { S, C } = yer(x); return { id: x.id, sol: (S - m.bas) * px, en: (C - S) * px }; }));
      const sag = (id: string): { sag: number } | undefined => is.get(id) ?? kumeler.get(id);
      for (const b of birimler) {
        const { sol, en } = b, id = b.idler[0] ?? '';
        let i = goz === 'T' && fasonlar.has(k) ? 0 : sonlar.findIndex((s) => s <= sol + 0.5);
        if (i < 0) { if (sonlar.length < EN_COK_SERIT) { sonlar.push(0); i = sonlar.length - 1; } else i = sonlar.indexOf(Math.min(...sonlar)); }
        const once0 = sonIs[i], onceki = once0 === undefined ? undefined : sag(once0);
        if (onceki) onceki.sag = sol - (sonlar[i] ?? 0);
        sonlar[i] = Math.max(sonlar[i] ?? 0, sol + en); sonIs[i] = id;
        if (b.idler.length > 1) {
          for (const y of b.idler) kumeOf.set(y, id);
          kumeler.set(id, { idler: b.idler, S: m.bas + sol / px, C: m.bas + (sol + en) / px, en, serit: i, sag: alanEni - (sol + en) });
        } else is.set(id, { en, serit: i, sag: alanEni - (sol + en) });
      }
      satir.set(k, Math.max(1, sonlar.length));
    }
    return { is, satir, kumeOf, kumeler };
  }, [m, goz, olcek, px, once, fasonlar, o.agac?.acik, isi]);
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
  // Bölme eni ve sütun şablonu tahtanın değişkenidir: bütün satırlar ve başlık aynı ızgarayı okur (satır içi stil yok).
  useLayoutEffect(() => {
    const k = kap.current;
    if (!k) return;
    if (sutunSablonu) { k.style.setProperty('--sutunlar', sutunSablonu); k.style.setProperty('--bas-en', bolmeGenisligi); }
    else { k.style.removeProperty('--sutunlar'); k.style.removeProperty('--bas-en'); }
  });
  // Yalnız daha önce ölçülmemiş emir ve sipariş satırları ölçülür (sütun kümesi, kademe, satır boyu, yazı tipi ya da plan değişince hepsi
  // yeniden), boyamadan önce; her sütunda yazısı en uzun görünen birkaç satır düzenle ölçülür (olcuAdaylari). Açılan emrin adım satırları yalnız
  // Süre ve Durum sütununda ölçülür (3660; kendi sütunlarına sığmayan adım adı eskisi gibi "…" ile kısalır); arama, sıralama, seçim ve kaydırma ölçmez. Enler yalnız büyür;
  // değişince sütun şablonu doğrudan tahtanın değişkenine yazılır (satırlar yeniden çizilmez).
  const olcuAnahtari = tabloKipi ? `${kolonlar.map((x) => x.id).join(',')}|${kad}|${o.satirBoyu ?? ''}` : '';
  const olculen = useRef<{ anahtar: string; m: unknown; satirlar: Set<string> } | null>(null);
  const duzenYaz = useRef<() => void>(() => undefined);
  duzenYaz.current = () => {
    const k = kap.current, d = tabloKipi && tablo ? olcuSablonu(kolonlar, olcum.current) : null;
    if (!k || !d || !tablo) return;
    k.style.setProperty('--sutunlar', d.sablon); k.style.setProperty('--bas-en', bolmeEni(d.dogal, tablo.en, d.enAz));
    if (tablo.en === null) k.querySelector('.tc-pyq-eksen [role="separator"]')?.setAttribute('aria-valuenow', String(Math.round(d.dogal)));
  };
  const olcCalis = useRef<(yaziDegisti: boolean) => void>(() => undefined);
  olcCalis.current = (yaziDegisti) => {
    const k = kap.current;
    if (!k || !olcuAnahtari) return;
    const once = olculen.current;
    const yeniAnahtar = yaziDegisti || once === null || once.anahtar !== olcuAnahtari || once.m !== m;
    const kayit = yeniAnahtar ? { anahtar: olcuAnahtari, m, satirlar: new Set<string>() } : once;
    olculen.current = kayit;
    const yeniSatirlar = (sec: string): HTMLElement[] => [...k.querySelectorAll<HTMLElement>(sec)].filter((x) => !kayit.satirlar.has(x.dataset['satir'] ?? ''));
    const yeni = yeniSatirlar('.tc-pyq-satir[data-satir]:not([data-agac-adim], [data-agac-ara], [data-agac-not])'), yeniAdim = yeniSatirlar('.tc-pyq-satir[data-satir][data-agac-adim]');
    const baslik = yeniAnahtar ? [...k.querySelectorAll<HTMLElement>('.tc-pyq-satir.tc-pyq-eksen')] : [];
    if (yeni.length === 0 && yeniAdim.length === 0 && baslik.length === 0) return;
    // Tahta baştan dizilecekse (ilk açılış, sütun kümesi, kademe ya da satır boyu değişince) satırlar ölçüm süresince gizlenir:
    // ölçüm yalnız kopyaları dizer, satırlar yeni şablonla bir kez dizilir (iki kez değil). Odak satırlardaysa gizlenmez (odak düşmesin).
    const ic = k.querySelector<HTMLElement>(':scope > .tc-pyq-ic');
    const gizle = (once === null || once.anahtar !== olcuAnahtari) && ic !== null && !ic.contains(document.activeElement);
    // Yeni tahtada kaydırma sıfırdır; okumak satırları gizlemeden önce dizdirirdi.
    const ust = gizle && once !== null ? k.scrollTop : 0, sol = gizle && once !== null ? k.scrollLeft : 0;
    if (gizle) k.setAttribute('data-olcum', '');
    try {
      const y = sutunlariOlc(k, [...baslik, ...olcuAdaylari(yeni), ...olcuAdaylari(yeniAdim, 3, ADIM_OLCULEN)]);
      for (const x of [...yeni, ...yeniAdim]) kayit.satirlar.add(x.dataset['satir'] ?? '');
      if (!y) return;
      const onceki = yeniAnahtar ? null : olcum.current, z = onceki ? olcumBirlestir(onceki, y) : y;
      if (olcum.current && JSON.stringify(olcum.current) === JSON.stringify(z)) return;
      olcum.current = z;
      duzenYaz.current();
    } finally {
      if (gizle) { k.removeAttribute('data-olcum'); if (ust || sol) { k.scrollTop = ust; k.scrollLeft = sol; } }
    }
  };
  useLayoutEffect(() => { olcCalis.current(false); }, [olcuAnahtari, m, emirler, o.siparisler, o.agac?.acik]);
  // Yazı tipi geç yüklenirse ölçü yeniden alınır (tahta yeniden çizilmez; yalnız en değişirse şablon yazılır).
  useEffect(() => {
    const f = typeof document === 'undefined' ? undefined : document.fonts as FontFaceSet | undefined;
    if (!f || typeof f.addEventListener !== 'function') return undefined;
    // Tarayıcı yeni yazıyla bir kez dizdikten sonra ölçülür (ölçüm ayrıca dizdirmesin).
    let kare: number | null = null, sure: number | null = null;
    const birak = (): void => {
      if (kare !== null) window.cancelAnimationFrame(kare);
      if (sure !== null) window.clearTimeout(sure);
      kare = null; sure = null;
    };
    const yuklendi = (): void => {
      birak();
      kare = window.requestAnimationFrame(() => { kare = null; sure = window.setTimeout(() => { sure = null; olcCalis.current(true); }, 0); });
    };
    f.addEventListener('loadingdone', yuklendi);
    return () => { birak(); f.removeEventListener('loadingdone', yuklendi); };
  }, []);

  // Onay açıkken bırakılan taşıma bekler: başka işi tutmak onu sessizce başka işe çevirmesin.
  const tut = useCallback((id: string, tutma = 0): void => {
    const x = m.isler[id];
    if (onay || !x || !tasi) return;
    if (uzak) { uyari(YAKINLASIN); return; }
    const neden = tasinabilir(x);
    if (neden) { uyari(neden); return; }
    setMenu(null); setTasinan({ id, tut: tutma }); setHedef({ satir: goz === 'T' ? satirKimligi(x) : x.job, S: x.S, gecerli: true });
  }, [onay, m, tasi, goz, uyari, olcek]);
  const fisAdaylari = useCallback((emirId: string): string[] => (emir.get(emirId)?.adimlar[0]?.adaylar ?? []).filter((t) => !t.startsWith('@')), [emir]);
  const tutFis = useCallback((emirId: string): void => {
    const e = emir.get(emirId), ilk = e?.adimlar[0];
    if (onay || !e || !ilk || !planaAl) return;
    if (goz !== 'T') { uyari('Planlamak için Tezgâh görünümüne geçin'); return; }
    if (uzak) { uyari('Planlamak için yakınlaşın'); return; }
    if (e.adimlar.some((a) => m.isler[a.id])) { uyari('Bu emrin bir adımı planda; öteki adımları planlanınca yerleşir'); return; }
    if (!fisAdaylari(emirId).length) { uyari('Bu emrin ilk adımı tezgâhta yapılmıyor'); return; }
    setMenu(null); setTasinan({ id: ilk.id, tut: 0, fis: emirId }); setHedef(null);
  }, [onay, emir, m, planaAl, goz, uyari, fisAdaylari, olcek]);
  // vazgecer: sürükleyerek tutulan iş geçersiz yere bırakılınca tutma biter (yapışarak tutmada iş elde kalır, kişi başka yere tıklar).
  const birak = useCallback((vazgecer = false): void => {
    if (onay) return;
    const birakma = (ileti: string): void => { uyari(ileti); if (vazgecer) { setTasinan(null); setHedef(null); } };
    if (tasinan && uzak) { birakma('Bırakmak için yakınlaşın'); return; }
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
  }, [onay, tasinan, hedef, m, tasi, planaAl, goz, uyari, grupKaydir, coklu, olcek]);
  const vazgec = useCallback((): void => { surukleniyor.current = false; setOnay(false); setTasinan(null); setHedef(null); }, []);
  // Onay açıkken iş plandan düşerse ya da taşıma yetkisi kalkarsa çubuk çizilemez; tahta kilitli kalmasın diye taşıma bırakılır.
  useEffect(() => {
    if (!onay || !tasinan) return;
    if (!m.isler[tasinan.id]) { vazgec(); uyari('İş planda yok; taşıma iptal edildi'); } else if (!tasi) { vazgec(); uyari('Taşıma şu an yapılamıyor; iptal edildi'); }
  }, [onay, tasinan, m, tasi, vazgec, uyari]);
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
    const ham = m.bas + (ev.clientX - alan.getBoundingClientRect().left) / px - tasinan.tut;
    const adimSatiri = `${x.job}>${x.id}`;
    const gecerli = goz === 'T' ? adaylar(x).includes(kimlik) : kimlik === x.job || kimlik === adimSatiri;
    const hedefSatir = goz === 'T' || kimlik === adimSatiri ? kimlik : x.job;
    // 3602: Alt basılıyken ya da onaylı plan gösterilirken yakalama ve çizgi yok. Yakalama yalnız ham saati değiştirir; geçerlilik ve komut aynı.
    let S = tasimaSaati(ham, m.simdi);
    if (ev.altKey || once) { yakalanan.current = null; setHiza((h) => (h.length === 0 ? h : [])); } else {
      const noktalar = hizaNoktalari(m, x.id, hedefSatir, goz === 'T', coklu.size > 1 && coklu.has(x.id) ? coklu : undefined);
      const onceki = yakalanan.current?.satir === hedefSatir ? yakalanan.current.y : null;
      const r = hizalaYakala(ham, x.C - x.S, noktalar, px, onceki);
      yakalanan.current = r.yakalanan ? { satir: hedefSatir, y: r.yakalanan } : null;
      S = tasimaSaati(r.S, m.simdi);
      const c = hizaCizgileri(S, x.C - x.S, noktalar, px);
      const anahtar = (l: HizaCizgisi[]): string => l.map((q) => `${q.kenar}${String(q.saat)}${q.hizali ? '!' : ''}`).join('|');
      setHiza((h) => (anahtar(h) === anahtar(c) ? h : c));
    }
    setHedef({ satir: hedefSatir, S, gecerli });
  };

  useEffect(() => { if (!tasinan) { yakalanan.current = null; setHiza((h) => (h.length === 0 ? h : [])); } }, [tasinan]);
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
      if (ev.key === 'Escape' && balon && !tasinan && !menu) { ev.stopPropagation(); setBalon(null); return; }
      if (ev.key === 'Escape' && (tasinan || menu)) { ev.stopPropagation(); surukleniyor.current = false; setOnay(false); setTasinan(null); setHedef(null); setMenu(null); return; }
      if (onay) return;
      if (yazimda() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key !== ' ' || uzak) return;
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
  }, [tasinan, menu, onay, balon, tut, tutFis, birak, secIs, secEmir, emir, planaAl, m, olcek]);

  // Balon dışına basınca kapanır (tahtanın dışı da; içerideki basış tahtanın tık yakalayıcısındadır).
  useEffect(() => {
    if (!balon) return undefined;
    const bas = (ev: PointerEvent): void => { if (!(ev.target as Element | null)?.closest?.('.tc-pyq-tahta')) setBalon(null); };
    document.addEventListener('pointerdown', bas, true);
    return () => { document.removeEventListener('pointerdown', bas, true); };
  }, [balon]);
  useEffect(() => { if (balon && !balon.satir && !m.isler[balon.id]) setBalon(null); }, [balon, m]);
  const balonAc = (id: string, el: HTMLElement, satir?: true): void => {
    if (balon?.id === id) { setBalon(null); return; }
    const k = ic.current?.getBoundingClientRect(), b = el.getBoundingClientRect();
    setBalon({ id, x: b.left + b.width / 2 - (k?.left ?? 0), y: b.top - (k?.top ?? 0), alt: b.bottom - (k?.top ?? 0), ...(satir ? { satir } : {}) });
  };
  // Balon işarete ortalanır, ama tahtanın görünen genişliğinden taşmaz (768'de sağ kenardaki işaret): sol kenar görünen alana sıkıştırılır, ok
  // işaretin altında kalır. Üstte yer yoksa (ilk satır; yapışık saat ekseni dahil) balon işaretin altında açılır, ok yukarı bakar.
  const balonYerlestir = (el: HTMLElement, x: number, ust: number, alt: number): void => {
    const k = kap.current, pay = 8;
    if (k) el.style.setProperty('--balon-en', `${String(Math.max(0, k.clientWidth - 2 * pay))}px`);
    const en = el.offsetWidth;
    const sol0 = k ? k.scrollLeft + pay : -Infinity, sag0 = k ? k.scrollLeft + k.clientWidth - pay : Infinity;
    const sol = Math.max(sol0, Math.min(x - en / 2, sag0 - en));
    el.style.setProperty('--x', `${String(Math.round(sol))}px`);
    const eksen = k?.querySelector<HTMLElement>('.tc-pyq-eksen')?.offsetHeight ?? 0;
    const asagi = k !== null && ust - el.offsetHeight - pay < k.scrollTop + eksen;
    el.toggleAttribute('data-asagi', asagi);
    el.style.setProperty('--y', `${String(Math.round(asagi ? alt : ust))}px`);
    el.style.setProperty('--ok', `${String(Math.round(Math.max(pay, Math.min(en - pay, x - sol))))}px`);
  };
  // 3663: seçili adım panosu ekranda sabittir (gövdeye taşınır: tahtanın kaydırma alanı onu kırpmaz) ve sol tablonun üstüne binmez.
  // Sıra: çubuğun sağı, solu (Gantt alanı içinde), altı, üstü; önceki yer hâlâ sığıyorsa korunur (kaydırırken sağ-üst arası zıplamaz).
  // Gantt alanı dar kalırsa (768) pano yüzmez, 360'taki gibi alt sayfa olur ve tablo hiç örtülmez. Çubuk görünmüyorsa pano gizlenir.
  // Görünen dikey aralık: ekran ile tahtayı saran tüm kaydırma kaplarının kesişimi (üst sayfa, sekme şeridini ve sarı üst çubuğu örtmesin).
  const gorunenDikey = (k: HTMLElement): { ust: number; alt: number } => {
    let ust = 0, alt = document.documentElement.clientHeight;
    for (let a = k.parentElement; a && a !== document.body; a = a.parentElement) {
      const oy = getComputedStyle(a).overflowY;
      if (oy === 'auto' || oy === 'scroll' || oy === 'hidden') { const r = a.getBoundingClientRect(); ust = Math.max(ust, r.top); alt = Math.min(alt, r.bottom); }
    }
    return { ust, alt };
  };
  const panoYerlestir = (el: HTMLElement, isId: string, sabit = false): void => {
    const k = kap.current, cubuk = k?.querySelector<HTMLElement>(`[data-is="${tirnakIci(isId)}"]`);
    if (!k || !cubuk) { el.hidden = true; return; }
    el.hidden = false;
    // Liste sütununun sağı: çubuğun kendi satırındaki yapışkan sütundan ölçülür (başlıktaki ilk sütun tablo kipinde 0 genişlik verebilir).
    const bh = cubuk.closest('.tc-pyq-satir')?.querySelector<HTMLElement>(':scope > .tc-pyq-bas') ?? k.querySelector<HTMLElement>('.tc-pyq-bas');
    const kr = k.getBoundingClientRect(), pay = 8, enAz = 260, listeSag = Math.max(bh?.getBoundingClientRect().right ?? 0, kr.left + (bh?.offsetWidth ?? 0), 0);
    const ekranEn = document.documentElement.clientWidth, gd = gorunenDikey(k), ekranBoy = gd.alt;
    // Çubuk görünür zaman alanının dışındaysa pano gizlenir (3663: görünmeyen çubuğa bağlı kalmaz; satıra basınca tahta çubuğa kayar).
    const c = cubuk.getBoundingClientRect(), gl = Math.max(c.left, listeSag), gr = Math.min(c.right, kr.right, ekranEn), gt = Math.max(c.top, kr.top, gd.ust), gb = Math.min(c.bottom, kr.bottom, ekranBoy);
    if (gr - gl < pay || gb - gt < pay) { el.hidden = true; return; }
    const b = { left: gl, right: gr, top: gt, bottom: gb };
    const sag = Math.min(kr.right, ekranEn) - pay, sol = listeSag + pay;
    const ipucu = (): void => { el.toggleAttribute('data-kayar', el.scrollHeight > el.clientHeight + 1 && el.scrollTop + el.clientHeight < el.scrollHeight - 1); };
    el.onscroll = ipucu;
    const dar = sag - sol < (el.hasAttribute('data-alt') ? 340 : 300);
    if (!dar) el.removeAttribute('data-alt');
    if (dar) {
      // Alt sayfa çubuğu örtmesin: çubuğun üstünde ya da altında en az 160 px yer olan yanda açılır (önceki yan yeterliyse korunur).
      // Üstte açılırsa Gantt kartının üstünden başlar; sayfanın sarı üst çubuğunu ve sekmelerini örtmez.
      const topY = Math.max(kr.top, gd.ust) + pay,
        // Satır tıklamasında üst sayfa seçili tablo satırını örtmez: bölünmüş adımın satırı payların çubuğunun üstündedir (3681).
        satirUst = satirSecimi.current === isId ? k.querySelector<HTMLElement>(`[data-adim-satiri="${tirnakIci(isId)}"]`)?.getBoundingClientRect().top : undefined,
        roomUst = Math.min(b.top, satirUst ?? b.top) - pay - topY, roomAlt = ekranBoy - 2 * pay - (b.bottom + 2 * pay), eski = el.getAttribute('data-alt');
      // İki yanda da az yer varsa sayfa, çubuk üst kısma gelecek kadar bir kez yumuşakça kayar (alt sayfa altta açılır).
      if (Math.max(roomUst, roomAlt) < 200 && el.dataset['kay'] !== isId) { el.dataset['kay'] = isId; window.scrollBy({ top: b.top - ekranBoy * 0.3, behavior: 'smooth' }); }
      const ustGenis = b.top - pay - (gd.ust + pay), { yan, genis } = darPanoYani(roomUst, roomAlt, ustGenis, eski, satirSecimi.current === isId), oda = yan === 'ust' ? roomUst : roomAlt;
      if (genis) {
        const h = Math.floor(Math.max(0, Math.min(ustGenis, ekranBoy * 0.5)));
        el.setAttribute('data-alt', 'ust');
        el.style.maxWidth = '';
        el.style.maxHeight = `${String(h)}px`;
        el.style.setProperty('--y', `${String(Math.round(b.top - pay - Math.min(el.offsetHeight, h)))}px`);
        ipucu(); return;
      }
      el.setAttribute('data-alt', yan);
      el.style.maxWidth = '';
      el.style.maxHeight = `${String(Math.max(0, Math.min(oda, ekranBoy * 0.5)))}px`;
      el.style.setProperty('--y', `${String(Math.round(topY))}px`);
      ipucu(); return;
    }
    const eksen = k.querySelector<HTMLElement>('.tc-pyq-eksen')?.offsetHeight ?? 0;
    const ust = Math.max(kr.top, gd.ust) + eksen + pay, alt = ekranBoy - pay;
    el.style.maxWidth = `${String(Math.max(enAz, sag - sol))}px`;
    el.style.maxHeight = `${String(Math.max(0, alt - gd.ust - pay))}px`;
    const en = el.offsetWidth, boy = el.offsetHeight;
    const yanY = Math.max(gd.ust + pay, Math.min(Math.max(ust, (b.top + b.bottom) / 2 - boy / 2), alt - boy));
    const yerler: Record<string, (bos: number) => { x: number; y: number } | null> = {
      sag: (m) => (b.right + pay + en + m <= sag ? { x: b.right + pay, y: yanY } : null),
      sol: (m) => (b.left - pay - en - m >= sol ? { x: b.left - pay - en, y: yanY } : null),
      alt: (m) => (b.bottom + pay + boy + m <= alt ? { x: Math.max(sol, Math.min(b.left, sag - en)), y: b.bottom + pay } : null),
      ust: (m) => (b.top - pay - boy - m >= ust ? { x: Math.max(sol, Math.min(b.left, sag - en)), y: b.top - pay - boy } : null),
    };
    // Eşik payı: önceki yer payla (24 px) korunur, yeni yer ancak rahat sığıyorsa seçilir.
    const onceki = el.getAttribute('data-yon') ?? '';
    let yon = '', yer = onceki ? yerler[onceki]?.(0) ?? null : null;
    // Kaydırma sürerken yan değişmez: önceki yan sığmasa da aynı yanda (ekrana sıkıştırılarak) kalır; kaydırma durunca yeniden değerlendirilir.
    if (!yer && sabit && onceki && yerler[onceki]) {
      const g = onceki === 'sag' ? { x: b.right + pay, y: yanY } : onceki === 'sol' ? { x: b.left - pay - en, y: yanY } : { x: b.left, y: onceki === 'alt' ? b.bottom + pay : b.top - pay - boy };
      yer = { x: Math.max(sol, Math.min(g.x, sag - en)), y: Math.max(gd.ust + pay, Math.min(g.y, alt - boy)) };
    }
    if (yer && onceki) yon = onceki;
    else for (const ad of ['sag', 'sol', 'alt', 'ust']) { const r = yerler[ad]!(onceki ? 24 : 0); if (r) { yer = r; yon = ad; break; } }
    // Eksen ve Genel bakış şeridi altında yer yoksa son çare: çubuğun üstüne ya da altına, ekranın tam yüksekliğiyle (eksen geçici örtülür); çubuk örtülmez.
    if (!yer) {
      const x = Math.max(sol, Math.min(b.left, sag - en));
      if (b.top - pay - boy >= gd.ust + pay) { yon = 'ust'; yer = { x, y: b.top - pay - boy }; }
      else if (b.bottom + pay + boy <= alt) { yon = 'alt'; yer = { x, y: b.bottom + pay }; }
      else {
        // Pano iki yanda da sığmıyorsa çubuğu örtmez: geniş olan yanda yüksekliği sınırlanır, içinde kaydırılır (3681).
        const ustOda = b.top - pay - (gd.ust + pay), altOda = alt - (b.bottom + pay), ustte = ustOda > altOda, oda = Math.floor(ustte ? ustOda : altOda);
        if (oda >= 200) { el.style.maxHeight = `${String(oda)}px`; const bh = Math.min(boy, oda); yon = ustte ? 'ust' : 'alt'; yer = { x, y: ustte ? b.top - pay - bh : b.bottom + pay }; }
        else { yon = 'alt'; yer = { x, y: Math.max(gd.ust + pay, Math.min(b.bottom + pay, alt - boy)) }; }
      }
    }
    el.setAttribute('data-yon', yon);
    el.style.setProperty('--x', `${String(Math.round(yer.x))}px`);
    el.style.setProperty('--y', `${String(Math.round(yer.y))}px`);
    ipucu();
  };
  // 3681: bölünmüş adımın özet satırının çubuğu yoktur; basınca paylar açılır ve tahta ilk payın çubuğuna kayar (kanca sırası için erken tanımlıdır).
  const cubugaKaydir = (isId: string): boolean => {
    const cubuk = kap.current?.querySelector<HTMLElement>(`[data-is="${tirnakIci(isId)}"]`);
    if (!cubuk) return false;
    if (typeof cubuk.scrollIntoView === 'function') cubuk.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    // Çubuk sol bölmenin (sticky tablo) hemen sağına yaklaşır: pano sağına sığar, tablonun altında kalmaz.
    const k = kap.current, ik = ic.current?.getBoundingClientRect();
    if (k && ik && typeof k.scrollTo === 'function') {
      const bas = k.querySelector<HTMLElement>('.tc-pyq-bas')?.offsetWidth ?? 0, b = cubuk.getBoundingClientRect();
      k.scrollTo({ left: Math.max(0, b.left - ik.left - bas - 24), behavior: 'smooth' });
    }
    return true;
  };
  useEffect(() => { if (secIs !== satirSecimi.current) satirSecimi.current = null; }, [secIs]);
  const kaydirBekleyen = useRef<string | null>(null);
  useEffect(() => { const id = kaydirBekleyen.current; if (id !== null && cubugaKaydir(id)) kaydirBekleyen.current = null; });
  const panoOge = useRef<{ el: HTMLElement; id: string } | null>(null), panoYeni = useRef(panoYerlestir);
  panoYeni.current = panoYerlestir;
  useEffect(() => {
    const k = kap.current;
    if (!k || secIs === null) return undefined;
    let kare = 0, bosta = 0;
    // Kaydırma sürerken pano yan değiştirmez (sabit); kaydırma durunca (150 ms) yer normal kurallarla yeniden değerlendirilir.
    const yeni = (): void => {
      cancelAnimationFrame(kare); clearTimeout(bosta);
      kare = requestAnimationFrame(() => { if (panoOge.current) panoYeni.current(panoOge.current.el, panoOge.current.id, true); });
      bosta = window.setTimeout(() => { if (panoOge.current) panoYeni.current(panoOge.current.el, panoOge.current.id); }, 150);
    };
    k.addEventListener('scroll', yeni, { passive: true });
    window.addEventListener('scroll', yeni, { capture: true, passive: true });
    window.addEventListener('resize', yeni);
    return () => { cancelAnimationFrame(kare); clearTimeout(bosta); k.removeEventListener('scroll', yeni); window.removeEventListener('scroll', yeni, { capture: true }); window.removeEventListener('resize', yeni); };
  }, [secIs]);
  const gelenYazisi = (l: readonly Degisiklik[]): string => l.map((d) => `${BASLIK_ADI[d.baslik]}: ${d.ne}`).join(' · ');

  const hucreli = hucreKipi(goz, olcek, px) && !isi;
  const hucreGunleri = useMemo(() => {
    if (!hucreli) return null;
    const gec = new Set(m.emirler.filter((e) => e.durum === 'gec').map((e) => e.id));
    return new Map(m.tezgahlar.filter((t) => !t.fason).map((t) => [t.id, tezgahGunleri(cx, m, t.id, gec)]));
  }, [hucreli, cx, m]);
  const hucreSecili = o.hucreSecili ?? null, hucreAc = o.hucreAc ?? null;
  // Arayüz 3c Z3: hücre ağı tek Tab durağıdır (gezici tabIndex); oklar gün ve tezgâh arasında, Home/End satırın başı ve sonu.
  const [hucreOdak, setHucreOdak] = useState<string | null>(null);
  const hucreDurak = (sira: readonly string[]): string | null => {
    const gecerli = (k: string | null): k is string => {
      if (k === null) return false;
      const [id, g] = k.split('|');
      const x = hucreGunleri?.get(id ?? '')?.[Number(g)];
      return sira.includes(id ?? '') && x !== undefined && hucreEtkin(x);
    };
    if (gecerli(hucreOdak)) return hucreOdak;
    const sec = hucreSecili ? `${hucreSecili.tezgah}|${String(Math.round((hucreSecili.a - m.bas) / 24))}` : null;
    if (gecerli(sec)) return sec;
    for (const id of sira) { const i = (hucreGunleri?.get(id) ?? []).findIndex(hucreEtkin); if (i >= 0) return `${id}|${String(i)}`; }
    return null;
  };
  const hucreGez = (ev: TusOlayi<HTMLButtonElement>, sira: readonly string[], id: string, gun: number) => {
    const gunler = (t: string) => hucreGunleri?.get(t) ?? [];
    const yakin = (t: string, h: number): number => {
      const l = gunler(t); let en = -1;
      l.forEach((x, i) => { if (hucreEtkin(x) && (en < 0 || Math.abs(i - h) < Math.abs(en - h))) en = i; });
      return en;
    };
    const ara = (t: string, bas: number, adim: number): number => { const l = gunler(t); for (let i = bas; i >= 0 && i < l.length; i += adim) if (hucreEtkin(l[i]!)) return i; return -1; };
    let hedef: [string, number] | null = null;
    const r = sira.indexOf(id);
    if (ev.key === 'ArrowRight') { const i = ara(id, gun + 1, 1); if (i >= 0) hedef = [id, i]; }
    else if (ev.key === 'ArrowLeft') { const i = ara(id, gun - 1, -1); if (i >= 0) hedef = [id, i]; }
    else if (ev.key === 'Home') { const i = ara(id, 0, 1); if (i >= 0) hedef = [id, i]; }
    else if (ev.key === 'End') { const i = ara(id, gunler(id).length - 1, -1); if (i >= 0) hedef = [id, i]; }
    else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      const adim = ev.key === 'ArrowDown' ? 1 : -1;
      for (let j = r + adim; j >= 0 && j < sira.length; j += adim) { const t = sira[j]!, i = yakin(t, gun); if (i >= 0) { hedef = [t, i]; break; } }
    } else return;
    ev.preventDefault(); ev.stopPropagation();
    if (!hedef) return;
    const k = `${hedef[0]}|${String(hedef[1])}`;
    setHucreOdak(k);
    const kok = ev.currentTarget.closest('.tc-pyq-tahta') ?? document;
    [...kok.querySelectorAll<HTMLElement>('[data-hucre]')].find((el) => el.dataset.hucre === k)?.focus();
  };
  const gunHucreleri = (r: { kimlik: string; bas: string }, sira: readonly string[], durak: string | null) => (hucreGunleri?.get(r.kimlik) ?? []).map((g) => {
    const ad = hucreAdi(r.bas, zaman(g.a).slice(0, 5), g), secili = hucreSecili?.tezgah === r.kimlik && hucreSecili.a === g.a;
    const dar = 24 * px < HUCRE_SAYI_EN, ince = 24 * px < HUCRE_ROZET_EN, k = `${r.kimlik}|${String(g.gun)}`;
    return (
      <button
        type="button" key={g.gun} className="tc-pyq-hucre tc-pyq-gunhucre" data-hucre={k} data-yuk={yukSinifi(g)} title={ad} aria-label={ad}
        data-durus={g.duruslar.length === 0 ? undefined : g.duruslar.some((d) => !d.ariza) ? 'plan' : 'ariza'} data-secili={secili ? '' : undefined}
        aria-expanded={hucreAc ? secili : undefined} aria-controls={hucreAc && secili ? 'tc-pyq-hpanel' : undefined} disabled={!hucreEtkin(g)} tabIndex={k === durak ? 0 : -1}
        ref={(el) => { yerYaz(el, (g.a - m.bas) * px + 1, 24 * px - 2); }} onClick={(ev) => { setHucreOdak(k); hucreAc?.(r.kimlik, g.a, ev.currentTarget); }}
        onFocus={() => { if (hucreOdak !== k) setHucreOdak(k); }} onKeyDown={(ev) => { hucreGez(ev, sira, r.kimlik, g.gun); }}
      >
        <i ref={(el) => { el?.style.setProperty('--oran', String(Math.min(1, (g.yuzde ?? 0) / 100))); }} />
        {!dar && g.yuzde !== null && <span className="tc-pyq-gunhucre-sayi" aria-hidden="true">{g.yuzde}</span>}
        {g.gec > 0 && <small className="tc-pyq-gunhucre-gec" data-ince={ince ? '' : undefined} aria-hidden="true">{ince ? null : g.gec}</small>}
      </button>
    );
  });
  // Görünen aralık: kaydırma sol kenarı bas saatidir (yapışık ad sütunu hariç; açılıştaki kaydırmayla aynı hesap).
  const pencereDeposu = o.pencereDeposu ?? null;
  const bildirSira = useRef(0);
  const pencereyiBildir = useCallback((): void => {
    const k = kap.current; if (!k || !pencereDeposu) return;
    cancelAnimationFrame(bildirSira.current);
    bildirSira.current = requestAnimationFrame(() => {
      const ad = k.querySelector<HTMLElement>('.tc-pyq-bas')?.offsetWidth ?? 0, S = m.bas + k.scrollLeft / px;
      pencereDeposu.yaz(S, S + Math.max(0, k.clientWidth - ad) / px);
    });
  }, [pencereDeposu, m.bas, px]);
  useEffect(() => {
    pencereyiBildir();
    const k = kap.current;
    if (!k || !pencereDeposu) return undefined;
    // Şerit tahtayı doğrudan kaydırır (durum yok, Kokpit yeniden çizilmez); kaydırma olayı pencereyi geri bildirir.
    pencereDeposu.kaydiriciKur((S) => {
      const left = Math.max(0, (S - m.bas) * px);
      if (typeof k.scrollTo === 'function') k.scrollTo({ left }); else k.scrollLeft = left;
    });
    const izleyen = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { pencereyiBildir(); });
    izleyen?.observe(k);
    return () => { izleyen?.disconnect(); cancelAnimationFrame(bildirSira.current); pencereDeposu.kaydiriciKur(null); };
  }, [pencereyiBildir, pencereDeposu, olcek, m.bas, px]);
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

  // Hook erken dönüşten (Yıl ölçeği) önce durur; sonra olursa ölçek değişince sayfa çöker.
  // Kümeye basınca küme düğmesi kalkar; odak aralığın ilk işine geçer (klavye kullanıcısı sayfa başına düşmesin).
  const kumedenOdak = useRef<string | null>(null);
  useEffect(() => {
    const id = kumedenOdak.current;
    if (!id) return;
    const el = kap.current?.querySelector<HTMLButtonElement>(`[data-is="${tirnakIci(id)}"]`);
    if (el) { kumedenOdak.current = null; el.focus({ preventScroll: true }); }
  });
  // Tezgâhın kapalı saatleri (açık pencerelerin tümleyeni) taralı çizilir; penceresi bilinmeyen tezgâh ve fason satırı çizilmez.
  const kapali = useMemo(() => {
    const k = new Map<string, [number, number][]>();
    if (goz !== 'T' || uzak) return k;
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
    const k = new Map<string, { oran: number; yuzde: number; sinif: string | undefined; yazi: string }>();
    if (goz !== 'T' || olcek === 'Y') return k;
    const isler = Object.values(m.isler);
    for (const t of m.tezgahlar) {
      if (t.fason) continue;
      const y = aralikYuku(cx, isler, t.id, m.bas, m.bas + 7 * 24), yuzde = yukYuzdesi(y);
      if (yuzde !== null) k.set(t.id, { oran: Math.min(1, yuzde / 100), yuzde, sinif: yukSinifi(y), yazi: ` · 7 günde %${String(yuzde)} dolu` });
    }
    return k;
  }, [m, cx, goz, olcek]);
  const gunSayisi = Math.round((m.son - m.bas) / 24);
  // Saat çizgileri yalnız yazısı sığan ölçekte: Gün'de dört saatte bir, 3 gün'de sekiz saatte bir.
  const saatAdimi = uzak ? 0 : px * 4 >= SAAT_YAZISI ? 4 : px * 8 >= SAAT_YAZISI ? 8 : 0;
  const gunler = Array.from({ length: gunSayisi }, (_, g) => g);
  const eksen = (
    <div className="tc-pyq-satir tc-pyq-eksen" data-saatli={saatAdimi > 0 ? '' : undefined}>
      {tabloKipi && tablo
        ? (
          <div className="tc-pyq-bas" data-tablo="">
            <div className="tc-pyq-tablo-satir" role="row" id={`${tabloKimligi}-b`}>
              {kolonlar.map((k) => <div key={k.id} className="tc-pyq-h" role="columnheader" data-sutun={k.id} data-sayi={k.sayi ? '' : undefined}>{kad === 'siparis' && k.id === 'emir' ? 'Sipariş' : kad === 'siparis' && k.id === 'urun' ? 'Emirler' : kad === 'siparis' && k.id === 'fark' ? 'En kötü fark' : k.ad}</div>)}
            </div>
            <Ayrac tablo={tablo} erisilir deger={Math.round(tablo.en ?? dogalEn)} />
          </div>
        )
        : <div className="tc-pyq-bas">{goz === 'T' || isi ? 'Tezgâh' : kad === 'siparis' ? 'Sipariş' : 'Emir'}</div>}
      <div className="tc-pyq-alan" role={tabloKipi ? 'presentation' : undefined}>
        {gunler.filter((g) => !uzak || g % 7 === 0).map((g) => (
          <button
            type="button" key={g} className="tc-pyq-gun" ref={(el) => { yerYaz(el, g * 24 * px, (uzak ? 7 : 1) * 24 * px); }}
            title="Bu güne yakınlaş" onDoubleClick={() => { gunAc(g); }} onClick={() => { if (uzak) gunAc(g); }}
          >{zaman(m.bas + g * 24).slice(0, olcek === 'G' || olcek === '3' ? 9 : 5)}</button>
        ))}
        {saatAdimi > 0 && gunler.flatMap((g) => SAATLER.filter((h) => h % saatAdimi === 0).map((h) => (
          <span className="tc-pyq-saat" key={`${String(g)}.${String(h)}`} ref={(el) => { yerYaz(el, (g * 24 + h) * px); }}>{String(h).padStart(2, '0')}</span>
        )))}
        <span className="tc-pyq-simdi-et" ref={(el) => { yerYaz(el, (m.simdi - m.bas) * px); }}>Şimdi {zaman(m.simdi).slice(-5)}</span>
        {ufuk !== null && <span className="tc-pyq-ufuk-et" data-ufuk="" ref={(el) => { yerYaz(el, (ufuk - m.bas) * px); }}>{ufukYazisi(zaman, ufuk)}</span>}
      </div>
    </div>
  );

  // T7: Ay'da satırlar emir ve tezgâh satırıdır, işler gün boyu ince çubuklar; yük hücreleri yalnız Yıl'da kalır.
  if (isi) {
    const adim = 7, isler = Object.values(m.isler);
    const hucreler = gunler.filter((g) => g % adim === 0);
    return (
      <div className="tc-pyq-tahta" data-olcek={olcek} ref={kap} onScroll={pencereyiBildir}>
        <div className="tc-pyq-ic" ref={(el) => { el?.style.setProperty('--en', `${String(en)}px`); }}>
          {eksen}
          {m.tezgahlar.map((t) => (
            <div className="tc-pyq-satir" key={t.id} data-satir={t.id}>
              <div className="tc-pyq-bas"><b>{t.kod}</b><small>{t.ad}</small></div>
              <div className="tc-pyq-alan">
                {ufukDisi}
                {t.fason ? <span className="tc-pyq-not">fason · dış atölye, kapasite izlenmez</span> : hucreler.map((g) => {
                  const y = aralikYuku(cx, isler, t.id, m.bas + g * 24, m.bas + (g + adim) * 24), yuzde = yukYuzdesi(y);
                  const a = m.bas + g * 24, b = a + adim * 24;
                  const gelenSay = gelen ? isler.filter((x) => x.m === t.id && x.S < b && x.C > a && gelen.isler.has(x.id)).length : 0;
                  const ad = `${t.kod} · ${zaman(m.bas + g * 24).slice(0, 9)}${adim > 1 ? ' haftası' : ''} · ${yuzde === null ? 'kapalı' : `%${String(yuzde)} dolu (${String(Math.round(y.plan))} / ${String(Math.round(y.acik))} sa)`}${gelenSay > 0 ? ` · ${String(gelenSay)} işe değişiklik geldi` : ''}`;
                  return (
                    <button
                      type="button" key={g} className="tc-pyq-hucre" data-yuk={yukSinifi(y)} disabled={yuzde === null} title={ad} aria-label={ad}
                      ref={(el) => { yerYaz(el, g * 24 * px + 1, adim * 24 * px - 2); }} onClick={() => { gunAc(g); }}
                    ><i ref={(el) => { el?.style.setProperty('--oran', String(Math.min(1, yuzde === null ? 0 : yuzde / 100))); }} />{gelenSay > 0 && <small className="tc-pyq-hucre-gelen" data-hucre-gelen="">{gelenSay}</small>}</button>
                  );
                })}
              </div>
            </div>
          ))}
          {ufukCizgi}
        </div>
      </div>
    );
  }

  const tezgahKodu = new Map(m.tezgahlar.map((t) => [t.id, t.kod]));
  // emirKaydi: emir ve adım satırının emri; adimSira: adım satırının rotadaki sırası; ara: açık emrin adım sütun başlığı (3533).
  type Satir = { kimlik: string; bas: string; alt: string; isler: KokpitIsi[]; durum?: string; tam?: string; termin?: number | null; durus?: string; agacEmir?: string; acik?: boolean; adim?: true; ozet?: [number, number]; notlar?: readonly string[]; emirKaydi?: KokpitEmri; adimSira?: number; paylar?: readonly KokpitIsi[]; payAlt?: true; ara?: true; siparis?: SiparisGrubu; spOzet?: SiparisOzeti; emirCubugu?: true };
  const agac = goz !== 'T' ? o.agac ?? null : null;
  const satirlar0: Satir[] = goz === 'T'
    ? m.tezgahlar.map((t) => ({ kimlik: t.id, bas: t.kod, alt: t.ad, ...(suAndakiDurus(m, t.id) ? { durus: durusYazisi(suAndakiDurus(m, t.id)!, zaman) } : {}), isler: Object.values(m.isler).filter((x) => satirKimligi(x) === t.id) }))
    : kad === 'siparis' ? (o.siparisler ?? []).map((g): Satir => {
      const oz = siparisOzeti(g.emirler, m.isler);
      return { kimlik: `sp:${g.kok}`, bas: g.no, alt: siparisCubukYazisi(g.emirler.length, oz), tam: g.no, termin: g.termin, isler: [], durum: oz.durum, siparis: g, spOzet: oz };
    })
    : emirler.filter((e) => agac !== null || e.durum !== 'plansiz').map((e) => ({ kimlik: e.id, bas: `${emirKuyrugu(e.no)} · ${e.urun}`, alt: `${String(e.adet)} adet · ${durumYazisi(e)}`, tam: e.no, termin: e.termin, isler: e.adimlar.flatMap((a) => adimPaylari(m, a.id)), durum: e.durum, emirKaydi: e }));
  // Ağaçta açık emrin çubukları adım satırlarına iner; emrin satırında ilk başlangıçtan son bitişe özet çubuğu kalır.
  const satirlar: Satir[] = agac === null ? (kad === 'emir' ? satirlar0.map((r) => ({ ...r, emirCubugu: true as const })) : satirlar0) : satirlar0.flatMap((r): Satir[] => {
    const e = emir.get(r.kimlik);
    if (!e) return [r];
    const acik = agac.acik.has(e.id);
    const ana: Satir = { ...r, agacEmir: e.id, acik, ...(kad === 'emir' && !acik ? { emirCubugu: true as const } : {}) };
    if (!acik) return [ana];
    const yer = r.isler.map((x) => once?.[x.id] ?? x);
    const ozet: [number, number] | undefined = yer.length > 0 ? [Math.min(...yer.map((x) => x.S)), Math.max(...yer.map((x) => x.C))] : undefined;
    const notlar = agac.notlar?.(e) ?? [];
    return [{ ...ana, isler: [], ...(ozet ? { ozet } : {}) }, ...(notlar.length ? [{ kimlik: `${e.id}>not`, bas: '', alt: '', isler: [], notlar }] : []), ...(tabloKipi ? [{ kimlik: `${e.id}>ust`, bas: '', alt: '', isler: [], ara: true as const, emirKaydi: e }] : []), ...e.adimlar.flatMap((a, i): Satir[] => {
      const x = m.isler[a.id], l = adimPaylari(m, a.id), bolunmus = l.length > 1;
      // Bölünmüş adım tek satırdır (ilk başlangıç, son bitiş, toplam adet); payları açınca her pay kendi satırında çizilir (3681 A).
      const ana: Satir = { kimlik: `${e.id}>${a.id}`, bas: agacAdimBasligi(i, a), alt: x ? `${bolunmus ? `${String(l.length)} pay` : x.fason ? 'Fason' : tezgahKodu.get(x.m) ?? x.m} · ${zaman(Math.min(...l.map((y) => y.S))).slice(6)}` : 'planda yeri yok', isler: x ? l : [], adim: true, emirKaydi: e, adimSira: i, ...(bolunmus ? { paylar: l, ozet: [Math.min(...l.map((y) => y.S)), Math.max(...l.map((y) => y.C))] as [number, number] } : {}), ...(r.durum ? { durum: r.durum } : {}) };
      return bolunmus && acikPay.has(a.id) ? [ana, ...l.map((y): Satir => ({ kimlik: `${e.id}>${y.id}`, bas: `Pay ${payYazisi(y, true) ?? ''}`, alt: tezgahKodu.get(y.m) ?? y.m, isler: [y], adim: true, payAlt: true, emirKaydi: e, adimSira: i, ...(r.durum ? { durum: r.durum } : {}) }))] : [ana];
    })];
  });
  const hucreSirasi = hucreGunleri ? satirlar.filter((r) => hucreGunleri.has(r.kimlik)).map((r) => r.kimlik) : [];
  const hucreDurakAnahtari = hucreGunleri ? hucreDurak(hucreSirasi) : null;
  // Tek çubuklu satır (sipariş ve emir kademesi, adım, özet, ara başlık, gün hücreleri) adımların şerit sayısıyla uzamaz.
  const tekSeritli = (r: Satir): boolean => Boolean(r.adim || r.ozet || r.ara || r.siparis || r.emirCubugu || hucreGunleri?.has(r.kimlik));
  const plansiz = agac !== null ? [] : emirler.filter((e) => e.durum === 'plansiz');
  const cubuklar = once ? [] : malzemeCubuklari(o.malzeme, { simdi: m.simdi, bas: m.bas, emirler }, zaman);
  const tasinanIs = tasinan ? m.isler[tasinan.id] : undefined;
  const oneriIsi = oneri ? m.isler[oneri.isId] : undefined;
  const adaySatirlari = goz !== 'T' ? null : tasinan?.fis !== undefined ? new Set(fisAdaylari(tasinan.fis)) : tasinanIs ? new Set(adaylar(tasinanIs)) : yerlestirme ? new Set(yerlestirme.tezgahlar) : null;
  const secili = secEmir ? emir.get(secEmir) : undefined;

  const aktifPay = tiklananPay !== null && secIs !== null && tiklananPay.split('~')[0] === secIs ? tiklananPay : secIs;
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
    // 3532: güncellemeden önceki yerine göre kayma (iş yeni yerindedir; eski yeri satırda hayalettir).
    const eski = eskiYer?.[x.id], gKayma = eski ? x.S - eski.S : 0, gKaydi = eski !== undefined && (Math.abs(gKayma) > 0.01 || eski.m !== x.m);
    const gelenler = gelen?.isler.get(x.id), gelenTur = gelenler?.[0]?.baslik;
    // T5: çubuk yazısının yeri. Değişiklik işareti çubuğun sağındadır; işaretli çubuğun yazısı dışarı çıkmaz.
    const kod = goz === 'T' ? emirKuyrugu(e?.no ?? x.job) : tezgahKodu.get(x.m) ?? x.m;
    const ek = itilen !== undefined ? `${gecikir ? 'gecikir · ' : ''}${itilen > 0 ? '+' : '−'}${sureYaz(itilen)}` : gKaydi ? (Math.abs(gKayma) > 0.01 ? `${gKayma > 0 ? '+' : '−'}${sureYaz(gKayma)}` : 'yeni tezgâh') : canli && Math.abs(kayma) > 0.25 ? `${kayma > 0 ? '+' : '−'}${sureYaz(kayma)}` : kisa ? sureYaz(C - S) : x.pay ? `${x.ad} · ${payYazisi(x, (cizim?.en ?? gercek) < PAY_DAR_EN) ?? ''}${(cizim?.en ?? gercek) >= PAY_DAR_EN && payIlerlemeYazisi(x) ? ` · sayılan ${payIlerlemeYazisi(x) ?? ''}` : ''}` : goz === 'T' ? e?.urun ?? x.ad : x.ad;
    const cizEn = Math.max(6, cizim?.en ?? gercek), sag = gelenler ? 0 : tek ? en - ((cizS - m.bas) * px + cizEn) : cizim?.sag ?? 0;
    const etiket: EtiketYeri = etiketYeri(o.satirBoyu === 'siki' ? 0 : cizEn, sag, kod, ek);
    const ad = `${e?.no ?? x.job} · ${x.ad} · ${zaman(x.S)} – ${zaman(x.C).slice(-5)}${e ? ` · ${durumYazisi(e)}` : ''}${x.basladi && !x.bitti && tasi ? ' · sürüyor, taşınırsa durdurulur' : ''}${x.durdurmaBekliyor ? ` · ${DURDURMA_BEKLIYOR}` : ''}${x.pay ? ` · pay ${payYazisi(x) ?? ''}${payIlerlemeYazisi(x) ? ` · sayılan ${payIlerlemeYazisi(x) ?? ''}` : ''} · ${payNedeni(x) ?? ''}` : ''}`;
    return (
      <Fragment key={x.id}>
      <button
        type="button" className="tc-pyq-is" data-is={x.id} data-d={e?.durum ?? 'iyi'} title={ad} aria-label={ad}
        aria-pressed={secIs === adimKimligi(x) && (x.pay === undefined || aktifPay === x.id)} data-pay={x.pay ? String(x.pay.no) : undefined} data-pay-kardes={x.pay && secIs === adimKimligi(x) && aktifPay !== x.id ? '' : undefined} data-suruyor={x.basladi ? '' : undefined} data-emir-secili={secEmir === x.job ? '' : undefined} data-yanan={yanan?.has(x.job) ? '' : undefined} data-sonuk={uyar(x.job) && (!yanan || yanan.has(x.job)) ? undefined : ''}
        data-sabit={neden && !x.pay ? '' : undefined} data-durdurma-bekliyor={x.durdurmaBekliyor ? '' : undefined} data-tasinan={tasinan?.id === x.id ? '' : undefined} data-kaydi={(canli && Math.abs(kayma) > 0.25) || itilen !== undefined || gKaydi ? '' : undefined}
        data-kisa={kisa ? '' : undefined} data-gecikir={gecikir ? '' : undefined} data-etiket={etiket}
        ref={(el) => {
          yerYaz(el, (cizS - m.bas) * px, cizim?.en ?? gercek);
          el?.style.setProperty('--serit', String(tek ? 0 : cizim?.serit ?? 0));
          if (kisa) el?.style.setProperty('--gercek', `${String(Math.max(2, Math.round(gercek)))}px`);
        }}
        onPointerDown={(ev) => {
          if (ev.button > 0 || ev.pointerType === 'touch' || !tasi || tasinan || uzak) return;
          basilan.current = { id: x.id, x: ev.clientX, y: ev.clientY, tut: (ev.clientX - ev.currentTarget.getBoundingClientRect().left) / px };
        }}
        data-coklu={coklu.has(x.id) ? '' : undefined}
        onClick={(ev) => {
          if (tasinan) return;
          if (cokluSec && (ev.ctrlKey || ev.metaKey || ev.shiftKey)) { cokluSec(adimKimligi(x)); return; }
          setTiklananPay(x.id);
          sec(x.job, adimKimligi(x));
        }}
        onDoubleClick={(ev) => { ev.preventDefault(); tut(x.id, (ev.clientX - ev.currentTarget.getBoundingClientRect().left) / px); }}
        onContextMenu={(ev: FareOlayi<HTMLButtonElement>) => {
          if (!tasi || tasinan) return;
          ev.preventDefault();
          if (uzak) { uyari(YAKINLASIN); return; }
          const k = kap.current?.getBoundingClientRect();
          setMenu({ id: x.id, x: ev.clientX - (k?.left ?? 0) + (kap.current?.scrollLeft ?? 0), y: ev.clientY - (k?.top ?? 0) + (kap.current?.scrollTop ?? 0), tut: (ev.clientX - ev.currentTarget.getBoundingClientRect().left) / px });
        }}
        onPointerEnter={() => { imlecteki.current = x.id; if (okKipi !== 'yok' || eskiYer) setUstteki(x.id); }}
        onPointerLeave={() => { if (imlecteki.current === x.id) imlecteki.current = null; setUstteki((u) => (u === x.id ? null : u)); }}
      >
        {x.kilitli && <Simge ad="lock" boyut="k" />}
        {x.pay && <span className="tc-pyq-pay-simge" data-pay-simge=""><Simge ad="layers" boyut="k" /></span>}
        <b>{kod}</b>
        <span>{ek}</span>
        {(x.basladi || x.pay?.sayilan !== undefined) && <i className="tc-pyq-ilerleme" data-pay-ilerleme={x.pay?.sayilan !== undefined ? '' : undefined} ref={(el) => { el?.style.setProperty('--oran', String(Math.min(1, Math.max(0, x.pay?.sayilan !== undefined ? x.pay.sayilan / Math.max(1, x.pay.adet) : (m.simdi - S) / Math.max(0.01, C - S))))); }} />}
      </button>
      {etiket === 'dis' && (
        <span className="tc-pyq-is-etiket" aria-hidden="true" data-etiket-is={x.id} ref={(el) => { yerYaz(el, (cizS - m.bas) * px + cizEn); el?.style.setProperty('--serit', String(tek ? 0 : cizim?.serit ?? 0)); }}><b>{kod}</b> <span>{ek}</span></span>
      )}
      {gelenler && gelenTur && (
        <button
          type="button" className="tc-pyq-gelen" data-gelen-is={x.id} data-tur={gelenTur} aria-expanded={balon?.id === x.id}
          aria-label={`${emirKuyrugu(e?.no ?? x.job)}: ${gelenYazisi(gelenler)}`}
          ref={(el) => { yerYaz(el, (cizS - m.bas) * px + (cizim?.en ?? gercek)); el?.style.setProperty('--serit', String(tek ? 0 : cizim?.serit ?? 0)); }}
          onClick={(ev) => { if (tasinan) return; balonAc(x.id, ev.currentTarget); gelenBas?.(x.id); }}
        ><Simge ad={GELEN_SIMGESI[gelenTur]} boyut="k" />{gelenler.length > 1 && <small>{gelenler.length}</small>}</button>
      )}
      </Fragment>
    );
  };
  // Dilim 3 (E): sipariş ya da emir kademesinin tek çubuğu. Sipariş: ilk başlangıçtan son bitişe, en kötü emir rengi, içinde emir ve durum sayısı.
  // Emir: adımlarının birleşik aralığı, biten adım dolgusu ve "biten/toplam adım". Basınca bir alt kademeye o aralıkla iner.
  const kademeCubugu = (r: Satir) => {
    const g = r.siparis, e = r.emirKaydi;
    const aralik = g ? r.spOzet?.aralik ?? null : e ? emirAraligi(e, m.isler) : null;
    if (!aralik) return r.siparis ? <span className="tc-pyq-agac-bos" data-agac-bos>planda yeri yok</span> : null;
    const sayim = bitenAdim(g ? g.emirler : e ? [e] : [], m.isler);
    const kod = g ? g.no : emirKuyrugu(e?.no ?? r.kimlik), ek = g ? r.alt : sayim ? `${String(sayim.biten)}/${String(sayim.toplam)} adım` : '';
    const x = (aralik.S - m.bas) * px, w = Math.max(6, (aralik.C - aralik.S) * px);
    const etiket = etiketYeri(o.satirBoyu === 'siki' ? 0 : w, en - (x + w), kod, ek);
    const tur = g ? 'siparis' as const : 'emir' as const, id = g ? g.kok : e?.id ?? r.kimlik;
    const ad = `${g ? `Sipariş ${g.no}` : e?.no ?? ''} · ${zaman(aralik.S)} – ${zaman(aralik.C)} · ${g ? r.alt : e ? durumYazisi(e) : ''}${sayim ? ` · ${String(sayim.biten)}/${String(sayim.toplam)} adım bitti` : ''}${o.kademeIn ? ` · basınca ${g ? 'emirlerine' : 'adımlarına'} iner` : ''}`;
    return (
      <Fragment key={`kademe-${id}`}>
        <button
          type="button" className="tc-pyq-is tc-pyq-kademe" data-kademe={tur} data-kademe-id={id} data-d={r.durum ?? 'iyi'} data-etiket={etiket} title={ad} aria-label={ad}
          data-secili={!g && secEmir === id ? '' : undefined} aria-current={!g && secEmir === id ? true : undefined} data-sonuk={g ? (g.emirler.some((y) => uyar(y.id)) ? undefined : '') : uyar(id) ? undefined : ''}
          ref={(el) => { yerYaz(el, x, w); el?.style.setProperty('--serit', '0'); }}
          onClick={() => { if (!tasinan) o.kademeIn?.(tur, id, aralik.S, aralik.C); }}
        >
          <b>{kod}</b><span>{ek}</span>
          {sayim && sayim.biten > 0 && <i className="tc-pyq-ilerleme" ref={(el) => { el?.style.setProperty('--oran', String(sayim.biten / sayim.toplam)); }} />}
        </button>
        {etiket === 'dis' && <span className="tc-pyq-is-etiket" aria-hidden="true" ref={(el) => { yerYaz(el, x + w); el?.style.setProperty('--serit', '0'); }}><b>{kod}</b> <span>{ek}</span></span>}
      </Fragment>
    );
  };
  const siparisHucresi = (r: Satir, id: SutunKimligi): ReactNode => {
    const g = r.siparis, oz = r.spOzet;
    if (!g || !oz) return null;
    switch (id) {
      case 'emir': return o.kademeIn && oz.aralik
        ? <button type="button" className="tc-pyq-agac-ac" data-siparis={g.kok} aria-label={`Sipariş ${g.no}: emirlerine in`} title={`Sipariş ${g.no} · ${r.alt} · emirlerine iner`} onClick={() => { if (oz.aralik) o.kademeIn?.('siparis', g.kok, oz.aralik.S, oz.aralik.C); }}><Simge ad="zin" boyut="k" /><b>{emirKuyrugu(g.no)}</b></button>
        : <b title={g.no}>{emirKuyrugu(g.no)}</b>;
      case 'urun': return <span title={r.alt}>{r.alt}</span>;
      case 'adet': { const t = g.emirler.reduce((a, e) => a + e.adet, 0); return <span className="tc-pyq-h-veri" title="Emirlerin toplam adedi">{t}</span>; }
      case 'termin': return g.termin === null ? <Bos ad="Termin yok" /> : <span className="tc-pyq-h-veri" title={`En erken termin ${zaman(g.termin)}`}>{tarihSaat(zaman, g.termin)}</span>;
      case 'bitis': return oz.bitis === null ? <Bos ad="Plan bitişi yok" /> : <span className="tc-pyq-h-veri" title={`Son plan bitişi ${zaman(oz.bitis)}`}>{tarihSaat(zaman, oz.bitis)}</span>;
      case 'fark': return <FarkRozeti f={farkOlustur({ gecikme: oz.gecikme })} ipucu="En çok gecikecek emrin farkı" kisa={o.satirBoyu === 'siki'} />;
      case 'ilerleme': { const s = bitenAdim(g.emirler, m.isler); return s ? <Halka i={{ biten: s.biten, toplam: s.toplam, oran: s.biten / s.toplam, tam: s.biten === s.toplam }} /> : null; }
    }
  };
  // T3: "N iş" kümesi. Rengi en kötü emir durumu; seçili ya da yanan iş içindeyse öyle görünür. Basınca o aralık Gün ölçeğinde açılır (taşıma orada).
  const DURUM_AGIRLIGI: Readonly<Record<string, number>> = { gec: 3, risk: 2, plansiz: 1, iyi: 0 };
  const kumeDugmesi = (id: string) => {
    const k = yerlesim.kumeler.get(id);
    if (!k) return null;
    const l = k.idler.map((y) => m.isler[y]).filter((x) => x !== undefined);
    const d = l.map((x) => emir.get(x.job)?.durum ?? 'iyi').reduce((a, b) => ((DURUM_AGIRLIGI[b] ?? 0) > (DURUM_AGIRLIGI[a] ?? 0) ? b : a), 'iyi');
    const yazi = kumeYazisi(k.idler.length), etiket = etiketYeri(o.satirBoyu === 'siki' ? 0 : k.en, k.sag, yazi, '');
    const ad = `${yazi} · ${zaman(k.S)} – ${zaman(k.C)} · ${[...new Set(l.map((x) => emirKuyrugu(emir.get(x.job)?.no ?? x.job)))].join(', ')}${o.kumeAc ? ' · basınca yakınlaşır' : ''}`;
    return (
      <Fragment key={`kume-${id}`}>
        <button
          type="button" className="tc-pyq-is tc-pyq-kume" data-kume={id} data-d={d} data-etiket={etiket} title={ad} aria-label={ad}
          data-secili={secIs !== null && k.idler.includes(secIs) ? '' : undefined} aria-current={secIs !== null && k.idler.includes(secIs) ? true : undefined} data-yanan={yanan && l.some((x) => yanan.has(x.job)) ? '' : undefined}
          data-sonuk={l.some((x) => uyar(x.job) && (!yanan || yanan.has(x.job))) ? undefined : ''}
          ref={(el) => { yerYaz(el, (k.S - m.bas) * px, k.en); el?.style.setProperty('--serit', String(k.serit)); }}
          onClick={() => { if (!tasinan && o.kumeAc) { kumedenOdak.current = k.idler[0] ?? null; o.kumeAc(k.S, k.C); } }}
        ><b>{yazi}</b></button>
        {etiket === 'dis' && <span className="tc-pyq-is-etiket" aria-hidden="true" ref={(el) => { yerYaz(el, (k.S - m.bas) * px + Math.max(6, k.en)); el?.style.setProperty('--serit', String(k.serit)); }}><b>{yazi}</b></span>}
      </Fragment>
    );
  };
  // 3533: tablo hücreleri. Veri yoksa "—" yazılır, sıfır uydurulmaz. Satıra basmak emri seçer (yanan, oklar) ve çubuğunu görünüme getirir.
  const tumIsler = Object.values(m.isler);
  const satirSec = (e: KokpitEmri): void => {
    if (tasinan || onay) return;
    sec(secEmir === e.id ? null : e.id, null);
    if (secEmir === e.id) return;
    const ilk = e.adimlar.map((a) => m.isler[a.id]).find((x) => x !== undefined);
    const cubuk = ilk ? kap.current?.querySelector<HTMLElement>(`[data-is="${tirnakIci(ilk.id)}"], [data-ozet="${tirnakIci(e.id)}"]`) : null;
    if (cubuk && typeof cubuk.scrollIntoView === 'function') cubuk.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  };
  const emirHucresi = (e: KokpitEmri, r: Satir, id: SutunKimligi): ReactNode => {
    switch (id) {
      case 'emir': return (
        <button
          type="button" className="tc-pyq-agac-ac" data-agac={e.id} aria-expanded={r.acik} aria-label={`${e.no} ${r.acik ? 'adımlarını gizle' : 'adımlarını aç'}`}
          title={`${e.no} · ${durumYazisi(e)} · ${r.acik ? 'adımları gizle' : 'adımları göster'}`} onClick={() => { agac?.ac(e.id); }}
        ><Simge ad="chev-right" boyut="k" /><EmirNo no={e.no} /></button>
      );
      case 'urun': return <span title={e.urun}>{e.urun}</span>;
      case 'adet': return <span className="tc-pyq-h-veri">{String(e.adet)}</span>;
      case 'termin': return e.termin === null ? <Bos ad="Termin yok" /> : <span className="tc-pyq-h-veri" title={`Termin ${zaman(e.termin)}`}>{tarihSaat(zaman, e.termin)}</span>;
      case 'bitis': return e.bitis === null ? <Bos ad="Plan bitişi yok" /> : <span className="tc-pyq-h-veri" title={`Plan bitişi ${zaman(e.bitis)}`}>{tarihSaat(zaman, e.bitis)}</span>;
      case 'fark': return <FarkRozeti f={farkOlustur(e)} ipucu={e.bitis !== null && e.termin !== null ? `${durumYazisi(e)} · plan bitişi ${zaman(e.bitis)} · termin ${zaman(e.termin)}` : durumYazisi(e)} kisa={o.satirBoyu === 'siki'} />;
      case 'ilerleme': { const i = ilerleme(e, m.isler); return i ? <Halka i={i} /> : null; }
    }
  };
  const adimHucresi = (r: Satir, id: SutunKimligi): ReactNode => {
    const e = r.emirKaydi, a = e && r.adimSira !== undefined ? e.adimlar[r.adimSira] : undefined, x = r.isler[0];
    if (!e || !a || r.adimSira === undefined) return null;
    // 3681: bölünmüş adımın satırı ilk başlangıcı, son bitişi ve toplam adedi yazar; pay satırı tek payı.
    const l = r.paylar ?? r.isler, S0 = l.length ? Math.min(...l.map((y) => y.S)) : 0, C0 = l.length ? Math.max(...l.map((y) => y.C)) : 0;
    switch (id) {
      case 'emir':
        if (r.payAlt && x) return <b title={`${agacAdimBasligi(r.adimSira, a)} · pay ${payYazisi(x) ?? ''} · ${payNedeni(x) ?? ''}`}><Simge ad="layers" boyut="k" /> {r.bas}</b>;
        return (
          <>
            {r.paylar && <button type="button" className="tc-pyq-pay-ac" data-pay-ac={a.id} aria-expanded={acikPay.has(a.id)} aria-label={`${agacAdimBasligi(r.adimSira, a)}: payları ${acikPay.has(a.id) ? 'gizle' : 'göster'}`} onClick={() => { setAcikPay((o) => { const y = new Set(o); if (!y.delete(a.id)) y.add(a.id); return y; }); }}><Simge ad="chev-right" boyut="k" /></button>}
            <b title={agacAdimBasligi(r.adimSira, a)}>{agacAdimBasligi(r.adimSira, a)}</b>
          </>
        );
      case 'urun': return x ? <span className="tc-pyq-h-veri">{r.paylar ? [...new Set(r.paylar.map((y) => tezgahKodu.get(y.m) ?? y.m))].join(' + ') : x.fason ? 'Fason' : tezgahKodu.get(x.m) ?? x.m}</span> : <Bos ad="Planda yeri yok" />;
      case 'termin': return x ? <span className="tc-pyq-h-veri" title={zaman(S0)}>{tarihSaat(zaman, S0)}</span> : null;
      case 'bitis': return x ? <span className="tc-pyq-h-veri">{sureYaz(C0 - S0)}</span> : null;
      case 'ilerleme': { const d: AdimDurumu | null = adimDurumu(x); return <span className="tc-pyq-durum" data-durum={d ?? 'yok'}><i aria-hidden="true" />{d ? ADIM_DURUMU_ADI[d] : 'Planda yok'}</span>; }
      case 'adet': {
        if (r.payAlt) return x?.pay ? <span className="tc-pyq-h-veri" data-pay-adet=""><b>{x.pay.adet} adet</b>{x.pay.sayilan !== undefined ? <small title={`sayılan ${payIlerlemeYazisi(x) ?? ''}`}>{`sayılan ${String(x.pay.sayilan)}`}</small> : null}</span> : null;
        if (!r.paylar) return null;
        const top = r.paylar.reduce((t, y) => t + (y.pay?.adet ?? 0), 0), say = r.paylar.map((y) => y.pay?.sayilan);
        return <span className="tc-pyq-h-veri" data-pay-adet=""><b>{top} adet</b>{say.some((q) => q !== undefined) ? <small>{`sayılan ${String(say.reduce<number>((t, q) => t + (q ?? 0), 0))}`}</small> : null}</span>;
      }
      case 'fark': return null;
    }
  };
  // 3681: seçili adımın payı başka satırdaysa satır başlığı "N pay aşağıda / yukarıda" yazar (tezgâh görünümü).
  const payNotu = (r: Satir): ReactNode => {
    if (goz !== 'T' || secIs === null) return null;
    const y = payYonleri(m, secIs, satirlar.map((q) => q.kimlik), r.kimlik);
    const yon = [y.yukari > 0 ? `${String(y.yukari)} pay yukarıda` : '', y.asagi > 0 ? `${String(y.asagi)} pay aşağıda` : ''].filter((q) => q !== '').join(' · ');
    if (yon === '' || !adimPaylari(m, secIs).some((q) => satirKimligi(q) === r.kimlik)) return null;
    const hedefler = y.satirlar.map((k) => tezgahKodu.get(k) ?? k).join(', ');
    return (
      <button type="button" className="tc-pyq-pay-not" data-pay-not={r.kimlik} title={`${yon}: ${hedefler}; basınca o satıra gider`} aria-label={`${yon}: ${hedefler}`}
        onClick={() => { const k = y.satirlar[0]; const el = k === undefined ? null : kap.current?.querySelector<HTMLElement>(`[data-satir="${tirnakIci(k)}"]`); if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}
      >{yon} · {hedefler}</button>
    );
  };
  const tezgahHucresi = (r: Satir, id: string): ReactNode => {
    const fason = fasonlar.has(r.kimlik);
    switch (id) {
      case 'tezgah': return (
        <>
          {sorunBildir && !fason
            ? <button type="button" className="tc-pyq-sorun" data-sorun-bildir={r.kimlik} aria-label={`${r.bas} için sorun bildir`} title={`${r.bas} · sorun bildir: arıza ya da bakım`} onClick={() => { sorunBildir(r.kimlik); }}><b>{r.bas}<Simge ad="wrench" boyut="k" /></b></button>
            : <b>{r.bas}</b>}
          {gelen?.satirlar.get(r.kimlik) && (
            <button
              type="button" className="tc-pyq-gelen tc-pyq-gelen-satir" data-gelen-satir={r.kimlik} data-tur="saha" aria-expanded={balon?.id === r.kimlik}
              aria-label={`${r.bas}: ${gelenYazisi(gelen.satirlar.get(r.kimlik)!)}`} onClick={(ev) => { if (!tasinan) balonAc(r.kimlik, ev.currentTarget, true); }}
            ><Simge ad={GELEN_SIMGESI.saha} boyut="k" /></button>
          )}
          {m.mesai?.[r.kimlik]?.length ? <i className="tc-pyq-mesai-isaret" title={ekMesaiYazisi(m.mesai[r.kimlik]!, zaman)}>+ ek mesai</i> : null}
          {payNotu(r)}
        </>
      );
      case 'ad': return r.alt ? <span title={r.alt}>{r.alt}</span> : null;
      // Yük: önümüzdeki yedi günde planlı saat / açık saat; açık saati olmayan (kapalı) tezgâhta ve fasonda hesaplanamaz.
      case 'yuk': { const y = yuk.get(r.kimlik); return y ? <span className="tc-pyq-yuk" title={`Önümüzdeki 7 günde planlı saat / açık saat${y.yazi}`}><i data-yuk={y.sinif} ref={(el) => { el?.style.setProperty('--oran', String(y.oran)); }} /><b>{`%${String(y.yuzde)}`}</b></span> : <Bos ad="Yük hesaplanamıyor" />; }
      case 'suan': {
        if (fason) return <span className="tc-pyq-durum" data-durum="yok">Dış atölye</span>;
        const d = suAn(tumIsler, r.kimlik, r.durus !== undefined);
        return <span className="tc-pyq-durum" data-durum={d} title={d === 'durus' ? r.durus : d === 'calisiyor' ? 'Plan kaydında şu an süren iş var' : 'Plan kaydında şu an süren iş yok'}><i aria-hidden="true" />{SU_AN_ADI[d]}</span>;
      }
      default: return null;
    }
  };
  // 3663 D1: açık emrin adım satırına basınca adım seçilir ve çubuğu görünüme gelir; seçili adıma yeniden basmak bırakır. Planda yeri olmayan adımın çubuğu yoktur, satır basılmaz.
  const adimSatiriSec = (r: Satir): void => {
    const x = r.isler[0], e = r.emirKaydi;
    if (tasinan || onay || !x || !e) return;
    if (secIs === adimKimligi(x)) { sec(null, null); return; }
    satirSecimi.current = adimKimligi(x);
    sec(e.id, adimKimligi(x));
    const a = r.adimSira !== undefined ? e.adimlar[r.adimSira] : undefined;
    if (r.paylar && a && !acikPay.has(a.id)) { kaydirBekleyen.current = x.id; setAcikPay((o) => new Set(o).add(a.id)); return; }
    cubugaKaydir(x.id);
  };
  const satirNo = new Map(satirlar.map((r, i) => [r.kimlik, i]));
  const tabloSatiri = (r: Satir): ReactNode => {
    if (!tablo) return null;
    const emirSatiri = goz === 'S' && r.emirKaydi !== undefined && !r.adim && !r.ara && !r.notlar;
    const adimSatiri = goz === 'S' && r.adim === true && r.emirKaydi !== undefined && r.isler.length > 0 && !r.ara && !r.notlar;
    const adimSecili = adimSatiri && secIs === adimKimligi(r.isler[0]!);
    return (
      <>
        <div
          className="tc-pyq-tablo-satir" role="row" id={satirNo.has(r.kimlik) ? `${tabloKimligi}-${String(satirNo.get(r.kimlik))}` : undefined} data-secilebilir={emirSatiri || adimSatiri ? '' : undefined} data-adim-satiri={adimSatiri ? r.isler[0]!.id : undefined}
          aria-selected={adimSatiri ? adimSecili : undefined} tabIndex={adimSatiri ? 0 : undefined} title={adimSatiri ? 'Adımı Gantt\'ta göster' : undefined}
          onClick={emirSatiri ? (ev) => { if (!(ev.target as Element).closest('button')) satirSec(r.emirKaydi!); } : adimSatiri ? (ev) => { if (!(ev.target as Element).closest('button')) adimSatiriSec(r); } : undefined}
          onKeyDown={adimSatiri ? (ev) => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); adimSatiriSec(r); } } : undefined}
        >
          {r.notlar ? null : kolonlar.map((k) => (
            <div key={k.id} className="tc-pyq-h" role={r.ara ? 'columnheader' : 'cell'} data-sutun={k.id} data-sayi={k.sayi ? '' : undefined}>
              {r.ara ? SUTUN_ADI[k.id as SutunKimligi].adimAdi : goz === 'T' ? tezgahHucresi(r, k.id) : r.siparis ? siparisHucresi(r, k.id as SutunKimligi) : r.adim ? adimHucresi(r, k.id as SutunKimligi) : r.emirKaydi ? emirHucresi(r.emirKaydi, r, k.id as SutunKimligi) : null}
            </div>
          ))}
        </div>
        <Ayrac tablo={tablo} />
      </>
    );
  };
  // Güncellemeyle kayan işin eski yeri (3532): kesik hayalet, emrin kuyruğu ve "eski"; çubuğunun üstüne gelinince ya da seçilince vurgulanır.
  const hayaletler = (r: { kimlik: string; isler: readonly KokpitIsi[] }) => {
    if (!eskiYer) return null;
    const l = goz === 'T' ? Object.values(m.isler).filter((x) => { const y = eskiYer[x.id]; return y !== undefined && satirKimligi({ ...x, m: y.m }) === r.kimlik; }) : r.isler;
    return l.flatMap((x) => {
      const y = eskiYer[x.id];
      if (!y || (Math.abs(x.S - y.S) <= 0.01 && y.m === x.m)) return [];
      const no = emirKuyrugu(emir.get(x.job)?.no ?? x.job);
      return [(
        <span
          className="tc-pyq-hayalet tc-pyq-eski" key={`eski-${x.id}`} data-eski-is={x.id} data-vurgu={ustteki === x.id || secIs === x.id ? '' : undefined}
          title={`${no} · güncellemeden önceki yeri ${zaman(y.S)}`} ref={(el) => { yerYaz(el, (y.S - m.bas) * px, Math.max((y.C - y.S) * px, OKUNUR_EN)); }}
        >{no} eski</span>
      )];
    });
  };

  return (
    <div
      className="tc-pyq-tahta" data-olcek={olcek} data-tasima={tasinan ? '' : undefined} ref={kap} onScroll={pencereyiBildir}
      onPointerMove={izle} onClickCapture={(ev) => { if (balon && !(ev.target as Element).closest('.tc-pyq-balon, .tc-pyq-gelen')) setBalon(null); if (tasinan && !onay) { ev.preventDefault(); ev.stopPropagation(); birak(); } else if (menu && !(ev.target as Element).closest('.tc-pyq-menu')) setMenu(null); }}
    >
      <div className="tc-pyq-ic" ref={(el) => { ic.current = el; el?.style.setProperty('--en', `${String(en)}px`); el?.style.setProperty('--gun', `${String(24 * px)}px`); }}>
        {/* Tablo rolü satırlara aria-owns ile bağlı ayrı öğededir: Gantt düğmeleri ve sütun ayracı aynı satırlarda durur, role=table içinde
            satır ya da hücre olmayan çocuk olarak sayılırdı (axe aria-required-children). */}
        {tabloKipi && <div className="tc-pyq-tablo-sahip" role="table" aria-label={goz === 'T' ? 'Tezgâhlar' : 'Emirler'} ref={tabloSahibi} />}
        {eksen}
        {plansiz.length > 0 && (
          <div className="tc-pyq-satir tc-pyq-tepsi">
            <div className="tc-pyq-bas"><b>Yerleştirilecek</b><small>{plansiz.length} emir{planaAl && goz === 'T' ? ' · sürükleyip tezgâha bırakın' : ''}</small></div>
            <div className="tc-pyq-alan tc-pyq-fisler" role={tabloKipi ? 'presentation' : undefined}><div>
              {plansiz.map((e) => (
                <button
                  type="button" key={e.id} className="tc-pyq-fis" data-fis={e.id} aria-pressed={secEmir === e.id} data-tasinan={tasinan?.fis === e.id ? '' : undefined}
                  onClick={() => { if (!tasinan) sec(e.id, null); }} onDoubleClick={(ev) => { ev.preventDefault(); tutFis(e.id); }}
                  onPointerDown={(ev) => { if (ev.button > 0 || ev.pointerType === 'touch' || !planaAl || tasinan || goz !== 'T' || uzak) return; basilan.current = { id: FIS + e.id, x: ev.clientX, y: ev.clientY, tut: 0 }; }}
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
            className="tc-pyq-satir" key={r.kimlik} data-satir={r.kimlik} data-d={r.durum} data-seritli={!tekSeritli(r) && (yerlesim.satir.get(r.kimlik) ?? 1) > 1 ? '' : undefined}
            data-agac-adim={r.adim ? '' : undefined} data-agac-not={r.notlar ? '' : undefined} data-agac-ara={r.ara ? '' : undefined}
            data-secili={tabloKipi && goz === 'S' && r.emirKaydi !== undefined && !r.adim && !r.ara && !r.notlar && secEmir === r.kimlik ? '' : undefined}
            ref={(el) => { el?.style.setProperty('--seritler', String(tekSeritli(r) ? 1 : yerlesim.satir.get(r.kimlik) ?? 1)); }}
            data-aday={adaySatirlari ? (adaySatirlari.has(r.kimlik) ? 'evet' : 'hayir') : undefined}
          >
            <div className="tc-pyq-bas" data-tablo={tabloKipi ? '' : undefined} data-durus={r.durus ? '' : undefined} title={tabloKipi || r.notlar ? undefined : `${r.tam ?? r.bas} · ${r.durus ?? r.alt}${yuk.get(r.kimlik)?.yazi ?? ''}`}>
              {tabloKipi ? tabloSatiri(r) : (
              <>
              {r.agacEmir !== undefined && agac
                ? <button type="button" className="tc-pyq-agac-ac" data-agac={r.agacEmir} aria-expanded={r.acik} title={`${r.tam ?? r.bas} · ${r.acik ? 'adımları gizle' : 'adımları göster'}`} onClick={() => { agac.ac(r.agacEmir!); }}><Simge ad="chev-right" boyut="k" /><b>{r.bas}</b><small>{r.alt}</small></button>
                : sorunBildir && !fasonlar.has(r.kimlik)
                ? <button type="button" className="tc-pyq-sorun" data-sorun-bildir={r.kimlik} aria-label={`${r.bas} için sorun bildir`} title={`${r.bas} · sorun bildir: arıza ya da bakım`} onClick={() => { sorunBildir(r.kimlik); }}><b>{r.bas}<Simge ad="wrench" boyut="k" /></b><small>{r.durus ?? r.alt}</small></button>
                : <><b>{r.bas}</b><small>{r.durus ?? r.alt}</small></>}
              {goz === 'T' && gelen?.satirlar.get(r.kimlik) && (
                <button
                  type="button" className="tc-pyq-gelen tc-pyq-gelen-satir" data-gelen-satir={r.kimlik} data-tur="saha" aria-expanded={balon?.id === r.kimlik}
                  aria-label={`${r.bas}: ${gelenYazisi(gelen.satirlar.get(r.kimlik)!)}`} onClick={(ev) => { if (!tasinan) balonAc(r.kimlik, ev.currentTarget, true); }}
                ><Simge ad={GELEN_SIMGESI.saha} boyut="k" /></button>
              )}
              {payNotu(r)}
              {goz === 'T' && m.mesai?.[r.kimlik]?.length ? <i className="tc-pyq-mesai-isaret" title={ekMesaiYazisi(m.mesai[r.kimlik]!, zaman)}>+ ek mesai</i> : null}
              {yuk.has(r.kimlik) && <i className="tc-pyq-yukcubuk" data-yuk={yuk.get(r.kimlik)!.sinif} ref={(el) => { el?.style.setProperty('--oran', String(yuk.get(r.kimlik)!.oran)); }} />}
              </>
              )}
            </div>
            <div className="tc-pyq-alan" role={tabloKipi ? 'presentation' : undefined} onClick={(ev) => { if (!(ev.target as Element).closest('button') && !tasinan && yanan) secimiKaldir?.(); }}>
              {ufukDisi}
              {(kapali.get(r.kimlik) ?? []).map(([a, b]) => <span className="tc-pyq-kapali" key={a} ref={(el) => { yerYaz(el, (a - m.bas) * px, (b - a) * px); }} />)}
              {goz === 'T' && (m.durus[r.kimlik] ?? []).map((d) => <span className="tc-pyq-durus" key={`${String(d.a)}-${String(d.b)}`} data-plan={d.ariza ? undefined : d.neden} title={d.ariza ? durusYazisi(d, zaman) : planliDurusYazisi(d, zaman)} ref={(el) => { yerYaz(el, (Math.max(d.a, m.bas) - m.bas) * px, (Math.min(d.b, m.son) - Math.max(d.a, m.bas)) * px); }} />)}
              {r.termin !== undefined && r.termin !== null && <span className="tc-pyq-satir-termin" data-d={r.durum} title={`Termin ${zaman(r.termin)}`} ref={(el) => { yerYaz(el, (r.termin! - m.bas) * px); }} />}
              {r.ozet && <span className="tc-pyq-ozet-cubuk" data-ozet={r.agacEmir} title={`${r.tam ?? r.bas} · adımlar ${zaman(r.ozet[0])} – ${zaman(r.ozet[1])}`} ref={(el) => { yerYaz(el, (r.ozet![0] - m.bas) * px, (r.ozet![1] - r.ozet![0]) * px); }} />}
              {r.agacEmir !== undefined && !r.ozet && r.isler.length === 0 && <span className="tc-pyq-agac-bos" data-agac-bos>planda yeri yok</span>}
              {r.notlar?.map((y) => <p className="tc-pyq-not" key={y}>{y}</p>)}
              {hayaletler(r)}
              {(r.siparis || r.emirCubugu) && kademeCubugu(r)}
              {hucreGunleri?.has(r.kimlik) && gunHucreleri(r, hucreSirasi, hucreDurakAnahtari)}
              {!r.siparis && !r.emirCubugu && !hucreGunleri?.has(r.kimlik) && !(r.paylar !== undefined && !r.payAlt) && r.isler.map((x) => {
                const k = r.adim ? undefined : yerlesim.kumeOf.get(x.id);
                if (k === undefined) return isDugmesi(x, r.adim);
                return k === x.id ? kumeDugmesi(k) : null;
              })}
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
        {tasinanIs && tasinan?.fis === undefined && hiza.map((c) => (
          <div className="tc-pyq-hiza" key={c.kenar} data-kenar={c.kenar} data-hizali={c.hizali ? '' : undefined} aria-hidden="true" ref={(el) => { yerYaz(el, (c.saat - m.bas) * px); }}>
            <span>{c.ad} · {zaman(c.saat).slice(-5)}{c.hizali ? ' · hizalı' : ''}</span>
          </div>
        ))}
        {ufukCizgi}
        {secili && secili.termin !== null && goz === 'T' && (
          <div className="tc-pyq-termin" ref={(el) => { yerYaz(el, (secili.termin! - m.bas) * px); }}><span>Termin {secili.no} · {zaman(secili.termin).slice(6)}</span></div>
        )}
        {balon && (() => {
          const l = (balon.satir ? gelen?.satirlar.get(balon.id) : gelen?.isler.get(balon.id)) ?? [];
          return l.length > 0 && (
            <div className="tc-pyq-balon" role="status" data-balon={balon.id} ref={(el) => { if (el) balonYerlestir(el, balon.x, balon.y, balon.alt); }}>
              {l.map((d) => <p key={d.anahtar} data-tur={d.baslik}><Simge ad={GELEN_SIMGESI[d.baslik]} boyut="k" /><span><b>{BASLIK_ADI[d.baslik]}:</b> {d.ne}{d.alt ? <small>{d.alt}</small> : null}</span></p>)}
            </div>
          );
        })()}
        {(() => {
          const x = secIs !== null && !tasinan && !menu && !hucreli ? m.isler[secIs] : undefined, e = x ? emir.get(x.job) : undefined;
          if (!x || !e || panoKapali === x.id) return null;
          return createPortal(<AdimPanosu kip="secili" m={m} e={e} x={x} zaman={zaman} sayim={o.adimSayim?.[x.id]} bolAc={bol ? (id) => { setPanoKapali(x.id); bol(id); } : null} kapat={() => { setPanoKapali(x.id); }} yerlestir={(el) => { if (el) { panoOge.current = { el, id: x.id }; panoYerlestir(el, x.id); } else panoOge.current = null; }} />, document.body);
        })()}
        {menu && (
          <div className="tc-pyq-menu" role="menu" aria-label={emir.get(menu.fis ? menu.id : m.isler[menu.id]?.job ?? '')?.no ?? 'İş'} ref={(el) => { if (!el) return; const k = kap.current; const alt = k ? k.scrollTop + k.clientHeight : Infinity; const y = menu.y + el.offsetHeight > alt && k ? Math.max(k.scrollTop, menu.y - el.offsetHeight) : menu.y; el.style.setProperty('--x', `${String(menu.x)}px`); el.style.setProperty('--y', `${String(y)}px`); el.querySelector('button')?.focus(); }}>
            <button type="button" role="menuitem" onClick={() => { const x = m.isler[menu.id]; setMenu(null); if (menu.fis) sec(menu.id, null); else if (x) sec(x.job, adimKimligi(x)); }}><Simge ad="list" boyut="k" /><span>Ayrıntı</span></button>
            {bol && !menu.fis && m.isler[menu.id] && (() => {
              const adimId = adimKimligi(m.isler[menu.id]!), bx = m.isler[adimId] ?? m.isler[menu.id]!;
              const neden = bolunemezNedeni(bx, emir.get(bx.job)?.adet ?? 0);
              return (
                <>
                  <button type="button" role="menuitem" data-bol-ac={menu.id} disabled={neden !== null} onClick={() => { const id = adimKimligi(m.isler[menu.id]!); setMenu(null); bol(id); }}><Simge ad="layers" boyut="k" /><span>{bx.pay ? 'Bölmeyi yönet' : 'Planda böl'}</span></button>
                  {neden !== null && <small data-bol-neden={menu.id}>{neden}</small>}
                </>
              );
            })()}
          </div>
        )}
      </div>
      {onay && tasinanIs && hedef && (
        <>
        <div className="tc-pyq-alt-bosluk" aria-hidden="true" />
        {createPortal(
        <div className="tc-pyq-ipucu tc-pyq-tasima-onayi tc-pyq-alt-panel" role="group" aria-label="Taşımayı onayla">
          <span role="status">{`${onayCumlesi(
            emirKuyrugu(emir.get(tasinanIs.job)?.no ?? tasinanIs.job),
            goz !== 'T' || hedef.satir === satirKimligi(tasinanIs) ? (tasinanIs.fason ? 'Fason' : tezgahKodu.get(tasinanIs.m) ?? tasinanIs.m) : tezgahKodu.get(hedef.satir) ?? hedef.satir,
            zaman(hedef.S).slice(6), hedef.S - tasinanIs.S,
          )}${etkiNe?.gecerli !== false ? etkiCumlesi(etkiNe, zaman, m.simdi) : ''}`}</span>
          <Dugme onClick={vazgec}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={etkiNe?.gecerli === false} onClick={uygula} autoFocus>Uygula</Dugme>
        </div>,
        document.body,
        )}
        </>
      )}
      {tasinan && !onay && tasinan.fis === undefined && hedef && (() => {
        const x = m.isler[tasinan.id], e = x ? emir.get(x.job) : undefined;
        if (!x || !e) return null;
        const tezgah = goz === 'T' ? hedef.satir : x.m;
        const tahmin = tasimaTahmini(m, e, x, tezgah, hedef.S, (t) => zaman(t).slice(-5));
        const sunucu = etkiNe !== null && etkiNe.gecerli;
        const etki = sunucu ? etkiCumlesi(etkiNe, zaman, m.simdi).replace(/^ · /, '') : tahminCumlesi(tahmin);
        const neden = !hedef.gecerli ? 'Bu tezgâh adımın uygun tezgâhı değil.' : etkiNe?.gecerli === false ? etkiNe.ileti ?? 'Sunucu bu yere bırakmayı kabul etmez.' : null;
        return createPortal(<AdimPanosu kip="surukle" m={m} e={e} x={x} zaman={zaman} sayim={o.adimSayim?.[x.id]} hedef={{ tezgah, S: hedef.S, tahmin, etki, dogrulandi: sunucu, neden }} />, document.body);
      })()}
      {tasinan && !onay && <p className="tc-pyq-ipucu" role="status">{tasinan.suruk ? 'Bırakın: iş taşınır' : 'Bırakmak için tıklayın ya da Space'}{grupKaydir && coklu.size > 1 && coklu.has(tasinan.id) ? ` · seçili ${String(coklu.size)} iş aynı süre kayar` : ''}{etkiNe?.gecerli === false && etkiNe.ileti ? ` · ${etkiNe.ileti}` : ''}{etkiNe?.gecerli !== false ? etkiCumlesi(etkiNe, zaman, m.simdi) : ''}{hiza.filter((c) => c.hizali).map((c) => ` · Hizalı: ${c.ad} ${zaman(c.saat).slice(-5)}`).join('')} · Esc vazgeçer</p>}
      {once && <p className="tc-pyq-ipucu" role="status">Onaylı plan gösteriliyor · işlerin üzerinde sizin değişikliğinizle ne kadar kaydığı yazar</p>}
    </div>
  );
}
