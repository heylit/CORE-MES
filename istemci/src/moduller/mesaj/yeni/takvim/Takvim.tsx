import { useState } from 'react';
import { DurumKutusu, SayfaBasligi, Simge } from '../../../../ortak/arayuz/index.ts';
import { D, isoGun } from '../bicim.ts';
import { useMesaj } from '../durum.tsx';
import { katilimciMi } from '../kurallar.ts';
import { GorevSatiri, SiparisKarti, ToplantiSatiri } from '../kartlar/index.ts';
import { SecimGrubu } from '../kartlar/parcalar.tsx';
import type { Gorev, Kayit, SiparisOzeti, Toplanti } from '../tipler.ts';
import { useKisiselDeger } from '../veri.ts';
import './takvim.css';

type Kapsam = 'me' | 'all';
type Kip = 'agenda' | 'month';
export type TakvimOlayi =
  | { k: 'm'; ts: number; r: Kayit<Toplanti> }
  | { k: 't'; ts: number; r: Kayit<Gorev> }
  | { k: 'o'; ts: number; r: SiparisOzeti };

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const saat = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const gunBasligi = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
const haftaGunu = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' });

// Prototipin calEvents'i: toplantılar, son tarihli görevler ve sevk edilmemiş siparişlerin teslimi gün gün; toplantılar
// saat sırasıyla önde. "Benim": katıldığım toplantılar ve bana verilen görevler; siparişler iki kapsamda da görünür.
export function takvimOlaylari(g: {
  kapsam: Kapsam; ben: string; toplantilar: readonly Kayit<Toplanti>[]; gorevler: readonly Kayit<Gorev>[]; siparisler: readonly SiparisOzeti[] | null;
}): Record<string, TakvimOlayi[]> {
  const olaylar: Record<string, TakvimOlayi[]> = {};
  const ekle = (o: TakvimOlayi) => { (olaylar[isoGun(o.ts)] ??= []).push(o); };
  for (const mt of g.toplantilar) if (g.kapsam === 'all' || katilimciMi(mt, g.ben)) ekle({ k: 'm', ts: mt.start, r: mt });
  for (const t of g.gorevler) if (t.due && (g.kapsam === 'all' || t.to === g.ben)) ekle({ k: 't', ts: t.due, r: t });
  for (const o of g.siparisler ?? []) if (o.teslim && o.durum !== 'sevk') ekle({ k: 'o', ts: o.teslim, r: o });
  const sira = (o: TakvimOlayi) => (o.k === 'm' ? o.ts : 9e15);
  for (const liste of Object.values(olaylar)) liste.sort((a, b) => sira(a) - sira(b));
  return olaylar;
}

const dar = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;

// Prototipin viewCal'ı: Benim / Herkes ile Ajanda / Ay. Kip kişiye özel saklanır (mesai:calMode); dar ekranda ajanda varsayılan.
export function Takvim() {
  const { ben, veri, siparisler, yetki, formAc, hazir } = useMesaj();
  const [kapsam, kapsamYaz] = useState<Kapsam>('me');
  const [kayitliKip, kipYaz] = useKisiselDeger<string | null>(ben.id, 'calMode', null);
  const kip: Kip = kayitliKip === 'agenda' || kayitliKip === 'month' ? kayitliKip : dar() ? 'agenda' : 'month';
  const olaylar = takvimOlaylari({ kapsam, ben: ben.id, toplantilar: veri.toplantilar, gorevler: veri.gorevler, siparisler });
  return (
    <>
      <SayfaBasligi
        baslik="Takvim" simge="clock" alt="Toplantılar, görev tarihleri ve teslimler"
        birincil={yetki.yaz ? { etiket: 'Toplantı', simge: 'plus', yap: () => formAc({ tur: 'toplanti' }) } : undefined}
        eylemler={yetki.yaz ? [{ anahtar: 'gorev', baslik: 'Görev', simge: 'plus', sec: () => formAc({ tur: 'gorev' }) }] : []}
      />
      <div className="tc-mi-arac">
        <SecimGrubu<Kapsam>
          etiket="Kimin takvimi" secili={kapsam} sec={kapsamYaz}
          secenekler={[{ anahtar: 'me', baslik: 'Benim' }, { anahtar: 'all', baslik: 'Herkes' }]}
        />
        <SecimGrubu<Kip>
          etiket="Görünüm" secili={kip} sec={kipYaz}
          secenekler={[{ anahtar: 'agenda', baslik: 'Ajanda', simge: 'list' }, { anahtar: 'month', baslik: 'Ay', simge: 'grid' }]}
        />
      </div>
      {!hazir ? <DurumKutusu durum="yukleniyor" /> : kip === 'month' ? <AyGorunumu olaylar={olaylar} /> : <Ajanda olaylar={olaylar} />}
    </>
  );
}

function OlayListesi({ liste }: { liste: readonly TakvimOlayi[] }) {
  if (liste.length === 0) return <p className="tc-mi-bos-kucuk">Bu güne bağlı toplantı, görev ya da teslim yok.</p>;
  return (
    <div className="tc-mi-liste">
      {liste.map((e) => (e.k === 'm'
        ? <ToplantiSatiri key={`m${e.r.id}`} toplanti={e.r} />
        : e.k === 't' ? <GorevSatiri key={`t${e.r.id}`} gorev={e.r} /> : <SiparisKarti key={`o${e.r.id}`} siparis={e.r} kisa />))}
    </div>
  );
}

function Cip({ olay: e }: { olay: TakvimOlayi }) {
  const { ayrintiAc } = useMesaj();
  if (e.k === 'm') {
    return (
      <button type="button" className={`tc-mi-cip-olay tc-mi-cip-m${e.r.cancelled ? ' tc-mi-cip-bitti' : ''}`} onClick={(o) => { o.stopPropagation(); ayrintiAc({ tur: 'toplanti', id: e.r.id }); }}>
        <b>{saat.format(e.r.start)}</b> {e.r.title}
      </button>
    );
  }
  if (e.k === 't') {
    return (
      <button type="button" className={`tc-mi-cip-olay tc-mi-cip-t-${e.r.status}`} onClick={(o) => { o.stopPropagation(); ayrintiAc({ tur: 'gorev', id: e.r.id }); }}>
        {e.r.title}
      </button>
    );
  }
  return (
    <button type="button" className="tc-mi-cip-olay tc-mi-cip-o" onClick={(o) => { o.stopPropagation(); ayrintiAc({ tur: 'siparis', id: e.r.id }); }}>
      #{e.r.no} {e.r.musteri}
    </button>
  );
}

const noktaSinifi = (e: TakvimOlayi) => (e.k === 'm' ? 'tc-mi-nokta-m' : e.k === 'o' ? 'tc-mi-nokta-o' : `tc-mi-nokta-t-${e.r.status}`);

// Prototipin calMonth'u: pazartesiyle başlayan ay ızgarası, günde en çok üç olay; seçili günün listesi altta.
function AyGorunumu({ olaylar }: { olaylar: Record<string, TakvimOlayi[]> }) {
  const { yetki, formAc } = useMesaj();
  const bugun = isoGun(Date.now());
  const [ay, ayYaz] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth(), sec: bugun }; });
  const ilk = new Date(ay.y, ay.m, 1);
  const bas = (ilk.getDay() + 6) % 7;
  const toplam = Math.ceil((bas + new Date(ay.y, ay.m + 1, 0).getDate()) / 7) * 7;
  const gunler = Array.from({ length: toplam }, (_, i) => new Date(ay.y, ay.m, i - bas + 1));
  const git = (n: number) => {
    if (n === 0) { const d = new Date(); ayYaz({ y: d.getFullYear(), m: d.getMonth(), sec: bugun }); return; }
    const d = new Date(ay.y, ay.m + n, 1);
    ayYaz({ y: d.getFullYear(), m: d.getMonth(), sec: ay.sec });
  };
  const secili = olaylar[ay.sec] ?? [];
  return (
    <>
      <div className="tc-mi-ay-cubugu">
        <button type="button" className="tc-mi-ay-git" aria-label="Önceki ay" onClick={() => git(-1)}><Simge ad="chev-left" /></button>
        <b aria-live="polite">{AYLAR[ay.m]} {ay.y}</b>
        <button type="button" className="tc-mi-ay-git" aria-label="Sonraki ay" onClick={() => git(1)}><Simge ad="chev-right" /></button>
        <button type="button" className="tc-mi-ay-bugun" onClick={() => git(0)}>Bugün</button>
      </div>
      <div className="tc-mi-ay" role="grid" aria-label={`${AYLAR[ay.m]} ${ay.y}`}>
        <div className="tc-mi-ay-satir" role="row">{GUNLER.map((g) => <span key={g} role="columnheader" className="tc-mi-ay-gunadi">{g}</span>)}</div>
        {Array.from({ length: toplam / 7 }, (_, h) => (
          <div key={h} className="tc-mi-ay-satir" role="row">
            {gunler.slice(h * 7, h * 7 + 7).map((d) => {
              const k = isoGun(d.getTime());
              const liste = olaylar[k] ?? [];
              const sinif = ['tc-mi-gun', d.getMonth() !== ay.m && 'tc-mi-gun-disari', k === bugun && 'tc-mi-gun-bugun', k === ay.sec && 'tc-mi-gun-secili'];
              return (
                <div
                  key={k} role="gridcell" aria-selected={k === ay.sec} tabIndex={0} className={sinif.filter(Boolean).join(' ')}
                  aria-label={`${gunBasligi.format(d)}${liste.length ? `, ${liste.length} kayıt` : ''}`}
                  onClick={() => ayYaz({ ...ay, sec: k })}
                  onKeyDown={(o) => { if (o.key === 'Enter' || o.key === ' ') { o.preventDefault(); ayYaz({ ...ay, sec: k }); } }}
                >
                  <span className="tc-mi-gun-no">{d.getDate()}</span>
                  <div className="tc-mi-gun-olaylar">
                    {liste.slice(0, 3).map((e) => <Cip key={`${e.k}${e.r.id}`} olay={e} />)}
                    {liste.length > 3 && <span className="tc-mi-gun-fazla">+{liste.length - 3}</span>}
                  </div>
                  {liste.length > 0 && (
                    <span className="tc-mi-noktalar" aria-hidden="true">
                      {liste.slice(0, 4).map((e) => <i key={`${e.k}${e.r.id}`} className={noktaSinifi(e)} />)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <section className="tc-mi-bolum" aria-label="Seçili gün">
        <h3>{gunBasligi.format(new Date(`${ay.sec}T12:00`))}</h3>
        <OlayListesi liste={secili} />
        {yetki.yaz && (
          <div className="tc-mi-eylemler">
            <button type="button" className="tc-mi-baglanti" onClick={() => formAc({ tur: 'toplanti', ilk: { start: new Date(`${ay.sec}T10:00`).getTime() } })}>
              Bu güne toplantı
            </button>
            <button type="button" className="tc-mi-baglanti" onClick={() => formAc({ tur: 'gorev', ilk: { due: new Date(`${ay.sec}T18:00`).getTime() } })}>
              Bu güne görev
            </button>
          </div>
        )}
      </section>
    </>
  );
}

// Prototipin calAgenda'sı: bugünden başlayan, olayı olan ilk 30 gün.
function Ajanda({ olaylar }: { olaylar: Record<string, TakvimOlayi[]> }) {
  const bugun = isoGun(Date.now());
  const yarin = isoGun(Date.now() + D);
  const gunler = Object.keys(olaylar).filter((k) => k >= bugun).sort().slice(0, 30);
  if (gunler.length === 0) {
    return <DurumKutusu durum="bos" mesaj="Takvim boş. Toplantı planla ya da görevlere son tarih ver; hepsi burada sırayla görünür." />;
  }
  return (
    <>
      {gunler.map((k) => {
        const d = new Date(`${k}T12:00`);
        return (
          <section key={k} className="tc-mi-ajanda-gun" aria-label={gunBasligi.format(d)}>
            <div className="tc-mi-ajanda-baslik">
              <b>{d.getDate()}</b>
              <div><span>{k === bugun ? 'Bugün' : k === yarin ? 'Yarın' : haftaGunu.format(d)}</span><small>{AYLAR[d.getMonth()]} {d.getFullYear()}</small></div>
            </div>
            <OlayListesi liste={olaylar[k] ?? []} />
          </section>
        );
      })}
    </>
  );
}
