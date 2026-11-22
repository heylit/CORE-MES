import { useEffect, useMemo, useState } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { emirKuyrugu } from '../ortak/emir-no.ts';
import { BASLIK_ADI, GELEN_SIMGESI, gelenSirasi, type Degisiklik, type Gelenler } from './degisiklikler.ts';
import type { CanliYer } from './Tahta.tsx';
import type { Derleme } from '../motor/kurallar.ts';
import { Bos, FarkRozeti, Halka } from './Tablo.tsx';
import { SU_AN_ADI, farkOlustur, ilerleme, siralaGecikme, suAn, tarihSaat, type Siralama } from './tablo.ts';
import { aralikYuku, bagimlilik, durumYazisi, sureYaz, durusYazisi, ekMesaiYazisi, matrisSirasi, satirKimligi, suAndakiDurus, yukYuzdesi, type KokpitEmri, type KokpitIsi, type KokpitModeli } from './kurallar.ts';

// Telefonda tahtanın yerini tutan liste. Tezgâh gözü: önce plana alınacak emirler, sonra tezgâh tezgâh sıradaki işler (ilk üçü, gerisi
// düğmeyle); Sipariş gözü: emirler, geç olan üstte. Satıra dokununca ayrıntı alttan açılır.
const ILK = 3;

export interface ListeOzellikleri {
  m: KokpitModeli; cx: Derleme; goz: 'T' | 'S';
  // Süzgeçten geçen emirler.
  emirler: readonly KokpitEmri[];
  secEmir: string | null; secIs: string | null;
  zaman: (t: number) => string;
  sec: (job: string, isId: string | null) => void;
  // 3330: seçili kartın emirleri; satırları öne çıkar, ötekiler solar ve adımın bağı satırda yazar (listede ok yoktur).
  yanan?: ReadonlySet<string> | null;
  // Tezgâhta sorun bildir (3335 a): tezgâh başlığındaki düğme o tezgâhın arıza ve bakım formunu açar; fason satırında yok.
  sorunBildir?: ((tezgah: string) => void) | null;
  // Emir düzeyindeki notlar (kurallar.ts emirNotlari): telefonda ağaç yoktur, not emrin kartında durum satırının altında yazar.
  emirNotu?: ((e: KokpitEmri) => readonly string[]) | null;
  // 3532: gelen değişikliklerin işareti satırın solunda (işaretsiz satırda yeri boş kalır); satıra basınca cümle satırın altında açılır,
  // dışına basınca ya da Esc ile kapanır. eskiYer: "Planı güncelle"den önceki yerler; satırda "N sa ileri/geri" yazar. Hayalet yoktur.
  gelen?: Gelenler | null;
  eskiYer?: Readonly<Record<string, CanliYer>> | null;
  // 3533: Emirler gözünün sıralaması (tablo başındaki seçici; telefonda da aynı). Plan sırası bugünkü matris sırasıdır; yalnız görünümü değiştirir.
  sira?: Siralama;
}

export function Liste({ m, cx, goz, emirler, secEmir, secIs, zaman, sec, yanan = null, sorunBildir = null, emirNotu = null, gelen = null, eskiYer = null, sira = 'plan' }: ListeOzellikleri) {
  const isaret = (job: string) => ({ 'data-yanan': yanan?.has(job) ? '' : undefined, 'data-sonuk': yanan && !yanan.has(job) ? '' : undefined });
  const [acik, setAcik] = useState<ReadonlySet<string>>(new Set());
  const [cumle, setCumle] = useState<string | null>(null);
  useEffect(() => {
    if (cumle === null) return undefined;
    const bas = (ev: PointerEvent): void => { if (!(ev.target as Element | null)?.closest?.(`[data-liste-satir="${cumle.replace(/["\\]/g, '\\$&')}"]`)) setCumle(null); };
    const tus = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') setCumle(null); };
    document.addEventListener('pointerdown', bas, true); document.addEventListener('keydown', tus);
    return () => { document.removeEventListener('pointerdown', bas, true); document.removeEventListener('keydown', tus); };
  }, [cumle]);
  const isaretVar = gelen !== null && gelen.isler.size > 0;
  const emirGelenleri = (e: KokpitEmri): Degisiklik[] => [...new Set(e.adimlar.flatMap((a) => gelen?.isler.get(a.id) ?? []))].sort(gelenSirasi);
  const simge = (l: readonly Degisiklik[]) => (isaretVar ? <i className="tc-pyq-liste-gelen" data-tur={l[0]?.baslik}>{l[0] && <><Simge ad={GELEN_SIMGESI[l[0].baslik]} boyut="k" /><span className="tc-gizli-etiket">{BASLIK_ADI[l[0].baslik]}</span></>}</i> : null);
  const cumleSatiri = (id: string, l: readonly Degisiklik[]) => (cumle === id && l.length > 0 ? (
    <div className="tc-pyq-liste-cumle" role="status" data-liste-cumle={id}>{l.map((d) => <p key={d.anahtar}><b>{BASLIK_ADI[d.baslik]}:</b> {d.ne}{d.alt ? <small>{d.alt}</small> : null}</p>)}</div>
  ) : null);
  const kayma = (x: KokpitIsi): string => {
    const y = eskiYer?.[x.id];
    if (!y) return '';
    const d = x.S - y.S;
    return Math.abs(d) > 0.01 ? ` · ${sureYaz(d)} ${d > 0 ? 'ileri' : 'geri'}` : y.m !== x.m ? ' · yeni tezgâh' : '';
  };
  const emir = useMemo(() => new Map(emirler.map((e) => [e.id, e])), [emirler]);
  const gruplar = useMemo(() => {
    const hepsi = Object.values(m.isler), gorunen = hepsi.filter((x) => emir.has(x.job));
    return m.tezgahlar.map((t) => {
      const isler = gorunen.filter((x) => satirKimligi(x) === t.id).sort((a, b) => a.S - b.S);
      const yuzde = t.fason ? null : yukYuzdesi(aralikYuku(cx, hepsi, t.id, m.bas, m.bas + 7 * 24));
      return { t, isler, yuzde, durum: suAn(hepsi, t.id, suAndakiDurus(m, t.id) !== null) };
    }).filter((g) => g.isler.length > 0);
  }, [m, cx, emir]);

  const emirSatiri = (e: KokpitEmri) => {
    const l = emirGelenleri(e);
    return (
    <li key={e.id} data-liste-satir={e.id}>
      <button type="button" data-d={e.durum} title={durumYazisi(e)} aria-current={secEmir === e.id} {...isaret(e.id)} data-gelen={l.length > 0 ? '' : undefined} onClick={() => { sec(e.id, null); setCumle(l.length > 0 ? e.id : null); }}>
        {simge(l)}
        <span className="tc-pyq-kart">
          <span className="tc-pyq-kart-ust">
            <b>{e.no}</b>
            <span className="tc-pyq-kart-sag"><FarkRozeti f={farkOlustur(e)} />{(() => { const i = ilerleme(e, m.isler); return i ? <Halka i={i} kucuk /> : null; })()}</span>
          </span>
          <span className="tc-pyq-kart-alt">
            <span title={e.urun}>{e.urun}</span>
            <em>{`${String(e.adet)} adet`}</em>
            <em>{e.termin === null ? <>Termin <Bos ad="yok" /></> : `Termin ${tarihSaat(zaman, e.termin)}`}</em>
          </span>
          {e.durum === 'plansiz' || e.durum === 'risk' || e.gecikme === null ? <small className="tc-pyq-kart-durum">{durumYazisi(e)}</small> : null}
        </span>
        {emirNotu?.(e).map((y) => <small data-emir-not={e.id} key={y}>{y}</small>)}
      </button>
      {cumleSatiri(e.id, l)}
    </li>
    );
  };
  const isSatiri = (x: KokpitIsi) => {
    const e = emir.get(x.job);
    const adim = yanan?.has(x.job) ? e?.adimlar.find((a) => a.id === x.id) : undefined;
    const bag = e && adim ? bagimlilik(e, adim)?.kisa ?? '' : '';
    const l = gelen?.isler.get(x.id) ?? [];
    return (
      <li key={x.id} data-liste-satir={x.id}>
        <button
          type="button" data-d={e?.durum ?? 'iyi'} aria-current={secIs === x.id} {...isaret(x.job)} data-gelen={l.length > 0 ? '' : undefined}
          onClick={() => { sec(x.job, x.id); setCumle(l.length > 0 ? x.id : null); }}
        >
          {simge(l)}<b>{emirKuyrugu(e?.no ?? x.job)}</b><span>{e ? `${e.urun} · ` : ''}{x.ad}</span><small>{zaman(x.S).slice(6)}{e && e.durum !== 'iyi' ? ` · ${durumYazisi(e)}` : ''}{bag ? ` · ${bag}` : ''}{kayma(x) && <em data-kayma="">{kayma(x)}</em>}</small>
        </button>
        {cumleSatiri(x.id, l)}
      </li>
    );
  };

  if (goz === 'S') {
    return (
      <ul className="tc-pyq-liste" aria-label="Emirler" data-isaretli={isaretVar ? '' : undefined}>
        {(sira === 'gecikme' ? siralaGecikme(emirler, m.isler) : matrisSirasi(emirler)).map(emirSatiri)}
        {!emirler.length && <li className="tc-pyq-not">Süzgece uyan emir yok.</li>}
      </ul>
    );
  }
  const plansiz = emirler.filter((e) => e.durum === 'plansiz');
  return (
    <div className="tc-pyq-liste" role="group" aria-label="Tezgâhlar ve işler" data-isaretli={isaretVar ? '' : undefined}>
      {plansiz.length > 0 && (
        <section>
          <h3><b>Yerleştirilecek</b><small>{plansiz.length} emir</small></h3>
          <ul>{plansiz.map(emirSatiri)}</ul>
        </section>
      )}
      {gruplar.map(({ t, isler, yuzde, durum }) => {
        const tum = acik.has(t.id) || isler.some((x) => x.id === secIs);
        return (
          <section key={t.id}>
            <h3><b>{t.kod}</b><small>{t.ad}</small>{m.mesai?.[t.id]?.length ? <i className="tc-pyq-mesai-isaret" title={ekMesaiYazisi(m.mesai[t.id]!, zaman)}>+ ek mesai</i> : null}<i data-su-an={durum}>{SU_AN_ADI[durum]}</i>{suAndakiDurus(m, t.id) ? <i data-durus>{durusYazisi(suAndakiDurus(m, t.id)!, zaman)}</i> : null}{yuzde !== null && <i title="Önümüzdeki 7 günde planlı saat / açık saat">%{yuzde}</i>}{sorunBildir && !t.fason && <button type="button" className="tc-pyq-simge-dugme" data-sorun-bildir={t.id} aria-label={`${t.kod} için sorun bildir`} title="Sorun bildir: arıza ya da bakım" onClick={() => { sorunBildir(t.id); }}><Simge ad="wrench" boyut="k" /></button>}</h3>
            <ul>
              {(tum ? isler : isler.slice(0, ILK)).map(isSatiri)}
              {isler.length > ILK && (
                <li>
                  <button type="button" className="tc-pyq-liste-daha" aria-expanded={tum} onClick={() => { const y = new Set(acik); if (tum) y.delete(t.id); else y.add(t.id); setAcik(y); }}>
                    {tum ? 'İlk üç iş' : `+ ${String(isler.length - ILK)} iş daha`}
                  </button>
                </li>
              )}
            </ul>
          </section>
        );
      })}
      {!plansiz.length && !gruplar.length && <p className="tc-pyq-not">Süzgece uyan emir yok.</p>}
    </div>
  );
}
