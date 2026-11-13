import { useEffect, useMemo, useRef, useState } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { Derleme } from '../motor/kurallar.ts';
import {
  BEKLEME_ESIGI, MATRIS_GUNU, adimBeklemesi, aralikYuku, darbogaz, durumYazisi, emirGunleri, matrisSirasi, matrisYuku, satirKimligi, sayim, sureYaz, tezgahGunundeMi, yukYuzdesi,
  type KokpitEmri, type KokpitModeli, type MatrisYuku,
} from './kurallar.ts';

// Matris (kart 3185): plana tek bakış. Üstte tezgâhların 14 günlük yükü, altında emirler; ikisi birbirine bağlıdır (seçili emrin geçtiği
// tezgâh-günler yükte çerçevelenir, yük hücresi o tezgâh ve günün emirlerini süzer). Tıklama sayfa değiştirmez: emir ve adım seçilir,
// ayrıntı ve çözüm aynı ekranda açılır. Akış: emir gün gün. Yan yana: emir adım adım.
export type MatrisDuzeni = 'A' | 'Y';
const DUZENLER: readonly (readonly [MatrisDuzeni, string])[] = [['A', 'Akış'], ['Y', 'Yan yana']];
// Yük şeridi bu satırdan uzunsa emirlerin üstünde yapışık durmaz (ekranı kaplar).
const YAPISIK_SATIR = 12;
const DAR = '(max-width: 767px)';
export const darEkran = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia(DAR).matches;

export interface MatrisOzellikleri {
  m: KokpitModeli; cx: Derleme; duzen: MatrisDuzeni; duzenSec: (d: MatrisDuzeni) => void;
  emirler: readonly KokpitEmri[];
  secEmir: string | null; secIs: string | null;
  zaman: (t: number) => string;
  sec: (job: string, isId: string | null) => void;
  // Darboğaz düğmesi durum süzgecini "Geç"e alır.
  gecSuz: () => void;
}
interface YukSuzgeci { tezgah: string; gun: number | null }
interface YukSatiri { id: string; kod: string; ad: string; gunler: { sinif: MatrisYuku; yuzde: number | null; plan: number; acik: number }[]; dolu: boolean }

const GUNLER = Array.from({ length: MATRIS_GUNU }, (_, g) => g);

export function Matris({ m, cx, duzen, duzenSec, emirler, secEmir, secIs, zaman, sec, gecSuz }: MatrisOzellikleri) {
  const [suz, setSuz] = useState<YukSuzgeci | null>(null);
  const [tum, setTum] = useState(false);
  const [lej, setLej] = useState(false);
  const kap = useRef<HTMLDivElement | null>(null);
  const kod = useMemo(() => new Map(m.tezgahlar.map((t) => [t.id, t.kod])), [m]);
  const gunAdi = (g: number): string => { const z = zaman(m.bas + g * 24); return `${z.slice(6, 9)} ${z.slice(0, 2)}`; };

  const yuk = useMemo<YukSatiri[]>(() => {
    const isler = Object.values(m.isler);
    return m.tezgahlar.filter((t) => !t.fason).map((t) => {
      const gunler = GUNLER.map((g) => { const y = aralikYuku(cx, isler, t.id, m.bas + g * 24, m.bas + (g + 1) * 24); return { sinif: matrisYuku(y), yuzde: yukYuzdesi(y), plan: y.plan, acik: y.acik }; });
      return { id: t.id, kod: t.kod, ad: t.ad, gunler, dolu: gunler.some((x) => x.sinif === 'tam' || x.sinif === 'dolu') };
    });
  }, [m, cx]);
  const liste = useMemo(() => matrisSirasi(emirler).filter((e) => !suz || tezgahGunundeMi(m, e, suz.tezgah, suz.gun)), [emirler, suz, m]);
  // Seçili emrin geçtiği tezgâh-günler.
  const iz = useMemo(() => {
    const s = new Set<string>(), e = secEmir ? m.emirler.find((x) => x.id === secEmir) : undefined;
    for (const a of e?.adimlar ?? []) {
      const x = m.isler[a.id];
      if (x && !x.fason) for (const g of GUNLER) if (x.S < m.bas + (g + 1) * 24 && x.C > m.bas + g * 24) s.add(`${x.m}|${String(g)}`);
    }
    return s;
  }, [m, secEmir]);
  const gec = sayim(m.emirler).gec, dar = useMemo(() => darbogaz(m), [m]);

  // Dar ekranda ayrıntı alttan açılır; seçili satır onun altında kalmasın diye görünür yere kaydırılır.
  useEffect(() => {
    if (!secEmir || !darEkran()) return;
    const tr = kap.current?.querySelector('tr[data-sec]');
    if (tr && typeof tr.scrollIntoView === 'function') tr.scrollIntoView({ block: 'start' });
  }, [secEmir, duzen]);

  const yukSatirlari = yuk.map((t) => (
    <tr key={t.id} data-yuk-satiri={t.id} data-dolu={t.dolu ? '' : undefined} data-iz={GUNLER.some((g) => iz.has(`${t.id}|${String(g)}`)) ? '' : undefined}>
      <th scope="row"><span><b>{t.kod}</b><small>{t.ad}</small></span></th>
      {t.gunler.map((y, g) => {
        if (y.sinif === 'kapali') return <td key={g} data-yuk="kapali" />;
        const secili = suz?.tezgah === t.id && (suz.gun === g || suz.gun === null);
        const bilgi = `${t.kod} · ${gunAdi(g)} · %${String(y.yuzde ?? 0)} dolu (${String(Math.round(y.plan))} / ${String(Math.round(y.acik))} sa)`;
        return (
          <td key={g} data-yuk={y.sinif} data-iz={iz.has(`${t.id}|${String(g)}`) ? '' : undefined} data-suz={secili ? '' : undefined}>
            <button type="button" data-gun={g} title={bilgi} aria-label={bilgi} aria-pressed={suz?.tezgah === t.id && suz.gun === g} onClick={() => { setSuz(suz?.tezgah === t.id && suz.gun === g ? null : { tezgah: t.id, gun: g }); }}>
              {y.sinif === 'bos' ? '' : y.yuzde}
            </button>
          </td>
        );
      })}
    </tr>
  ));
  const gunBasligi = (
    <tr>
      <th scope="col">
        <span className="tc-pyq-genis">Tezgâh yükü %</span>
        <button type="button" className="tc-pyq-dar" aria-pressed={tum} onClick={() => { setTum(!tum); }}>{tum ? 'Tüm tezgâhlar' : 'Dolu tezgâhlar'}<Simge ad="chev-right" boyut="k" /></button>
      </th>
      {GUNLER.map((g) => <th scope="col" key={g}>{gunAdi(g)}</th>)}
    </tr>
  );
  const emirBasi = (e: KokpitEmri, alt: string) => (
    <th scope="row">
      <button type="button" data-emir-sec={e.id} aria-current={secEmir === e.id} onClick={() => { sec(e.id, null); }}><b>{e.no}</b><small>{alt}</small></button>
    </th>
  );
  const bosSatir = (n: number) => <tr><td colSpan={n} className="tc-pyq-not">Süzgece uyan emir yok.</td></tr>;

  const akis = (
    <div className="tc-pyq-mat-govde" tabIndex={0} role="region" aria-label="Tezgâh yükü ve emirler, gün gün">
      <table className="tc-pyq-mat" data-tur="A">
        <thead data-yapisik={yuk.length <= YAPISIK_SATIR ? '' : undefined}>
          {gunBasligi}
          {yukSatirlari}
          <tr className="tc-pyq-mat-bolum"><th colSpan={MATRIS_GUNU + 1}><span>Emirler · geç olan üstte · {liste.length} emir</span></th></tr>
        </thead>
        <tbody>
          {liste.map((e) => (
            <tr key={e.id} data-emir={e.id} data-d={e.durum} data-sec={secEmir === e.id ? '' : undefined}>
              {emirBasi(e, `${e.urun} · ${durumYazisi(e)}`)}
              {emirGunleri(m, e).map((g, i) => (
                <td key={i} data-bekle={g.bekle ? '' : undefined} data-termin={g.termin ? '' : undefined} data-sonra={g.sonra ? '' : undefined}>
                  {g.adimlar.length > 0 && (
                    <div className="tc-pyq-cipler">
                      {g.adimlar.map((k) => {
                        const a = e.adimlar[k], x = a ? m.isler[a.id] : undefined;
                        if (!a || !x) return null;
                        const yer = kod.get(satirKimligi(x)) ?? x.m, bilgi = `${a.ad} · ${yer} · ${zaman(x.S)} – ${zaman(x.C).slice(6)}`;
                        return <button type="button" key={a.id} className="tc-pyq-cip" data-d={x.basladi ? 'sur' : e.durum} data-hucre={a.id} aria-pressed={secIs === a.id} title={bilgi} aria-label={bilgi} onClick={() => { sec(e.id, a.id); }}>{yer}</button>;
                      })}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
          {!liste.length && bosSatir(MATRIS_GUNU + 1)}
        </tbody>
      </table>
    </div>
  );

  const adimSayisi = liste.reduce((x, e) => Math.max(x, e.adimlar.length), 0);
  const yan = (
    <>
      <div className="tc-pyq-mat-govde" tabIndex={0} role="region" aria-label="Tezgâh × gün yükü">
        <table className="tc-pyq-mat" data-tur="Y"><thead>{gunBasligi}</thead><tbody>{yukSatirlari}</tbody></table>
      </div>
      <div className="tc-pyq-mat-govde" data-kisa="" tabIndex={0} role="region" aria-label="Emir × adım matrisi">
        <table className="tc-pyq-mat" data-tur="E">
          <thead><tr><th scope="col">Emir</th>{Array.from({ length: adimSayisi }, (_, j) => <th scope="col" key={j}>{j + 1}. adım</th>)}<th scope="col">Bitiş / termin</th></tr></thead>
          <tbody>
            {liste.map((e) => (
              <tr key={e.id} data-emir={e.id} data-d={e.durum} data-sec={secEmir === e.id ? '' : undefined}>
                {emirBasi(e, e.urun)}
                {Array.from({ length: adimSayisi }, (_, j) => {
                  const a = e.adimlar[j];
                  if (!a) return <td key={j} />;
                  const x = m.isler[a.id];
                  if (!x) return <td key={j} data-d="plansiz"><button type="button" onClick={() => { sec(e.id, null); }}><b>{a.ad}</b><small>plansız</small></button></td>;
                  const b = adimBeklemesi(m, e, j), bekler = b !== null && b.acik >= BEKLEME_ESIGI, yer = kod.get(satirKimligi(x)) ?? x.m;
                  return (
                    <td key={j} data-d={x.basladi ? 'sur' : undefined} data-bek={bekler ? '' : undefined}>
                      <button type="button" data-hucre={a.id} aria-pressed={secIs === a.id} title={`${a.ad} · ${yer} · ${zaman(x.S)} – ${zaman(x.C).slice(6)}`} onClick={() => { sec(e.id, a.id); }}>
                        <b>{a.ad} · {yer}</b><small>{zaman(x.S).slice(6)}{bekler && <em> · {sureYaz(b.sure)} bekler</em>}</small>
                      </button>
                    </td>
                  );
                })}
                <td data-son="" data-d={e.durum}><b>{durumYazisi(e)}</b><small>{e.bitis === null ? '–' : `biter ${zaman(e.bitis).slice(0, 9)}`}{e.termin === null ? '' : ` · termin ${zaman(e.termin).slice(0, 9)}`}</small></td>
              </tr>
            ))}
            {!liste.length && bosSatir(adimSayisi + 2)}
          </tbody>
        </table>
      </div>
    </>
  );

  const darKod = dar ? kod.get(dar.tezgah) ?? dar.tezgah : '';
  return (
    <div className="tc-pyq-mat-kap" data-tum={tum ? 'evet' : 'hayir'} ref={kap}>
      <div className="tc-pyq-mat-ust">
        <p className="tc-pyq-ozet" role="status">
          {gec > 0 ? <><b>{gec} emir geç.</b>{dar && ` ${String(dar.emir)} tanesi ${darKod} tezgâhında toplam ${sureYaz(dar.sure)} sıra bekliyor.`}</> : <b>Geç emir yok.</b>}
        </p>
        {gec > 0 && dar && <button type="button" className="tc-pyq-kucuk" data-darbogaz={dar.tezgah} onClick={() => { setSuz({ tezgah: dar.tezgah, gun: null }); gecSuz(); }}>{darKod} emirlerini göster</button>}
        {suz && (
          <span className="tc-pyq-suz">
            {kod.get(suz.tezgah) ?? suz.tezgah}{suz.gun === null ? '' : ` · ${gunAdi(suz.gun)}`} süzgeci
            <button type="button" aria-label="Süzgeci kaldır" onClick={() => { setSuz(null); }}><Simge ad="x" boyut="k" /></button>
          </span>
        )}
        <details className="tc-pyq-lejk" open={lej} onToggle={(ev) => { setLej(ev.currentTarget.open); }}>
          <summary><Simge ad="chev-right" boyut="k" />Renkler ne anlatıyor</summary>
          <div className="tc-pyq-lej">
            <span data-yuk="hafif">az dolu</span><span data-yuk="orta">yarı dolu</span><span data-yuk="dolu">dolmak üzere</span><span data-yuk="tam">tam dolu</span>
            {duzen === 'A' && <><span data-lej="bekle">sırada bekliyor</span><span data-lej="termin">termin günü</span></>}
            <span data-lej="iz">seçili emrin geçtiği yer</span>
          </div>
        </details>
        <span className="tc-pyq-seg tc-pyq-duzen" role="group" aria-label="Düzen">
          {DUZENLER.map(([k, ad]) => <button type="button" key={k} aria-pressed={duzen === k} onClick={() => { duzenSec(k); }}>{ad}</button>)}
        </span>
      </div>
      {duzen === 'A' ? akis : yan}
    </div>
  );
}
