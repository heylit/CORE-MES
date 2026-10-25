import { useState, type DragEvent } from 'react';
import { DurumKutusu, SayfaBasligi, Simge, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import type { Siralama } from '../../../../ortak/veri/liste-durumu.ts';
import { isoGun } from '../bicim.ts';
import { useMesaj } from '../durum.tsx';
import { bendenOnayBekliyor, onayDurumu, teslimEtiketi } from '../kurallar.ts';
import { GorevSatiri, OnayKarti } from '../kartlar/index.ts';
import { durumDegistirebilir, useIsEylemleri } from '../kartlar/eylemler.ts';
import { SecimGrubu, SiparisCipi, TeslimEtiketi } from '../kartlar/parcalar.tsx';
import { GOREV_DURUMLARI, KisiRozeti } from '../ortak/index.ts';
import type { Gorev, Kayit } from '../tipler.ts';
import { useKisiselDeger } from '../veri.ts';
import './isler.css';

type Kapsam = 'me' | 'by' | 'all';
type Kip = 'list' | 'board' | 'table';
type Durum = Gorev['status'];
const DURUMLAR = Object.keys(GOREV_DURUMLARI) as Durum[];
const tesliminSirasi = (a: Gorev, b: Gorev) => (a.due ?? 9e15) - (b.due ?? 9e15);
const kisaTarih = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });

// Prototipin viewWork2'si: Bana / Benden / Herkes ile Liste / Pano / Tablo. Kip kişiye özel saklanır (mesai:workMode).
export function Isler() {
  const { ben, veri, hazir } = useMesaj();
  const [kapsam, kapsamYaz] = useState<Kapsam>('me');
  const [kayitliKip, kipYaz] = useKisiselDeger<string>(ben.id, 'workMode', 'list');
  const kip: Kip = kayitliKip === 'board' || kayitliKip === 'table' ? kayitliKip : 'list';
  const { gorevler, onaylar } = veri;
  const gorevde = (t: Gorev) => (kapsam === 'me' ? t.to === ben.id : kapsam === 'by' ? t.by === ben.id : true);
  const sayilar = {
    me: gorevler.filter((t) => t.to === ben.id && t.status !== 'done').length + onaylar.filter((a) => bendenOnayBekliyor(a, ben.id)).length,
    by: gorevler.filter((t) => t.by === ben.id && t.status !== 'done').length
      + onaylar.filter((a) => a.by === ben.id && onayDurumu(a).s === 'wait').length,
  };

  return (
    <>
      <SayfaBasligi
        baslik="İşler" simge="clipboard-check" alt="Görevler ve onay istekleri"
      />
      <div className="tc-mi-arac">
        <SecimGrubu<Kapsam>
          etiket="Kimin işleri" secili={kapsam} sec={kapsamYaz}
          secenekler={[
            { anahtar: 'me', baslik: 'Bana', sayi: sayilar.me }, { anahtar: 'by', baslik: 'Benden', sayi: sayilar.by },
            { anahtar: 'all', baslik: 'Herkes' },
          ]}
        />
        <SecimGrubu<Kip>
          etiket="Görünüm" secili={kip} sec={kipYaz}
          secenekler={[
            { anahtar: 'list', baslik: 'Liste', simge: 'list' }, { anahtar: 'board', baslik: 'Pano', simge: 'grid' },
            { anahtar: 'table', baslik: 'Tablo', simge: 'layers' },
          ]}
        />
      </div>
      {!hazir
        ? <DurumKutusu durum="yukleniyor" />
        : kip === 'list'
          ? <IsListesi kapsam={kapsam} />
          : kip === 'board'
            ? <IsPanosu gorevler={gorevler.filter(gorevde)} />
            : <IsTablosu gorevler={gorevler.filter(gorevde)} hepsi={gorevler} />}
    </>
  );
}

function IsListesi({ kapsam }: { kapsam: Kapsam }) {
  const { ben, veri } = useMesaj();
  const [bitenler, bitenlerYaz] = useState(false);
  const gorevde = (t: Gorev) => (kapsam === 'me' ? t.to === ben.id : kapsam === 'by' ? t.by === ben.id : true);
  const onayda = (a: { by: string; approvers: string[] }) =>
    (kapsam === 'me' ? (a.approvers || []).includes(ben.id) : kapsam === 'by' ? a.by === ben.id : true);
  const acikG = veri.gorevler.filter((t) => gorevde(t) && t.status !== 'done').sort(tesliminSirasi);
  const bitenG = veri.gorevler.filter((t) => gorevde(t) && t.status === 'done').sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 50);
  const acikO = veri.onaylar.filter((a) => onayda(a) && onayDurumu(a).s === 'wait').sort((a, b) => b.createdAt - a.createdAt);
  const bitenO = veri.onaylar.filter((a) => onayda(a) && onayDurumu(a).s !== 'wait').sort((a, b) => b.createdAt - a.createdAt);
  const bitenSayisi = veri.gorevler.filter((t) => gorevde(t) && t.status === 'done').length + bitenO.length;
  return (
    <>
      {acikG.length === 0 && acikO.length === 0 && (
        <DurumKutusu
          durum="bos"
          mesaj={`${kapsam === 'me' ? 'Sana düşen açık iş yok' : 'Açık iş yok'}. Birine görev vermek ya da onay istemek için “Yeni iş”e dokun. Sohbetteki bir mesajı da menüsünden işe çevirebilirsin.`}
        />
      )}
      {acikO.length > 0 && (
        <section className="tc-mi-bolum" aria-label="Onay istekleri">
          <h3>Onay istekleri</h3>
          <div className="tc-mi-liste">{acikO.map((a) => <OnayKarti key={a.id} onay={a} />)}</div>
        </section>
      )}
      {acikG.length > 0 && (
        <section className="tc-mi-bolum" aria-label="Görevler">
          <h3>Görevler</h3>
          <div className="tc-mi-liste">{acikG.map((t) => <GorevSatiri key={t.id} gorev={t} />)}</div>
        </section>
      )}
      {bitenSayisi > 0 && (
        <button type="button" className="tc-mi-baglanti" aria-expanded={bitenler} onClick={() => bitenlerYaz(!bitenler)}>
          {bitenler ? 'Bitenleri gizle' : `Bitenleri göster (${bitenSayisi})`}
        </button>
      )}
      {bitenler && (
        <div className="tc-mi-liste tc-mi-bitenler">
          {bitenO.map((a) => <OnayKarti key={a.id} onay={a} />)}
          {bitenG.map((t) => <GorevSatiri key={t.id} gorev={t} />)}
        </div>
      )}
    </>
  );
}

const dokunmatik = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches;

// Prototipin workBoard'u: kart sürüklenip sütuna bırakılınca durum değişir; dokunmatikte karta dokunulur.
function IsPanosu({ gorevler }: { gorevler: Kayit<Gorev>[] }) {
  const { ben, yetki, ayrintiAc, formAc } = useMesaj();
  const { gorevDurumu } = useIsEylemleri();
  const [uzerinde, uzerindeYaz] = useState<Durum | null>(null);
  const birak = (o: DragEvent, s: Durum) => {
    o.preventDefault();
    uzerindeYaz(null);
    const id = o.dataTransfer.getData('text/plain');
    const t = gorevler.find((g) => g.id === id);
    if (t && durumDegistirebilir(t, yetki, ben.id)) gorevDurumu(t.id, s);
  };
  return (
    <>
      <div className="tc-mi-pano">
        {DURUMLAR.map((s) => {
          const hepsi = gorevler.filter((t) => t.status === s);
          const liste = s === 'done' ? [...hepsi].sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 30) : [...hepsi].sort(tesliminSirasi);
          return (
            <section
              key={s} className={`tc-mi-sutun tc-mi-sutun-${s}${uzerinde === s ? ' tc-mi-sutun-uzerinde' : ''}`} aria-label={GOREV_DURUMLARI[s].t}
              onDragOver={yetki.yaz ? (o) => { o.preventDefault(); uzerindeYaz(s); } : undefined}
              onDragLeave={() => uzerindeYaz(null)}
              onDrop={yetki.yaz ? (o) => birak(o, s) : undefined}
            >
              <h3 className="tc-mi-sutun-baslik">{GOREV_DURUMLARI[s].t}<span className="tc-mi-sayi">{hepsi.length}</span></h3>
              {liste.map((t) => (
                <div
                  key={t.id} className="tc-mi-pano-karti" draggable={durumDegistirebilir(t, yetki, ben.id)}
                  onDragStart={(o) => o.dataTransfer.setData('text/plain', t.id)}
                  onClick={() => ayrintiAc({ tur: 'gorev', id: t.id })}
                >
                  <button type="button" className="tc-mi-baslik" onClick={(o) => { o.stopPropagation(); ayrintiAc({ tur: 'gorev', id: t.id }); }}>
                    {t.title}
                  </button>
                  <div className="tc-mi-ust">
                    <SiparisCipi siparisId={t.orderId ?? null} />
                    {s !== 'done' && <TeslimEtiketi etiket={teslimEtiketi(t.due, Date.now())} />}
                    {t.to && <KisiRozeti id={t.to} boyut="s" />}
                  </div>
                </div>
              ))}
              {yetki.yaz && s !== 'done' && (
                <button type="button" className="tc-mi-pano-ekle" onClick={() => formAc({ tur: 'gorev', ilk: { status: s } })}>
                  <Simge ad="plus" />Görev
                </button>
              )}
            </section>
          );
        })}
      </div>
      <p className="tc-mi-bos-kucuk">{dokunmatik() ? 'Durumu değiştirmek için karta dokun.' : 'Kartları sürükleyerek durumunu değiştir.'}</p>
    </>
  );
}

type TabloAlani = 'title' | 'to' | 'by' | 'status' | 'due' | 'order' | 'createdAt';

// Prototipin workTable'ı: başlığa tıklayınca sıralanır, durum satırda değişir, CSV bütün görevleri aktarır.
function IsTablosu({ gorevler, hepsi }: { gorevler: Kayit<Gorev>[]; hepsi: Kayit<Gorev>[] }) {
  const { ben, ad, ilkAd, yetki, siparisler, ayrintiAc } = useMesaj();
  const { gorevDurumu } = useIsEylemleri();
  const [siralama, siralamaYaz] = useState<Siralama | null>({ alan: 'due', yon: 'artan' });
  const siparisNo = (t: Gorev) => (t.orderId ? siparisler?.find((o) => o.id === t.orderId)?.no ?? '' : '');
  const deger = (t: Gorev, k: TabloAlani): string | number => {
    if (k === 'to' || k === 'by') return (t[k] ? ad(t[k]) : '').toLocaleLowerCase('tr');
    if (k === 'order') return siparisNo(t);
    if (k === 'status') return DURUMLAR.indexOf(t.status);
    if (k === 'due') return t.due ?? 9e15;
    if (k === 'title') return t.title.toLocaleLowerCase('tr');
    return t.createdAt ?? 0;
  };
  const alan = (siralama?.alan ?? 'due') as TabloAlani;
  const yon = siralama?.yon === 'azalan' ? -1 : 1;
  const satirlar = [...gorevler].sort((a, b) => { const x = deger(a, alan); const y = deger(b, alan); return (x > y ? 1 : x < y ? -1 : 0) * yon; });
  const sutunlar: Sutun<Kayit<Gorev>>[] = [
    { anahtar: 'title', baslik: 'Görev', sirala: true, hucre: (t) => t.title },
    {
      anahtar: 'to', baslik: 'Kime', sirala: true, csv: (t) => (t.to ? ad(t.to) : ''),
      hucre: (t) => (t.to ? <span className="tc-mi-ust"><KisiRozeti id={t.to} boyut="s" />{ilkAd(t.to)}</span> : '–'),
    },
    { anahtar: 'by', baslik: 'Veren', sirala: true, csv: (t) => ad(t.by), hucre: (t) => ilkAd(t.by) },
    {
      anahtar: 'status', baslik: 'Durum', sirala: true, csv: (t) => GOREV_DURUMLARI[t.status].t,
      hucre: (t) => (
        <select
          className={`tc-mi-durum-secimi tc-mi-durum-${t.status}`} aria-label={`${t.title}: durum`} value={t.status} disabled={!durumDegistirebilir(t, yetki, ben.id)}
          onClick={(o) => o.stopPropagation()} onChange={(o) => gorevDurumu(t.id, o.target.value as Durum)}
        >
          {DURUMLAR.map((s) => <option key={s} value={s}>{GOREV_DURUMLARI[s].t}</option>)}
        </select>
      ),
    },
    {
      anahtar: 'due', baslik: 'Ne zamana', sirala: true, kirilmaz: true, csv: (t) => (t.due ? isoGun(t.due) : ''),
      hucre: (t) => {
        const e = t.status !== 'done' ? teslimEtiketi(t.due, Date.now()) : null;
        return t.due ? <span className={e?.c ? `tc-mi-teslim-${e.c}` : undefined}>{kisaTarih.format(t.due)}</span> : '–';
      },
    },
    { anahtar: 'order', baslik: 'Sipariş', sirala: true, csv: (t) => siparisNo(t), hucre: (t) => (siparisNo(t) ? `#${siparisNo(t)}` : '–') },
    {
      anahtar: 'createdAt', baslik: 'Açıldı', sirala: true, kirilmaz: true, csv: (t) => isoGun(t.createdAt || Date.now()),
      hucre: (t) => kisaTarih.format(t.createdAt || Date.now()),
    },
  ];
  return (
    <Tablo
      etiket="Görevler" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(t) => t.id} bosMesaj="Görev yok."
      satirSec={(t) => ayrintiAc({ tur: 'gorev', id: t.id })}
      siralama={siralama} siralamaDegistir={siralamaYaz}
      arac={{ csv: { ad: 'gorevler', satirlar: hepsi } }}
    />
  );
}
