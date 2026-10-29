import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { EmirAkisiCevabi } from '#paylasilan/sozlesme/akis.ts';
import type { EmirAyrintiCevabi, UretimKaydi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { AdimListesi, Dugme, DurumKutusu, Kart, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { KucukResimKutusu, useKucukResimler } from '../cizimler/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { RefakatKartlari } from './RefakatKartlari.tsx';
import { StokTamamlama } from './StokTamamlama.tsx';
import { UretimYerleri } from './UretimYerleri.tsx';
import { Iplik } from './Iplik.tsx';
import { iplikDuraklari } from './iplik.ts';
import { OLAY_ETIKETI, durumGosterimi, farkMetni, kayitAdedi, kayitKisisi, kayitNedeni, saglamSayisi, zamanMetni } from './gorunum.ts';
import './uretim-emirleri.css';

const KAYIT_SUTUNLARI: Sutun<UretimKaydi>[] = [
  { anahtar: 'olay', baslik: 'Olay', hucre: (k) => OLAY_ETIKETI[k.olay] },
  { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', hucre: kayitAdedi },
  { anahtar: 'neden', baslik: 'Neden', hucre: kayitNedeni },
  { anahtar: 'kisi', baslik: 'Kişi', hucre: kayitKisisi },
  { anahtar: 'zaman', baslik: 'Zaman', kirilmaz: true, hucre: (k) => zamanMetni(k.zaman) },
];

function Satir({ ad, deger }: { ad: string; deger: ReactNode }) {
  return (
    <>
      <dt>{ad}</dt>
      <dd>{deger === null || deger === undefined || deger === '' ? 'yok' : deger}</dd>
    </>
  );
}

export function EmirAyrintisi() {
  const { id } = useParams();
  const emirId = Number(id);
  const yonlendir = useNavigate();
  const oturum = useOturum();
  const islemler = oturum.data?.islemler ?? [];
  const receteRotaGorur = islemler.includes('sayfa.recete-rota');
  const ayrinti = useQuery({
    queryKey: anahtarlar.ayrinti(emirId),
    queryFn: () => api.get<EmirAyrintiCevabi>(`/uretim-emirleri/${emirId}`),
  });
  const emir = ayrinti.data?.emir;
  const canli = emir?.canli ?? null;
  const durum = emir ? durumGosterimi(emir) : { etiket: '', ton: 'bilgi' as const };
  const adimlar = ayrinti.data?.adimlar ?? [];
  const malzemeNo = emir?.malzemeNo ?? null;
  const resim = useKucukResimler('malzemeler', malzemeNo === null ? [] : [malzemeNo]);
  const fark = emir && emir.durum === 'bitti' ? farkMetni(emir.adet, emir.saglamAdet) : null;
  const [iplikAcik, setIplikAcik] = useState(false);
  const [oynatma, setOynatma] = useState(0);
  // Parti, rota adımı saatleri ve sevk Akış Süresi okumasındadır; o yetki yoksa bu duraklar "kayıt yok" kalır.
  const akisGorur = islemler.includes('sayfa.akis');
  const akis = useQuery({
    queryKey: anahtarlar.akis(emirId),
    queryFn: () => api.get<EmirAkisiCevabi>(`/akis/emirler/${String(emirId)}`),
    enabled: iplikAcik && akisGorur,
  });
  const akisBekleniyor = akisGorur && akis.isPending;
  const izle = () => {
    if (!iplikAcik) setIplikAcik(true);
    setOynatma((n) => n + 1);
  };

  return (
    <Kart
      baslik="Üretim emri"
      sag={(
        <div className="tc-emir-ust">
          <Dugme simge="list" onClick={() => { void yonlendir('/uretim-emirleri'); }}>Listeye dön</Dugme>
          {emir && <Dugme simge="scan" aria-pressed={iplikAcik} onClick={izle}>Parçayı izle</Dugme>}
          {receteRotaGorur && (
            <Dugme simge="tool" onClick={() => { void yonlendir('/recete-rota'); }}>Reçete ve Rota'da aç</Dugme>
          )}
          {emir && akisGorur && (
            <Dugme simge="gantt" onClick={() => { void yonlendir(`/akis/${String(emirId)}`); }}>Akış Süresi'nde aç</Dugme>
          )}
        </div>
      )}
    >
      {ayrinti.isPending && <DurumKutusu durum="yukleniyor" />}
      {ayrinti.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(ayrinti.error, 'Emir alınamadı.')} yenile={() => { void ayrinti.refetch(); }} />}
      {emir && ayrinti.data && (
        <>
          <dl className="tc-emir-liste">
            <Satir ad="Emir no" deger={<span className="tc-emir-kod">{emir.emirNo}</span>} />
            <Satir ad="Durum" deger={<Rozet ton={durum.ton}>{durum.etiket}</Rozet>} />
            {canli && canli.durusNedeni !== null && <Satir ad="Duruş nedeni" deger={canli.durusNedeni.ad} />}
            {canli && canli.durusBaslangic !== null && <Satir ad="Duruş başlangıcı" deger={zamanMetni(canli.durusBaslangic)} />}
            <Satir ad="Parça no" deger={emir.parcaNo} />
            <Satir ad="Parça adı" deger={emir.parcaAd} />
            {malzemeNo !== null && <Satir ad="Malzeme resmi" deger={<KucukResimKutusu resim={resim.get(malzemeNo)} ad={emir.parcaAd} boy="orta" />} />}
            <Satir ad="İstasyon" deger={emir.istasyon?.ad ?? null} />
            <Satir ad="Emir adedi" deger={emir.adet} />
            <Satir ad="Sağlam adet" deger={saglamSayisi(emir)} />
            {canli && <Satir ad="Hurda" deger={canli.hurda} />}
            {ayrinti.data.kolHurdasi != null && <Satir ad="Kollardaki hurda" deger={ayrinti.data.kolHurdasi} />}
            {fark !== null && <Satir ad="Fark" deger={fark} />}
            <Satir ad="Açan" deger={emir.acan.ad} />
            <Satir ad="Açılma" deger={zamanMetni(emir.acilma)} />
            <Satir ad="Başlama" deger={zamanMetni(emir.baslama)} />
            <Satir ad="Bitiş" deger={zamanMetni(emir.bitis)} />
            {emir.durum === 'iptal' && <Satir ad="İptal" deger={zamanMetni(emir.iptal)} />}
          </dl>
          {iplikAcik && (
            <section className="tc-emir-bolum-iplik" aria-label="İzlenebilirlik ipliği">
              <div className="tc-emir-iplik-bas">
                <h3 className="tc-emir-bolum">İzlenebilirlik ipliği</h3>
                <Dugme simge="x" onClick={() => setIplikAcik(false)}>Kapat</Dugme>
              </div>
              {akisBekleniyor ? <DurumKutusu durum="yukleniyor" /> : (
                <>
                  {!akisGorur && <p className="tc-emir-not">Parti, rota saatleri ve sevk Akış Süresi yetkisiyle görünür.</p>}
                  {akisGorur && akis.isError && <p className="tc-emir-not">{hataIletisi(akis.error, 'Akış kaydı alınamadı.')}</p>}
                  <Iplik key={oynatma} baslik={`${emir.emirNo} izlenebilirlik ipliği`}
                    duraklar={iplikDuraklari(ayrinti.data, akis.data ?? null)} />
                </>
              )}
            </section>
          )}
          {adimlar.length > 0 && (
            <div className="tc-emir-bolum-adim">
              <AdimListesi saltOkunur adimlar={adimlar.map((a) => ({
                id: a.id, ad: a.ad, aciklama: a.aciklama, tamam: a.tamam,
                not: a.tamamlayan && a.tamamlanma ? `${a.tamamlayan.ad} · ${zamanMetni(a.tamamlanma) ?? ''}` : null,
              }))} />
            </div>
          )}
          <UretimYerleri emir={emir} />
          {emir.malzemeNo != null && <RefakatKartlari emirId={emir.id} />}
          <StokTamamlama emir={emir} />
          <h3 className="tc-emir-bolum">Kayıt defteri</h3>
          <Tablo etiket="Kayıt defteri" sutunlar={KAYIT_SUTUNLARI} satirlar={ayrinti.data.kayitlar}
            satirAnahtari={(k) => k.id} bosMesaj="Henüz kayıt yok" />
        </>
      )}
    </Kart>
  );
}
