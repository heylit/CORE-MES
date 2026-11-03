import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IstasyonSecimiCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type {
  BirimlerCevabi, EmirOzetiCevabi, MarkalaGovdesi, MarkalamaBirimi, MarkalamaTanimi, OnizlemeCevabi, TanimEmirleriCevabi, TanimlarCevabi,
} from '#paylasilan/sozlesme/markalama.ts';
import {
  Dugme, DurumKutusu, Kart, KodOkuyucu, OnayPenceresi, Qr, Rozet, Secim, Tablo, useBildirim, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useKorumaliKomut } from '../../ortak/veri/korumali-komut.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { BIRIM_DURUMLARI, DURUM_ADLARI, DURUM_TONLARI, YONTEM_ADLARI } from './adlar.ts';
import { anahtarlar } from './anahtarlar.ts';
import { ModelPaneli } from './ModelPaneli.tsx';
import { yaziOlculeri } from './taslak.ts';
import './markalama.css';

const SON_SERI_SAYISI = 8;

const SUTUNLAR: readonly Sutun<MarkalamaBirimi>[] = [
  { anahtar: 'seri', baslik: 'Seri no', mono: true, hucre: (b) => b.seriNo },
  { anahtar: 'durum', baslik: 'Durum', hucre: (b) => <Rozet ton={DURUM_TONLARI[b.durum]}>{DURUM_ADLARI[b.durum]}</Rozet> },
  { anahtar: 'dogrulama', baslik: 'Doğrulama', hucre: (b) => (b.dogrulamaZamani === null ? null : <Rozet ton="tamam">Okundu</Rozet>) },
  { anahtar: 'zaman', baslik: 'Zaman', hucre: (b) => zamanMetni(b.zaman) },
];

// Seçilen istasyon birimin kaydına girer (hangi tezgâhta markalandı). Seri yalnız markalama istasyonunda verilir (2036): istasyon seçilmeden gönderilmez.
function Calisma({ tanim, emirId, istasyonId, yazabilir }: {
  tanim: MarkalamaTanimi; emirId: number; istasyonId: number | null; yazabilir: boolean;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [son, sonYaz] = useState<MarkalamaBirimi | null>(null);
  // Hatalı markalama numarayı geri dönüşsüz yakar; tek dokunuşla gitmesin diye onay sorulur.
  const [hataliOnayi, hataliOnayiYaz] = useState(false);
  const onizleme = useQuery({
    queryKey: anahtarlar.onizleme(tanim.id, emirId),
    queryFn: () => api.get<OnizlemeCevabi>(`/markalama/tanimlar/${tanim.id}/onizleme?emirId=${emirId}`),
  });
  // Sayılar ve son seriler yalnız bu tanımın markalarıdır: aynı emirde başka operasyonun markası karışmasın.
  const ozet = useQuery({
    queryKey: anahtarlar.emirOzeti(emirId, tanim.id),
    queryFn: () => api.get<EmirOzetiCevabi>(`/markalama/emirler/${emirId}/ozet?tanimId=${tanim.id}`),
  });
  const birimler = useQuery({
    queryKey: anahtarlar.birimler(`emir:${emirId}:tanim:${tanim.id}`),
    queryFn: () => api.get<BirimlerCevabi>(`/markalama/birimler?emirId=${emirId}&tanimId=${tanim.id}`),
  });
  const yenile = () => istemci.invalidateQueries({ queryKey: anahtarlar.kok });

  // Seri sunucuda sayaçtan doğar; ağ koparsa aynı istek kimliğiyle yeniden gönderilir, çift dokunuş tek istek gönderir:
  // ikinci numara yanmaz.
  const markala = useKorumaliKomut<MarkalaGovdesi['sonuc'], MarkalamaBirimi>({
    gonder: (sonuc, deneme) => {
      const govde: MarkalaGovdesi = { tanimId: tanim.id, uretimEmriId: emirId, istasyonId, sonuc };
      return api.post<MarkalamaBirimi>('/markalama/birimler/markala', govde, deneme);
    },
    onSettled: () => hataliOnayiYaz(false),
    onSuccess: async (b) => {
      sonYaz(b);
      bildir(b.durum === 'hurda' ? 'bilgi' : 'tamam', b.durum === 'hurda' ? `${b.seriNo} hatalı, hurdaya ayrıldı` : `${b.seriNo} markalandı`);
      await yenile();
    },
  });
  const dogrula = useMutation({
    mutationFn: (seriNo: string) => api.post<MarkalamaBirimi>('/markalama/birimler/dogrula', { tanimId: tanim.id, seriNo }),
    onSuccess: async (b) => {
      sonYaz(b);
      bildir('tamam', `${b.seriNo} doğrulandı`);
      await yenile();
    },
  });

  const siradaki = onizleme.data?.numaralar[0] ?? null;
  const istasyonBekliyor = istasyonId === null;
  const kodVar = tanim.alanlar.some((a) => a.kodTuru !== 'yok');
  const beklenen = tanim.dogrulama && son !== null && son.durum !== 'hurda' && son.dogrulamaZamani === null ? son : null;
  const sahneMarkalari = tanim.alanlar.flatMap((a, i) => (a.yer === null ? [] : [{
    sira: i, yer: a.yer, metin: a.icerik === 'sabit' ? a.sabitMetin ?? '' : siradaki ?? tanim.seriSablonu,
  }]));

  return (
    <div className="tc-mrk-istasyon">
      <Kart baslik="Sıradaki seri" simge="tag">
        <div className="tc-mrk-siradaki">
          {kodVar && siradaki !== null && <Qr metin={siradaki} boyut={120} />}
          <div className="tc-mrk-siradaki-yazi">
            <span className="tc-mrk-buyuk mono" aria-live="polite">{onizleme.isPending ? '…' : siradaki ?? '—'}</span>
            <span className="tc-mrk-ipucu">Numara, Markalandı'ya basınca sunucuda verilir; ekranda görünen öngörüdür.</span>
          </div>
        </div>
        <ol className="tc-mrk-markalar">
          {tanim.alanlar.map((a, i) => (
            <li key={i} className="tc-mrk-marka">
              <span className="tc-mrk-sira">{i + 1}</span>
              <span>{a.ad}</span>
              <span className="tc-mrk-ipucu">{[YONTEM_ADLARI[a.yontem], ...yaziOlculeri(a), a.program, a.yuzey].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ol>
        {yazabilir ? (
          <div className="tc-mrk-eylemler">
            <Dugme tur="birincil" boyut="ana" simge="check" yukleniyor={markala.isPending && markala.variables === 'iyi'} disabled={markala.isPending || istasyonBekliyor} onClick={() => markala.mutate('iyi')}>
              Markalandı
            </Dugme>
            <Dugme tur="tehlike" boyut="ana" simge="alert" yukleniyor={markala.isPending && markala.variables === 'hatali'} disabled={markala.isPending || istasyonBekliyor} onClick={() => hataliOnayiYaz(true)}>
              Hatalı markalama
            </Dugme>
          </div>
        ) : <p className="tc-mrk-ipucu">Seri vermek için markalama yetkisi gerekir.</p>}
        {yazabilir && istasyonBekliyor && <p className="tc-mrk-ipucu">Seri vermek için markalama istasyonunu seçin.</p>}
        <OnayPenceresi
          acik={hataliOnayi} baslik="Hatalı markalama" onayMetni="Numarayı yak" tehlikeli
          yukleniyor={markala.isPending && markala.variables === 'hatali'}
          onayla={() => markala.mutate('hatali')} vazgec={() => hataliOnayiYaz(false)}
        >
          <p>Sıradaki numara yanar ve birim hurdaya ayrılır. Bu numara yeniden verilmez.</p>
        </OnayPenceresi>
        {markala.isError && <p className="tc-mrk-hata" role="alert">{hataIletisi(markala.error, 'Seri verilemedi')}</p>}
        {yazabilir && tanim.dogrulama && (
          <div className="tc-mrk-dogrula">
            <h3 className="tc-mrk-bolum">{beklenen ? <>Doğrula: <span className="mono">{beklenen.seriNo}</span></> : 'Markayı okutup doğrula'}</h3>
            <KodOkuyucu sik okundu={(kod) => dogrula.mutate(kod)} bekliyor={dogrula.isPending} ipucu="Markalanan parçadaki kodu okutun" dokunmatikteOdakYok />
            {dogrula.isError && <p className="tc-mrk-hata" role="alert">{hataIletisi(dogrula.error, 'Doğrulanamadı')}</p>}
          </div>
        )}
      </Kart>
      <Kart baslik="Bu emirde, bu operasyonda" simge="chart">
        {ozet.data ? (
          <div className="tc-mrk-sayilar">
            {BIRIM_DURUMLARI.map((d) => (
              <div key={d} className="tc-mrk-sayi"><Rozet ton={DURUM_TONLARI[d]}>{DURUM_ADLARI[d]}</Rozet><b>{ozet.data.sayilar[d]}</b></div>
            ))}
            <div className="tc-mrk-sayi"><Rozet ton="bilgi">Doğrulanan</Rozet><b>{ozet.data.dogrulanan}</b></div>
          </div>
        ) : <DurumKutusu durum={ozet.isError ? 'hata' : 'yukleniyor'} />}
        <Tablo
          etiket="Son seriler"
          sutunlar={SUTUNLAR}
          satirlar={(birimler.data?.birimler ?? []).slice(0, SON_SERI_SAYISI)}
          satirAnahtari={(b) => b.id}
          bosMesaj="Bu emirde henüz markalı parça yok"
        />
      </Kart>
      <Kart baslik="Markalama yeri" simge="cube">
        <ModelPaneli malzemeId={tanim.malzemeId} model={tanim.model} markalar={sahneMarkalari} secili={null} />
      </Kart>
    </div>
  );
}

function EmirSecimi({ tanim, emirId, sec }: { tanim: MarkalamaTanimi; emirId: number | null; sec: (id: number | null) => void }) {
  const emirler = useQuery({
    queryKey: anahtarlar.emirler(tanim.id),
    queryFn: () => api.get<TanimEmirleriCevabi>(`/markalama/tanimlar/${tanim.id}/emirler`),
  });
  return (
    <>
      <Secim
        etiket="Üretim emri"
        secenekler={(emirler.data?.emirler ?? []).map((e) => ({ deger: String(e.id), baslik: `${e.emirNo} · ${e.adet} adet` }))}
        bosSecenek={emirler.isPending ? 'Emirler okunuyor' : (emirler.data?.emirler.length ?? 0) === 0 ? 'Açık emir yok' : 'Emir seçin'}
        value={emirId === null ? '' : String(emirId)}
        onChange={(o) => sec(o.target.value === '' ? null : Number(o.target.value))}
      />
      {emirler.isError && <p className="tc-mrk-hata" role="alert">{hataIletisi(emirler.error, 'Emirler okunamadı')}</p>}
    </>
  );
}

export function Istasyon() {
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('markalama.seri-ver') === true;
  const [secim, secimYaz] = useState<{ tanimId: number | null; emirId: number | null }>({ tanimId: null, emirId: null });
  const [istasyonId, istasyonIdYaz] = useState<number | null>(null);
  const liste = useQuery({ queryKey: anahtarlar.tanimlar, queryFn: () => api.get<TanimlarCevabi>('/markalama/tanimlar') });
  const istasyonlar = useQuery({ queryKey: anahtarlar.istasyonlar, queryFn: () => api.get<IstasyonSecimiCevabi>('/istasyonlar/secim') });
  const istasyonSecenekleri = (istasyonlar.data?.gruplar ?? []).flatMap((g) => g.istasyonlar.filter((i) => i.aktif && i.tip === 'markalama').map((i) => ({
    deger: String(i.id), baslik: `${g.isMerkeziAd} · ${i.ad}`,
  })));
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  const etkinler = liste.data.tanimlar.filter((t) => t.aktif);
  const tanim = etkinler.find((t) => t.id === secim.tanimId);
  return (
    <div className="tc-mrk-sayfa">
      <Kart baslik="Markalama istasyonu" simge="tag">
        <div className="tc-mrk-satir">
          <Secim
            etiket="Parça ve operasyon"
            secenekler={etkinler.map((t) => ({ deger: String(t.id), baslik: `${t.malzemeKodu ?? `#${t.malzemeId}`} · Op ${t.opNo}` }))}
            bosSecenek={etkinler.length === 0 ? 'Markalama tanımı yok' : 'Seçin'}
            value={secim.tanimId === null ? '' : String(secim.tanimId)}
            onChange={(o) => secimYaz({ tanimId: o.target.value === '' ? null : Number(o.target.value), emirId: null })}
          />
          {tanim && <EmirSecimi key={tanim.id} tanim={tanim} emirId={secim.emirId} sec={(emirId) => secimYaz((o) => ({ ...o, emirId }))} />}
          <Secim
            etiket="İstasyon"
            secenekler={istasyonSecenekleri}
            bosSecenek={istasyonlar.isPending ? 'İstasyonlar okunuyor' : istasyonSecenekleri.length === 0 ? 'Markalama istasyonu yok' : 'Seçin'}
            value={istasyonId === null ? '' : String(istasyonId)}
            onChange={(o) => istasyonIdYaz(o.target.value === '' ? null : Number(o.target.value))}
          />
        </div>
        {istasyonlar.isError && <p className="tc-mrk-hata" role="alert">{hataIletisi(istasyonlar.error, 'İstasyonlar okunamadı')}</p>}
      </Kart>
      {tanim && secim.emirId !== null && (
        <Calisma
          key={`${tanim.id}:${secim.emirId}`} tanim={tanim} emirId={secim.emirId} istasyonId={istasyonId}
          yazabilir={yazabilir}
        />
      )}
    </div>
  );
}
