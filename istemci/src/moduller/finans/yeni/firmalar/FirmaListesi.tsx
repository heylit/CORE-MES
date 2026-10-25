import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FirmaListesiCevabi, FirmaSatiri } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import type { Siralama } from '../../../../ortak/veri/liste-durumu.ts';
import { yolKur } from '../../../../ortak/veri/uc-cagrisi.ts';
import { tl, YOK } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { acikBakiye, FIRMA_TUR_ADI } from './kurallar.ts';

// Firma listesi (prototipte gömülü kipin VIEWS.firmalar, tam kipte rakam sütunlarıyla). Liste sunucuda süzülür ve sayfalanır
// (50'lik); rakam sütunları yalnız finans.oku olana görünür.

const TUR_SUZGECI = [['musteri', 'Müşteriler'], ['tedarikci', 'Tedarikçiler'], ['', 'Tümü']] as const;
const AKTIF_SUZGECI = [['true', 'Aktif'], ['false', 'Pasif'], ['', 'Tümü']] as const;
const SAYFA_BOYU = 50;

export interface ListeSuzgeci { tur: string; aktif: string; ara: string; sayfa: number; siralama: Siralama }
// Kart açılıp listeye dönülünce süzgeç yerinde kalır (prototipteki gibi): durum bir üstte, Firmalar'dadır.
export const ILK_SUZGEC: ListeSuzgeci = { tur: 'musteri', aktif: 'true', ara: '', sayfa: 1, siralama: { alan: 'ad', yon: 'artan' } };

export function FirmaListesi({ finans, yetki, ac, yeni, s, sYaz }: Pick<EkranOzellikleri, 'finans' | 'yetki'> & {
  ac: (id: number) => void;
  yeni: () => void;
  s: ListeSuzgeci;
  sYaz: Dispatch<SetStateAction<ListeSuzgeci>>;
}) {
  const [arama, aramaYaz] = useState(s.ara);
  useEffect(() => {
    const sayac = setTimeout(() => { if (arama.trim() !== s.ara) sYaz((o) => ({ ...o, ara: arama.trim(), sayfa: 1 })); }, 300);
    return () => clearTimeout(sayac);
  }, [arama]);

  const sorgu = {
    ...(s.ara ? { ara: s.ara } : {}), ...(s.tur ? { tur: s.tur } : {}), ...(s.aktif ? { aktif: s.aktif } : {}),
    sayfa: s.sayfa, sayfaBoyu: SAYFA_BOYU, sirala: s.siralama.alan, yon: s.siralama.yon,
  };
  const liste = useQuery({
    queryKey: ['finans', 'yeni', 'firmalar', sorgu],
    queryFn: () => api.get<FirmaListesiCevabi>(yolKur('/musteri-tedarikci/firmalar', {}, sorgu)),
    placeholderData: (onceki) => onceki,
  });

  const sutunlar: Sutun<FirmaSatiri>[] = [
    { anahtar: 'kod', baslik: 'Kod', mono: true, sirala: true, kirilmaz: true, hucre: (f) => f.kod ?? YOK },
    { anahtar: 'ad', baslik: 'Ad', sirala: true, hucre: (f) => <strong>{f.ad}</strong> },
    { anahtar: 'tur', baslik: 'Tür', hucre: (f) => FIRMA_TUR_ADI[f.tur] },
    { anahtar: 'fason', baslik: 'Fason', hucre: (f) => (f.fason ? 'Evet' : YOK) },
    { anahtar: 'vergiNo', baslik: 'Vergi no', mono: true, hucre: (f) => f.vergiNo ?? YOK },
    { anahtar: 'il', baslik: 'İl', hucre: (f) => f.il ?? YOK },
    { anahtar: 'durum', baslik: 'Durum', hucre: (f) => (f.aktif ? <Rozet ton="tamam">Aktif</Rozet> : <Rozet ton="pasif">Pasif</Rozet>) },
    { anahtar: 'logo', baslik: 'Logo cari kodu', mono: true, hucre: (f) => f.logoCariKodu ?? YOK },
    ...(finans ? [
      { anahtar: 'alacak', baslik: 'Açık alacak', hizala: 'sag', mono: true, kirilmaz: true, hucre: (f) => tl(acikBakiye(finans.V, f.id, 'gelir')) },
      { anahtar: 'borc', baslik: 'Açık borç', hizala: 'sag', mono: true, kirilmaz: true, hucre: (f) => tl(acikBakiye(finans.V, f.id, 'gider')) },
    ] satisfies Sutun<FirmaSatiri>[] : []),
  ];

  const veri = liste.data;
  return (
    <div className="tc-fk">
      <Kart sag={yetki.firmaYaz ? <Dugme tur="birincil" simge="plus" onClick={yeni}>Yeni firma</Dugme> : undefined}>
        <p className="tc-fk-not">Müşteri, tedarikçi ve fason firmaların kartları. Satın alma, stok ve Logo firmayı buradan alır.</p>
        <div className="tc-fk-arac">
          <div className="tc-fk-cipler" role="group" aria-label="Firma türü">
            {TUR_SUZGECI.map(([k, b]) => (
              <Dugme key={k} aria-pressed={s.tur === k} onClick={() => sYaz((o) => ({ ...o, tur: k, sayfa: 1 }))}>{b}</Dugme>
            ))}
          </div>
          <div className="tc-fk-cipler" role="group" aria-label="Firma durumu">
            {AKTIF_SUZGECI.map(([k, b]) => (
              <Dugme key={k} aria-pressed={s.aktif === k} onClick={() => sYaz((o) => ({ ...o, aktif: k, sayfa: 1 }))}>{b}</Dugme>
            ))}
          </div>
          <div className="tc-fk-arama">
            <Girdi etiket="Firma ara" type="search" placeholder="Ad, kod ya da vergi no ara" autoComplete="off" value={arama} onChange={(o) => aramaYaz(o.target.value)} />
          </div>
        </div>
      </Kart>
      {liste.isError ? (
        <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Firmalar alınamadı')} yenile={() => { void liste.refetch(); }} />
      ) : (
        <Tablo
          etiket="Firmalar" sutunlar={sutunlar} satirlar={veri?.satirlar ?? []} satirAnahtari={(f) => f.id} satirSec={(f) => ac(f.id)}
          mesgul={liste.isFetching}
          bosMesaj={liste.isPending ? 'Yükleniyor…' : s.ara ? 'Aramaya uyan firma yok.' : 'Bu süzgeçte firma yok.'}
          siralama={s.siralama}
          siralamaDegistir={(yeniSira) => sYaz((o) => ({ ...o, siralama: yeniSira ?? { alan: 'ad', yon: 'artan' }, sayfa: 1 }))}
          {...(veri ? { sayfalama: { sayfa: veri.sayfa ?? s.sayfa, sayfaBoyu: veri.sayfaBoyu, toplam: veri.toplam, degistir: (sayfa: number) => sYaz((o) => ({ ...o, sayfa })) } } : {})}
        />
      )}
    </div>
  );
}
