import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import type { Alarm, AlarmGorunumu, AlarmKapatGovdesi, AlarmListeCevabi, AlarmOnaylaGovdesi, KurallarCevabi } from '#paylasilan/sozlesme/guvenlik.ts';
import { CokSatir, Dugme, DurumKutusu, Pencere, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import {
  BOS, DURUM_ADI, DURUM_TONU, GORUNUMLER, GORUNUM_ADI, KAPANIS_NOTU_EN_COK, NE_YAPILIR, ONEM_ADI, ONEM_TONU, SINYAL_ADI, kaynakMetni, zamanMetni,
} from './gorunum.ts';
import './guvenlik.css';

const SUTUNLAR: readonly Sutun<Alarm>[] = [
  { anahtar: 'onem', baslik: 'Önem', hucre: (a) => <Rozet ton={ONEM_TONU[a.onem]}>{ONEM_ADI[a.onem]}</Rozet> },
  { anahtar: 'sinyal', baslik: 'Alarm', hucre: (a) => SINYAL_ADI[a.sinyal] },
  { anahtar: 'kaynak', baslik: 'Kaynak', hucre: (a) => <span className="tc-guvenlik-kaynak">{kaynakMetni(a)}</span> },
  { anahtar: 'gozlenen', baslik: 'Sayı', hizala: 'sag', mono: true, hucre: (a) => a.gozlenenSayi },
  { anahtar: 'son', baslik: 'Son görülme', kirilmaz: true, hucre: (a) => zamanMetni(a.sonGoruldu) },
  { anahtar: 'durum', baslik: 'Durum', hucre: (a) => <Rozet ton={DURUM_TONU[a.durum]}>{DURUM_ADI[a.durum]}</Rozet> },
];

export function GuvenlikAlarmlar() {
  const [gorunum, gorunumYaz] = useState<AlarmGorunumu>('etkin');
  const [sayfa, sayfaYaz] = useState(1);
  const [secili, seciliYaz] = useState<Alarm | null>(null);
  const sorgu = useQuery({
    queryKey: anahtarlar.alarmlar(gorunum, sayfa),
    queryFn: () => api.get<AlarmListeCevabi>(`/guvenlik-alarmlari?${new URLSearchParams({ gorunum, sayfa: String(sayfa) }).toString()}`),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="tc-guvenlik">
      <div className="tc-guvenlik-cipler" role="group" aria-label="Alarm görünümü">
        {GORUNUMLER.map((g) => (
          <Dugme key={g} className="tc-guvenlik-cip" aria-pressed={g === gorunum} onClick={() => { gorunumYaz(g); sayfaYaz(1); }}>
            {GORUNUM_ADI[g]}
          </Dugme>
        ))}
      </div>
      {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
        : sorgu.isError ? <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />
          : (
            <Tablo
              etiket="Güvenlik alarmları"
              sutunlar={SUTUNLAR}
              satirlar={sorgu.data.satirlar}
              satirAnahtari={(a) => a.id}
              satirSec={seciliYaz}
              bosMesaj={gorunum === 'etkin' ? 'Bakılacak alarm yok' : 'Bu görünümde alarm yok'}
              mesgul={sorgu.isPlaceholderData}
              sayfalama={{ sayfa: sorgu.data.sayfa, sayfaBoyu: sorgu.data.sayfaBoyu, toplam: sorgu.data.toplam, degistir: sayfaYaz }}
            />
          )}
      {secili !== null && <AlarmAyrintisi alarm={secili} degisti={seciliYaz} kapat={() => seciliYaz(null)} />}
    </div>
  );
}

function AlarmAyrintisi({ alarm, degisti, kapat }: { alarm: Alarm; degisti: (a: Alarm) => void; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const oturum = useOturum();
  const yonetir = oturum.data?.islemler.includes('guvenlik.yonet') ?? false;
  const [not, notYaz] = useState('');
  const [notHatasi, notHatasiYaz] = useState<string | undefined>(undefined);
  const kurallar = useQuery({ queryKey: anahtarlar.kurallar, queryFn: () => api.get<KurallarCevabi>('/guvenlik/kurallar'), staleTime: Infinity });
  const kural = kurallar.data?.kurallar.find((k) => k.sinyal === alarm.sinyal);

  // Başkası alarmı değiştirdiyse güncel hali gösterilir; kullanıcı kararını onu görerek yeniden verir.
  const hataIsle = async (hata: unknown, ekranIletisi: string) => {
    if (hata instanceof ApiHatasi && eskiSurumMu(hata.govde)) {
      bildir('bilgi', 'Alarm bu arada değişti; güncel hali gösteriliyor.');
      degisti(await api.get<Alarm>(`/guvenlik-alarmlari/${alarm.id}`));
    } else bildir('hata', hataIletisi(hata, ekranIletisi));
    await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
  };
  const bitti = async (yeni: Alarm, ileti: string) => {
    bildir('tamam', ileti);
    degisti(yeni);
    notYaz('');
    await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
  };
  const onayla = useMutation({
    mutationFn: () => api.post<Alarm>(`/guvenlik-alarmlari/${alarm.id}/onayla`, { surum: alarm.surum } satisfies AlarmOnaylaGovdesi),
    onSuccess: (a) => bitti(a, 'Alarm onaylandı.'),
    onError: (h) => hataIsle(h, 'Alarm onaylanamadı.'),
  });
  const kapatIslemi = useMutation({
    mutationFn: (metin: string) => api.post<Alarm>(`/guvenlik-alarmlari/${alarm.id}/kapat`, { surum: alarm.surum, not: metin } satisfies AlarmKapatGovdesi),
    onSuccess: (a) => bitti(a, 'Alarm kapatıldı.'),
    onError: (h) => hataIsle(h, 'Alarm kapatılamadı.'),
  });
  const kapatmayiDene = () => {
    if (not.trim() === '') { notHatasiYaz('Kapatmak için ne bulunduğunu ve ne yapıldığını yazın.'); return; }
    notHatasiYaz(undefined);
    kapatIslemi.mutate(not.trim());
  };
  const mesgul = onayla.isPending || kapatIslemi.isPending;
  const acikMi = alarm.durum !== 'kapandi';

  return (
    <Pencere
      acik
      tur="yan"
      kapat={kapat}
      baslik={SINYAL_ADI[alarm.sinyal]}
      alt={yonetir && acikMi ? (
        <>
          {alarm.durum === 'acik' && (
            <Dugme simge="check" onClick={() => onayla.mutate()} yukleniyor={onayla.isPending} disabled={mesgul}>Onayla</Dugme>
          )}
          <Dugme tur="birincil" simge="lock" onClick={kapatmayiDene} yukleniyor={kapatIslemi.isPending} disabled={mesgul}>Alarmı kapat</Dugme>
        </>
      ) : undefined}
    >
      <div className="tc-guvenlik-ayrinti">
        <div className="tc-guvenlik-cipler">
          <Rozet ton={ONEM_TONU[alarm.onem]}>{ONEM_ADI[alarm.onem]}</Rozet>
          <Rozet ton={DURUM_TONU[alarm.durum]}>{DURUM_ADI[alarm.durum]}</Rozet>
        </div>
        <dl className="tc-guvenlik-alanlar">
          <dt>Kaynak</dt><dd>{kaynakMetni(alarm)}</dd>
          <dt>Gözlenen</dt><dd className="mono">{alarm.gozlenenSayi}</dd>
          <dt>Tekrar</dt><dd className="mono">{alarm.tekrarSayisi}</dd>
          <dt>İlk görülme</dt><dd>{zamanMetni(alarm.ilkGoruldu)}</dd>
          <dt>Son görülme</dt><dd>{zamanMetni(alarm.sonGoruldu)}</dd>
          <dt>Onaylayan</dt><dd>{alarm.onaylandi === null ? BOS : `${alarm.onaylayanAdi ?? BOS} · ${zamanMetni(alarm.onaylandi)}`}</dd>
          <dt>Kapatan</dt><dd>{alarm.kapandi === null ? BOS : `${alarm.kapatanAdi ?? BOS} · ${zamanMetni(alarm.kapandi)}`}</dd>
          {alarm.kapanisNotu !== null && (<><dt>Kapanış notu</dt><dd>{alarm.kapanisNotu}</dd></>)}
        </dl>
        <section>
          <h3>Kural</h3>
          <p className="tc-guvenlik-not">{kural?.kosul ?? BOS}</p>
        </section>
        <section>
          <h3>Ne yapılır</h3>
          <ol className="tc-guvenlik-adimlar">
            {NE_YAPILIR[alarm.sinyal].map((m) => <li key={m}>{m}</li>)}
          </ol>
        </section>
        {yonetir && acikMi && (
          <CokSatir etiket="Kapanış notu" value={not} maxLength={KAPANIS_NOTU_EN_COK} hata={notHatasi}
            ipucu="Kapatırken zorunludur; kapanan alarm bir daha değiştirilemez."
            onChange={(o) => { notYaz(o.target.value); notHatasiYaz(undefined); }} />
        )}
        {!yonetir && <p className="tc-guvenlik-not">Alarmı onaylama ve kapatma yetkiniz yok.</p>}
      </div>
    </Pencere>
  );
}
