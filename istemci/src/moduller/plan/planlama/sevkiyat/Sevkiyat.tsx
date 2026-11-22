import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Kart, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import '../../../../ortak/arayuz/tablo.css';
import { Acilim, IsiIzgarasi, Lejant, type IsiSecimi } from '../ortak/isi/index.ts';
import type { IsiUstDurumu } from '../ortak/isi/kurallar.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { useEmirNo, type EmirNo } from '../ortak/emir-no.ts';
import {
  AKIS_SINIRI, DONEMLER, bitisAkisi, donemOzetleri, farkYaz, sayiYaz, SEVK_LEJANTI, sevkAcilimi, sevkIsisi, sevkListesi, sevkSayilari, simdi, tarihSaatYaz, type AkisSatiri,
  type Donem, type DonemOzeti, type Olcu, type SevkIsiSatiri, type SevkSatiri,
} from './kurallar.ts';
import { sevkListeSatirlari } from './liste.ts';
import { SevkListesi, zamanYaz } from './SevkListesi.tsx';
import './sevkiyat.css';

// Sevk takvimi (3537 a, Kokpit dili; malzeme satın alma planının ikizi): üç görünüm. Liste sipariş başına tek satırdır (asıl görünüm);
// Takvim bugünkü ısı haritasıdır (telefonda yer yok, Liste açılır); Grafik dönem özeti ve bitiş akışıdır. Son seçilen görünüm ve dönem
// tarayıcıda hatırlanır. Plan durumu (yok, eski) plan şeridindedir (KOKPITE_GIDEN); sayfa yinelemez.
// Görünüm yalnız okur (455/1 a: sevk sevkiyat modülünden okunacak; 455/2 a: bitiş akışını sunucu yazar).

type Gosterim = 'ikisi' | 'grafik' | 'tablo';
type Gorunum = 'liste' | 'takvim' | 'grafik';
const OLCULER: readonly { deger: Olcu; baslik: string }[] = [{ deger: 'siparis', baslik: 'Sipariş' }, { deger: 'adet', baslik: 'Adet' }];
const GOSTERIMLER: readonly { deger: Gosterim; baslik: string }[] = [
  { deger: 'ikisi', baslik: 'Grafik ve tablo' }, { deger: 'grafik', baslik: 'Grafik' }, { deger: 'tablo', baslik: 'Tablo' },
];
const SERILER = [
  { alan: 'plan', ad: 'Plana göre bitmesi gereken' }, { alan: 'termin', ad: 'Termini gelen' }, { alan: 'sevk', ad: 'Sevk edilen' },
] as const;

// Bugünkü sayfanın dar ekran eşiği (00-baslangic.betik dar): altında tablolar karta döner. Orta ekranda (1024 altı) listenin yer sütunu açılıma iner.
const DAR = '(max-width: 767px)';
const ORTA = '(max-width: 1023px)';
function useEkran(sorgu: string): boolean {
  const [eslesti, eslestiYaz] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(sorgu).matches === true);
  useEffect(() => {
    const m = window.matchMedia?.(sorgu);
    if (!m) return undefined;
    const izle = (): void => { eslestiYaz(m.matches); };
    m.addEventListener('change', izle);
    return () => { m.removeEventListener('change', izle); };
  }, [sorgu]);
  return eslesti;
}

const GORUNUMLER: readonly { deger: Gorunum; baslik: string }[] = [{ deger: 'liste', baslik: 'Liste' }, { deger: 'takvim', baslik: 'Takvim' }, { deger: 'grafik', baslik: 'Grafik' }];
const GORUNUM_ANAHTARI = 'tmi.sevkiyat.gorunum';
const DONEM_ANAHTARI = 'tmi.sevkiyat.donem';
function gorunumOku(): Gorunum {
  try {
    const g = localStorage.getItem(GORUNUM_ANAHTARI);
    return g === 'takvim' || g === 'grafik' ? g : 'liste';
  } catch { return 'liste'; }
}
function donemOku(): Donem {
  try {
    const d = localStorage.getItem(DONEM_ANAHTARI);
    return d === 'gun' || d === 'ay' || d === 'yil' ? d : 'hafta';
  } catch { return 'hafta'; }
}
function sakla(anahtar: string, deger: string): void {
  try { localStorage.setItem(anahtar, deger); } catch { /* depo kapalı: yalnız bu açılışta geçerli */ }
}

function Secici<T extends string>({ etiket, secenekler, secili, sec }: {
  etiket: string; secenekler: readonly { deger: T; baslik: string }[]; secili: T; sec: (d: T) => void;
}) {
  return (
    <div className="tc-pyv-seg" role="group" aria-label={etiket}>
      {secenekler.map((s) => (
        <button key={s.deger} type="button" aria-pressed={s.deger === secili} onClick={() => { sec(s.deger); }}>{s.baslik}</button>
      ))}
    </div>
  );
}

// Sayfanın kendi tablosu (bugünkü sayfa td/kip): her hücre başlığını taşır, dar ekranda satır karta döner; geç satır data-ton ile işaretlenir.
interface Sutun<S> { anahtar: string; baslik: string; hucre: (s: S) => ReactNode; sag?: boolean }
function SevkTablosu<S>({ etiket, sutunlar, satirlar, anahtar, ton, sinif }: {
  etiket: string; sutunlar: readonly Sutun<S>[]; satirlar: readonly S[]; anahtar: (s: S) => string; ton?: (s: S) => string | undefined; sinif?: string;
}) {
  const dar = useEkran(DAR);
  return (
    <div className="tc-tablo-kap" data-kip={dar ? 'kart' : undefined}>
      <table className={`tc-tablo tc-pyv-tablo${sinif ? ` ${sinif}` : ''}`} aria-label={etiket}>
        <thead><tr>{sutunlar.map((c) => <th key={c.anahtar} scope="col" className={c.sag ? 'tc-tablo-sag' : undefined}>{c.baslik}</th>)}</tr></thead>
        <tbody>
          {satirlar.map((s) => (
            <tr key={anahtar(s)} data-ton={ton?.(s)}>
              {sutunlar.map((c) => <td key={c.anahtar} data-baslik={c.baslik} className={c.sag ? 'tc-tablo-sag mono' : undefined}>{c.hucre(s)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Sevkiyat({ calisma, sec, git, depo }: PlanlamaEkranOzellikleri) {
  const emirNo = useEmirNo(depo.receteRotaKaydi, depo.durum?.emirler);
  const dar = useEkran(DAR);
  const orta = useEkran(ORTA);
  const [donem, donemYaz] = useState<Donem>(donemOku);
  const [olcu, olcuYaz] = useState<Olcu>('siparis');
  const [gosterim, gosterimYaz] = useState<Gosterim>('ikisi');
  const [gorunum, gorunumYaz] = useState<Gorunum>(gorunumOku);
  const [secim, secimYaz] = useState<IsiSecimi | null>(null);
  const liste = useMemo(() => (calisma ? sevkListesi(calisma) : null), [calisma]);
  const isi = useMemo(() => (calisma && liste ? sevkIsisi(liste.satirlar, liste.taban, simdi(calisma), emirNo) : null), [calisma, liste, emirNo]);
  const satirlar = useMemo(() => (calisma && liste ? sevkListeSatirlari(liste.satirlar, liste.taban, simdi(calisma)) : []), [calisma, liste]);

  const takvimVar = !dar;
  const etkin: Gorunum = gorunum === 'takvim' && !takvimVar ? 'liste' : gorunum;
  const gorunumSec = (g: Gorunum): void => { gorunumYaz(g); sakla(GORUNUM_ANAHTARI, g); };
  const donemSec = (d: Donem): void => { donemYaz(d); sakla(DONEM_ANAHTARI, d); };
  const gorunumSecici = <Secici etiket="Görünüm" secenekler={takvimVar ? GORUNUMLER : GORUNUMLER.filter((g) => g.deger !== 'takvim')} secili={etkin} sec={gorunumSec} />;
  const donemSecici = <Secici etiket="Dönem" secenekler={DONEMLER} secili={donem} sec={donemSec} />;
  const goster = (id: string): void => { sec({ siparis: id, adim: null, tezgah: null }); git('kokpit'); };

  // Plan yokken de sayfa başlığıyla çizilir; plan Kokpit'te kurulur (3282-1 a), bağlantısı plan şeridindedir.
  if (!calisma || !liste || !isi) {
    return (
      <div className="tc-pyv">
        <Baslik ust={null} />
        <div className="tc-pyv-yok">
          <Simge ad="grid" boyut="k" />
          <span><b>Önce plan kurulmalı.</b> Plan kurulunca siparişlerin ne zaman bittiği ve hangisinin termine yetişmediği burada görünür.</span>
        </div>
      </div>
    );
  }
  return (
    <div className="tc-pyv">
      <Baslik ust={isi.durum} />
      {etkin === 'liste' && (
        <SevkListesi satirlar={satirlar} taban={liste.taban} emirNo={emirNo} donemSecici={donemSecici} donem={donem} ertelenen={sevkSayilari(liste.satirlar).ertelenen} gorunum={gorunumSecici} dar={dar} yerSutunu={!orta} goster={goster} />
      )}
      {etkin === 'takvim' && (
        <>
          <div className="tc-pyv-serit">{gorunumSecici}</div>
          <Lejant ogeler={SEVK_LEJANTI.ogeler} simgeler={SEVK_LEJANTI.simgeler} />
          <IsiIzgarasi
            etiket="Sipariş × gün, termine kalan süre" satirAd="Sipariş" genis="gun" sutunlar={isi.sutunlar} satirlar={isi.satirlar}
            secim={secim} sec={secimYaz} gizliAd="termine üç günden çok pay"
            acilim={(r, _sutun, kapat) => <SevkAcilimKarti r={r} taban={liste.taban} emirNo={emirNo} kapat={kapat} goster={() => { goster(r.x.id); }} />}
          />
        </>
      )}
      {etkin === 'grafik' && (
        <>
          <div className="tc-pyv-serit">{gorunumSecici}</div>
          <Ozet satirlar={liste.satirlar} taban={liste.taban} donem={donem} olcu={olcu} gor={gosterim} donemSecici={donemSecici} olcuYaz={olcuYaz} gorYaz={gosterimYaz} />
          <Akis satirlar={liste.satirlar} taban={liste.taban} emirNo={emirNo} />
        </>
      )}
    </div>
  );
}

// Sayfa başlığı ve nabız (Kokpit'in durum satırı gibi): en sıcak satır. Plan durumu (yok, eski) plan şeridindedir; sayfa yinelemez.
function Baslik({ ust }: { ust: IsiUstDurumu | null }) {
  return (
    <header className="tc-pyv-bas">
      <h2><Simge ad="truck" boyut="k" />Sevk takvimi</h2>
      {ust && <p className="tc-pyv-nabiz" data-ton={ust.ton} role="status"><Simge ad={ust.simge} boyut="k" /><span>{ust.metin}</span></p>}
    </header>
  );
}

// Satırın açılımı. "Sevk edildi olarak işaretle" formu sevkiyat modülünündür (455/1 a); burada form ve kilit metni yoktur (3537 a).
// "Kokpit'te": sipariş seçilir, Kokpit açılır (planın tek yeri, 3282-1 a).
function SevkAcilimKarti({ r, taban, emirNo, kapat, goster }: { r: SevkIsiSatiri; taban: number; emirNo: EmirNo; kapat: () => void; goster: () => void }) {
  const a = sevkAcilimi(r, taban, emirNo);
  return (
    <Acilim
      baslik={a.baslik} simge="truck" ton={a.ton} neden={a.neden} bilgi={a.bilgi} kapat={kapat}
      secenekler={[{ ad: `${emirNo(r.x.id)} Kokpit'te`, etki: 'Siparişi Kokpit\'te seçer.', simge: 'target', yap: goster }]}
    />
  );
}

function Ozet({ satirlar, taban, donem, olcu, gor, donemSecici, olcuYaz, gorYaz }: {
  satirlar: readonly SevkSatiri[]; taban: number; donem: Donem; olcu: Olcu; gor: Gosterim; donemSecici: ReactNode;
  olcuYaz: (o: Olcu) => void; gorYaz: (g: Gosterim) => void;
}) {
  const l = donemOzetleri(satirlar, taban, donem, olcu);
  const birim = olcu === 'adet' ? 'adet' : 'sipariş';
  const top = (k: 'plan' | 'termin' | 'gec' | 'sevk'): number => l.reduce((a, b) => a + b[k], 0);
  type Satir = DonemOzeti & { toplam?: true };
  const toplam: Satir = { anahtar: 'toplam', ad: 'Toplam', plan: top('plan'), termin: top('termin'), sevk: top('sevk'), gec: top('gec'), toplam: true };
  const sayiHucre = (n: number, s: Satir) => (s.toplam ? <b>{sayiYaz(n)}</b> : sayiYaz(n));
  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'donem', baslik: 'Dönem', hucre: (s) => <b>{s.ad}</b> },
    { anahtar: 'plan', baslik: 'Plana göre bitmesi gereken', sag: true, hucre: (s) => sayiHucre(s.plan, s) },
    { anahtar: 'termin', baslik: 'Termini gelen', sag: true, hucre: (s) => sayiHucre(s.termin, s) },
    {
      anahtar: 'gec', baslik: 'Geç bitecek', sag: true,
      hucre: (s) => (s.toplam ? sayiHucre(s.gec, s) : s.gec ? <Rozet ton="hata">{sayiYaz(s.gec)}</Rozet> : '—'),
    },
    { anahtar: 'sevk', baslik: 'Sevk edilen', sag: true, hucre: (s) => sayiHucre(s.sevk, s) },
    { anahtar: 'fark', baslik: 'Fark', sag: true, hucre: (s) => (s.toplam ? '' : `${s.plan - s.termin > 0 ? '+' : ''}${sayiYaz(s.plan - s.termin)}`) },
  ];
  return (
    <Kart baslik="Sevkiyat özeti" baslikEki={<Simge ad="chart" boyut="k" />}>
      <div className="tc-pyv-govde">
        <div className="tc-pyv-araclar">
          {donemSecici}
          <Secici etiket="Ölçü" secenekler={OLCULER} secili={olcu} sec={olcuYaz} />
          <Secici etiket="Gösterim" secenekler={GOSTERIMLER} secili={gor} sec={gorYaz} />
        </div>
        {gor !== 'tablo' && <Grafik l={l} birim={birim} />}
        {gor !== 'grafik' && (
          <SevkTablosu<Satir>
            etiket="Dönem başına sevkiyat" sutunlar={sutunlar} satirlar={l.length ? [...l, toplam] : []} anahtar={(s) => s.anahtar}
            ton={(s) => (s.toplam ? 'toplam' : undefined)}
          />
        )}
        <p className="tc-pyv-not">
          Birim: {birim}. Plana göre bitmesi gereken: son adımın plana göre bitişi (sevke hazır). Termini gelen: müşteriye söz verilen gün. Fark
          artıysa o dönem söz verilenden çok iş bitiyor (öne kayan iş), eksiyse iş sonraki döneme kayıyor. Sevk edilen, Sevkiyat tablosunda girilen
          tarihtir. Plan ufku sınırlı olduğu için aylık ve yıllık görünüm yalnız plandaki siparişleri sayar.
        </p>
      </div>
    </Kart>
  );
}

// Üç serili çubuk grafik: dönem başına yan yana üç çubuk. Renk yalnız sınıftan (tasarım değişkeni); değer fare üstünde ve tabloda okunur.
// Genişlik bugünkü sayfadaki gibi: dönem başına en az 72 birim, yer varsa kartın genişliğine (en çok 1100) yayılır.
const BOY = 220, UST = 16, ALT = 46, SOL = 40, DILIM = 72, EN_AZ = 260, EN_COK = 1100;
function useGenislik<E extends HTMLElement>(): [RefObject<E>, number | null] {
  const ref = useRef<E>(null);
  const [en, enYaz] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const g = new ResizeObserver(() => { enYaz(el.clientWidth); });
    g.observe(el);
    enYaz(el.clientWidth);
    return () => { g.disconnect(); };
  }, []);
  return [ref, en];
}
function Grafik({ l, birim }: { l: readonly DonemOzeti[]; birim: string }) {
  const [ref, yer] = useGenislik<HTMLDivElement>();
  if (!l.length) return <p className="tc-pyv-not">Gösterilecek dönem yok.</p>;
  const en = Math.max(EN_AZ, l.length * DILIM, Math.min(EN_COK, yer ?? 0));
  const mx = Math.max(1, ...l.flatMap((b) => SERILER.map((s) => b[s.alan])));
  const adim = 10 ** Math.floor(Math.log10(mx));
  const tavan = Math.ceil(mx / adim) * adim;
  const y = (v: number): number => UST + (BOY - UST - ALT) * (1 - v / tavan);
  const gw = (en - SOL - 8) / l.length;
  const bw = Math.min(18, (gw - 12) / 3);
  return (
    <>
      <div className="tc-pyv-lejant">
        {SERILER.map((s) => <span key={s.alan}><i className={`tc-pyv-seri-${s.alan}`} aria-hidden="true" />{s.ad}</span>)}
      </div>
      <div className="tc-pyv-grafik" ref={ref}>
        <svg viewBox={`0 0 ${String(en)} ${String(BOY)}`} width={en} height={BOY} role="img" aria-label="Dönem başına sevkiyat">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={SOL} x2={en - 4} y1={y(tavan * f)} y2={y(tavan * f)} className="tc-pyv-izgara" />
              <text x={SOL - 6} y={y(tavan * f) + 4} textAnchor="end" className="tc-pyv-eksen">{sayiYaz(tavan * f, 1)}</text>
            </g>
          ))}
          {l.map((b, i) => {
            const x0 = SOL + i * gw + (gw - bw * 3 - 4) / 2;
            const [ust, alt] = b.ad.split(' · ');
            return (
              <g key={b.anahtar}>
                {SERILER.map((s, j) => {
                  const v = b[s.alan];
                  return v ? (
                    <rect key={s.alan} x={x0 + j * (bw + 2)} y={y(v)} width={bw} height={Math.max(1, y(0) - y(v))} rx={2} className={`tc-pyv-seri-${s.alan}`}>
                      <title>{`${b.ad} · ${s.ad}: ${sayiYaz(v)} ${birim}`}</title>
                    </rect>
                  ) : null;
                })}
                <text x={SOL + i * gw + gw / 2} y={BOY - ALT + 16} textAnchor="middle" className="tc-pyv-eksen">{ust}</text>
                {alt && <text x={SOL + i * gw + gw / 2} y={BOY - ALT + 30} textAnchor="middle" className="tc-pyv-eksen">{alt}</text>}
              </g>
            );
          })}
        </svg>
      </div>
    </>
  );
}

function Akis({ satirlar, taban, emirNo }: { satirlar: readonly SevkSatiri[]; taban: number; emirNo: EmirNo }) {
  const l = bitisAkisi(satirlar);
  const sutunlar: Sutun<AkisSatiri>[] = [
    { anahtar: 'zaman', baslik: 'Zaman', hucre: (x) => <span className="mono">{zamanYaz(x.kayit.t)}</span> },
    { anahtar: 'siparis', baslik: 'Sipariş', hucre: (x) => <b className="mono">{emirNo(x.id)}</b> },
    { anahtar: 'degisiklik', baslik: 'Değişiklik', hucre: (x) => x.ad },
    { anahtar: 'bitis', baslik: 'Yeni bitiş', hucre: (x) => <span className="mono">{tarihSaatYaz(taban, x.kayit.C)}</span> },
    { anahtar: 'fark', baslik: 'Fark', sag: true, hucre: (x) => farkYaz(x.fark) },
    {
      anahtar: 'kaynak', baslik: 'Kaynak',
      hucre: (x) => <span className="tc-pyv-hucre">{x.kayit.kaynak}<small>{x.kayit.kim}</small></span>,
    },
  ];
  return (
    <Kart baslik="Bitiş tarihi akışı" baslikEki={<Simge ad="book" boyut="k" />}>
      <div className="tc-pyv-govde">
        {l.length === 0
          ? <p className="tc-pyv-not">Henüz plan değişikliği yok. Plan her çözüldüğünde ya da değiştiğinde siparişin bitişi kaydedilir.</p>
          : (
            <>
              <SevkTablosu<AkisSatiri>
                etiket="Bitiş tarihi akışı" sutunlar={sutunlar} satirlar={l.slice(0, AKIS_SINIRI)} anahtar={(x) => `${x.id}-${String(x.sira)}`}
              />
              {l.length > AKIS_SINIRI && <p className="tc-pyv-not">{`Son ${String(AKIS_SINIRI)} değişiklik gösteriliyor (toplam ${String(l.length)}).`}</p>}
            </>
          )}
      </div>
    </Kart>
  );
}
