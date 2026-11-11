import { useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type PointerEvent, type ReactNode } from 'react';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { csvIndir, type CsvDegeri } from '../veri/csv.ts';
import { etkiAcik } from '../veri/etki.ts';
import { sonrakiSiralama, type Siralama } from '../veri/liste-durumu.ts';
import { Girdi } from './Alan.tsx';
import { Dugme } from './Dugme.tsx';
import { DurumKutusu } from './DurumKutusu.tsx';
import { Sayfalama, type SayfalamaOzellikleri } from './Sayfalama.tsx';
import { Simge } from './Simge.tsx';
import './tablo.css';

export interface Sutun<S> {
  anahtar: string;
  baslik: string;
  hucre: (satir: S) => ReactNode;
  hizala?: 'sol' | 'sag';
  mono?: boolean;
  // Tarih, kod gibi bölününce okunmayan değer: tablo kipinde tek satırda kalır, sıkışmayı diğer sütunlar karşılar.
  kirilmaz?: boolean;
  // Sütun sıralanabilir; sıralama alanı `anahtar`dır. Tabloya `siralamaDegistir` verilmemişse etkisizdir.
  sirala?: boolean;
  // CSV'deki değeri. Verilmezse hücre metin ya da sayıysa o yazılır, değilse boş kalır; false sütunu CSV'ye almaz (eylem sütunu).
  csv?: ((satir: S) => CsvDegeri) | false;
  // Yalnız `kip="kaydir"` tabloda: sütun yatay kayarken yerinde kalır. 'sol' yalnız ilk sütunda, 'sag' yalnız son sütunda anlamlıdır.
  sabit?: 'sol' | 'sag';
  // Yalnız `kip="kaydir"` tabloda: uzun yazı tek satırda sütun genişliğinde "…" ile kesilir; tamamı imlecin ipucunda (CSV değeri).
  kes?: boolean;
}

export interface TabloSuzgeci {
  deger: string;
  baslik: string;
  simge?: SimgeAdi;
}

// Araç çubuğu yalnız denetimleri çizer; arama ve süzme ekranın işidir (istemcide ya da sunucuda).
export interface TabloAraci<S> {
  arama?: { deger: string; degistir: (deger: string) => void; etiket?: string; yerTutucu?: string };
  suzgec?: { etiket: string; secenekler: readonly TabloSuzgeci[]; secili: string; sec: (deger: string) => void };
  // Ekranda görünen satırlar aktarılır; sayfalı listede bütün liste isteniyorsa `satirlar` verilir.
  csv?: { ad: string; satirlar?: readonly S[] };
  sag?: ReactNode;
}

const SIRA_METNI = { artan: 'artan sıralı', azalan: 'azalan sıralı' } as const;
const ARIA_SIRA = { artan: 'ascending', azalan: 'descending' } as const;

interface Ozellikler<S> {
  etiket: string;
  sutunlar: readonly Sutun<S>[];
  satirlar: readonly S[];
  satirAnahtari: (satir: S) => string | number;
  satirSec?: (satir: S) => void;
  bosMesaj?: string;
  // Boş listenin altındaki düğme ("Süzgeci temizle" ya da ilk kaydı açan düğme); boş iletinin yanında durur.
  bosEylem?: ReactNode;
  siralama?: Siralama | null;
  siralamaDegistir?: (siralama: Siralama | null) => void;
  // Verilince tablonun altında sayfalama çizilir; satır sayısını tablo kendisi bildirir.
  sayfalama?: Omit<SayfalamaOzellikleri, 'satirSayisi'>;
  // Yeni sayfa beklenirken eski satırlar yerinde kalır ve soluk görünür.
  mesgul?: boolean;
  // Verilince tablonun üstünde arama, süzgeç çipleri ve CSV düğmesi çizilir; boş listede de görünür (aramayı geri almak için).
  arac?: TabloAraci<S>;
  // İlk yükleme: satır yokken sütun başlıklarıyla iskelet satırlar çizilir (kart 2090, karar 2081-16). Etki kapatıldıysa
  // "Yükleniyor" kutusu görünür.
  yukleniyor?: boolean;
  // Kart kipinde (dar kap) satır sola kaydırılınca açılan tek hızlı eylem (kart 2090, karar 2081-20). Hangi listede ve hangi
  // eylemle kullanılacağı bağlamada ekran ekran kararlaştırılır (2090-1). Düğme klavye ve ekran okuyucuyla da erişilir.
  satirEylemi?: SatirEylemi<S>;
  // Verilince satırlar seçilebilir ve seçim olunca tablonun altında toplu işlem çubuğu çıkar (kart 2092, karar 2081-24).
  // Hangi listede hangi eylemin olacağı bağlamada kararlaştırılır. Etki kapatıldıysa seçim sütunu çizilmez.
  toplu?: { eylemler: readonly TopluEylem<S>[] };
  // 'kaydir': sığmayan tablo kart kipine geçmez, kendi kabında yatay ve dikey kayar; başlık kabın üstünde, `sabit` sütunlar
  // yanlarda kalır. Çok sütunlu izleme listeleri içindir. Verilmezse uyarlanır (sığmayınca kart kipi).
  kip?: 'uyarlanir' | 'kaydir';
}

export interface TopluEylem<S> {
  anahtar: string;
  baslik: string;
  simge: SimgeAdi;
  yap: (secili: readonly S[]) => void;
  ton?: 'tehlike';
}

// Satırın içeriği değişince (canlı veri) satır bir an vurgulanır (kart 2092, karar 2081-21). Karşılaştırma içerikledir:
// ekran her çizimde yeni nesne üretse de değişmeyen satır vurgulanmaz. İlk çizimde ve yeni gelen satırda (sayfa değişimi)
// vurgu yoktur.
const VURGU_MS = 1400;
function satirImzasi(satir: unknown): string | null {
  try { return JSON.stringify(satir) ?? null; } catch { return null; }
}

export interface SatirEylemi<S> {
  etiket: (satir: S) => string;
  simge: SimgeAdi;
  yap: (satir: S) => void;
  ton?: 'tehlike';
}

const ISKELET_SATIRI = 5;
// Kaydırma eşiği ve sürüklenme sayılan en az yol; sürüklenen satıra bırakınca gelen tıklama satırı açmaz.
const KAYDIRMA_ESIGI_PX = 48;
const SURUKLEME_PX = 8;

// Kesilen hücrenin tam metni: yazı ya da sayıysa kendisi, değilse sütunun CSV değeri.
function kesIpucu<S>(s: Sutun<S>, satir: S, icerik: ReactNode): string | undefined {
  if (typeof icerik === 'string' || typeof icerik === 'number') return String(icerik);
  const d = typeof s.csv === 'function' ? s.csv(satir) : null;
  return d === null || d === undefined || d === '' ? undefined : String(d);
}

function csvHucresi<S>(s: Sutun<S>, satir: S): CsvDegeri {
  if (typeof s.csv === 'function') return s.csv(satir);
  const icerik = s.hucre(satir);
  return typeof icerik === 'string' || typeof icerik === 'number' ? icerik : null;
}

export function tabloCsvSatirlari<S>(sutunlar: readonly Sutun<S>[], satirlar: readonly S[]): { basliklar: string[]; satirlar: CsvDegeri[][] } {
  const alinan = sutunlar.filter((s) => s.csv !== false);
  return { basliklar: alinan.map((s) => s.baslik), satirlar: satirlar.map((satir) => alinan.map((s) => csvHucresi(s, satir))) };
}

function AracCubugu<S>({ arac, sutunlar, satirlar }: { arac: TabloAraci<S>; sutunlar: readonly Sutun<S>[]; satirlar: readonly S[] }) {
  const { arama, suzgec, csv, sag } = arac;
  const aktarilan = csv?.satirlar ?? satirlar;
  return (
    <div className="tc-tablo-arac">
      {arama && (
        <div className="tc-tablo-arama">
          <Girdi
            etiket={arama.etiket ?? 'Ara'} type="search" value={arama.deger} placeholder={arama.yerTutucu ?? 'Ara'}
            onChange={(o) => { arama.degistir(o.target.value); }}
          />
        </div>
      )}
      {suzgec && suzgec.secenekler.length > 0 && (
        <div className="tc-tablo-cipler" role="group" aria-label={suzgec.etiket}>
          {suzgec.secenekler.map((c) => (
            <Dugme key={c.deger} simge={c.simge} aria-pressed={c.deger === suzgec.secili} onClick={() => { suzgec.sec(c.deger); }}>
              {c.baslik}
            </Dugme>
          ))}
        </div>
      )}
      {(csv || sag) && (
        <div className="tc-tablo-arac-sag">
          {sag}
          {csv && (
            <Dugme
              simge="download" disabled={aktarilan.length === 0}
              onClick={() => {
                const { basliklar, satirlar: veri } = tabloCsvSatirlari(sutunlar, aktarilan);
                csvIndir(csv.ad, basliklar, veri);
              }}
            >
              CSV
            </Dugme>
          )}
        </div>
      )}
    </div>
  );
}

// Tablo kabına sığmayınca her satır karta döner; sütun başlığı hücrenin önünde yazılır, sütun gizlenmez.
// Eşik ekran genişliği değildir: aynı ekranda dar tablo sığar, geniş tablo sığmaz; ölçü içerikten gelir.
function TabloIskeleti<S>({ etiket, sutunlar }: { etiket: string; sutunlar: readonly Sutun<S>[] }) {
  return (
    <div className="tc-tablo-kap" data-olcer="" aria-busy="true">
      <span className="tc-gizli-etiket" role="status">Yükleniyor</span>
      <table className="tc-tablo tc-tablo-iskelet" aria-label={etiket} aria-hidden="true">
        <thead><tr>{sutunlar.map((s) => <th key={s.anahtar} scope="col">{s.baslik}</th>)}</tr></thead>
        <tbody>
          {Array.from({ length: ISKELET_SATIRI }, (_, i) => (
            <tr key={i}>{sutunlar.map((s) => <td key={s.anahtar}><span className="tc-iskelet" /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Kaydirma { x0: number; y0: number; dx: number; kimlik: number; satir: HTMLTableRowElement; acikti: boolean }

// Kart kipinde satır sola kaydırılınca hızlı eylem açılır; eşiği geçmeyen kaydırma kapanır. Aynı anda tek satır açıktır.
function useSatirKaydirma(etkin: boolean) {
  const suren = useRef<Kaydirma | null>(null);
  const acik = useRef<HTMLTableRowElement | null>(null);
  const yutulacak = useRef(false);
  const kapat = (tr: HTMLTableRowElement | null) => {
    tr?.removeAttribute('data-eylem-acik');
    tr?.style.removeProperty('--kaydir-x');
  };
  const olaylar = (): Pick<HTMLAttributes<HTMLTableRowElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onClickCapture'> => {
    if (!etkin) return {};
    return {
      onPointerDown: (o: PointerEvent<HTMLTableRowElement>) => {
        if (o.button !== 0 || !etkiAcik('satir-kaydirma')) return;
        if (o.target instanceof Element && o.target.closest('.tc-tablo-eylem')) return;
        const tr = o.currentTarget;
        if (acik.current && acik.current !== tr) { kapat(acik.current); acik.current = null; }
        suren.current = { x0: o.clientX, y0: o.clientY, dx: 0, kimlik: o.pointerId, satir: tr, acikti: tr.hasAttribute('data-eylem-acik') };
      },
      onPointerMove: (o: PointerEvent<HTMLTableRowElement>) => {
        const k = suren.current;
        if (k?.kimlik !== o.pointerId) return;
        const dx = o.clientX - k.x0;
        if (Math.abs(dx) < SURUKLEME_PX && k.dx === 0) return;
        if (k.dx === 0 && Math.abs(o.clientY - k.y0) > Math.abs(dx)) { suren.current = null; return; }
        k.dx = dx;
        k.satir.setAttribute('data-kaydiriliyor', '');
        k.satir.style.setProperty('--kaydir-x', `${String(Math.min(0, dx + (k.acikti ? -KAYDIRMA_ESIGI_PX * 2 : 0)))}px`);
      },
      onPointerUp: (o: PointerEvent<HTMLTableRowElement>) => {
        const k = suren.current;
        if (k?.kimlik !== o.pointerId) return;
        suren.current = null;
        k.satir.removeAttribute('data-kaydiriliyor');
        if (k.dx === 0) {
          if (k.acikti) { kapat(k.satir); acik.current = null; yutulacak.current = true; }
          return;
        }
        yutulacak.current = true;
        k.satir.style.removeProperty('--kaydir-x');
        const ac = k.acikti ? k.dx < KAYDIRMA_ESIGI_PX : k.dx < -KAYDIRMA_ESIGI_PX;
        if (ac) { k.satir.setAttribute('data-eylem-acik', ''); acik.current = k.satir; }
        else { kapat(k.satir); acik.current = null; }
      },
      onPointerCancel: () => {
        const k = suren.current;
        suren.current = null;
        if (k) { k.satir.removeAttribute('data-kaydiriliyor'); k.satir.style.removeProperty('--kaydir-x'); }
      },
      onClickCapture: (o) => {
        if (!yutulacak.current) return;
        yutulacak.current = false;
        if (o.target instanceof Element && o.target.closest('.tc-tablo-eylem')) return;
        o.stopPropagation();
      },
    };
  };
  return olaylar;
}

export function Tablo<S>({
  etiket, sutunlar, satirlar, satirAnahtari, satirSec, bosMesaj, bosEylem, siralama = null, siralamaDegistir, sayfalama, mesgul = false, arac,
  yukleniyor = false, satirEylemi, toplu, kip = 'uyarlanir',
}: Ozellikler<S>) {
  const kaydir = kip === 'kaydir';
  const kap = useRef<HTMLDivElement>(null);
  const [kart, kartYaz] = useState(false);
  const kaydirma = useSatirKaydirma(kart && satirEylemi !== undefined);
  const imzalar = useRef<Map<string, string | null> | null>(null);
  const topluAcik = toplu !== undefined && toplu.eylemler.length > 0 && etkiAcik('toplu-islem');
  const [secili, seciliYaz] = useState<ReadonlySet<string>>(() => new Set());
  const anahtar = (satir: S) => String(satirAnahtari(satir));

  useLayoutEffect(() => {
    const yeni = new Map(satirlar.map((satir) => [anahtar(satir), satirImzasi(satir)] as const));
    const onceki = imzalar.current;
    imzalar.current = yeni;
    const el = kap.current;
    if (!onceki || !el || !etkiAcik('canli-vurgu')) return;
    for (const tr of el.querySelectorAll<HTMLTableRowElement>('tbody tr[data-satir]')) {
      const k = tr.getAttribute('data-satir') ?? '';
      const eski = onceki.get(k);
      if (eski === undefined || eski === null || eski === yeni.get(k)) continue;
      tr.removeAttribute('data-degisti');
      void tr.offsetWidth;
      tr.setAttribute('data-degisti', '');
      setTimeout(() => { tr.removeAttribute('data-degisti'); }, VURGU_MS);
    }
  });

  // Listede artık olmayan satır seçimden düşer (sayfa değişti, kayıt silindi).
  useEffect(() => {
    seciliYaz((onceki) => {
      if (onceki.size === 0) return onceki;
      const var_ = new Set(satirlar.map((satir) => String(satirAnahtari(satir))));
      const kalan = [...onceki].filter((k) => var_.has(k));
      return kalan.length === onceki.size ? onceki : new Set(kalan);
    });
  }, [satirlar, satirAnahtari]);

  const bos = satirlar.length === 0;

  useLayoutEffect(() => {
    const el = kap.current;
    if (kaydir) { kartYaz(false); return undefined; }
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let sonEn = -1;
    // Sığma yalnız tablo kipinde ölçülür. Kart kipinden ölçüm için çıkmak sayfayı kısaltıp kaydırma yerini
    // oynatır; bu yüzden kart kipinde yalnız kabın genişliği değişince yeniden ölçülür, içerik değişince değil.
    const olc = () => {
      const en = el.clientWidth;
      const kartta = el.hasAttribute('data-kip');
      if (kartta && en === sonEn) return;
      sonEn = en;
      el.removeAttribute('data-kip');
      const sigmiyor = el.scrollWidth > el.clientWidth;
      if (kartta) el.setAttribute('data-kip', 'kart');
      kartYaz(sigmiyor);
    };
    const izleyen = new ResizeObserver(olc);
    izleyen.observe(el);
    const tablo = el.querySelector('table');
    if (tablo) izleyen.observe(tablo);
    olc();
    // Yazı tipi sonradan yüklenince genişlikler değişir; ilk ölçüm yedek yazı tipiyle yapılmış olabilir.
    let canli = true;
    void document.fonts?.ready.then(() => { if (canli) { sonEn = -1; olc(); } });
    return () => { canli = false; izleyen.disconnect(); };
  }, [bos, kaydir]);

  const sayfaDegistir = (sayfa: number) => {
    sayfalama?.degistir(sayfa);
    // Sayfalama listenin altındadır: yeni sayfa baştan okunsun diye liste başı görünür yere alınır.
    const el = kap.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView?.({ block: 'start' });
  };
  const alt = sayfalama && <Sayfalama {...sayfalama} degistir={sayfaDegistir} satirSayisi={satirlar.length} />;

  const ust = arac && <AracCubugu arac={arac} sutunlar={sutunlar} satirlar={satirlar} />;

  if (bos && yukleniyor) {
    return <>{ust}{etkiAcik('tablo-iskelet') ? <TabloIskeleti etiket={etiket} sutunlar={sutunlar} /> : <DurumKutusu durum="yukleniyor" />}</>;
  }
  if (bos) return <>{ust}<DurumKutusu durum="bos" mesaj={bosMesaj}>{bosEylem}</DurumKutusu>{alt}</>;

  const sabitSinif = (s: Sutun<S>) => (kaydir && s.sabit ? `tc-tablo-sabit-${s.sabit}` : undefined);
  const siralanan = siralamaDegistir ? sutunlar.filter((s) => s.sirala) : [];
  const yon = (s: Sutun<S>) => (siralama?.alan === s.anahtar ? siralama.yon : null);
  const sirala = (s: Sutun<S>) => siralamaDegistir?.(sonrakiSiralama(siralama, s.anahtar));
  const ok = (s: Sutun<S>) => {
    const y = yon(s);
    if (y) return <Simge ad={y === 'artan' ? 'up' : 'down'} boyut="k" />;
    return <span className="tc-tablo-sirasiz"><Simge ad="sort" boyut="k" /></span>;
  };

  return (
    <>
      {ust}
      <div ref={kap} className="tc-tablo-kap" data-olcer={kaydir ? undefined : ''} data-kaydir={kaydir ? '' : undefined} data-kip={kart ? 'kart' : undefined} aria-busy={mesgul || undefined}>
        {/* Kart kipinde sütun başlığı görünmez; sıralama düğmeleri kartların üstüne taşınır. */}
        {kart && siralanan.length > 0 && (
          <div className="tc-tablo-siralar" role="group" aria-label="Sıralama">
            {siralanan.map((s) => {
              const y = yon(s);
              return (
                <Dugme key={s.anahtar} aria-label={`${s.baslik}: ${y ? SIRA_METNI[y] : 'sıralı değil'}`} aria-pressed={y !== null} onClick={() => sirala(s)}>
                  {s.baslik}{ok(s)}
                </Dugme>
              );
            })}
          </div>
        )}
        <table className="tc-tablo" aria-label={etiket}>
          <thead>
            <tr>
              {topluAcik && (
                <th scope="col" className="tc-tablo-sec">
                  <input
                    type="checkbox" aria-label="Tümünü seç"
                    checked={secili.size > 0 && secili.size === satirlar.length}
                    ref={(el) => { if (el) el.indeterminate = secili.size > 0 && secili.size < satirlar.length; }}
                    onChange={(o) => { seciliYaz(o.target.checked ? new Set(satirlar.map(anahtar)) : new Set()); }}
                  />
                </th>
              )}
              {sutunlar.map((s) => {
                const siralanir = siralanan.includes(s);
                const y = yon(s);
                return (
                  <th
                    key={s.anahtar} scope="col" className={[s.hizala === 'sag' && 'tc-tablo-sag', sabitSinif(s)].filter(Boolean).join(' ') || undefined}
                    aria-sort={siralanir ? (y ? ARIA_SIRA[y] : 'none') : undefined}
                  >
                    {siralanir && !kart
                      ? <button type="button" className="tc-tablo-sirala" onClick={() => sirala(s)}>{s.baslik}{ok(s)}</button>
                      : s.baslik}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {satirlar.map((satir) => (
              <tr
                key={satirAnahtari(satir)}
                data-satir={anahtar(satir)}
                data-secili={topluAcik && secili.has(anahtar(satir)) ? '' : undefined}
                className={satirSec ? 'tc-tablo-secilir' : undefined}
                tabIndex={satirSec ? 0 : undefined}
                {...kaydirma()}
                onClick={satirSec ? () => satirSec(satir) : undefined}
                onKeyDown={satirSec ? (o) => {
                  if (o.target !== o.currentTarget || (o.key !== 'Enter' && o.key !== ' ')) return;
                  o.preventDefault();
                  satirSec(satir);
                } : undefined}
              >
                {topluAcik && (
                  <td className="tc-tablo-sec" data-baslik="Seç" onClick={(o) => { o.stopPropagation(); }}>
                    <input
                      type="checkbox" aria-label={`Seç: ${String(sutunlar[0]?.hucre(satir) ?? anahtar(satir))}`}
                      checked={secili.has(anahtar(satir))}
                      onChange={(o) => {
                        const k = anahtar(satir);
                        const acik = o.target.checked;
                        seciliYaz((onceki) => { const y = new Set(onceki); if (acik) y.add(k); else y.delete(k); return y; });
                      }}
                    />
                  </td>
                )}
                {sutunlar.map((s) => {
                  const icerik = s.hucre(satir);
                  const sinif = [s.hizala === 'sag' && 'tc-tablo-sag', s.mono && 'mono', s.kirilmaz && 'tc-tablo-kirilmaz', sabitSinif(s)].filter(Boolean).join(' ');
                  return (
                    <td key={s.anahtar} data-baslik={s.baslik} className={sinif || undefined}>
                      {icerik === null || icerik === undefined || icerik === '' ? <span className="tc-tablo-yok">yok</span>
                        : kaydir && s.kes ? <span className="tc-tablo-kes" title={kesIpucu(s, satir, icerik)}>{icerik}</span> : icerik}
                    </td>
                  );
                })}
                {kart && satirEylemi && (
                  <td className="tc-tablo-eylem">
                    <button
                      type="button" className={`tc-tablo-eylem-dugme${satirEylemi.ton === 'tehlike' ? ' tc-tablo-eylem-tehlike' : ''}`}
                      onClick={(o) => { o.stopPropagation(); o.currentTarget.closest('tr')?.removeAttribute('data-eylem-acik'); satirEylemi.yap(satir); }}
                    >
                      <Simge ad={satirEylemi.simge} />
                      <span>{satirEylemi.etiket(satir)}</span>
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {topluAcik && secili.size > 0 && (
        <div className="tc-tablo-toplu" role="toolbar" aria-label={`${etiket}: toplu işlem`}>
          <span className="tc-tablo-toplu-sayi" role="status">{secili.size} seçili</span>
          {toplu?.eylemler.map((e) => (
            <Dugme key={e.anahtar} simge={e.simge} tur={e.ton === 'tehlike' ? 'tehlike' : 'ikincil'}
              onClick={() => { e.yap(satirlar.filter((satir) => secili.has(anahtar(satir)))); }}>
              {e.baslik}
            </Dugme>
          ))}
          <Dugme simge="x" onClick={() => { seciliYaz(new Set()); }}>Seçimi kaldır</Dugme>
        </div>
      )}
      {alt}
    </>
  );
}
