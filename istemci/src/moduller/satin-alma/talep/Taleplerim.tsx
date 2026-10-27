import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Talebim } from '#paylasilan/sozlesme/satin-alma.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Simge } from '../../../ortak/arayuz/index.ts';
import { ADIMLAR, ADIM_SIRASI, DURUM, KAYNAK, SURE, anahtarlar, cagri, gunYaz } from './ortak.ts';
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

function Satir({ t, tam }: { t: Talebim; tam: boolean }) {
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
        {tam ? `${t.kalemler.length} kalem` : t.kalemler.map((x) => `${x.ad}${x.miktar === null ? '' : ` ${x.miktar} ${x.birim}`}`).join(', ')}
        {t.ihtiyacTarihi && <> · istenen {gunYaz(t.ihtiyacTarihi)}</>}
        {t.uretimEmriNo && <> · üretim emri {t.uretimEmriNo}</>}
      </div>
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
        <ul className="sa-talep-kalemler">
          {t.kalemler.map((x, i) => (
            <li key={i}>
              <span>{x.ad}</span>
              <span className="sa-talep-no">{x.miktar === null ? '—' : `${x.miktar} ${x.birim}`}</span>
              {(x.uygulanan || x.fasonAdim) && (
                <span className="sa-talep-not">{[x.uygulanan && `Parça: ${x.uygulanan}`, x.fasonAdim && `Fason: ${x.fasonAdim}`].filter(Boolean).join(' · ')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// Kişinin kendi talepleri ve durumu (kart #375); fiyat, teklif ve tedarikçi sunucudan zaten gelmez. Ana sayfada son on talep;
// Taleplerim sayfasında (898 a) arama, durum süzgeci, ilerleme ve kalem ayrıntısıyla.
export function Taleplerim({ tam = false, suzgec, suzgecYaz }: { tam?: boolean; suzgec?: DurumSuzgeci; suzgecYaz?: (s: DurumSuzgeci) => void } = {}) {
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
              : <ul className="sa-talep-liste">{gorunen.map((t) => <Satir key={t.id} t={t} tam={tam} />)}</ul>}
    </Kart>
  );
}
