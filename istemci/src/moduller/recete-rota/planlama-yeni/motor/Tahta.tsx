import { useMemo, useState, type FormEvent } from 'react';
import { SayiKarti, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { Cizelge, type CizelgeSatiri } from '../cizelge/Cizelge.tsx';
import { olcekKur } from '../cizelge/olcek.ts';
import { planGuncel } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  UFUKLAR, gruplar, isiSeviyesi, planOku, planSayilari, saatYaz, siparisler, simdiSaati, sureYaz, tezgahKodu, tezgahlar, ufukSaati,
  yapilacaklar, type OkunanPlan, type PlanIslemi, type Ufuk,
} from './kurallar.ts';
import { MotorDugmesi, PlanDurumu, PlanYok, SiparisYolu, TezgahPaneli } from './ortak.tsx';

// Planlama motoru (eski sayfa `tahta`: o-tahta, zc-tahta ve sade tahta zi/zj/zk). Üstte tek çubuk: durum, geciken, arama, ufuk ve planı
// iyileştir; altında Özet, Harita ve Çizelge görünümleri. Seçilen tezgâhın ya da siparişin kartı yanda açılır; Yapılacaklar sorunları sıralar.
// Plan kayıttaki son çözülmüş plandır; motor gerektiren düğmeler kapalıdır (357 b).

const GORUNUMLER = [['ozet', 'Özet', 'expand'], ['harita', 'Harita', 'grid'], ['cizelge', 'Çizelge', 'gantt']] as const;
type Gorunum = (typeof GORUNUMLER)[number][0];

type Secim = { tur: 'tezgah'; id: string } | { tur: 'siparis'; id: string; islem: string | null } | null;

export function PlanlamaMotoru(o: PlanlamaEkranOzellikleri) {
  const c = o.calisma;
  const p = useMemo(() => planOku(c), [c]);
  if (c === null || p === null) return <PlanYok c={c} />;
  return <Tahta o={o} c={c} p={p} />;
}

function Tahta({ o, c, p }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; p: OkunanPlan }) {
  const { bildir } = useBildirim();
  const [gorunum, setGorunum] = useState<Gorunum>('ozet');
  const [ufuk, setUfuk] = useState<Ufuk>('hafta');
  const [secim, setSecim] = useState<Secim>(null);
  const [yapilacakAcik, setYapilacakAcik] = useState(false);
  const [ara, setAra] = useState('');
  const simdi = simdiSaati(c) ?? 0;
  const guncel = planGuncel(c);
  const tez = useMemo(() => tezgahlar(c, p, simdi), [c, p, simdi]);
  const grp = useMemo(() => gruplar(tez, p), [tez, p]);
  const sip = useMemo(() => siparisler(c, p), [c, p]);
  const yap = useMemo(() => yapilacaklar(c, p, sip, guncel), [c, p, sip, guncel]);
  const sayilar = planSayilari(c, p);
  const D = c.D;

  const secIslem = (r: PlanIslemi) => { setSecim({ tur: 'siparis', id: r.job, islem: r.id }); };
  const bul = (e: FormEvent) => {
    e.preventDefault();
    const q = ara.trim().toLocaleUpperCase('tr-TR');
    if (!q) return;
    const t = tez.find((x) => x.id.toLocaleUpperCase('tr-TR') === q || tezgahKodu(x.id).toLocaleUpperCase('tr-TR') === q);
    if (t) { setSecim({ tur: 'tezgah', id: t.id }); return; }
    const s = sip.find((x) => x.id.toLocaleUpperCase('tr-TR') === q);
    if (s) { setSecim({ tur: 'siparis', id: s.id, islem: null }); return; }
    bildir('hata', `${ara.trim()} bulunamadı.`);
  };

  const seciliTezgah = secim?.tur === 'tezgah' ? tez.find((x) => x.id === secim.id) ?? null : null;
  const seciliSiparis = secim?.tur === 'siparis' ? sip.find((x) => x.id === secim.id) ?? null : null;
  const seciliIs = secim?.tur === 'siparis' ? secim.id : null;

  const t1 = simdi + ufukSaati(ufuk);
  const satirlar: CizelgeSatiri[] = tez.map((t) => ({
    anahtar: t.id, baslik: tezgahKodu(t.id), altBaslik: t.ad,
    cubuklar: Object.values(p.ops).filter((r) => r.m === t.id && r.C > simdi && r.S < t1).map((r) => ({
      anahtar: r.id, bas: r.S, bit: r.C, etiket: r.job,
      ipucu: `${r.id} · ${saatYaz(D, r.S)} → ${saatYaz(D, r.C)}${gecik(p, r.job) ? ' · sipariş gecikiyor' : ''}`,
      sinif: [gecik(p, r.job) ? 'tc-pym-gec' : '', seciliIs !== null ? (r.job === seciliIs ? 'tc-pym-sec' : 'tc-pym-soluk') : ''].filter(Boolean).join(' '),
    })),
  }));

  return (
    <div className="tc-pym" data-gorunum={gorunum}>
      <div className="tc-pym-cubuk">
        <PlanDurumu p={p} guncel={guncel} />
        <span className="tc-pym-nabiz"><b className="mono" data-ton={sayilar.gec ? 'hata' : undefined}>{sayilar.gec}</b> geciken</span>
        <form className="tc-pym-ara" role="search" onSubmit={bul}>
          <input
            className="tc-alan-kutu" value={ara} onChange={(e) => { setAra(e.target.value); }}
            placeholder="Tezgâh ya da sipariş" aria-label="Tezgâh ya da sipariş bul"
          />
          <button type="submit" className="tc-pym-kapat" aria-label="Bul"><Simge ad="search" boyut="k" /></button>
        </form>
        <span className="tc-pym-bosluk" />
        <button type="button" className="tc-pym-yapilacak" aria-expanded={yapilacakAcik} onClick={() => { setYapilacakAcik((x) => !x); }}>
          <Simge ad="check" boyut="k" />Yapılacaklar{yap.length > 0 && <b className="tc-pym-say">{yap.length}</b>}
        </button>
        <MotorDugmesi ad="Planı iyileştir" simge="play" />
      </div>
      <div className="tc-pym-cubuk">
        <div className="tc-pym-grup" role="group" aria-label="Görünüm">
          {GORUNUMLER.map(([k, ad, simge]) => (
            <button key={k} type="button" aria-pressed={gorunum === k} onClick={() => { setGorunum(k); }}><Simge ad={simge} boyut="k" />{ad}</button>
          ))}
        </div>
        {gorunum === 'cizelge' && (
          <div className="tc-pym-grup" role="group" aria-label="Ufuk">
            {UFUKLAR.map(([k, ad]) => <button key={k} type="button" aria-pressed={ufuk === k} onClick={() => { setUfuk(k); }}>{ad}</button>)}
          </div>
        )}
      </div>
      {o.depo.motorUyarilari !== null && o.depo.motorUyarilari.length > 0 && (
        <ul className="tc-pym-uyarilar" aria-label="Motor uyarıları">
          {o.depo.motorUyarilari.map((u) => <li key={u}><Simge ad="alert" boyut="k" />{u}</li>)}
        </ul>
      )}
      <div className="tc-pym-govde" data-yan={seciliTezgah || seciliSiparis || yapilacakAcik ? '' : undefined}>
        <div className="tc-pym-alan">
          {gorunum === 'ozet' && (
            <section className="tc-pym-ozet" aria-labelledby="pym-ozet">
              <header className="tc-pym-bolum-ust">
                <h2 id="pym-ozet">Plan nasıl gidiyor?</h2>
                <span className="mono">{saatYaz(D, simdi)}</span>
              </header>
              <p>
                {sayilar.siparis} siparişin {sayilar.zamaninda}'i zamanında. Son işin bitişi: <b>{saatYaz(D, sayilar.sonBitis)}</b>.
                {p.zaman !== null && <> Plan {new Date(p.zaman).toLocaleString('tr-TR')}{p.kim ? `, ${p.kim}` : ''} tarafından çözüldü.</>}
              </p>
              <div className="tc-pym-kartlar">
                <SayiKarti baslik="Sipariş" simge="list" sayi={sayilar.siparis} altMetin="planda" />
                <SayiKarti baslik="Zamanında" simge="check" sayi={sayilar.zamaninda} altMetin={sayilar.siparis ? `%${Math.round((sayilar.zamaninda / sayilar.siparis) * 100)} termininden önce biter` : undefined} />
                <SayiKarti baslik="Geç" simge="alert" sayi={sayilar.gec} ton="hata" altMetin={`${sureYaz(sayilar.gecikme)} toplam gecikme`} />
                <SayiKarti baslik="Ortalama doluluk" simge="gauge" metin={sayilar.ortDoluluk === null ? 'Veri yok' : `%${Math.round(sayilar.ortDoluluk * 100)}`} altMetin="çalışan tezgâhlarda" />
                <SayiKarti baslik="En yoğun tezgâh" simge="cpu" metin={sayilar.enYogun ? tezgahKodu(sayilar.enYogun.id) : 'Veri yok'} altMetin={sayilar.enYogun ? `%${Math.round(sayilar.enYogun.u * 100)}` : undefined} />
                <SayiKarti baslik="Ayar" simge="wrench" metin={sayilar.ayar === null ? 'Veri yok' : sureYaz(sayilar.ayar)} altMetin="bu dönemde" />
                <SayiKarti baslik="Son iş biter" simge="flag" metin={saatYaz(D, sayilar.sonBitis)} altMetin="planın sonu" />
                {sayilar.yerlesmeyen > 0 && <SayiKarti baslik="Planlanamayan" simge="alert" sayi={sayilar.yerlesmeyen} ton="hata" altMetin="işlem yerleşmedi" />}
              </div>
            </section>
          )}
          {gorunum !== 'cizelge' && (
            <section className="tc-pym-harita" aria-labelledby="pym-harita">
              <header className="tc-pym-bolum-ust">
                <h2 id="pym-harita"><Simge ad="cpu" boyut="k" />Tezgâh haritası</h2>
                <span className="tc-pym-not">Gruplar rotadaki sırayla; tezgâha dokunun, kartı açılsın.</span>
              </header>
              {grp.length === 0 && <p className="tc-pym-not">Kayıtta tezgâh yok.</p>}
              {grp.map((g) => (
                <section key={g.ad} className="tc-pym-bolge" data-isi={isiSeviyesi(g.doluluk)} aria-label={`${g.ad} grubu`}>
                  <h3>{g.ad} <small className="mono">{g.tezgahlar.length} tezgâh{g.doluluk !== null ? ` · %${Math.round(g.doluluk * 100)}` : ''}</small></h3>
                  <div className="tc-pym-tezgahlar">
                    {g.tezgahlar.map((t) => (
                      <button
                        key={t.id} type="button" className="tc-pym-tezgah" data-isi={isiSeviyesi(t.doluluk)}
                        aria-pressed={seciliTezgah?.id === t.id} data-ariza={t.ariza ? '' : undefined}
                        data-yol={seciliIs !== null && t.kuyruk.some((r) => r.job === seciliIs) ? '' : undefined}
                        onClick={() => { setSecim({ tur: 'tezgah', id: t.id }); }}
                      >
                        <span className="tc-pym-tezgah-ust"><b className="mono">{tezgahKodu(t.id)}</b><span>{t.ad}</span>
                          <span className="mono">{t.doluluk === null ? '' : `%${Math.round(t.doluluk * 100)}`}</span></span>
                        <meter min={0} max={1} low={0.4} high={0.75} optimum={0.6} value={Math.min(1, t.doluluk ?? 0)} aria-label="Doluluk" />
                        <span className="tc-pym-tezgah-is">
                          {t.kuyruk.slice(0, 3).map((r) => <span key={r.id} className="mono" data-gec={gecik(p, r.job) ? '' : undefined}>{r.job}</span>)}
                        </span>
                        <small>{t.kuyruk.length} iş sırada{t.gecikenSiparis ? ` · ${t.gecikenSiparis} geciken sipariş` : ''}{t.ariza ? ' · arıza/bakım' : ''}</small>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </section>
          )}
          {gorunum === 'cizelge' && (
            <section aria-label="Tezgâh çizelgesi">
              <Cizelge
                etiket="Tezgâh çizelgesi" olcek={olcekKur(simdi, t1, ufuk === 'gun' ? 40 : ufuk === 'hafta' ? 10 : 2)} satirlar={satirlar}
                simdi={simdi} secili={secim?.tur === 'siparis' ? secim.islem : null}
                sec={(id) => { const r = p.ops[id]; if (r) secIslem(r); }}
                gunEtiketi={(t) => saatYaz(D, t).slice(0, 9)}
              />
            </section>
          )}
        </div>
        {(seciliTezgah || seciliSiparis || yapilacakAcik) && (
          <aside className="tc-pym-yan">
            {seciliTezgah && <TezgahPaneli o={o} c={c} t={seciliTezgah} kapat={() => { setSecim(null); }} secIslem={secIslem} />}
            {seciliSiparis && (
              <SiparisYolu
                o={o} c={c} s={seciliSiparis} secili={secim?.tur === 'siparis' ? secim.islem : null} secIslem={secIslem}
                kapat={() => { setSecim(null); }}
              />
            )}
            {yapilacakAcik && (
              <section className="tc-pym-panel" aria-label="Yapılacaklar">
                <header className="tc-pym-panel-ust">
                  <h3><Simge ad="check" boyut="k" />Yapılacaklar</h3>
                  <button type="button" className="tc-pym-kapat" onClick={() => { setYapilacakAcik(false); }} aria-label="Yapılacakları kapat"><Simge ad="x" boyut="k" /></button>
                </header>
                {yap.length === 0 ? <p className="tc-pym-not">Bekleyen karar yok.</p> : (
                  <ul className="tc-pym-kararlar">
                    {yap.map((x) => (
                      <li key={x.anahtar} data-ton={x.ton}>
                        <b><Simge ad={x.simge} boyut="k" />{x.baslik}</b>
                        <small>{x.metin}</small>
                        {x.siparis !== undefined && (
                          <button type="button" className="tc-pym-baglanti" onClick={() => { setSecim({ tur: 'siparis', id: x.siparis ?? '', islem: null }); }}>Yolunu göster</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function gecik(p: OkunanPlan, job: string): boolean {
  const j = p.J[job];
  return j !== undefined && (j.C === null || j.T > 0.05);
}
