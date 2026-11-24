import { Dugme, Girdi, Rozet, SayiKarti, Simge, Tablo, type Sutun, type TabloAraci } from '../../ortak/arayuz/index.ts';
import { IkiGorunum, KompaktListe } from './KompaktListe.tsx';
import type { KategoriOzeti, TakimhaneOzeti, TakimSatiri } from '#paylasilan/sozlesme/takimhane.ts';
import {
  KONUM_ADI, KONUM_SIMGESI, SINIF_ADI, STOK_DURUMU_ADI, STOK_DURUMU_TONU, adetMetni, stokDurumu, type Konum,
} from './gosterim.ts';
import './takimhane.css';

const SERIT_KONUMLARI = ['raf', 'tezgah', 'kisi', 'bileme'] as const satisfies readonly Konum[];

// Takım nerede? Dört yer yan yana: veri yoksa "Veri yok" görünür, sıfır uydurulmaz.
export function KonumSeridi({ konumlar }: { konumlar: TakimhaneOzeti['konumlar'] }) {
  return (
    <div className="tc-tkm-serit">
      {SERIT_KONUMLARI.map((k) => (
        <SayiKarti key={k} baslik={KONUM_ADI[k]} simge={KONUM_SIMGESI[k]} sayi={konumlar[k]} altMetin="adet" />
      ))}
    </div>
  );
}

// Beş yer yan yana: rafta, tezgâhta, kişide, bilemede, ara alan. Toplam kalem adedine eşit olmalı; görünmeyen adet "kayıp" gibi okunur.
export function KonumOzeti({ konumlar }: { konumlar: TakimhaneOzeti['konumlar'] }) {
  return (
    <dl className="tc-tkm-konum">
      {([...SERIT_KONUMLARI, 'ara'] as const).map((k) => (
        <div key={k}>
          <dt><Simge ad={KONUM_SIMGESI[k]} boyut="k" />{KONUM_ADI[k]}</dt>
          <dd className="mono">{adetMetni(konumlar[k])}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BekleyenIadeCipi({ sayi, ac }: { sayi: number; ac: () => void }) {
  if (sayi === 0) return null;
  return (
    <Dugme simge="rotate" onClick={ac} aria-label={`${String(sayi)} bekleyen iade`}>
      <span className="tc-tkm-uzun">{`${String(sayi)} bekleyen iade`}</span>
      <span className="tc-tkm-kisa" aria-hidden="true">{sayi}</span>
    </Dugme>
  );
}

export function UstSayilar({ ozet }: { ozet: TakimhaneOzeti }) {
  return (
    <div className="tc-tkm-serit">
      <SayiKarti baslik="Kalem" simge="tool" sayi={ozet.kalem} altMetin={`${adetMetni(ozet.adet)} adet`} />
      <SayiKarti baslik="Kritik" simge="alert" sayi={ozet.kritik} ton="uyari" altMetin="eşiğin altında" />
      <SayiKarti baslik="Stok yok" simge="minus" sayi={ozet.sifir} ton="hata" altMetin="kalem" />
      <SayiKarti baslik="Bekleyen iade" simge="rotate" sayi={ozet.bekleyenIade} ton="bilgi" altMetin="teslim" />
    </div>
  );
}

export function KategoriKartlari({ kategoriler, secili, sec }: {
  kategoriler: readonly KategoriOzeti[];
  secili: string | null;
  sec: (kategori: string | null) => void;
}) {
  return (
    <ul className="tc-tkm-kategoriler" aria-label="Kategoriler">
      {kategoriler.map((k) => (
        <li key={k.kategori}>
          <button
            type="button" className="tc-tkm-kategori" aria-pressed={secili === k.kategori}
            onClick={() => { sec(secili === k.kategori ? null : k.kategori); }}
          >
            <span className="tc-tkm-kategori-ad">{k.kategori}</span>
            <span className="tc-tkm-kategori-sayi mono">{k.adet.toLocaleString('tr-TR')}</span>
            <span className="tc-tkm-kategori-alt">
              {k.kalem} kalem
              {k.kritik > 0 && <Rozet ton="uyari">{k.kritik} kritik</Rozet>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function KategoriCipleri({ kategoriler, kalem, secili, sec }: {
  kategoriler: readonly KategoriOzeti[];
  kalem: number;
  secili: string | null;
  sec: (kategori: string | null) => void;
}) {
  return (
    <nav aria-label="Kategori süzgeci" className="tc-tkm-cipler">
      <button type="button" aria-pressed={secili === null} onClick={() => { sec(null); }}>Tümü<span className="mono">{kalem}</span></button>
      {kategoriler.map((k) => (
        <button key={k.kategori} type="button" aria-pressed={secili === k.kategori} onClick={() => { sec(secili === k.kategori ? null : k.kategori); }}>
          {k.kategori}<span className="mono">{k.kalem}</span>
          {k.kritik > 0 && <span className="tc-tkm-cip-kritik">{k.kritik} kritik</span>}
        </button>
      ))}
    </nav>
  );
}

export function KritikListe({ takimlar, ac, en = 3, toplam, tumu }: {
  takimlar: readonly TakimSatiri[];
  ac: (t: TakimSatiri) => void;
  // Gösterilen en çok kayıt; kalanlar için `tumu` bağlantısı çizilir. `toplam`: listede olmayan kayıtlar dahil eşik altı kalem sayısı.
  en?: number;
  toplam?: number;
  tumu?: () => void;
}) {
  const hepsi = takimlar.filter((t) => ['sifir', 'kritik'].includes(stokDurumu(t)))
    .sort((a, b) => a.toplam - b.toplam || a.kod.localeCompare(b.kod, 'tr'));
  const liste = hepsi.slice(0, en);
  const say = toplam ?? hepsi.length;
  if (liste.length === 0) return <p className="tc-tkm-bos">Eşiğin altında kalem yok.</p>;
  return (
    <>
    <ul className="tc-tkm-kritik">
      {liste.map((t) => {
        const d = stokDurumu(t);
        return (
          <li key={t.kartKimlik}>
            <button type="button" className="tc-tkm-kritik-satir" onClick={() => { ac(t); }}>
              <span className="tc-tkm-kritik-ad"><span className="mono">{t.kod}</span><span>{t.ad}</span></span>
              <span className="tc-tkm-kritik-adet">
                <span className="mono">{t.toplam}{t.kritikSeviye !== null && <span className="tc-tkm-soluk"> / {t.kritikSeviye}</span>}</span>
                <Rozet ton={STOK_DURUMU_TONU[d]}>{STOK_DURUMU_ADI[d]}</Rozet>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
    {tumu && say > liste.length && <div className="tc-tkm-tumu"><Dugme simge="list" onClick={tumu}>{`Tümü (${String(say)})`}</Dugme></div>}
    </>
  );
}

const SUTUNLAR: readonly Sutun<TakimSatiri>[] = [
  { anahtar: 'kod', baslik: 'Kod', mono: true, kirilmaz: true, hucre: (t) => t.kod },
  {
    anahtar: 'ad', baslik: 'Takım',
    hucre: (t) => (
      <span className="tc-tkm-ad">
        <span>{t.ad}</span>
        <span className="tc-tkm-soluk">{[SINIF_ADI[t.sinif], t.capMm === null ? null : `Ø${t.capMm}`].filter(Boolean).join(' · ')}</span>
      </span>
    ),
  },
  { anahtar: 'kategori', baslik: 'Kategori', hucre: (t) => t.kategori },
  { anahtar: 'raf', baslik: 'Raf', mono: true, kirilmaz: true, hucre: (t) => t.rafKodu },
  { anahtar: 'toplam', baslik: 'Stok', hizala: 'sag', mono: true, hucre: (t) => t.toplam },
  { anahtar: 'kritik', baslik: 'Eşik', hizala: 'sag', mono: true, hucre: (t) => t.kritikSeviye },
  {
    anahtar: 'durum', baslik: 'Durum', kartTamSatir: true,
    hucre: (t) => { const d = stokDurumu(t); return <Rozet ton={STOK_DURUMU_TONU[d]}>{STOK_DURUMU_ADI[d]}</Rozet>; },
  },
];

// Kompakt görünümde Tablo'nun araç çubuğu yoktur; arama ve süzgeç aynı durumla burada çizilir.
function DarAraclar<S>({ arac }: { arac: TabloAraci<S> }) {
  return (
    <div className="tc-tkm-dar-arac">
      {arac.arama && <Girdi etiket={arac.arama.etiket ?? 'Ara'} placeholder={arac.arama.yerTutucu} value={arac.arama.deger} onChange={(e) => { arac.arama?.degistir(e.target.value); }} />}
      {arac.suzgec && (
        <div className="tc-tkm-cipler" role="group" aria-label={arac.suzgec.etiket}>
          {arac.suzgec.secenekler.map((o) => (
            <button key={o.deger} type="button" aria-pressed={arac.suzgec?.secili === o.deger} onClick={() => { arac.suzgec?.sec(o.deger); }}>{o.baslik}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TakimTablosu({ takimlar, satirSec, arac, bosMesaj = 'Takım yok' }: {
  takimlar: readonly TakimSatiri[];
  satirSec: (t: TakimSatiri) => void;
  arac?: TabloAraci<TakimSatiri>;
  bosMesaj?: string;
}) {
  return (
    <IkiGorunum
      masa={<Tablo etiket="Takımlar" sutunlar={SUTUNLAR} satirlar={takimlar} satirAnahtari={(t) => t.kartKimlik} satirSec={satirSec} arac={arac} bosMesaj={bosMesaj} />}
      kompakt={(
        <>
          {arac && <DarAraclar arac={arac} />}
          <KompaktListe
            etiket="Takımlar" satirlar={takimlar} satirAnahtari={(t) => t.kartKimlik}
            baslik={(t) => <button type="button" className="tc-tkm-kompakt-dugme" onClick={() => { satirSec(t); }}>{t.ad}</button>}
            sag={(t) => (t.kritikSeviye === null ? String(t.toplam) : `${String(t.toplam)} / ${String(t.kritikSeviye)}`)}
            alt={(t) => [t.kod, t.rafKodu].filter(Boolean).join(' · ')}
            ek={(t) => { const d = stokDurumu(t); return <Rozet ton={STOK_DURUMU_TONU[d]}>{STOK_DURUMU_ADI[d]}</Rozet>; }}
          />
        </>
      )}
    />
  );
}

export function KonumDagilimi({ konumlar }: { konumlar: TakimSatiri['konumlar'] }) {
  return (
    <dl className="tc-tkm-dagilim">
      {SERIT_KONUMLARI.map((k) => (
        <div key={k}>
          <dt><Simge ad={KONUM_SIMGESI[k]} boyut="k" />{KONUM_ADI[k]}</dt>
          <dd className="mono">{adetMetni(konumlar[k])}</dd>
        </div>
      ))}
      <div><dt><Simge ad={KONUM_SIMGESI.ara} boyut="k" />{KONUM_ADI.ara}</dt><dd className="mono">{adetMetni(konumlar.ara)}</dd></div>
    </dl>
  );
}
