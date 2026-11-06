import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  GeriBildirimDurumu, GeriBildirimListeCevabi, GeriBildirimOzetiCevabi, GeriBildirimSecenekleriCevabi,
} from '#paylasilan/sozlesme/profil.ts';
import { DurumKutusu, Girdi, Kart, Rozet, Sayfalama, Secim, Simge } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GeriBildirimAyrintisi } from './GeriBildirimAyrintisi.tsx';
import { DURUM_ADI, DURUM_TONU, DURUMLAR, KONU_ADI, KONULAR, TUR_ADI, TUR_TONU, TURLER, zamanMetni } from './gorunum.ts';
import './profil.css';

// Geri Bildirim Merkezi gelen kutusu (kart 2192, önizleme 2192-0 a): üstte duruma göre sayılar (basınca süzer), süzgeçler,
// solda liste, sağda seçili kaydın ayrıntısı. Dar ekranda ayrıntı listenin altına iner.
export function GeriBildirimMerkezi() {
  const [sayfa, sayfaYaz] = useState(1);
  const [durum, durumYaz] = useState<GeriBildirimDurumu | ''>('');
  const [tur, turYaz] = useState('');
  const [konu, konuYaz] = useState('');
  const [kategori, kategoriYaz] = useState('');
  const [ara, araYaz] = useState('');
  const [secili, seciliYaz] = useState<number | null>(null);

  const q = new URLSearchParams({ sayfa: String(sayfa) });
  if (durum) q.set('durum', durum);
  if (tur) q.set('tur', tur);
  if (konu) q.set('konu', konu);
  if (kategori) q.set('kategoriId', kategori);
  if (ara.trim()) q.set('ara', ara.trim());
  const sorgu = q.toString();

  const liste = useQuery({
    queryKey: anahtarlar.gelenler(sorgu),
    queryFn: () => api.get<GeriBildirimListeCevabi>(`/profil/geri-bildirimler?${sorgu}`),
    placeholderData: keepPreviousData,
  });
  const ozet = useQuery({ queryKey: anahtarlar.ozet, queryFn: () => api.get<GeriBildirimOzetiCevabi>('/profil/geri-bildirim-ozeti') });
  const secenekler = useQuery({
    queryKey: anahtarlar.secenekler, queryFn: () => api.get<GeriBildirimSecenekleriCevabi>('/profil/geri-bildirim-secenekleri'),
  });

  if (liste.isError && liste.error instanceof ApiHatasi && liste.error.durum === 403) {
    return <DurumKutusu durum="bos" mesaj="Bu listeyi görme yetkiniz yok." />;
  }
  const sec = (yaz: (d: string) => void) => (deger: string) => { yaz(deger); sayfaYaz(1); };
  const seciliKayit = secili ?? liste.data?.satirlar[0]?.id ?? null;

  return (
    <div className="tc-profil tc-gbm">
      <div className="tc-gbm-ozet" role="group" aria-label="Duruma göre">
        {DURUMLAR.map((d) => (
          <button
            key={d} type="button" className="tc-gbm-ozet-kutu" aria-pressed={durum === d}
            onClick={() => { durumYaz(durum === d ? '' : d); sayfaYaz(1); }}
          >
            <Rozet ton={DURUM_TONU[d]}>{DURUM_ADI[d]}</Rozet>
            <strong className="mono">{ozet.data ? ozet.data.durumlar[d] : '—'}</strong>
          </button>
        ))}
      </div>
      <div className="tc-profil-suzgec">
        <Secim etiket="Tür" value={tur} bosSecenek="Hepsi" onChange={(o) => sec(turYaz)(o.target.value)}
          secenekler={TURLER.map((t) => ({ deger: t, baslik: TUR_ADI[t] }))} />
        <Secim etiket="Konu" value={konu} bosSecenek="Hepsi" onChange={(o) => sec(konuYaz)(o.target.value)}
          secenekler={KONULAR.map((k) => ({ deger: k, baslik: KONU_ADI[k] }))} />
        <Secim etiket="Kategori" value={kategori} bosSecenek="Hepsi" onChange={(o) => sec(kategoriYaz)(o.target.value)}
          secenekler={[{ deger: '0', baslik: 'Kategorisiz' }, ...(secenekler.data?.kategoriler ?? []).map((k) => ({ deger: String(k.id), baslik: k.ad }))]} />
        <Girdi etiket="Yazıda ara" type="search" maxLength={100} value={ara} onChange={(o) => sec(araYaz)(o.target.value)} />
      </div>
      <div className="tc-gbm-ana">
        <Kart baslik="Gelen kutusu" simge="list">
          {liste.isPending ? <DurumKutusu durum="yukleniyor" />
            : liste.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Liste alınamadı')} yenile={() => { void liste.refetch(); }} />
              : liste.data.satirlar.length === 0 ? <DurumKutusu durum="bos" mesaj="Bu süzgeçle kayıt yok." />
                : (
                  <>
                    <ul className="tc-profil-liste tc-gbm-liste" aria-busy={liste.isPlaceholderData}>
                      {liste.data.satirlar.map((s) => (
                        <li key={s.id}>
                          <button type="button" className="tc-gbm-satir" aria-current={s.id === seciliKayit} onClick={() => seciliYaz(s.id)}>
                            <span className="tc-profil-gb-ust">
                              <Rozet ton={DURUM_TONU[s.durum]}>{DURUM_ADI[s.durum]}</Rozet>
                              <Rozet ton={TUR_TONU[s.tur]} gorunum="cizgi">{TUR_ADI[s.tur]}</Rozet>
                              {s.kategoriAdi !== null && <span className="tc-profil-soluk"><Simge ad="tag" boyut="k" /> {s.kategoriAdi}</span>}
                              {s.anaKayitId !== null && <span className="tc-profil-soluk"><Simge ad="layers" boyut="k" /> #{s.anaKayitId}</span>}
                              <span className="tc-profil-soluk tc-gbm-zaman mono">#{s.id} · {zamanMetni(s.gonderildi)}</span>
                            </span>
                            <span className="tc-gbm-ozet-metin">{s.metin}</span>
                            <span className="tc-profil-soluk">
                              {s.kisiAdi} · {KONU_ADI[s.konu]}{s.hareketSayisi > 0 ? ` · ${s.hareketSayisi} hareket` : ''}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <Sayfalama sayfa={liste.data.sayfa} sayfaBoyu={liste.data.sayfaBoyu} toplam={liste.data.toplam} degistir={sayfaYaz} />
                  </>
                )}
        </Kart>
        {seciliKayit !== null && <GeriBildirimAyrintisi key={seciliKayit} id={seciliKayit} secenekler={secenekler.data ?? null} sec={seciliYaz} />}
      </div>
    </div>
  );
}
