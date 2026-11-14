import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { Derleme } from '../motor/kurallar.ts';
import { KISA_SERIT, darEkran } from './Matris.tsx';
import {
  MATRIS_GUNU, durumYazisi, hucreler3B, matrisSirasi, onayliGecSayisi, satirKimligi, sayim, sureYaz, tezgahGunundeMi,
  type Hucre3B, type KokpitEmri, type KokpitModeli, type OnayliYer,
} from './kurallar.ts';
import { Sahne3B, ciziciAc, renkleriOku, type Bakis, type Kamera, type SahneVerisi, type Secim } from './sahne3b.ts';

// Kokpit 3B (kart 3208 a, 3214 a): Matris'in yanındaki "3B" görünümü, onaylı ön izlemenin düzeniyle: üstte "Bu görünümde" satırı, solda
// sahne (kamera düğmeleri üstünde), sağda açıklama paneli (dar ekranda sahnenin altında), 2B / 3B Matris'te altta emir tablosu. Veri Matris
// ile aynı tezgâh-gün yüküdür; Yük ve gecikme ile Önce / sonra onaylı planı bugünkü "Önce / sonra" okumasından alır.

const BAKISLAR: readonly (readonly [Bakis, string])[] = [['D', '2B / 3B Matris'], ['E', 'Yük ve gecikme'], ['H', 'Önce / sonra']];
const KAMERALAR: readonly (readonly [Kamera, string])[] = [['egik', 'Eğik'], ['ust', 'Üstten'], ['on', 'Önden'], ['yan', 'Yandan']];
const BOYUTLAR: Record<Bakis, readonly (readonly [string, string])[]> = {
  D: [['Genişlik', 'gün'], ['Derinlik', 'tezgâh'], ['Yükseklik', "3B'de yük %"], ['Renk', "yük sınıfı, bugünkü Matris'teki gibi"], ['Kırmızı tepe', 'o hücrede geç emir var']],
  E: [['Genişlik', 'gün'], ['Derinlik', 'tezgâh, istasyona göre gruplu'], ['Yükseklik', 'yük %, cetvel %50 ve %100'], ['Renk', 'o hücredeki en kötü emir: kırmızı geç, turuncu riskli, mavi zamanında'], ['Saydamlık', 'taslakta yeri değişen, henüz onaylanmamış iş payı']],
  H: [['Genişlik', 'gün'], ['Derinlik', 'tezgâh, istasyona göre'], ['Yükseklik', 'yük %'], ['Saydam kutu', 'onaylı plan (önce)'], ['Dolu çubuk', 'taslak plan (sonra)'], ['Renk', 'turuncu yük arttı, yeşil azaldı, mavi aynı'], ['Kaydırıcı', 'önce ile sonra arasında geçiş']],
};
const BASLIK: Record<Bakis, string> = { D: '2B/3B geçişli Matris', E: 'Yük ve gecikme', H: 'Önce / sonra' };
const LEJANT: readonly (readonly [string, string])[] = [['hafif', 'yarıdan az'], ['orta', 'yarı ve üstü'], ['dolu', '%85 ve üstü'], ['tam', 'tam dolu'], ['kapali', 'kapalı gün'], ['gec', 'geç emir']];
const SIRA = { gec: 0, risk: 1, plansiz: 1, iyi: 2 } as const;

export type OnayliDurumu = 'okunuyor' | 'hata' | 'tamam';
export interface Kokpit3BOzellikleri {
  m: KokpitModeli; cx: Derleme;
  once: Record<string, OnayliYer> | null; onceDurumu: OnayliDurumu;
  emirler: readonly KokpitEmri[];
  secEmir: string | null;
  zaman: (t: number) => string;
  sec: (job: string, isId: string | null) => void;
  matriseGec: () => void;
}

const yuzde = (x: number | null): string => (x === null ? '–' : `%${String(Math.round(x * 100))}`);

export function Kokpit3B({ m, cx, once, onceDurumu, emirler, secEmir, zaman, sec, matriseGec }: Kokpit3BOzellikleri) {
  const [bakis, setBakis] = useState<Bakis>('D');
  const [kalkik, setKalkik] = useState(false);
  const [kamera, setKamera] = useState<Kamera | null>(null);
  const [don, setDon] = useState(false);
  const [oran, setOran] = useState(100);
  const [secim, setSecim] = useState<{ tezgah: string; gun: number } | null>(null);
  const [cizici, setCizici] = useState<'aciliyor' | 'tamam' | 'yok' | 'yazilim'>('aciliyor');
  const [tema, setTema] = useState(0);
  const [tum, setTum] = useState(false);
  const tuval = useRef<HTMLCanvasElement | null>(null), katman = useRef<HTMLDivElement | null>(null), kap = useRef<HTMLDivElement | null>(null);
  const sahne = useRef<Sahne3B | null>(null), veriRef = useRef<(SahneVerisi & { idler: string[] }) | null>(null), kalkikRef = useRef(kalkik);
  kalkikRef.current = kalkik;

  const onayli = onceDurumu === 'tamam' ? once : null;
  const hucre = useMemo(() => hucreler3B(m, cx, onayli), [m, cx, onayli]);
  const tezgahSayisi = useMemo(() => m.tezgahlar.filter((t) => !t.fason).length, [m]);
  const kalabalik = tezgahSayisi > KISA_SERIT;
  const veri = useMemo<SahneVerisi & { idler: string[] }>(() => {
    const hepsi = m.tezgahlar.filter((t) => !t.fason).map((t, i) => ({ t, h: hucre[i] ?? [] }));
    // Kalabalık atölyede boş tezgâhlar ızgarayı uzatıp çubukları küçültür: 14 günde hiç yükü olmayan tezgâh çizilmez (seçili olan kalır).
    const yuklu = (x: (typeof hepsi)[number]): boolean => x.t.id === secim?.tezgah || x.h.some((c) => c.plan > 0 || (c.once ?? 0) > 0);
    const satir = kalabalik && !tum ? hepsi.filter(yuklu) : hepsi;
    // Yük ve gecikme ile Önce / sonra tezgâhları istasyona göre toplar (istasyon ilk göründüğü sırada); 2B / 3B Matris Matris'in sırasını korur.
    const gruplar = [...new Set(satir.map((x) => x.t.grup ?? ''))];
    const sirali = bakis === 'D' ? satir : [...satir].sort((a, b) => gruplar.indexOf(a.t.grup ?? '') - gruplar.indexOf(b.t.grup ?? ''));
    const gunler = Array.from({ length: MATRIS_GUNU }, (_, g) => {
      const z = zaman(m.bas + g * 24);
      return { ad: `${z.slice(6, 9)} ${z.slice(0, 2)}`, kisa: z.slice(0, 2), kapali: satir.every((x) => x.h[g]?.yuk === null) };
    });
    return {
      idler: sirali.map((x) => x.t.id),
      tezgahlar: sirali.map((x) => ({ kod: x.t.kod, grup: gruplar.indexOf(x.t.grup ?? ''), grupAdi: x.t.grupAdi ?? null })),
      gunler, hucre: sirali.map((x) => x.h), dar: darEkran(),
    };
  }, [m, hucre, bakis, zaman, kalabalik, tum, secim?.tezgah]);
  veriRef.current = veri;

  // Sahne bir kez kurulur; görünümden çıkınca çizici bırakılır.
  useEffect(() => {
    const tv = tuval.current, kt = katman.current;
    if (!tv || !kt) return undefined;
    const c = ciziciAc(tv);
    if (c.tur !== 'tamam') { setCizici(c.tur); return undefined; }
    const s = new Sahne3B(c.r, tv, kt, (x: Secim | null) => {
      const id = x === null ? undefined : veriRef.current?.idler[x.ti];
      setSecim(x === null || id === undefined ? null : { tezgah: id, gun: x.gi });
    });
    sahne.current = s; setCizici('tamam');
    const boyut = (): void => { s.boyut(tv.clientWidth, tv.clientHeight); };
    boyut();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(boyut);
    ro?.observe(tv);
    const koyu = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const temaDegisti = (): void => { setTema((x) => x + 1); };
    koyu?.addEventListener('change', temaDegisti);
    return () => { ro?.disconnect(); koyu?.removeEventListener('change', temaDegisti); s.kapat(); sahne.current = null; };
  }, []);

  useEffect(() => {
    const s = sahne.current, k = kap.current;
    if (!s || !k || cizici !== 'tamam') return;
    s.kur(bakis, veri, renkleriOku(k), kalkikRef.current);
    s.oran(oran / 100);
    setKamera(null); setDon(false);
    // Oran kaydırıcısı kurulumda yeniden okunmaz: yalnız bakış ya da veri değişince sahne yeniden kurulur.
  }, [bakis, veri, cizici, tema]);

  const secIndeks = secim ? veri.idler.indexOf(secim.tezgah) : -1;
  useEffect(() => { sahne.current?.vurgula(secim && secIndeks >= 0 ? { ti: secIndeks, gi: secim.gun } : null); }, [secim, secIndeks, bakis, veri]);

  const kod = useMemo(() => new Map(m.tezgahlar.map((t) => [t.id, t])), [m]);
  const siraliEmir = useMemo(() => matrisSirasi(emirler), [emirler]);
  const hucreEmirleri = useMemo(() => (secim ? siraliEmir.filter((e) => tezgahGunundeMi(m, e, secim.tezgah, secim.gun)) : siraliEmir), [siraliEmir, secim, m]);
  const secHucre: Hucre3B | undefined = secim && secIndeks >= 0 ? veri.hucre[secIndeks]?.[secim.gun] : undefined;
  const degisenVar = hucre.some((s) => s.some((c) => (c.degisen ?? 0) > 0));
  const gecSimdi = sayim(m.emirler).gec, gecOnce = onayli ? onayliGecSayisi(m, onayli) : null;
  const termin = (e: KokpitEmri): string => `${durumYazisi(e)}${e.termin === null ? '' : ` · termin ${zaman(e.termin).slice(0, 9)}`}`;

  const emirKartlari = (l: readonly KokpitEmri[]) => (
    <ul className="tc-pyq-liste" aria-label="Hücrenin emirleri">
      {[...l].sort((a, b) => SIRA[a.durum] - SIRA[b.durum]).map((e) => (
        <li key={e.id}>
          <button type="button" data-d={e.durum} aria-current={secEmir === e.id} onClick={() => { sec(e.id, null); }}>
            <b>{e.no}</b><span>{e.urun} · {e.adet} adet</span><small>{termin(e)}</small>
          </button>
        </li>
      ))}
    </ul>
  );
  const onayliNotu = (): ReactNode => {
    if (onceDurumu === 'okunuyor') return <p className="tc-pyq-not">Onaylı plan okunuyor.</p>;
    if (onceDurumu === 'hata') return <p className="tc-pyq-not">{bakis === 'H' ? 'Onaylı plan okunamadı; önce ve sonra aynı gösteriliyor.' : 'Onaylı plan okunamadı; bütün çubuklar dolu.'}</p>;
    if (!degisenVar) return <p className="tc-pyq-not">{bakis === 'H' ? 'Taslakta değişiklik yok; önce ve sonra aynı.' : 'Taslakta değişiklik yok; bütün çubuklar dolu.'}</p>;
    return null;
  };
  const lejant = (
    <div className="tc-pyq-lej">
      {LEJANT.map(([k, ad]) => <span key={k} data-yuk={k === 'kapali' || k === 'gec' ? undefined : k} data-lej3b={k}>{ad}</span>)}
    </div>
  );

  const panel = ((): ReactNode => {
    if (secim && secHucre) {
      const t = kod.get(secim.tezgah), gun = veri.gunler[secim.gun]?.ad ?? '';
      const bas = <><h3>{t?.kod ?? secim.tezgah} · {gun}</h3>{t?.ad && <p>{t.ad}</p>}</>;
      if (secHucre.yuk === null) return <>{bas}<p className="tc-pyq-not">Kapalı gün.</p></>;
      if (bakis === 'H') {
        const a = secHucre.once ?? secHucre.yuk, fark = (secHucre.yuk - a) * secHucre.acik;
        return (
          <>
            {bas}
            <p>Önce <b>{yuzde(a)}</b> → sonra <b>{yuzde(secHucre.yuk)}</b> ({fark >= 0 ? '+' : '−'}{sureYaz(Math.abs(fark))})</p>
            {onayliNotu()}
          </>
        );
      }
      return (
        <>
          {bas}
          <p><b>{yuzde(secHucre.yuk)} dolu</b> ({Math.round(secHucre.plan)} / {Math.round(secHucre.acik)} sa){bakis === 'E' && secHucre.degisen !== null && secHucre.degisen > 0 ? ` · taslakta değişen ${yuzde(secHucre.degisen)}` : ''}</p>
          {hucreEmirleri.length ? <><p>Bu tezgâhta o gün {hucreEmirleri.length} emir çalışıyor:</p>{emirKartlari(hucreEmirleri)}</> : <p className="tc-pyq-not">O gün iş yok.</p>}
          {bakis === 'D' && lejant}
        </>
      );
    }
    if (bakis === 'D') {
      return (
        <>
          <h3>{BASLIK.D}</h3>
          <p>Açılışta bugünkü Matris gibi düz ve üstten. "3B'ye kaldır" hücreleri yükü kadar yükseltir ve sahneyi eğer; "2B'ye indir" geri getirir.</p>
          <p>Bir hücreye dokununca o tezgâh ve günün emirleri altta süzülür.</p>
          {lejant}
        </>
      );
    }
    if (bakis === 'E') {
      return (
        <>
          <h3>{BASLIK.E}</h3>
          <p>Yükseklik ne kadar dolu olduğunu, renk o işin terminini tutup tutmadığını söyler. Yüksek ve kırmızı = darboğaz; alçak ama kırmızı = yük az, sorun önceki adımda.</p>
          <p>Saydam çubukta taslakta yeri değişmiş, henüz onaylanmamış iş var.</p>
          {onayliNotu()}
          <p>Bir çubuğa dokunun.</p>
        </>
      );
    }
    return (
      <>
        <h3>{BASLIK.H}</h3>
        <p>Taslak ile onaylı plan. {gecOnce !== null && <b>Geç emir {gecOnce} → {gecSimdi}.</b>}</p>
        <p>Saydam kutu onaylı planın yükü, içindeki dolu çubuk taslağınki. Kaydırıcıyla ya da düğmeyle ikisi arasında geçin; yükün nereden nereye kaydığı görülür.</p>
        {onayliNotu()}
        <p>Bir çubuğa dokunun.</p>
      </>
    );
  })();

  const kameraSec = (k: Kamera): void => { setKamera(k); setDon(false); sahne.current?.kamera(k); };
  const kaldir = (): void => { const x = !kalkik; setKalkik(x); setKamera(null); setDon(false); sahne.current?.kaldir(x ? 1 : 0); };
  const oranYaz = (x: number): void => { setOran(x); sahne.current?.oran(x / 100); };
  const gecis = (): void => { const x = oran > 50 ? 0 : 100; setOran(x); sahne.current?.oran(x / 100, true); };

  return (
    <div className="tc-pyq-3b" ref={kap}>
      <div className="tc-pyq-3b-ust">
        <span className="tc-pyq-seg" role="group" aria-label="3B bakış">
          {BAKISLAR.map(([k, ad]) => <button type="button" key={k} data-bakis={k} aria-pressed={bakis === k} onClick={() => { setBakis(k); setSecim(null); }}>{ad}</button>)}
        </span>
        {kalabalik && (
          <span className="tc-pyq-seg" role="group" aria-label="Tezgâhlar">
            <button type="button" aria-pressed={!tum} onClick={() => { setTum(false); }}>Yükü olan{tum ? '' : ` (${String(veri.idler.length)})`}</button>
            <button type="button" aria-pressed={tum} onClick={() => { setTum(true); }}>Tümü ({tezgahSayisi})</button>
          </span>
        )}
      </div>
      <p className="tc-pyq-3b-boyut" aria-live="polite"><b>Bu görünümde:</b>{BOYUTLAR[bakis].map(([k, a]) => <span key={k}><i>{k}</i>{a}</span>)}</p>
      <div className="tc-pyq-3b-alan">
        <div className="tc-pyq-3b-sahne" data-cizici={cizici}>
          <canvas ref={tuval} aria-label="Tezgâh × gün yükü, üç boyutlu" role="img" />
          <div className="tc-pyq-3b-etiketler" ref={katman} aria-hidden="true" />
          {cizici === 'tamam' && (
            <div className="tc-pyq-3b-kamera" role="group" aria-label="Kamera">
              {bakis === 'D' && <button type="button" data-kaldir="" aria-pressed={kalkik} onClick={kaldir}><Simge ad="layers" boyut="k" />{kalkik ? "2B'ye indir" : "3B'ye kaldır"}</button>}
              {KAMERALAR.map(([k, ad]) => <button type="button" key={k} aria-pressed={kamera === k} onClick={() => { kameraSec(k); }}>{ad}</button>)}
              <button type="button" aria-pressed={don} onClick={() => { setDon(!don); setKamera(null); sahne.current?.donsun(!don); }}>Döndür</button>
            </div>
          )}
          {bakis === 'H' && cizici === 'tamam' && (
            <div className="tc-pyq-3b-kaydir">
              <button type="button" onClick={gecis}>Önce ↔ Sonra</button>
              <input type="range" min={0} max={100} value={oran} aria-label="Önce ve sonra arası" onChange={(ev) => { oranYaz(Number(ev.target.value)); }} />
              <output>{oran < 5 ? 'Önce' : oran > 95 ? 'Sonra' : `%${String(oran)}`}</output>
            </div>
          )}
          {cizici === 'tamam' && <span className="tc-pyq-3b-ipucu">Sürükle: döndür · Tekerlek ya da iki parmak: yaklaş</span>}
          {(cizici === 'yok' || cizici === 'yazilim') && (
            <div className="tc-pyq-3b-yok" role="status">
              <Simge ad="cube" boyut="k" />
              <p>{cizici === 'yazilim' ? 'Bu bilgisayarda grafik kartı yok; 3B görünüm yavaş çalışacağı için açılmaz.' : 'Bu tarayıcıda 3B çizim açılamıyor.'} Aynı bilgi Matris'te.</p>
              <button type="button" className="tc-pyq-kucuk" onClick={matriseGec}>Matris'e geç</button>
            </div>
          )}
        </div>
        <aside className="tc-pyq-3b-panel" aria-live="polite" aria-label="Açıklama">{panel}</aside>
      </div>
      {bakis === 'D' && (
        <div className="tc-pyq-3b-emirler">
          <div className="tc-pyq-3b-suz">
            <span>Emirler · geç olan üstte · {hucreEmirleri.length} emir{secim ? ` · ${kod.get(secim.tezgah)?.kod ?? secim.tezgah}, ${veri.gunler[secim.gun]?.ad ?? ''}` : ''}</span>
            {secim && <button type="button" className="tc-pyq-kucuk" onClick={() => { setSecim(null); }}>Süzgeci kaldır</button>}
          </div>
          <div className="tc-pyq-3b-tablo" tabIndex={0} role="region" aria-label="Emirler">
            <table>
              <thead><tr><th scope="col">Emir</th><th scope="col">Ürün</th><th scope="col">Adımlar</th><th scope="col">Bitiş / termin</th></tr></thead>
              <tbody>
                {hucreEmirleri.map((e) => (
                  <tr key={e.id} data-d={e.durum} data-sec={secEmir === e.id ? '' : undefined}>
                    <td><button type="button" data-emir-sec={e.id} aria-current={secEmir === e.id} onClick={() => { sec(e.id, null); }}>{e.no}</button></td>
                    <td>{e.urun}</td>
                    <td>{e.adimlar.map((a) => { const x = m.isler[a.id]; return x ? kod.get(satirKimligi(x))?.kod ?? x.m : '–'; }).join(' → ')}</td>
                    <td>{termin(e)}</td>
                  </tr>
                ))}
                {!hucreEmirleri.length && <tr><td colSpan={4} className="tc-pyq-not">{secim ? 'Bu tezgâh ve günde süzgece uyan emir yok.' : 'Süzgece uyan emir yok.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
