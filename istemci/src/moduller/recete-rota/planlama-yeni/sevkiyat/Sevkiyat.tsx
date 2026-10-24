import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Kart, Rozet, SayiKarti, Simge } from '../../../../ortak/arayuz/index.ts';
import '../../../../ortak/arayuz/tablo.css';
import { planGuncel } from '../durum.ts';
import { Acilim, BosHarita, IsiIzgarasi, IsiSayfasi, Lejant, type IsiSecimi } from '../ortak/isi/index.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import {
  ACIK_GRUP, AKIS_SINIRI, AYNI_BITIS, DONEMLER, bitisAkisi, donemOzetleri, farkYaz, gecMi, ilkPlanaGore, oncekineGore, planAdi, sayiYaz, sevkDurumu,
  SEVK_LEJANTI, sevkAcilimi, sevkGruplari, sevkGunuYaz, sevkIsisi, sevkListesi, sevkSayilari, simdi, tarihSaatYaz, type AkisSatiri, type BitisKaydi, type Donem, type DonemOzeti, type Olcu,
  type SevkIsiSatiri, type SevkSatiri,
} from './kurallar.ts';
import './sevkiyat.css';

// Sevkiyat: plana göre bitmesi gereken işler (bugünkü sayfa zx-sevkiyat.betik, üst katman zz30-isi ISI.sevkiyat). Üstte ısı haritası
// (sipariş × gün, ortak bileşen) ve durum satırı; "Tüm satırlar"da dönem özeti, dönem dönem sipariş listesi ve bitiş tarihi akışı.
// Görünüm yalnız okur (455/1 a: sevk sevkiyat modülünden okunacak; 455/2 a: bitiş akışını sunucu yazar).
// Düzen bugünkü sayfanındır (tasarım koruma): bölümlü seçici, sayfanın kendi tablosu (dar ekranda satır karta döner, geç satır işaretli),
// karta yayılan grafik.

type Gorunum = 'ikisi' | 'grafik' | 'tablo';
const OLCULER: readonly { deger: Olcu; baslik: string }[] = [{ deger: 'siparis', baslik: 'Sipariş' }, { deger: 'adet', baslik: 'Adet' }];
const GORUNUMLER: readonly { deger: Gorunum; baslik: string }[] = [
  { deger: 'ikisi', baslik: 'Grafik ve tablo' }, { deger: 'grafik', baslik: 'Grafik' }, { deger: 'tablo', baslik: 'Tablo' },
];
const SERILER = [
  { alan: 'plan', ad: 'Plana göre bitmesi gereken' }, { alan: 'termin', ad: 'Termini gelen' }, { alan: 'sevk', ad: 'Sevk edilen' },
] as const;
const zamanYaz = (ms: number): string => new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Bugünkü sayfanın dar ekran eşiği (00-baslangic.betik dar): altında tablolar karta döner.
const DAR = '(max-width: 767px)';
function useDar(): boolean {
  const [dar, darYaz] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(DAR).matches === true);
  useEffect(() => {
    const m = window.matchMedia?.(DAR);
    if (!m) return undefined;
    const izle = (): void => { darYaz(m.matches); };
    m.addEventListener('change', izle);
    return () => { m.removeEventListener('change', izle); };
  }, []);
  return dar;
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
  const dar = useDar();
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

export function Sevkiyat({ calisma }: PlanlamaEkranOzellikleri) {
  const [donem, donemYaz] = useState<Donem>('gun');
  const [olcu, olcuYaz] = useState<Olcu>('siparis');
  const [gor, gorYaz] = useState<Gorunum>('ikisi');
  const liste = useMemo(() => (calisma ? sevkListesi(calisma) : null), [calisma]);

  const isi = useMemo(() => (calisma && liste ? sevkIsisi(liste.satirlar, liste.taban, simdi(calisma)) : null), [calisma, liste]);
  const [secim, secimYaz] = useState<IsiSecimi | null>(null);

  const donemSecici = <Secici etiket="Dönem" secenekler={DONEMLER} secili={donem} sec={donemYaz} />;
  // "Tüm satırlar": bugünkü sayfanın asıl içeriği (özet, iş listesi, bitiş akışı).
  const tum = !calisma || !liste
    ? <Kart baslik="Plana göre bitmesi gereken işler"><p className="tc-pyv-not">Önce plan kurulmalı.</p></Kart>
    : (
      <>
        <Ozet satirlar={liste.satirlar} taban={liste.taban} donem={donem} olcu={olcu} gor={gor} donemSecici={donemSecici} olcuYaz={olcuYaz} gorYaz={gorYaz} />
        <Isler satirlar={liste.satirlar} taban={liste.taban} donem={donem} guncel={planGuncel(calisma)} donemSecici={donemSecici} />
        <Akis satirlar={liste.satirlar} taban={liste.taban} />
      </>
    );
  return (
    <div className="tc-pyv">
      <IsiSayfasi simge="truck" baslik="Sevkiyat" alt={isi ? 'Sipariş × gün, termine kalan süre' : undefined} ust={isi?.durum} tum={tum}>
        {isi && liste
          ? (
            <>
              <Lejant ogeler={SEVK_LEJANTI.ogeler} simgeler={SEVK_LEJANTI.simgeler} />
              <IsiIzgarasi
                etiket="Sipariş × gün, termine kalan süre" satirAd="Sipariş" genis="gun" sutunlar={isi.sutunlar} satirlar={isi.satirlar}
                secim={secim} sec={secimYaz} gizliAd="termine üç günden çok pay"
                acilim={(r, _sutun, kapat) => <SevkAcilimKarti r={r} taban={liste.taban} kapat={kapat} />}
              />
            </>
          )
          : <BosHarita metin="Plan kurulunca siparişlerin sevk günleri burada görünür." />}
      </IsiSayfasi>
    </div>
  );
}

// Satırın açılımı. Bugünkü sayfanın "Sevk edildi olarak işaretle" formu 455/1 a ile gelmez (sevk sevkiyat modülünden okunacak);
// "çizelgede" seçeneği yerinde ve pasif: Planlama motoru görünümünde siparişi seçmek iskelet desteği ister.
function SevkAcilimKarti({ r, taban, kapat }: { r: SevkIsiSatiri; taban: number; kapat: () => void }) {
  const a = sevkAcilimi(r, taban);
  return (
    <Acilim
      baslik={a.baslik} simge="truck" ton={a.ton} neden={a.neden} bilgi={a.bilgi} kapat={kapat}
      secenekler={[{ ad: `${r.x.id} çizelgede`, etki: 'Siparişin adımlarını tezgâh çizelgesinde gösterir.', simge: 'gantt', pasif: true }]}
    />
  );
}

function Ozet({ satirlar, taban, donem, olcu, gor, donemSecici, olcuYaz, gorYaz }: {
  satirlar: readonly SevkSatiri[]; taban: number; donem: Donem; olcu: Olcu; gor: Gorunum; donemSecici: ReactNode;
  olcuYaz: (o: Olcu) => void; gorYaz: (g: Gorunum) => void;
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
          <Secici etiket="Görünüm" secenekler={GORUNUMLER} secili={gor} sec={gorYaz} />
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

function DurumRozeti({ x }: { x: SevkSatiri }) {
  const d = sevkDurumu(x);
  if (d === 'gec') return <Rozet ton="hata">{`${sayiYaz(x.T ?? 0, 1)} sa geç`}</Rozet>;
  return d === 'son-gun' ? <Rozet ton="uyari">son gün</Rozet> : <Rozet ton="tamam">zamanında</Rozet>;
}

function PlanGecmisi({ x, taban }: { x: SevkSatiri; taban: number }) {
  const l = x.gecmis;
  const sira = l.map((k, i) => ({ k, i })).reverse();
  const ciz = (x: { k: BitisKaydi; i: number }) => satir(x.k, x.i);
  const satir = (k: BitisKaydi, i: number) => {
    const f = oncekineGore(l, i);
    return (
      <li key={i} data-son={i === l.length - 1 ? '' : undefined}>
        <b>{planAdi(l, i)}</b> <span className="mono">{tarihSaatYaz(taban, k.C)}</span>
        {f !== null && <span className="mono" data-ton={f > 0 ? 'hata' : 'tamam'}> {farkYaz(f)}</span>}
        <small>{`${k.kaynak} · ${k.kim} · ${zamanYaz(k.t)}`}</small>
      </li>
    );
  };
  return (
    <>
      <ol className="tc-pyv-iz">{sira.slice(0, 3).map(ciz)}</ol>
      {sira.length > 3 && (
        <details className="tc-pyv-daha">
          <summary>{`${String(sira.length - 3)} eski plan daha`}</summary>
          <ol className="tc-pyv-iz">{sira.slice(3).map(ciz)}</ol>
        </details>
      )}
    </>
  );
}

function PlanHucresi({ x, taban }: { x: SevkSatiri; taban: number }) {
  const f = ilkPlanaGore(x.gecmis);
  return (
    <span className="tc-pyv-hucre">
      <span className="mono tc-pyv-kirilmaz">{tarihSaatYaz(taban, x.C)}</span>
      <small>{`${x.adim ?? 'son adım'}${x.yer ? ` · ${x.yer}` : ''}`}</small>
      {f !== null && (
        <details className="tc-pyv-daha">
          <summary>
            <Simge ad={f > AYNI_BITIS ? 'clock' : 'check'} boyut="k" />
            {`${String(x.gecmis.length)} plan`}
            {Math.abs(f) > AYNI_BITIS ? ` · ilk plana göre ${sayiYaz(Math.abs(f), 1)} sa ${f > 0 ? 'geç' : 'erken'}` : ' · ilk planla aynı'}
          </summary>
          <PlanGecmisi x={x} taban={taban} />
        </details>
      )}
    </span>
  );
}

function SevkHucresi({ x, taban }: { x: SevkSatiri; taban: number }) {
  return (
    <span className="tc-pyv-hucre">
      {x.sevk ? <Rozet ton="tamam">{`sevk edildi ${sevkGunuYaz(x.sevk.t)}`}</Rozet> : x.gercekBitis !== null ? <Rozet ton="bilgi">üretim bitti</Rozet> : null}
      <span className="mono">{x.sevk ? x.sevk.t : '—'}</span>
      {x.gercekBitis !== null && <small>{`üretim bitişi ${tarihSaatYaz(taban, x.gercekBitis)}`}</small>}
    </span>
  );
}

function Isler({ satirlar, taban, donem, guncel, donemSecici }: {
  satirlar: readonly SevkSatiri[]; taban: number; donem: Donem; guncel: boolean; donemSecici: ReactNode;
}) {
  const sayilar = sevkSayilari(satirlar);
  const gruplar = sevkGruplari(satirlar, taban, donem);
  const sutunlar: Sutun<SevkSatiri>[] = [
    {
      anahtar: 'siparis', baslik: 'Sipariş ve müşteri',
      hucre: (x) => <span className="tc-pyv-hucre"><b className="mono">{x.id}</b><small>{`${x.ad ?? ''} · ${x.musteri}`}</small></span>,
    },
    { anahtar: 'adet', baslik: 'Adet', sag: true, hucre: (x) => (x.adet === null ? '—' : sayiYaz(x.adet)) },
    { anahtar: 'bitis', baslik: 'Plana göre bitiş', hucre: (x) => <PlanHucresi x={x} taban={taban} /> },
    {
      anahtar: 'termin', baslik: 'Termin ve durum',
      hucre: (x) => (
        <span className="tc-pyv-hucre">
          {x.termin === null ? <span>termin yok</span> : <span className="mono tc-pyv-kirilmaz">{tarihSaatYaz(taban, x.termin)}</span>}
          <DurumRozeti x={x} />
        </span>
      ),
    },
    { anahtar: 'sevk', baslik: 'Sevk', hucre: (x) => <SevkHucresi x={x} taban={taban} /> },
  ];
  return (
    <Kart baslik="Plana göre bitmesi gereken işler" baslikEki={<Simge ad="truck" boyut="k" />}>
      <div className="tc-pyv-govde">
        <div className="tc-pyv-araclar">{donemSecici}</div>
        <div className="tc-pyv-sayilar">
          <SayiKarti baslik="Bitmesi gereken" simge="truck" sayi={sayilar.bitecek} altMetin="plandaki sipariş" />
          <SayiKarti baslik="Termini geçecek" simge="alert" sayi={sayilar.gec} altMetin={sayilar.gec ? 'müşteriye haber' : 'yok'} ton="hata" />
          <SayiKarti baslik="Son gün bitecek" simge="clock" sayi={sayilar.sonGun} altMetin="termine 24 saatten az" ton="uyari" />
        </div>
        {gruplar.length === 0 && <p className="tc-pyv-not">Planda bitecek iş yok.</p>}
        {gruplar.map((g, i) => (
          <details key={g.anahtar} className="tc-pyv-grup" open={i < ACIK_GRUP}>
            <summary>
              <Simge ad="flag" boyut="k" />
              <b>{g.ad}</b>
              <span className="tc-pyv-say"><span className="mono">{g.satirlar.length}</span> sipariş · <span className="mono">{sayiYaz(g.adet)}</span> adet</span>
              {g.gec ? <Rozet ton="hata">{`${String(g.gec)} geç`}</Rozet> : <Rozet ton="tamam">hepsi zamanında</Rozet>}
            </summary>
            <SevkTablosu<SevkSatiri>
              etiket={`${g.ad} siparişleri`} sutunlar={sutunlar} satirlar={g.satirlar} anahtar={(x) => x.id} sinif="tc-pyv-is"
              ton={(x) => (gecMi(x) ? 'hata' : undefined)}
            />
          </details>
        ))}
        <p className="tc-pyv-not">
          Sipariş, son adımının (genelde son ölçüm) plana göre bittiği döneme düşer; sevkiyat o günden itibaren yapılabilir. Plan değiştikçe eski
          bitiş silinmez: bitiş hücresindeki satırı açınca ilk plan ve her ertelenmiş ya da öne çekilmiş plan görünür. {sayilar.ertelenen} sipariş
          ilk planına göre ertelendi.{guncel ? '' : ' Veri plandan sonra değişti; plan yeniden çözülünce güncellenir.'}
        </p>
      </div>
    </Kart>
  );
}

function Akis({ satirlar, taban }: { satirlar: readonly SevkSatiri[]; taban: number }) {
  const l = bitisAkisi(satirlar);
  const sutunlar: Sutun<AkisSatiri>[] = [
    { anahtar: 'zaman', baslik: 'Zaman', hucre: (x) => <span className="mono">{zamanYaz(x.kayit.t)}</span> },
    { anahtar: 'siparis', baslik: 'Sipariş', hucre: (x) => <b className="mono">{x.id}</b> },
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
