import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EslemeAtaGovdesi, EslemeCevabi, EslemeKaldirGovdesi, EslemelerCevabi, SmartesEslemeTuru,
} from '#paylasilan/sozlesme/smartes.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Sekmeler, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { YOK } from './gosterim.ts';
import './smartes.css';

type Satir = EslemelerCevabi['satirlar'][number];

// Sözleşme dosyası zod taşır, istemci ondan değer ithal etmez; tip eksik ya da fazla türü yakalar.
const TUR_ADLARI = {
  istasyon: 'İstasyon', makine: 'Makine', 'operasyon-tipi': 'Operasyon tipi', 'durus-nedeni': 'Duruş nedeni',
} as const satisfies Record<SmartesEslemeTuru, string>;
const SEKMELER = (Object.keys(TUR_ADLARI) as SmartesEslemeTuru[]).map((t) => ({ anahtar: t, baslik: TUR_ADLARI[t] }));

function EslemeFormu({ tur, satir, kapat }: { tur: SmartesEslemeTuru; satir: Satir; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [kod, kodYaz] = useState(satir.smartesKod ?? '');
  const [hata, hataYaz] = useState<string | null>(null);
  const bitti = async (mesaj: string) => {
    await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
    bildir('tamam', mesaj);
    kapat();
  };
  const ata = useMutation({
    mutationFn: (g: EslemeAtaGovdesi) => api.post<EslemeCevabi>('/smartes/eslemeler/ata', g),
    onMutate: () => { hataYaz(null); },
    onSuccess: () => bitti('Eşleme kaydedildi.'),
    onError: (e) => { hataYaz(hataIletisi(e, 'Eşleme kaydedilemedi')); },
  });
  const kaldir = useMutation({
    mutationFn: (g: EslemeKaldirGovdesi) => api.post<EslemeCevabi>('/smartes/eslemeler/kaldir', g),
    onMutate: () => { hataYaz(null); },
    onSuccess: () => bitti('Eşleme kaldırıldı.'),
    onError: (e) => { hataYaz(hataIletisi(e, 'Eşleme kaldırılamadı')); },
  });
  const kaydet = () => { ata.mutate({ tur, tmiId: satir.tmiId, smartesKod: kod, surum: satir.surum }); };
  const surum = satir.surum;

  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={`${TUR_ADLARI[tur]}: ${satir.tmiKod}`}
      alt={(
        <>
          {surum !== null && (
            <Dugme tur="tehlike" simge="trash" yukleniyor={kaldir.isPending} disabled={ata.isPending}
              onClick={() => { kaldir.mutate({ tur, tmiId: satir.tmiId, surum }); }}>Eşlemeyi kaldır</Dugme>
          )}
          <Dugme tur="birincil" simge="check" yukleniyor={ata.isPending} disabled={kaldir.isPending || kod.trim() === ''} onClick={kaydet}>Kaydet</Dugme>
        </>
      )}
    >
      <form className="tc-smartes-form" onSubmit={(o) => { o.preventDefault(); if (kod.trim() !== '') kaydet(); }}>
        <p className="tc-smartes-aciklama">{satir.tmiAd}</p>
        <Girdi etiket="SmartES kodu" ipucu="SmartES’te bu kaydın kodu; aynı kod iki kayda verilemez." maxLength={50}
          value={kod} onChange={(o) => { kodYaz(o.target.value); }} autoFocus />
        {hata !== null && <p role="alert" className="tc-smartes-hata">{hata}</p>}
      </form>
    </Pencere>
  );
}

export function Eslemeler() {
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('smartes.esleme-yaz') === true;
  const [tur, turYaz] = useState<SmartesEslemeTuru>('istasyon');
  const [secili, seciliYaz] = useState<Satir | null>(null);
  const liste = useQuery({
    queryKey: anahtarlar.eslemeler(tur),
    queryFn: () => api.get<EslemelerCevabi>(`/smartes/eslemeler?tur=${tur}`),
  });
  const satirlar = liste.data?.tur === tur ? liste.data.satirlar : [];
  const eslenen = satirlar.filter((s) => s.smartesKod !== null).length;

  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'tmiKod', baslik: 'TMI kodu', hucre: (s) => s.tmiKod, mono: true },
    { anahtar: 'tmiAd', baslik: 'Ad', hucre: (s) => <>{s.tmiAd}{!s.aktif && <> <Rozet ton="pasif">Pasif</Rozet></>}</> },
    { anahtar: 'smartesKod', baslik: 'SmartES kodu', hucre: (s) => s.smartesKod ?? YOK, mono: true },
    ...(yazabilir
      ? [{ anahtar: 'eylem', baslik: '', hucre: (s: Satir) => <Dugme simge="wrench" onClick={() => { seciliYaz(s); }}>{s.smartesKod === null ? 'Eşle' : 'Değiştir'}</Dugme> }]
      : []),
  ];

  return (
    <Kart baslik="Kod eşlemeleri">
      <div className="tc-smartes">
        <p className="tc-smartes-aciklama">
          SmartES’e yalnız eşlenmiş istasyonların iş emri gider; okunan kayıtlar bu kodlarla TMI kayıtlarına bağlanır.
        </p>
        <Sekmeler etiket="Eşleme türü" sekmeler={SEKMELER} secili={tur} sec={(t) => { turYaz(t); seciliYaz(null); }} />
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Eşlemeler alınamadı')} yenile={() => { void liste.refetch(); }} />}
        {liste.data && (
          <>
            <p className="tc-smartes-ozet"><Rozet ton="bilgi">{`${eslenen} / ${satirlar.length} eşli`}</Rozet></p>
            <Tablo etiket="Kod eşlemeleri" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(s) => s.tmiId} bosMesaj="Bu türde TMI kaydı yok." />
          </>
        )}
      </div>
      {secili !== null && <EslemeFormu key={`${tur}-${secili.tmiId}`} tur={tur} satir={secili} kapat={() => { seciliYaz(null); }} />}
    </Kart>
  );
}
