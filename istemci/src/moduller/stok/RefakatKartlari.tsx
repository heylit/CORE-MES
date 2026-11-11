import { useMemo, useState, type KeyboardEvent, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { KartAkisiCevabi, KartOzetleriCevabi } from '#paylasilan/sozlesme/akis.ts';
import type { RefakatKartlariCevabi, RefakatKartlariSatiri } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Qr, Rozet, Sekmeler, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { SayfaBasi, hataMetni, useIslem } from './ortak.tsx';
import {
  DAGILIM, KONUM, YER_KUMELERI, adimSatirlari, anSatirlari, aralikMetni, asamalar, cycleSatirlari, gunBasligi, kartAdedi, kisaZaman, leadDagilimi, ondalik,
  odakAdimi, ozetKutulari, rotaAdimlari, rotaAltMetni, rotaZamani, saat, siradakiMetni, sonAnMetni, sureMetni, sureOzetiSatirlari, tarihSaat, tekliCubuklar,
  type Asama, type DagilimTuru, type Ton,
} from './refakat-akisi.ts';
import { KartIslemleri, RefakatIzi, RefakatKartPenceresi } from './RefakatKarti.tsx';
import './stok.css';

export { sureMetni } from './refakat-akisi.ts';

// Refakat kartları (kart #708, sade düzen 2907 / 2912 a): solda kartlar (yeri, son anı, sıradaki adımı; yere göre süzülür), sağda
// seçili kart: kimlik, kart işlemleri, rota adımları. Süre analizi (lead, cycle, süre özeti, akış ve tablo) ve kartın izi istenince
// açılır. Akış ve süreler Akış Süresi'nin hesabıdır (708-1); yetkisi olmayan listeyi görür, karta basınca kart penceresi açılır.
// `?kart=<id>` kartı seçili açar (emir ayrıntısından gelinir).
type Durum = 'acik' | 'tumu';
type Gorunum = 'akis' | 'tablo';
type KartOzeti = KartOzetleriCevabi['kartlar'][number];
const kucuk = (s: string): string => s.toLocaleLowerCase('tr-TR');
const OZET_PARCASI = 50;
const DAGILIM_SIRASI: DagilimTuru[] = ['stok', 'yol', 'ayar', 'uretim', 'durus', 'fason'];
const tonSinifi = (t: Ton): string => `tc-refakat-ton-${t}`;

export const kartAramaMetni = (k: RefakatKartlariSatiri): string =>
  kucuk([k.refakat.qr, k.refakat.etiket, k.refakat.emirNo, k.refakat.lotNo, k.urun.kod, k.urun.ad, k.refakat.malzemeKod].filter(Boolean).join(' '));

function Hap({ ton, children }: { ton: Ton; children: string }) {
  return <span className={`tc-refakat-hap ${tonSinifi(ton)}`}><span className="tc-refakat-nokta" aria-hidden="true" />{children}</span>;
}

function ListeDurumu({ k, ozet }: { k: RefakatKartlariSatiri; ozet: KartOzeti | undefined }) {
  const r = k.refakat;
  if (r.durum === 'iptal') return <Rozet ton="pasif">İptal</Rozet>;
  if (r.birlestigi) return <Rozet ton="pasif">{r.birlestigi.etiket} kartına birleşti</Rozet>;
  if (r.lotNo === null) return <Rozet ton="uyari">Lot bekliyor</Rozet>;
  if (ozet === undefined) return <Rozet ton="tamam">Açık</Rozet>;
  const y = KONUM[ozet.konum.durum];
  return <Hap ton={y.ton}>{y.metin}</Hap>;
}

function KartListesi({ kartlar, ozetler, secili, sec, durum, setDurum, kume, setKume }: {
  kartlar: RefakatKartlariSatiri[]; ozetler: Map<number, KartOzeti>; secili: number | null; sec: (id: number) => void; durum: Durum; setDurum: (d: Durum) => void;
  kume: string | null; setKume: (k: string | null) => void;
}) {
  const kumeDe = (k: RefakatKartlariSatiri, anahtar: string) => {
    const o = ozetler.get(k.refakat.id);
    return o !== undefined && (YER_KUMELERI.find((y) => y.anahtar === anahtar)?.durumlar.includes(o.konum.durum) ?? false);
  };
  const gorunen = kume === null ? kartlar : kartlar.filter((k) => kumeDe(k, kume));
  const sutunlar: Sutun<RefakatKartlariSatiri>[] = [
    { anahtar: 'kart', baslik: 'Kart', sabit: 'sol', csv: (k) => k.refakat.etiket, hucre: (k) => (
      <Dugme aria-pressed={secili === k.refakat.id} onClick={(o) => { o.stopPropagation(); sec(k.refakat.id); }}><span className="mono">{k.refakat.etiket}</span></Dugme>
    ) },
    { anahtar: 'durum', baslik: 'Şimdi', csv: false, hucre: (k) => <ListeDurumu k={k} ozet={ozetler.get(k.refakat.id)} /> },
    { anahtar: 'sira', baslik: 'Sıradaki', mono: true, hucre: (k) => { const o = ozetler.get(k.refakat.id); return (o === undefined ? null : siradakiMetni(o)) ?? '—'; } },
    { anahtar: 'urun', baslik: 'Ürün', kes: true, hucre: (k) => k.urun.ad },
    { anahtar: 'emir', baslik: 'Üretim emri', mono: true, hucre: (k) => k.refakat.emirNo ?? '—' },
    { anahtar: 'son', baslik: 'Son an', kes: true, hucre: (k) => { const o = ozetler.get(k.refakat.id); return o ? sonAnMetni(o) : `${k.adimSayisi} adım · ${k.refakat.lotNo ?? 'lotsuz'}`; } },
  ];
  return (
    <section className="tc-refakat-panel tc-refakat-liste" aria-label="Kartlar">
      <div className="tc-refakat-liste-bas">
        <b>{durum === 'acik' ? 'Açık kartlar' : 'Bütün kartlar'}</b>
        <span className="tc-refakat-liste-ek">
          <button type="button" className="tc-refakat-baglanti" onClick={() => setDurum(durum === 'acik' ? 'tumu' : 'acik')}>{durum === 'acik' ? 'Tümü' : 'Açık'}</button>
          <span className="tc-refakat-soluk">Son an önce</span>
        </span>
      </div>
      {ozetler.size > 0 && (
        <div className="tc-refakat-kumeler" role="group" aria-label="Yere göre süz">
          <button type="button" className="tc-refakat-kume" aria-pressed={kume === null} onClick={() => setKume(null)}>Hepsi <b className="mono">{kartlar.length}</b></button>
          {YER_KUMELERI.map((y) => (
            <button key={y.anahtar} type="button" className="tc-refakat-kume" aria-pressed={kume === y.anahtar} onClick={() => setKume(kume === y.anahtar ? null : y.anahtar)}>
              {y.ad} <b className="mono">{kartlar.filter((k) => kumeDe(k, y.anahtar)).length}</b>
            </button>
          ))}
        </div>
      )}
      {gorunen.length === 0 && <p className="tc-refakat-bos">Kart yok.</p>}
      {gorunen.length > 0 && <Tablo etiket="Kart listesi" kip="kaydir" sutunlar={sutunlar} satirlar={gorunen} satirAnahtari={(k) => k.refakat.id} satirSec={(k) => sec(k.refakat.id)} />}
    </section>
  );
}

function OzetBolumu({ d }: { d: KartAkisiCevabi }) {
  const dagilim = useMemo(() => leadDagilimi(d), [d]);
  const kutular = ozetKutulari(d, dagilim);
  const cycle = cycleSatirlari(d);
  const odak = odakAdimi(d);
  const tekli = odak === null ? null : tekliCubuklar(d, odak);
  return (
    <div className="tc-refakat-ozet">
      <div className="tc-refakat-kutular">
        {kutular.map((k) => (
          <div key={k.ad} className="tc-refakat-kutu">
            <div className="tc-refakat-soluk">{k.ad}</div>
            <div className="tc-refakat-kutu-deger mono">{k.deger}</div>
            <div className={`tc-refakat-kutu-fark mono ${tonSinifi(k.ton)}`}>{k.fark}</div>
          </div>
        ))}
      </div>
      {dagilim && (
        <div>
          <div className="tc-refakat-bolum-bas">
            <b>Lead time dağılımı</b>
            <span className="tc-refakat-soluk">karta yüklemeden {d.lead.acik ? 'şu ana' : 'kapanışa'} · {tarihSaat(dagilim.bas)} → {tarihSaat(dagilim.bit)}</span>
          </div>
          <svg className="tc-refakat-serit" viewBox="0 0 1000 26" preserveAspectRatio="none" role="img" aria-label="Lead time dağılımı: stok ve operasyon parçaları">
            {dagilim.parcalar.reduce<{ x: number; l: ReactElement[] }>((t, p, i) => {
              const w = p.pay * 1000;
              t.l.push(<rect key={i} x={t.x} y={0} width={w} height={26} className={`tc-refakat-serit-parca ${tonSinifi(DAGILIM[p.tur].ton)}`}><title>{`${p.ad} · ${sureMetni(p.dk)}`}</title></rect>);
              t.x += w;
              return t;
            }, { x: 0, l: [] }).l}
          </svg>
          <div className="tc-refakat-lejant">
            {DAGILIM_SIRASI.filter((t) => t !== 'fason' || dagilim.toplamlar.fason > 0).map((t) => (
              <span key={t} className={tonSinifi(DAGILIM[t].ton)}><i className="tc-refakat-lejant-kare" />{DAGILIM[t].ad} <b className="mono">{sureMetni(dagilim.toplamlar[t])}</b></span>
            ))}
          </div>
        </div>
      )}
      {cycle.length > 0 && (
        <div>
          <b className="tc-refakat-bolum-baslik">Cycle time · plan ve gerçek (dk / parça)</b>
          <div className="tc-refakat-cycle">
            {cycle.map((c) => (
              <div key={c.anahtar} className="tc-refakat-cycle-satir">
                <span>{c.ad}</span>
                <svg viewBox="0 0 1000 17" preserveAspectRatio="none" className="tc-refakat-cycle-cubuk" aria-hidden="true">
                  <rect x={0} y={0} width={c.planPay * 1000} height={7} rx={2} className="tc-refakat-plan" />
                  <rect x={0} y={10} width={c.gercekPay * 1000} height={7} rx={2} className={tonSinifi(c.ton)} />
                </svg>
                <span className="mono tc-refakat-soluk tc-refakat-sag">{ondalik(c.plan)} → <b className={tonSinifi(c.ton)}>{c.gercek === null ? '—' : ondalik(c.gercek)}</b></span>
              </div>
            ))}
          </div>
          <div className="tc-refakat-lejant">
            <span><i className="tc-refakat-lejant-cubuk tc-refakat-plan" />Plan (rota birim süresi)</span>
            <span className="tc-refakat-ton-bekle"><i className="tc-refakat-lejant-cubuk" />Gerçek (bu kart · net birim süre)</span>
          </div>
        </div>
      )}
      {odak !== null && (
        <div className="tc-refakat-sure">
          <div className="tc-refakat-bolum-bas">
            <b>OP{odak.opNo} süre özeti · üretim emrinden</b>
            <span className="tc-refakat-soluk">ayar ve duruş olayları, sayım zamanları · bu kart ve emrin tamamı</span>
          </div>
          <div className="tc-refakat-kaydir">
            <table className="tc-refakat-tablo tc-refakat-tablo-dar">
              <thead><tr><th>Ölçü</th><th className="tc-refakat-sayi">Plan</th><th className="tc-refakat-sayi">Bu kart</th><th className="tc-refakat-sayi">Emir · OP{odak.opNo} tümü</th><th>Nasıl hesaplanır</th></tr></thead>
              <tbody>
                {sureOzetiSatirlari(d, odak).map((s) => (
                  <tr key={s.ad}>
                    <td>{s.ad}</td><td className="tc-refakat-sayi tc-refakat-soluk">{s.plan}</td>
                    <td className={`tc-refakat-sayi ${s.ton === 'soluk' ? '' : tonSinifi(s.ton)}`}>{s.kart}</td><td className="tc-refakat-sayi">{s.emir}</td>
                    <td className="tc-refakat-soluk tc-refakat-kucuk">{s.nasil}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tekli && (
            <div>
              <div className="tc-refakat-soluk tc-refakat-kucuk">
                Parça parça cycle (tekli sayımlar arası net dk){odak.standartBirimDk !== null && ` · kesik çizgi plan ${ondalik(odak.standartBirimDk)}`}
              </div>
              {tekli.cubuklar.length === 0 ? <p className="tc-refakat-soluk tc-refakat-kucuk">Bu kartın tekli sayımı yok.</p> : (
                <svg className="tc-refakat-tekli" viewBox={`0 0 ${String(tekli.cubuklar.length * 10)} 64`} preserveAspectRatio="none" role="img" aria-label="Parça başına cycle süreleri">
                  {tekli.cubuklar.map((c, i) => (
                    <rect key={c.sira} x={i * 10 + 1} y={64 - c.pay * 64} width={8} height={c.pay * 64} className={tonSinifi(c.ton)}><title>{`${String(c.sira)}. parça · ${ondalik(c.dk)} dk`}</title></rect>
                  ))}
                  {tekli.planPay !== null && <line x1={0} x2={tekli.cubuklar.length * 10} y1={64 - tekli.planPay * 64} y2={64 - tekli.planPay * 64} className="tc-refakat-plan-cizgi" />}
                </svg>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AsamaSatiri({ s, gun }: { s: Asama; gun: string | null }) {
  return (
    <li className="tc-refakat-asama" data-tur={s.tur} data-durum={s.durum}>
      {gun && <div className="tc-refakat-gun"><span><Simge ad="clock" boyut="k" />{gun}</span></div>}
      <div className="tc-refakat-asama-izgara">
        <div className="tc-refakat-asama-sure mono">{s.planli ? `plan ${sureMetni(s.sureDk)}` : sureMetni(s.sureDk)}</div>
        <div className="tc-refakat-asama-iz"><span className="tc-refakat-dugum">{s.kod}</span><span className="tc-refakat-iz-cizgi" /></div>
        <div className="tc-refakat-asama-govde">
          <div className="tc-refakat-asama-bas"><b>{s.baslik}</b><span className="tc-refakat-soluk">{s.alt}</span></div>
          <div className="tc-refakat-asama-tarih mono">
            <span>{s.tur === 'son' ? (s.bit !== null ? tarihSaat(s.bit) : 'kapanmadı') : aralikMetni(s.bas, s.bit, s.acik)}</span>
            {s.plan && <span className="tc-refakat-soluk">{s.tur === 'son' ? s.plan.metin : `plan ${s.plan.metin}`}</span>}
            {s.plan?.fark && <span className={tonSinifi(s.plan.farkTon)}>{s.plan.fark}</span>}
            {s.plan?.taban && <span className="tc-refakat-soluk">{s.plan.taban}</span>}
          </div>
          {(s.giren.length > 0 || s.cikan.length > 0) && (
            <div className="tc-refakat-gc">
              <div className="tc-refakat-gc-kutu">
                <div className="tc-refakat-gc-bas">Giren</div>
                {s.giren.map((g, i) => <div key={i}><span className="mono">{g.miktar}</span> {g.ad}</div>)}
              </div>
              <Simge ad="next" boyut="k" />
              <div className="tc-refakat-gc-kutu">
                <div className="tc-refakat-gc-bas">Çıkan</div>
                {s.cikan.map((c, i) => <div key={i} className={c.ton ? tonSinifi(c.ton) : undefined}><span className="mono">{c.miktar}</span> {c.ad}</div>)}
              </div>
            </div>
          )}
          {s.anlar.map((a, i) => (
            <div key={i} className="tc-refakat-an">
              {a.farkDk !== null && <div className={`tc-refakat-an-fark mono ${tonSinifi(a.farkDk >= 60 ? 'bekle' : 'soluk')}`}>+{sureMetni(a.farkDk)}</div>}
              <div className="tc-refakat-an-satir">
                <span className="mono tc-refakat-soluk">{a.simdi ? `şimdi ${saat(a.zaman)}` : kisaZaman(a.zaman)}</span>
                <div>
                  <div className="tc-refakat-an-ad"><i className={`tc-refakat-an-kare ${tonSinifi(a.ton)}`} />{a.ad}</div>
                  {a.alanlar.length > 0 && (
                    <div className="tc-refakat-cipler">{a.alanlar.map((f) => <span key={f.ad} className="tc-refakat-cip">{f.ad} <b className="mono">{f.deger}</b></span>)}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </li>
  );
}

function AkisGorunumu({ liste }: { liste: Asama[] }) {
  let onceki: string | null = null;
  return (
    <ol className="tc-refakat-akis" aria-label="Kartın rotası ve anları">
      {liste.map((s) => {
        const zaman = s.bas ?? s.bit;
        const planGunu = zaman === null && s.plan?.bas != null ? s.plan.bas : null;
        const gun = zaman !== null ? gunBasligi(zaman) : planGunu !== null ? gunBasligi(planGunu) : null;
        const yeni = gun !== null && gun !== onceki ? (zaman === null ? `${gun} · plan` : gun) : null;
        if (gun !== null) onceki = gun;
        return <AsamaSatiri key={s.anahtar} s={s} gun={yeni} />;
      })}
    </ol>
  );
}

function TabloGorunumu({ d, liste, urun }: { d: KartAkisiCevabi; liste: Asama[]; urun: string | null }) {
  const adimlar = adimSatirlari(liste, d);
  const anlar = anSatirlari(d, { urun });
  const dagilim = leadDagilimi(d);
  const bekleme = dagilim === null ? null : dagilim.toplamlar.stok + dagilim.toplamlar.yol;
  const lead = ozetKutulari(d, dagilim)[0]!;
  return (
    <div className="tc-refakat-tablolar">
      <div>
        <b className="tc-refakat-bolum-baslik">Adımlar · plan ve gerçek</b>
        <div className="tc-refakat-kaydir">
          <table className="tc-refakat-tablo" aria-label="Adımlar: plan ve gerçek">
            <thead><tr>
              <th>Adım</th><th>Yer</th><th className="tc-refakat-genis">Giren</th><th className="tc-refakat-genis">Çıkan</th><th className="tc-refakat-sayi">Önce bekleme</th>
              <th className="tc-refakat-sayi">Ayar plan / gerçek</th><th className="tc-refakat-sayi">Cycle plan / gerçek</th><th className="tc-refakat-sayi">Adım süresi</th><th className="tc-refakat-sayi">Sapma</th>
            </tr></thead>
            <tbody>
              {adimlar.map((r) => (
                <tr key={r.anahtar} data-durum={r.durum}>
                  <td><b>{r.adim}</b></td><td>{r.yer}</td><td>{r.giren}</td><td>{r.cikan}</td><td className="tc-refakat-sayi">{r.bekleme}</td>
                  <td className="tc-refakat-sayi">{r.ayar}</td><td className="tc-refakat-sayi">{r.cycle}</td><td className="tc-refakat-sayi">{r.sure}</td>
                  <td className={`tc-refakat-sayi ${tonSinifi(r.sapmaTon)}`}>{r.sapma}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={4}><b>Lead time</b> <span className="tc-refakat-soluk">karta yüklemeden {d.lead.acik ? 'şu ana' : 'kapanışa'}</span></td>
                <td className="tc-refakat-sayi">{sureMetni(bekleme)}</td><td /><td />
                <td className="tc-refakat-sayi"><b>{sureMetni(d.lead.dk)}</b></td>
                <td className={`tc-refakat-sayi ${tonSinifi(lead.ton)}`}>{lead.fark.split(' · ')[1] ?? ''}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <b className="tc-refakat-bolum-baslik">Anlar</b>
        <div className="tc-refakat-kaydir">
          <table className="tc-refakat-tablo" aria-label="Anlar">
            <thead><tr>
              <th className="tc-refakat-sayi">#</th><th>Zaman</th><th className="tc-refakat-sayi">Önceki andan</th><th>Durum</th><th className="tc-refakat-genis">An</th><th>Yer</th><th>Giren</th><th>Çıkan</th><th>Kim</th>
            </tr></thead>
            <tbody>
              {anlar.map((r) => (
                <tr key={r.no}>
                  <td className="tc-refakat-sayi">{r.no}</td><td className="mono tc-refakat-kirilmaz">{r.zaman}</td>
                  <td className={`tc-refakat-sayi ${tonSinifi(r.farkTon)}`}>{r.fark}</td>
                  <td><Hap ton={r.durumTon}>{r.durum}</Hap></td>
                  <td>{r.ad}</td><td>{r.yer}</td><td>{r.giren}</td><td>{r.cikan}</td><td className="tc-refakat-soluk">{r.kim}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RotaAdimlari({ liste }: { liste: Asama[] }) {
  return (
    <ol className="tc-refakat-rota" aria-label="Kartın rotası">
      {rotaAdimlari(liste).map((s) => (
        <li key={s.anahtar} className="tc-refakat-rota-adim" data-durum={s.durum}>
          <span className="tc-refakat-rota-dugum mono" aria-hidden="true">{s.durum === 'gecti' ? <Simge ad="check" boyut="k" /> : s.kod}</span>
          <span className="tc-refakat-rota-govde">
            <b>{s.baslik}</b>
            <span className="tc-refakat-soluk">{rotaAltMetni(s)}</span>
          </span>
          <span className={`tc-refakat-rota-zaman mono ${s.durum === 'simdi' ? 'tc-refakat-ton-bekle' : 'tc-refakat-soluk'}`}>{rotaZamani(s)}</span>
        </li>
      ))}
    </ol>
  );
}

export function KartAkisi({ k, sec }: { k: RefakatKartlariSatiri; sec: (id: number) => void }) {
  const id = k.refakat.id;
  const [gorunum, setGorunum] = useState<Gorunum>('akis');
  const [analiz, setAnaliz] = useState(false);
  const [iz, setIz] = useState(false);
  const q = useQuery({ queryKey: [...anahtarlar.hepsi, 'kart-akisi', id], queryFn: () => api.get<KartAkisiCevabi>(`/akis/refakat-kartlari/${String(id)}`) });
  const d = q.data;
  const liste = useMemo(() => (d ? asamalar(d, { urun: k.urun.ad }) : []), [d, k.urun.ad]);
  const adet = d ? kartAdedi(d) : null;
  return (
    <article className="tc-refakat-panel tc-refakat-ayrinti" aria-label="Kart ayrıntısı">
      <div className="tc-refakat-ayrinti-bas">
        <div className="tc-refakat-kimlik">
          <h2 className="mono">{k.refakat.etiket}</h2>
          <div className="tc-refakat-soluk">
            {k.urun.ad} · emir {k.adet} adet{adet !== null && `, bu kart ${String(adet)} parça`} · Emir <span className="mono">{k.refakat.emirNo ?? '—'}</span> · lot <span className="mono">{k.refakat.lotNo ?? '—'}</span>
          </div>
        </div>
        <Qr metin={k.refakat.qr} boyut={72} />
      </div>
      <div className="tc-refakat-bolum">
        <KartIslemleri id={id} sec={sec} />
      </div>
      {q.isPending && <DurumKutusu durum="yukleniyor" />}
      {q.isError && <DurumKutusu durum="hata" mesaj={hataMetni(q.error)} yenile={() => void q.refetch()} />}
      {d && (
        <div className="tc-refakat-bolum">
          <RotaAdimlari liste={liste} />
        </div>
      )}
      <div className="tc-refakat-bolum tc-refakat-ac-kapa">
        <Dugme simge="gantt" aria-expanded={analiz} onClick={() => setAnaliz(!analiz)}>Süre analizi</Dugme>
        <Dugme simge="list" aria-expanded={iz} onClick={() => setIz(!iz)}>Bağlı kartlar ve sevkler</Dugme>
      </div>
      {iz && <div className="tc-refakat-bolum"><RefakatIzi id={id} git={sec} /></div>}
      {d && analiz && (
        <>
          <OzetBolumu d={d} />
          <div className="tc-refakat-sekmeler">
            <Sekmeler etiket="Görünüm" secili={gorunum} sec={setGorunum} sekmeler={[{ anahtar: 'akis', baslik: 'Akış', simge: 'route' }, { anahtar: 'tablo', baslik: 'Tablo', simge: 'grid' }]} />
          </div>
          <div className="tc-refakat-icerik">
            {gorunum === 'akis' ? <AkisGorunumu liste={liste} /> : <TabloGorunumu d={d} liste={liste} urun={k.urun.ad} />}
            <p className="tc-refakat-soluk tc-refakat-kucuk">Süreler Akış Süresi hesabıdır, takvim saatiyle. Kartla sayılanlar ve kartın lotu esas alınır; adım olayları emrindir, emrin başka kartı varsa onun işi de görünebilir. Plan saatleri güncel canlı plandandır; taban, adımın ilk canlıya alındığı yerdir. Plan lead time, karta yüklemeden rotadaki son plan bitişinedir.</p>
          </div>
        </>
      )}
    </article>
  );
}

export function RefakatKartlari() {
  const [adres] = useSearchParams();
  const istenen = Number(adres.get('kart'));
  const ilk = Number.isInteger(istenen) && istenen > 0 ? istenen : null;
  const [durum, setDurum] = useState<Durum>('acik');
  const [kume, setKume] = useState<string | null>(null);
  const [arama, setArama] = useState('');
  const [secili, setSecili] = useState<number | null>(ilk);
  // Kartın akışını Akış Süresi sayfası ya da yalnız kartı gören dar işlem açar (AKS-5 a, 1870).
  const sayfaOkur = useIslem('sayfa.akis');
  const kartOkur = useIslem('akis.kart-oku');
  const akisOkur = sayfaOkur || kartOkur;
  const [pencere, setPencere] = useState<number | null>(akisOkur ? null : ilk);
  const sec = (id: number) => { if (akisOkur) setSecili(id); else setPencere(id); };
  const l = useQuery({
    queryKey: anahtarlar.liste('refakat-kartlari', { durum }),
    queryFn: () => api.get<RefakatKartlariCevabi>(`/stok/refakat-kartlari?durum=${durum}`),
  });
  const idler = (l.data?.kartlar ?? []).filter((k) => k.refakat.durum === 'acik' && k.refakat.birlestigi === null).map((k) => k.refakat.id);
  const o = useQuery({
    queryKey: [...anahtarlar.hepsi, 'kart-ozetleri', idler],
    enabled: akisOkur && idler.length > 0,
    queryFn: async () => {
      const parcalar: number[][] = [];
      for (let i = 0; i < idler.length; i += OZET_PARCASI) parcalar.push(idler.slice(i, i + OZET_PARCASI));
      const cevaplar = await Promise.all(parcalar.map((p) => api.get<KartOzetleriCevabi>(`/akis/refakat-kartlari?idler=${p.join(',')}`)));
      return new Map(cevaplar.flatMap((c) => c.kartlar).map((k) => [k.id, k]));
    },
  });
  const ozetler = o.data ?? new Map<number, KartOzeti>();
  const aranan = kucuk(arama.trim());
  const sonAn = (k: RefakatKartlariSatiri) => Date.parse(ozetler.get(k.refakat.id)?.sonAn?.zaman ?? k.refakat.kayitZamani);
  const kartlar = (l.data?.kartlar ?? []).filter((k) => aranan === '' || kartAramaMetni(k).includes(aranan)).sort((a, b) => sonAn(b) - sonAn(a));
  const seciliKart = (l.data?.kartlar ?? []).find((k) => k.refakat.id === secili) ?? (akisOkur ? kartlar[0] : undefined);
  const okut = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const tam = (l.data?.kartlar ?? []).find((k) => [k.refakat.qr, k.refakat.etiket, k.refakat.emirNo, k.refakat.lotNo].some((x) => x !== null && kucuk(x) === aranan));
    const tek = kartlar.length === 1 ? kartlar[0] : undefined;
    const bulunan = tam ?? tek;
    if (bulunan) { sec(bulunan.refakat.id); setArama(''); }
  };
  return (
    <section className="tc-stok tc-refakat">
      <SayfaBasi
        baslik="Refakat kartları"
        aciklama="Kart nerede, hangi adımda, sırada ne var; kartı okutun ya da listeden seçin."
        sag={(
          <label className="tc-refakat-okut">
            <Simge ad="scan" boyut="k" />
            <input type="search" aria-label="Kart, emir ya da lot okutun" placeholder="Kart, emir ya da lot okutun" value={arama}
              onChange={(e) => setArama(e.target.value)} onKeyDown={okut} />
          </label>
        )}
      />
      {l.isError && <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} />}
      {l.isPending && <DurumKutusu durum="yukleniyor" />}
      {l.data?.sinirda && <p className="tc-stok-not">Yalnız en yeni kartlar gösteriliyor; arama bu kartlarda yapılır.</p>}
      {l.data && (
        <div className="tc-refakat-govde">
          <KartListesi kartlar={kartlar} ozetler={ozetler} secili={seciliKart?.refakat.id ?? null} sec={sec} durum={durum} setDurum={setDurum} kume={kume} setKume={setKume} />
          {akisOkur && seciliKart && <KartAkisi key={seciliKart.refakat.id} k={seciliKart} sec={sec} />}
        </div>
      )}
      {pencere !== null && <RefakatKartPenceresi id={pencere} kapat={() => setPencere(null)} />}
    </section>
  );
}
