import { useEffect, useMemo, useState } from 'react';
import type { TabanVeCanliCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../../../../ortak/veri/api.ts';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { bitenler, derle, girdiKur, malzemeHazir, plandanBitenler, simdiSaati, type OkunanPlan } from '../kurallar.ts';
import { degisken, HAZIRLANIYOR } from '../ortak.tsx';
import {
  PG_NEDEN, pgGostergeleri, pgKaynakKur, pgNedenOzeti, pgSa, pgSatirlar, pgSerit, saatYaz, sapmaEsik, tarihGun, tt, type PgKaynak, type PgSatiri,
} from './kurallar.ts';

// Plan ve gerçekleşen (zz35): taban plan, son canlı plan ve atölyede olan; üç yönlü karşılaştırma. Buradan plan değişmez. Taban ve canlı
// sunucudan okunur (505 a); okunana kadar sekme hazırlanıyor der, okunamazsa sunucunun iletisini gösterir. Canlı sürüm değişince yeniden okunur.
export function PlanGercek({ o, c, p, canliSurum }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; p: OkunanPlan; canliSurum: number | null }) {
  const emirler = o.depo.durum?.emirler ?? null;
  const cx = useMemo(() => derle(girdiKur(c, emirler ? bitenler(emirler, c.D) : plandanBitenler(c, p))), [c, p, emirler]);
  const hazir = useMemo(() => malzemeHazir(cx), [cx]);
  const [cevap, setCevap] = useState<{ r: TabanVeCanliCevabi } | { hata: string } | null>(null);
  useEffect(() => {
    let gecerli = true;
    api.get<TabanVeCanliCevabi>('/recete-rota/planlama-calismasi/taban-ve-canli').then(
      (r) => { if (gecerli) setCevap({ r }); },
      (h: unknown) => { if (gecerli) setCevap({ hata: hataIletisi(h, 'Taban ve canlı plan okunamadı.') }); },
    );
    return () => { gecerli = false; };
  }, [canliSurum]);
  const K = useMemo<PgKaynak | null>(() => (cevap && 'r' in cevap ? pgKaynakKur(cevap.r, c, p) : null), [cevap, c, p]);
  const [yalniz, setYalniz] = useState(true);
  const L = useMemo(() => (K ? pgSatirlar(c, p, K, cx, hazir) : []), [c, p, K, cx, hazir]);
  const bas = (
    <p className="tc-pym-tp-not tc-pym-tp-pg-not"><Simge ad="help" boyut="k" />Taban plan siparişin ilk canlıya alınan planıdır; kendiliğinden donar, hiç değişmez. Karşılaştırma üç yönlüdür: taban plan, son canlı plan ve gerçekleşen.</p>
  );
  if (!cevap) return <div className="tc-pym-tp-pg">{bas}<p className="tc-pym-tp-hazir"><Simge ad="clock" boyut="k" />{HAZIRLANIYOR}</p></div>;
  if ('hata' in cevap) return <div className="tc-pym-tp-pg">{bas}<p className="tc-pym-tp-not tc-pym-bos"><Simge ad="alert" boyut="k" /> {cevap.hata}</p></div>;
  if (!K || !Object.keys(K.taban).length) {
    return <div className="tc-pym-tp-pg">{bas}<p className="tc-pym-tp-not tc-pym-bos"><Simge ad="flag" boyut="k" /> Henüz canlıya alınmış plan yok; ilk canlıya almada her siparişin taban planı kaydedilir.</p></div>;
  }
  return (
    <div className="tc-pym-tp-pg">
      {bas}
      <Gostergeler c={c} p={p} K={K} L={L} />
      <Serit c={c} p={p} K={K} now={simdiSaati(c)} />
      <NedenOzeti c={c} L={L} />
      <Tablo c={c} L={L} yalniz={yalniz} degis={() => setYalniz((x) => !x)} />
    </div>
  );
}

function Gostergeler({ c, p, K, L }: { c: PlanlamaCalismasi; p: OkunanPlan; K: PgKaynak; L: PgSatiri[] }) {
  const g = pgGostergeleri(c, p, K, L); const esik = sapmaEsik(c);
  const kutu = (ad: string, deger: string, alt: string) => (
    <div className="tc-pym-tp-pg-kutu"><span>{ad}</span><b>{deger}</b><small>{alt}</small></div>
  );
  return (
    <div className="tc-pym-tp-pg-kutular">
      {kutu('Plana uyum', g.biten ? `%${Math.round((100 * g.uyan) / g.biten)}` : '—', g.biten ? `${g.biten} biten adımın ${g.uyan}'i tabandan en çok ${saatYaz(esik)} geç` : 'henüz biten adım yok')}
      {kutu('Zamanında ve tam sevk', g.sevk ? `%${Math.round((100 * g.zaman) / g.sevk)}` : '—', g.sevk ? `${g.sevk} sevkin ${g.zaman}'i` : 'henüz biten sipariş yok')}
      {kutu('Ortalama kayma', pgSa(g.ort), 'bitiş, tabana göre')}
      {kutu('Plan değişikliği', String(g.degisiklik), g.degisiklik ? 'taban sonrası canlıya alma' : 'taban sonrası canlıya alma yok')}
    </div>
  );
}

const LEJANT = [['taban', 'Taban plan'], ['canli', 'Son canlı plan'], ['zaman', 'Gerçekleşen, zamanında'], ['gec', 'Gerçekleşen, geç'], ['calisiyor', 'Çalışıyor (tahmin)']] as const;
function Serit({ c, p, K, now }: { c: PlanlamaCalismasi; p: OkunanPlan; K: PgKaynak; now: number }) {
  const { a, b, satirlar } = pgSerit(c, p, K, now);
  if (!satirlar.length) return null;
  const yz = (t: number) => `${(Math.max(0, Math.min(1, (t - a) / (b - a))) * 100).toFixed(2)}%`;
  const cub = (k: string, S0: number, C0: number) => (C0 > a && S0 < b
    ? <i className="tc-pym-tp-pg-c" data-k={k} ref={degisken({ '--x': yz(S0), '--w': `calc(${yz(C0)} - ${yz(S0)})` })} /> : null);
  return (
    <section className="tc-pym-tp-pg-blok" aria-label="Tezgâhta üç çizgi">
      <h4><Simge ad="gantt" boyut="k" /> Tezgâhta üç çizgi <small>{satirlar.map((x) => x.m).join(', ')}</small></h4>
      <div className="tc-pym-tp-pg-serit">
        <div className="tc-pym-tp-pg-satir"><span /><div className="tc-pym-tp-pg-gun">{[0, 1, 2, 3, 4].map((i) => <span key={i}>{tarihGun(c.D, a + i * 24)}</span>)}</div></div>
        {satirlar.map(({ m, isler }) => (
          <div key={m} className="tc-pym-tp-pg-satir">
            <span className="tc-pym-tp-pg-m">{m}</span>
            <div className="tc-pym-tp-pg-yol" ref={degisken({ '--simdi': yz(now) })}>
              {isler.map((x) => (
                <div key={x.id} className="tc-pym-tp-pg-is" title={`${x.id} · taban ${tt(c.D, x.t0.S)} → ${tt(c.D, x.t0.C)}`}>
                  {cub('taban', x.t0.S, x.t0.C)}
                  {x.q && cub('canli', x.q.S, x.q.C)}
                  {x.g && cub(x.g.k, x.g.S, x.g.C)}
                  {x.g && <span className="tc-pym-tp-pg-is-ad" ref={degisken({ '--x': yz(x.t0.S) })}>{`${x.id.replace(/^SP-/, '')} `}<b data-k={x.g.k}>{pgSa(x.fk)}</b></span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <ul className="tc-pym-tp-pg-lejant">{LEJANT.map(([k, ad]) => <li key={k} data-k={k}>{ad}</li>)}</ul>
      <p className="tc-pym-tp-not">Rozet: bitişin taban plana göre farkı.</p>
    </section>
  );
}

function NedenOzeti({ c, L }: { c: PlanlamaCalismasi; L: PgSatiri[] }) {
  const l = pgNedenOzeti(c, L); if (!l.length) return null;
  return (
    <section className="tc-pym-tp-pg-blok" aria-label="Kayma nedenleri">
      <h4><Simge ad="chart" boyut="k" /> Kayma nedenleri <small>saat, canlı plana göre</small></h4>
      <ul className="tc-pym-tp-pg-nedenler">
        {l.map((x) => <li key={x.k} data-k={x.k}><Simge ad={x.simge as SimgeAdi} boyut="k" /><span>{x.ad}</span><b>{pgSa(x.s)}</b><small>{`${x.n} sipariş`}</small></li>)}
      </ul>
      <p className="tc-pym-tp-not">Nedenler kendiliğinden belirlenir, elle değiştirilmez. Süre standart birim süreyi ya da ayar süresini %10'dan fazla aşarsa aşan kısım "Yavaş üretim" ya da "Uzun ayar" sayılır, kalan kayma "Geç başlama". Arıza, malzeme ve fason gecikmesi kendi kayıtlarından gelir.</p>
    </section>
  );
}

function Tablo({ c, L, yalniz, degis }: { c: PlanlamaCalismasi; L: PgSatiri[]; yalniz: boolean; degis: () => void }) {
  const esik = sapmaEsik(c); const D = c.D;
  const l = yalniz ? L.filter((x) => x.fark != null && Math.abs(x.fark) > esik) : L;
  const cip = (x: PgSatiri) => {
    const uydu = <span className="tc-pym-tp-pg-cip" data-k="uydu"><Simge ad="check" boyut="k" />Plana uydu</span>;
    if (x.fark != null && x.fark <= esik) return uydu;
    const L2 = PG_NEDEN.filter(([k]) => x.N[k] > 0.05).map(([k, ad, sm]) => <span key={k} className="tc-pym-tp-pg-cip" data-k={k}><Simge ad={sm} boyut="k" />{`${ad} ${pgSa(x.N[k])}`}</span>);
    if (x.plan != null && Math.abs(x.plan) > 0.05) L2.unshift(<span key="plan" className="tc-pym-tp-pg-cip" data-k="plan"><Simge ad="edit" boyut="k" />{`Plan değişikliği ${pgSa(x.plan)}`}</span>);
    return L2.length ? L2 : '—';
  };
  return (
    <section className="tc-pym-tp-pg-blok" aria-label="Sipariş bazında">
      <h4><Simge ad="list" boyut="k" /> Sipariş bazında
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet" onClick={degis}><Simge ad="sort" boyut="k" />{yalniz ? 'Hepsini göster' : 'Yalnız sapanlar'}</button>
      </h4>
      {l.length ? (
        <div className="tc-pym-tp-pg-tablo">
          <table>
            <thead><tr><th scope="col">Sipariş</th><th scope="col">Taban bitiş</th><th scope="col">Canlı bitiş</th><th scope="col">Gerçekleşen bitiş</th><th scope="col">Termin</th><th scope="col">Fark</th><th scope="col">Neden</th></tr></thead>
            <tbody>
              {l.map((x) => (
                <tr key={x.j}>
                  <th scope="row"><span>{x.j}</span><small>{`${x.ad} · ${x.adet ?? ''}`}</small></th>
                  <td data-b="Taban">{tt(D, x.tb)}</td>
                  <td data-b="Canlı">{tt(D, x.cb)}</td>
                  <td data-b="Gerçekleşen">{tt(D, x.gb.t)}{x.gb.tahmin && x.gb.t != null && <small> (tahmin)</small>}</td>
                  <td data-b="Termin">{tt(D, x.due)}</td>
                  <td data-b="Fark" data-gec={x.fark != null && x.fark > esik ? '' : undefined}>{pgSa(x.fark)}</td>
                  <td><div className="tc-pym-tp-pg-cipler">{cip(x)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="tc-pym-tp-not">{yalniz ? 'Tabandan sapan sipariş yok.' : 'Taban planı olan sipariş yok.'}</p>}
    </section>
  );
}
