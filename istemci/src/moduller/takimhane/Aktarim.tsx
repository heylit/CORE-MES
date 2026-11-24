import { Dugme, Rozet, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { IkiGorunum, KompaktListe } from './KompaktListe.tsx';
import type { AktarimSatiri } from '#paylasilan/sozlesme/takimhane.ts';
import './takimhane.css';

const BULGU_ADI: Record<NonNullable<AktarimSatiri['bulgu']>, string> = {
  'yinelenen-kod': 'Yinelenen kod',
  bosluk: 'Baş/son boşluk',
  'bos-kategori': 'Kategori boş',
  'malzeme-cinsi-birlesti': 'Malzeme cinsi birleşti',
};
const BULGU_TONU: Record<NonNullable<AktarimSatiri['bulgu']>, RozetTonu> = {
  'yinelenen-kod': 'uyari', bosluk: 'bilgi', 'bos-kategori': 'hata', 'malzeme-cinsi-birlesti': 'bilgi',
};

const SUTUNLAR: readonly Sutun<AktarimSatiri>[] = [
  { anahtar: 'satir', baslik: 'Satır', mono: true, hizala: 'sag', hucre: (s) => s.satir },
  { anahtar: 'kod', baslik: 'Kod', mono: true, kirilmaz: true, hucre: (s) => s.kod },
  {
    anahtar: 'bulgu', baslik: 'Temizlik', kartTamSatir: true,
    hucre: (s) => (s.bulgu === null ? null : (
      <span className="tc-tkm-bulgu"><Rozet ton={BULGU_TONU[s.bulgu]}>{BULGU_ADI[s.bulgu]}</Rozet>{s.karar && <span className="tc-tkm-soluk">{s.karar}</span>}</span>
    )),
  },
  { anahtar: 'ad', baslik: 'Takım', hucre: (s) => s.ad },
  { anahtar: 'kategori', baslik: 'Kategori', hucre: (s) => s.kategori },
  { anahtar: 'raf', baslik: 'Raf', mono: true, kirilmaz: true, hucre: (s) => s.rafKodu },
  { anahtar: 'adet', baslik: 'Adet', mono: true, hizala: 'sag', hucre: (s) => s.adet },
];

// Başlangıç stoğu Excel'den toplu girer (ya hepsi ya hiçbiri); temizlik kararları kayıttan önce satır satır görünür.
export function AktarimOnizleme({ satirlar, kaydet, vazgec }: { satirlar: readonly AktarimSatiri[]; kaydet?: () => void; vazgec: () => void }) {
  const bulgulu = satirlar.filter((s) => s.bulgu !== null);
  const sorunlu = satirlar.filter((s) => s.bulgu === 'bos-kategori').length;
  const adet = satirlar.reduce((t, s) => t + s.adet, 0);
  return (
    <div className="tc-tkm-aktarim">
      <ul className="tc-tkm-aktarim-ozet" aria-label="Aktarım özeti">
        <li><span className="mono">{satirlar.length}</span><span>satır</span></li>
        <li><span className="mono">{adet.toLocaleString('tr-TR')}</span><span>adet</span></li>
        <li><span className="mono">{bulgulu.length}</span><span>temizlik kararı</span></li>
        <li data-sorun={sorunlu > 0 ? '' : undefined}><span className="mono">{sorunlu}</span><span>eksik kategori</span></li>
      </ul>
      <IkiGorunum
        masa={<Tablo etiket="Aktarım ön izlemesi" sutunlar={SUTUNLAR} satirlar={satirlar} satirAnahtari={(s) => s.satir} kip="kaydir" />}
        kompakt={(
          <KompaktListe
            etiket="Aktarım ön izlemesi" satirlar={satirlar} satirAnahtari={(s) => s.satir}
            baslik={(s) => <><span className="mono">{s.kod.trim()}</span><span className="tc-tkm-soluk"> satır {s.satir}</span></>}
            sag={(s) => `${String(s.adet)} adet`}
            alt={(s) => [s.ad, s.kategori ?? 'Kategori yok', s.rafKodu].filter(Boolean).join(' · ')}
            ek={(s) => (s.bulgu === null ? null : (
              <span className="tc-tkm-bulgu"><Rozet ton={BULGU_TONU[s.bulgu]}>{BULGU_ADI[s.bulgu]}</Rozet>{s.karar && <span className="tc-tkm-soluk">{s.karar}</span>}</span>
            ))}
          />
        )}
      />
      <div className="tc-tkm-eylemler">
        <Dugme onClick={vazgec}>Vazgeç</Dugme>
        {kaydet && <Dugme tur="birincil" simge="upload" onClick={kaydet} disabled={sorunlu > 0}>Başlangıç stoğu olarak yaz</Dugme>}
      </div>
      {!kaydet && <p className="tc-tkm-soluk">Bu ekran yalnız ön izlemedir; hiçbir şey kaydedilmez.</p>}
      {sorunlu > 0 && <p className="tc-tkm-soluk">Kategorisi boş satır varken yazılmaz; ya hepsi ya hiçbiri yazılır.</p>}
    </div>
  );
}
