import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { DurumCevabi, GelenlerCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { BAGLANTI, KAYNAK_ADI, YOK, sayiMetni, zamanMetni } from './gosterim.ts';
import './smartes.css';

type Okuma = DurumCevabi['okumalar'][number];

const OKUMA_SUTUNLARI: readonly Sutun<Okuma>[] = [
  { anahtar: 'kaynak', baslik: 'Kaynak', hucre: (o) => KAYNAK_ADI[o.kaynak] },
  { anahtar: 'sonDeneme', baslik: 'Son deneme', hucre: (o) => zamanMetni(o.sonDeneme), kirilmaz: true },
  {
    anahtar: 'sonSonuc', baslik: 'Sonuç',
    hucre: (o) => (o.sonSonuc === 'tamam' ? <Rozet ton="tamam">Tamam</Rozet> : <Rozet ton="hata">Hata</Rozet>),
  },
  // Pencere sonu: bir sonraki okuma buradan biraz geriden başlar.
  { anahtar: 'sonBitis', baslik: 'Okunan son an', hucre: (o) => zamanMetni(o.sonBitis), kirilmaz: true },
  { anahtar: 'okunan', baslik: 'Okunan', hucre: (o) => sayiMetni(o.okunan), hizala: 'sag', mono: true },
  { anahtar: 'kimliksiz', baslik: 'Kimliksiz', hucre: (o) => sayiMetni(o.kimliksiz), hizala: 'sag', mono: true },
  { anahtar: 'sonHata', baslik: 'Hata', hucre: (o) => o.sonHata ?? YOK },
];

type Kalem = GelenlerCevabi['kalemler'][number];
const KALEM_DURUMU: Record<Kalem['durum'], { metin: string; ton: RozetTonu }> = {
  okunuyor: { metin: 'Okunuyor', ton: 'tamam' },
  kapali: { metin: 'Okuması kapalı', ton: 'uyari' },
  okunmuyor: { metin: 'Okunmuyor', ton: 'pasif' },
};
const KALEM_SUTUNLARI: readonly Sutun<Kalem>[] = [
  { anahtar: 'baslik', baslik: 'Bilgi', hucre: (k) => (k.yol === null ? k.baslik : <Link className="tc-sg-baglanti" to={k.yol}>{k.baslik}</Link>) },
  { anahtar: 'durum', baslik: 'Durum', hucre: (k) => <Rozet ton={KALEM_DURUMU[k.durum].ton}>{KALEM_DURUMU[k.durum].metin}</Rozet> },
  { anahtar: 'sayi', baslik: 'Kayıt', hucre: (k) => sayiMetni(k.sayi), hizala: 'sag', mono: true },
  { anahtar: 'sonOkuma', baslik: 'Son okuma', hucre: (k) => zamanMetni(k.sonOkuma), kirilmaz: true },
  { anahtar: 'kullanim', baslik: 'CORE’da nerede kullanılıyor', hucre: (k) => k.kullanim },
];

function Gelenler() {
  const g = useQuery({ queryKey: anahtarlar.gelenler, queryFn: () => api.get<GelenlerCevabi>('/smartes/gelenler') });
  return (
    <Kart baslik="SmartES’ten gelen bilgiler">
      <div className="tc-smartes">
        <p className="tc-smartes-aciklama">SmartES’in sunduğu her bilgi burada tek satırdır: okunuyor mu, kaç kayıt geldi, CORE’da nereye gidiyor. Bilginin adına basınca listesi açılır.</p>
        {g.isPending && <DurumKutusu durum="yukleniyor" />}
        {g.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(g.error, 'Liste alınamadı')} yenile={() => { void g.refetch(); }} />}
        {g.data && <Tablo etiket="SmartES’ten gelen bilgiler" sutunlar={KALEM_SUTUNLARI} satirlar={g.data.kalemler} satirAnahtari={(k) => k.anahtar} />}
      </div>
    </Kart>
  );
}

export function BaglantiDurumu() {
  const ayarYazan = useOturum().data?.islemler.includes('ayarlar.yaz') === true;
  const durum = useQuery({ queryKey: anahtarlar.durum, queryFn: () => api.get<DurumCevabi>('/smartes/durum') });
  const d = durum.data;
  const baglanti = d ? BAGLANTI[d.baglanti] : null;

  return (
    <div className="tc-sg-sayfa">
    <Kart
      baslik="SmartES bağlantısı"
      sag={<Dugme simge="rotate" aria-label="Yenile" yukleniyor={durum.isFetching} onClick={() => { void durum.refetch(); }} />}
    >
      <div className="tc-smartes">
        {durum.isPending && <DurumKutusu durum="yukleniyor" />}
        {durum.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(durum.error, 'Durum alınamadı')} yenile={() => { void durum.refetch(); }} />}
        {d && baglanti && (
          <>
            <p role="status" className="tc-smartes-ozet"><Rozet ton={baglanti.ton}>{baglanti.metin}</Rozet></p>
            <p className="tc-smartes-aciklama">{ayarYazan ? baglanti.aciklama.ayarYazan : baglanti.aciklama.diger}</p>
            <dl className="tc-smartes-liste">
              <dt>Okunan üretim kaydı</dt><dd>{sayiMetni(d.sayilar.isEmriDurumu)}</dd>
              <dt>Okunan duruş</dt><dd>{sayiMetni(d.sayilar.durus)}</dd>
              <dt>Okunan alarm</dt><dd>{sayiMetni(d.sayilar.alarm)}</dd>
              <dt>Gönderilen iş emri</dt><dd>{sayiMetni(d.sayilar.gidenGonderilen)}</dd>
              <dt>Gönderilemeyen iş emri</dt>
              <dd>{d.sayilar.gidenHatali > 0 ? <Rozet ton="hata">{sayiMetni(d.sayilar.gidenHatali)}</Rozet> : sayiMetni(d.sayilar.gidenHatali)}</dd>
            </dl>
            <h3 className="tc-smartes-baslik">Okumalar</h3>
            {d.okumalar.length === 0
              ? <p className="tc-smartes-aciklama">Henüz okuma yapılmadı.</p>
              : <Tablo etiket="Okumalar" sutunlar={OKUMA_SUTUNLARI} satirlar={d.okumalar} satirAnahtari={(o) => o.kaynak} />}
          </>
        )}
      </div>
    </Kart>
    <Gelenler />
    </div>
  );
}
