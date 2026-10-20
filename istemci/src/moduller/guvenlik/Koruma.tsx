import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { KorumaCevabi, KurallarCevabi } from '#paylasilan/sozlesme/guvenlik.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { BOS, KORUMA_ADI, KORUMA_TONU, ONEM_ADI, ONEM_TONU } from './gorunum.ts';
import './guvenlik.css';

export function GuvenlikKoruma() {
  const sorgu = useQuery({ queryKey: anahtarlar.koruma, queryFn: () => api.get<KorumaCevabi>('/guvenlik/koruma') });
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />;
  return (
    <div className="tc-guvenlik">
      <p className="tc-guvenlik-not">Bu sistemin okuyamadığı madde "Bilinmiyor" görünür; açık ya da kapalı sayılmaz.</p>
      <div className="tc-guvenlik-koruma">
        {sorgu.data.maddeler.map((m) => (
          <Kart key={m.anahtar} baslik={m.baslik} sag={<Rozet ton={KORUMA_TONU[m.durum]}>{KORUMA_ADI[m.durum]}</Rozet>}>
            <p>{m.aciklama}</p>
            {m.deger !== null && <div className="tc-guvenlik-deger">{m.deger}</div>}
          </Kart>
        ))}
      </div>
    </div>
  );
}

type Kural = KurallarCevabi['kurallar'][number];
const KURAL_SUTUNLARI: readonly Sutun<Kural>[] = [
  { anahtar: 'baslik', baslik: 'Alarm', hucre: (k) => k.baslik },
  { anahtar: 'kosul', baslik: 'Ne zaman açılır', hucre: (k) => k.kosul },
  { anahtar: 'onem', baslik: 'Önem', hucre: (k) => <Rozet ton={ONEM_TONU[k.onem]}>{ONEM_ADI[k.onem]}</Rozet> },
];

export function GuvenlikKurallar() {
  const sorgu = useQuery({ queryKey: anahtarlar.kurallar, queryFn: () => api.get<KurallarCevabi>('/guvenlik/kurallar'), staleTime: Infinity });
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />;
  const k = sorgu.data;
  return (
    <div className="tc-guvenlik">
      <p className="tc-guvenlik-not">
        Tarama her {k.taramaAraligiSn} saniyede bir koşar; {k.durmaEsigiDk} dakikadan uzun koşmazsa durum sayfası uyarır.
        Kapanan alarm {k.saklamaGun} gün saklanır. Uyarılar yalnız bu uygulamada görünür.
      </p>
      {k.vpnAraliklari.length > 0 && (
        <Kart baslik="VPN muafiyeti" sag={<Rozet ton="bilgi">Etkin</Rozet>}>
          <p className="tc-guvenlik-not">
            {k.vpnAraliklari.join(', ')} aralığından gelen denemeler şu kurallarda sayılmaz:
            {' '}{k.muafSinyaller.map((m) => k.kurallar.find((x) => x.sinyal === m)?.baslik ?? m).join(', ')}.
          </p>
        </Kart>
      )}
      <Tablo etiket="Alarm kuralları" sutunlar={KURAL_SUTUNLARI} satirlar={k.kurallar} satirAnahtari={(x) => x.sinyal} bosMesaj={BOS} />
    </div>
  );
}

// Denetim modülü dışarıya okuma vermiyor; yönetici işlemleri denetim kaydı sayfasında okunur.
export function GuvenlikYoneticiIslemleri() {
  const git = useNavigate();
  const oturum = useOturum();
  const denetimGorur = oturum.data?.islemler.includes('sayfa.denetim') ?? false;
  return (
    <div className="tc-guvenlik">
      <Kart baslik="Yönetici işlemleri">
        <p className="tc-guvenlik-not">
          Alarm onaylama ve kapatma, oturum kapatma, yetki ve kişi değişiklikleri denetim kaydına yazılır: kim, ne zaman, hangi işlemi yaptı.
        </p>
        {denetimGorur
          ? <Dugme simge="eye" onClick={() => { void git('/denetim'); }}>Denetim kaydını aç</Dugme>
          : <DurumKutusu durum="bos" mesaj="Denetim kaydını görme yetkiniz yok." />}
      </Kart>
    </div>
  );
}
