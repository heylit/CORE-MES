import { useEffect, useState, type ReactNode } from 'react';
import { DurumKutusu, Dugme, Kart, SayfaBasligi, Simge } from '../../../../ortak/arayuz/index.ts';
import { gunAdi, saatDakika } from '../bicim.ts';
import { useMesaj } from '../durum.tsx';
import { DuyuruKarti, GorevSatiri, OnayKarti, SiparisKarti, ToplantiSatiri } from '../kartlar/index.ts';
import { baslamaMetni, toplantiBitisi } from '../kurallar.ts';
import { GunSeridi } from './GunSeridi.tsx';
import { SIRADAKI_SICAK_MS, bugunOzeti, gunSeridi, ozetCumlesi, selam, type SeritOgesi } from './kurallar.ts';
import './bugun.css';

// Toplantı bağlantısı yalnız web adresiyse "Katıl" düğmesi olur.
const webAdresi = (s: string | undefined): s is string => typeof s === 'string' && /^https?:\/\//i.test(s);

function Bolum({ baslik, sag, children }: { baslik: string; sag?: ReactNode; children: ReactNode }) {
  return <Kart baslik={baslik} sag={sag}><div className="tc-mb-bolum">{children}</div></Kart>;
}

// Prototip `viewToday`: selam ve özet, günün şeridi, sıradaki toplantı ve seni bekleyenler. Süs öğeleri (gökyüzü
// çizimi, fincan, konfeti) yok (203 a, T8).
// Saat, iğne ve "n dk sonra" metinleri dakikada bir tazelenir (prototip 60 sn).
export const TAZELEME_MS = 60_000;
function useDakika(): number {
  const [simdi, simdiYaz] = useState(() => Date.now());
  useEffect(() => {
    const z = setInterval(() => simdiYaz(Date.now()), TAZELEME_MS);
    return () => clearInterval(z);
  }, []);
  return simdi;
}

export function Bugun() {
  const m = useMesaj();
  const simdi = useDakika();
  if (!m.hazir) return <DurumKutusu durum="yukleniyor" />;
  const ben = m.ben.id;
  const o = bugunOzeti({
    ben, simdi, okunan: m.tercihler.lastRead, kanallar: m.veri.kanallar, gorevler: m.veri.gorevler, onaylar: m.veri.onaylar,
    duyurular: m.veri.duyurular, toplantilar: m.veri.toplantilar, siparisler: m.siparisler ?? [],
  });
  const serit = gunSeridi({
    ben, simdi, toplantilar: m.veri.toplantilar, gorevler: m.veri.gorevler, siparisler: m.siparisler ?? [], zamanli: m.veri.zamanli, ad: m.ad,
  });
  const sira = o.siradaki;

  const seritAc = (oge: SeritOgesi) => {
    if (oge.tur === 'zamanli') m.git({ gorunum: 'ayarlar' });
    else m.ayrintiAc({ tur: oge.tur as Exclude<SeritOgesi['tur'], 'zamanli'>, id: oge.id });
  };

  return (
    <div className="tc-mb-bugun">
      <SayfaBasligi baslik="Bugün" simge="home" alt={gunAdi(simdi)} />

      <section className="tc-mb-selam" aria-label="Günün özeti">
        <h3 className="tc-mb-selam-baslik">{selam(new Date(simdi).getHours() + new Date(simdi).getMinutes() / 60)}, {m.ilkAd(ben)}</h3>
        <p className="tc-mb-selam-ozet">{ozetCumlesi(o, simdi, (ts) => baslamaMetni(ts, simdi))}</p>
        <GunSeridi serit={serit} simdi={simdi} ac={seritAc} />
      </section>

      {sira && (
        <div className={`tc-mb-siradaki${sira.start - simdi < SIRADAKI_SICAK_MS ? ' tc-mb-siradaki-yakin' : ''}`}>
          <Simge ad="clock" />
          <div className="tc-mb-siradaki-govde">
            <span className="tc-mb-siradaki-ne">{baslamaMetni(sira.start, simdi)}</span>
            <b>{sira.title}</b>
            <span>{saatDakika(sira.start)}–{saatDakika(toplantiBitisi(sira))}{sira.loc ? `, ${sira.loc}` : ''}</span>
          </div>
          <div className="tc-mb-siradaki-eylem">
            {webAdresi(sira.link) && (
              <a className="tc-dugme tc-dugme-birincil tc-dugme-normal" href={sira.link} target="_blank" rel="noopener noreferrer">
                <Simge ad="play" />Katıl
              </a>
            )}
            <Dugme onClick={() => m.ayrintiAc({ tur: 'toplanti', id: sira.id })}>Aç</Dugme>
          </div>
        </div>
      )}

      {!o.bekleyen && !o.davetler.length && (
        <DurumKutusu durum="bos" mesaj="Masan tertemiz">
          <p>Bekleyen görev, onay ya da duyuru yok. Yeni bir şey geldiğinde burada göreceksin.</p>
        </DurumKutusu>
      )}
      {o.davetler.length > 0 && (
        <Bolum baslik="Yanıt bekleyen davetler">{o.davetler.map((t) => <ToplantiSatiri key={t.id} toplanti={t} />)}</Bolum>
      )}
      {o.bahisler.length > 0 && (
        <Bolum baslik="Senden bahsedildi">
          {o.bahisler.map((c) => (
            <button key={c.id} type="button" className="tc-mb-bahis" onClick={() => m.git({ kanal: c.id })}>
              <span className="tc-mb-bahis-isaret" aria-hidden="true">@</span>
              <span className="tc-mb-bahis-govde"><b>#{c.name}</b><span>Okumak için dokun</span></span>
            </button>
          ))}
        </Bolum>
      )}
      {o.duyurular.length > 0 && (
        <Bolum baslik="Okunması gereken duyurular">{o.duyurular.map((d) => <DuyuruKarti key={d.id} duyuru={d} />)}</Bolum>
      )}
      {o.onaylar.length > 0 && (
        <Bolum baslik="Onayını bekleyenler">{o.onaylar.map((a) => <OnayKarti key={a.id} onay={a} />)}</Bolum>
      )}
      {o.gorevler.length > 0 && (
        <Bolum baslik="Görevlerin">{o.gorevler.map((t) => <GorevSatiri key={t.id} gorev={t} />)}</Bolum>
      )}
      {o.siparisler.length > 0 && (
        <Bolum baslik="Teslimi yaklaşan siparişler" sag={<Dugme onClick={() => m.git({ gorunum: 'siparisler' })}>Tümü</Dugme>}>
          <div className="tc-mb-siparisler">{o.siparisler.map((s) => <SiparisKarti key={s.id} siparis={s} kisa />)}</div>
        </Bolum>
      )}
      {(o.takipOnaylar.length > 0 || o.takipGorevler.length > 0) && (
        <Bolum baslik="Takip ettiklerin">
          {o.takipOnaylar.map((a) => <OnayKarti key={a.id} onay={a} />)}
          {o.takipGorevler.map((t) => <GorevSatiri key={t.id} gorev={t} />)}
        </Bolum>
      )}
    </div>
  );
}
