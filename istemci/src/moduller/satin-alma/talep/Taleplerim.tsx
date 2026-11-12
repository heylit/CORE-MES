import { Fragment, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Talebim } from '#paylasilan/sozlesme/satin-alma.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Simge } from '../../../ortak/arayuz/index.ts';
import { ADIMLAR, ADIM_SIRASI, DURUM, KAYNAK, SURE, anahtarlar, cagri, gunYaz, karsilikYaz } from './ortak.ts';
import './talep.css';

const SON = 10;
export const HEPSI = 500;

export type DurumSuzgeci = 'acik' | 'satin' | 'onay' | 'siparis' | 'hepsi';
const SUZGECLER: readonly [DurumSuzgeci, string][] = [['acik', 'Açık'], ['satin', 'Satın almada'], ['onay', 'Onayda'], ['siparis', 'Sipariş verildi'], ['hepsi', 'Hepsi']];
// Süzgeç talep edenin gördüğü sade duruma göredir; satın almanın iç aşamaları (teklif, değerlendirme) "Satın almada"dır.
export function suzgeceUyar(t: Talebim, s: DurumSuzgeci): boolean {
  switch (s) {
    case 'acik': return t.durum !== 'teslim_alindi' && t.durum !== 'iptal';
    case 'satin': return t.durum === 'taslak' || t.durum === 'teklif_isteniyor' || t.durum === 'degerlendirme';
    case 'onay': return t.durum === 'onayda';
    case 'siparis': return t.durum === 'siparis_verildi';
    case 'hepsi': return true;
  }
}

function Adimlar({ t }: { t: Talebim }) {
  const sira = ADIM_SIRASI[t.durum];
  if (sira === null) return null;
  return (
    <ol className="sa-talep-adimlar" aria-label={`İlerleme: ${DURUM[t.durum].metin}`}>
      {ADIMLAR.map((a, i) => <li key={a} data-durum={i < sira ? 'bitti' : i === sira ? 'simdi' : undefined}>{a}</li>)}
    </ol>
  );
}

// 3121: kartın kalite, durum, işlem ve ölçüsü ayrı sütunlarda; dar ekranda sütunlar gizlenir, değerler kalem adının altında etiketli satırdır.
type Ozellik = NonNullable<Talebim['kalemler'][number]['malzeme']>;
type OzellikAlani = 'kalite' | 'durum' | 'islem' | 'olcu' | 'aciklama';
const OZELLIKLER: readonly [OzellikAlani, string][] = [['kalite', 'Kalite'], ['durum', 'Durum'], ['islem', 'İşlem'], ['olcu', 'Ölçü'], ['aciklama', 'Açıklama']];
function OzellikAlti({ m }: { m: Ozellik | null }) {
  const dolu = OZELLIKLER.flatMap(([k, b]) => (m?.[k] ? [`${b}: ${m[k]}`] : []));
  return dolu.length ? <span className="sa-talep-not sa-talep-oz-alt">{dolu.join(' · ')}</span> : null;
}
// 3133: malzeme kartının föyündeki ayrıntılar kalem hücresinde açılır.
function KartAyrintisi({ m }: { m: Ozellik | null }) {
  if (!m?.ayrinti.length) return null;
  return (
    <details className="sa-talep-ayrinti">
      <summary><Simge ad="list" boyut="k" /> Kart ayrıntısı</summary>
      <dl>{m.ayrinti.map((x) => <Fragment key={x.ad}><dt>{x.ad}</dt><dd>{x.deger}</dd></Fragment>)}</dl>
    </details>
  );
}

export type Duzenleme = 'duzenle' | 'guncelle';
function Satir({ t, tam, duzenle }: { t: Talebim; tam: boolean; duzenle: ((t: Talebim, kip: Duzenleme) => void) | undefined }) {
  const [acik, acikYaz] = useState(false);
  const d = DURUM[t.durum];
  const bekleyen = t.kalemler.filter((k) => k.kartBekliyor).length;
  const k = KAYNAK[t.kaynak];
  const ust = (
    <>
      <div className="sa-talep-satir-ust">
        <span className="sa-talep-no">{t.no}</span>
        <Rozet ton={d.ton}>{d.metin}</Rozet>
        {t.kaynak !== 'elle' && <Rozet ton="uyari" gorunum="cizgi">{k.metin}</Rozet>}
        {bekleyen > 0 && <Rozet ton="uyari">{bekleyen} kalem kart bekliyor</Rozet>}
        {tam && <span className="sa-talep-ok"><Simge ad={acik ? 'up' : 'down'} boyut="k" /></span>}
      </div>
      <div><b>{t.baslik}</b></div>
      <div className="sa-talep-not">
        {tam ? `${t.kalemler.length} kalem` : t.kalemler.map((x) => `${x.ad}${x.miktar === null ? '' : ` ${x.miktar} ${x.birim}`}${x.karsilik ? ` (${karsilikYaz(x.karsilik)})` : ''}`).join(', ')}
        {t.ihtiyacTarihi && <> · istenen {gunYaz(t.ihtiyacTarihi)}</>}
        {t.uretimEmriNo && <> · üretim emri {t.uretimEmriNo}</>}
      </div>
      {t.guncellemeGrubu && (
        <div className="sa-talep-not">
          <Simge ad="layers" boyut="k" /> {t.guncellemeGrubu.find((x) => x.kok)?.id === t.id ? 'Güncellemeleri' : 'Güncelleme grubu'}:{' '}
          {t.guncellemeGrubu.filter((x) => x.id !== t.id).map((x) => `${x.no}${x.kok ? ' (ilk talep)' : ''} ${DURUM[x.durum].metin.toLocaleLowerCase('tr-TR')}`).join(', ')}
        </div>
      )}
    </>
  );
  if (!tam) return <li className="sa-talep-satir">{ust}</li>;
  return (
    <li className="sa-talep-satir">
      <button type="button" className="sa-talep-ac" aria-expanded={acik} onClick={() => acikYaz((a) => !a)}>
        {ust}
        <Adimlar t={t} />
      </button>
      {acik && (
        <div className="sa-talep-kalem-tablo">
          <table className="sa-talep-kt">
            <thead>
              <tr><th>Kalem</th>{OZELLIKLER.map(([, b]) => <th key={b} className="sa-talep-oz">{b}</th>)}<th className="sa-talep-sag">Miktar</th></tr>
            </thead>
            <tbody>
              {t.kalemler.map((x, i) => (
                <tr key={i}>
                  <td>
                    <span>{x.ad}</span>
                    {(x.uygulanan || x.fasonAdim) && (
                      <span className="sa-talep-not">{[x.uygulanan && `Uygulanacak malzeme: ${x.uygulanan}`, x.fasonAdim && `Fason: ${x.fasonAdim}`].filter(Boolean).join(' · ')}</span>
                    )}
                    {x.aciklama && <span className="sa-talep-not">{x.aciklama}</span>}
                    <OzellikAlti m={x.malzeme ?? null} />
                    <KartAyrintisi m={x.malzeme ?? null} />
                  </td>
                  {OZELLIKLER.map(([k, b]) => <td key={k} className={`sa-talep-oz sa-talep-oz-${k}`} data-etiket={b}>{x.malzeme?.[k] ?? <span className="sa-talep-bos">–</span>}</td>)}
                  <td className="sa-talep-sag">
                    <span className="sa-talep-no">{x.miktar === null ? '—' : `${x.miktar} ${x.birim}`}</span>
                    {x.karsilik && <span className="sa-talep-not">{karsilikYaz(x.karsilik)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {acik && t.duzenlenebilir && duzenle && (
        <div className="sa-talep-duzenle"><Dugme simge="edit" onClick={() => duzenle(t, 'duzenle')}>Düzenle</Dugme></div>
      )}
      {acik && t.guncellenebilir && duzenle && (
        <div className="sa-talep-duzenle">
          <span className="sa-talep-not">Teklif toplanıyor: talep değişmez, değişiklik yeni bir güncelleme talebiyle gider; satın alma ikisini birlikte görür.</span>
          <Dugme simge="layers" onClick={() => duzenle(t, 'guncelle')}>Güncelleme talebi aç</Dugme>
        </div>
      )}
    </li>
  );
}

// Kişinin kendi talepleri ve durumu (kart #375); fiyat, teklif ve tedarikçi sunucudan zaten gelmez. Ana sayfada son on talep;
// Taleplerim sayfasında (898 a) arama, durum süzgeci, ilerleme ve kalem ayrıntısıyla.
// 2871-1 a: `duzenle` verilirse teklif istenmemiş kendi talebinin ayrıntısında "Düzenle" çıkar; 2876: teklif toplanırken "Güncelleme talebi aç".
export function Taleplerim({ tam = false, suzgec, suzgecYaz, duzenle }: {
  tam?: boolean; suzgec?: DurumSuzgeci; suzgecYaz?: (s: DurumSuzgeci) => void; duzenle?: (t: Talebim, kip: Duzenleme) => void;
} = {}) {
  const [hepsi, hepsiYaz] = useState(false);
  const [ara, araYaz] = useState('');
  const [yerelSuzgec, yerelSuzgecYaz] = useState<DurumSuzgeci>('acik');
  const durum = suzgec ?? yerelSuzgec;
  const durumYaz = suzgecYaz ?? yerelSuzgecYaz;
  const sinir = tam || hepsi ? HEPSI : SON;
  const liste = useQuery({
    queryKey: anahtarlar.taleplerim(sinir),
    queryFn: () => cagri.get('/satin-alma-taleplerim', { sorgu: { sinir }, ...SURE }),
    placeholderData: keepPreviousData,
  });
  const metin = ara.trim().toLocaleLowerCase('tr');
  const gorunen = (liste.data?.talepler ?? []).filter((t) => !tam || (suzgeceUyar(t, durum)
    && (metin === '' || [t.no, t.baslik, t.uretimEmriNo ?? '', ...t.kalemler.map((x) => x.ad)].join(' ').toLocaleLowerCase('tr').includes(metin))));
  return (
    <Kart baslik="Taleplerim" sag={!tam && liste.data && liste.data.toplam > SON
      ? <Dugme simge="list" onClick={() => hepsiYaz((h) => !h)}>{hepsi ? 'Son 10' : `Tümü (${liste.data.toplam})`}</Dugme> : undefined}>
      {tam && (
        <div className="sa-talep-suzgec">
          <Girdi etiket="Ara" type="search" placeholder="Talep no, kalem ya da emir no" value={ara} onChange={(e) => araYaz(e.target.value)} />
          <div className="sa-talep-tur" role="group" aria-label="Durum">
            {SUZGECLER.map(([a, b]) => (
              <Dugme key={a} tur={durum === a ? 'birincil' : 'ikincil'} aria-pressed={durum === a} onClick={() => durumYaz(a)}>{b}</Dugme>
            ))}
          </div>
        </div>
      )}
      {liste.isPending ? <DurumKutusu durum="yukleniyor" />
        : liste.isError ? <DurumKutusu durum="hata" mesaj="Talepler okunamadı." yenile={() => void liste.refetch()} />
          : liste.data.talepler.length === 0 ? <DurumKutusu durum="bos" mesaj="Henüz talebiniz yok." />
            : gorunen.length === 0 ? <DurumKutusu durum="bos" mesaj="Bu süzgeçle talep yok." />
              : <ul className="sa-talep-liste">{gorunen.map((t) => <Satir key={t.id} t={t} tam={tam} duzenle={duzenle} />)}</ul>}
    </Kart>
  );
}
