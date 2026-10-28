import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LISTE_KAPSAMLARI, type ListeKapsami } from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';
import type { EmirListeCevabi, EmirListeSatiri, TalepListeCevabi, TalepListeSatiri } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { DurumKutusu, Kart, Rozet, SayfaBasligi, Secim, Sekmeler, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { tarihMetni, zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import {
  AciliyetMetni, EmirDurumRozeti, KOK, TalepDurumRozeti, emirYolu, gecerlilikMetni, malzemeMetni, sinifMetni, talepYolu,
} from './gosterim.tsx';
import { YeniTalep } from './talep/YeniTalep.tsx';
import './degisiklik-yonetimi.css';

type Bolum = 'talep' | 'emir';
const KAPSAM_ADLARI: Readonly<Record<ListeKapsami, string>> = { acik: 'Açık olanlar', kapali: 'Kapananlar', tumu: 'Tümü' };
const KAPSAM_SECENEKLERI = LISTE_KAPSAMLARI.map((k) => ({ deger: k, baslik: KAPSAM_ADLARI[k] }));

const TALEP_SUTUNLARI: readonly Sutun<TalepListeSatiri>[] = [
  { anahtar: 'no', baslik: 'Kayıt', hucre: (t) => t.no, mono: true, kirilmaz: true },
  { anahtar: 'baslik', baslik: 'Başlık', hucre: (t) => t.baslik },
  { anahtar: 'sinif', baslik: 'Tip', hucre: (t) => sinifMetni(t.sinif) },
  { anahtar: 'aciliyet', baslik: 'Aciliyet', hucre: (t) => <AciliyetMetni aciliyet={t.aciliyet} />, csv: (t) => t.aciliyet },
  { anahtar: 'parcalar', baslik: 'Parçalar', hucre: (t) => t.malzemeler.map(malzemeMetni).join(', ') || '—', mono: true },
  { anahtar: 'acan', baslik: 'Açan', hucre: (t) => t.acanAdi ?? '—' },
  { anahtar: 'tarih', baslik: 'Tarih', hucre: (t) => zamanMetni(t.acilis), mono: true, kirilmaz: true },
  { anahtar: 'durum', baslik: 'Durum', hucre: (t) => <TalepDurumRozeti durum={t.durum} />, csv: (t) => t.durum },
];

const EMIR_SUTUNLARI: readonly Sutun<EmirListeSatiri>[] = [
  { anahtar: 'no', baslik: 'Kayıt', hucre: (e) => e.no, mono: true, kirilmaz: true },
  { anahtar: 'baslik', baslik: 'Başlık', hucre: (e) => e.baslik },
  { anahtar: 'sinif', baslik: 'Tip', hucre: (e) => sinifMetni(e.sinif) },
  {
    anahtar: 'gecerlilik', baslik: 'Geçerlilik',
    hucre: (e) => (e.gecerlilik === null ? <span className="tc-dy-soluk">Yayında belirlenecek</span> : gecerlilikMetni(e.gecerlilik)),
    csv: (e) => (e.gecerlilik === null ? '' : gecerlilikMetni(e.gecerlilik)),
  },
  {
    anahtar: 'karar', baslik: 'Bekleyen karar', hizala: 'sag',
    hucre: (e) => (e.bekleyenKarar > 0 ? <Rozet ton="hata">{e.bekleyenKarar} karar</Rozet> : <span className="tc-dy-soluk">—</span>),
    csv: (e) => e.bekleyenKarar,
  },
  { anahtar: 'acilis', baslik: 'Açılış', hucre: (e) => tarihMetni(e.acilis), mono: true, kirilmaz: true },
  { anahtar: 'durum', baslik: 'Durum', hucre: (e) => <EmirDurumRozeti durum={e.durum} />, csv: (e) => e.durum },
];

function Talepler() {
  const gezin = useNavigate();
  const liste = useListeDurumu({
    suzgecler: { kapsam: 'acik' as ListeKapsami, ara: '' }, suzgecDegerleri: { kapsam: LISTE_KAPSAMLARI }, adres: { onek: 'talep' },
  });
  const s = useQuery({
    queryKey: anahtarlar.talepler(liste.sorgu),
    queryFn: () => api.get<TalepListeCevabi>(`${KOK}/talepler${sorguMetni(liste.sorgu)}`),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (s.data) liste.sayfaEsitle(s.data.sayfa, liste.sorgu.sayfa); }, [s.data]);
  if (s.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(s.error, 'Talepler alınamadı')} yenile={() => { void s.refetch(); }} />;
  return (
    <Tablo
      etiket="Talepler (ECR)" sutunlar={TALEP_SUTUNLARI} satirlar={s.data?.satirlar ?? []} satirAnahtari={(t) => t.id}
      satirSec={(t) => { void gezin(talepYolu(t.id)); }} mesgul={s.isPending || s.isPlaceholderData}
      bosMesaj={s.isPending ? 'Yükleniyor' : 'Bu süzgeçte talep yok.'}
      arac={{
        arama: { deger: liste.suzgecler.ara, degistir: (ara) => { liste.suzgecDegistir({ ara }); }, yerTutucu: 'Kayıt no ya da başlık' },
        sag: <Secim etiket="Durum" value={liste.suzgecler.kapsam} secenekler={KAPSAM_SECENEKLERI} onChange={(e) => { liste.suzgecDegistir({ kapsam: e.target.value as ListeKapsami }); }} />,
        csv: { ad: 'degisiklik-talepleri' },
      }}
      {...(s.data ? { sayfalama: { sayfa: s.data.sayfa, sayfaBoyu: s.data.sayfaBoyu, toplam: s.data.toplam, degistir: liste.sayfaDegistir } } : {})}
    />
  );
}

function Emirler() {
  const gezin = useNavigate();
  const liste = useListeDurumu({
    suzgecler: { kapsam: 'acik' as ListeKapsami, ara: '' }, suzgecDegerleri: { kapsam: LISTE_KAPSAMLARI }, adres: { onek: 'emir' },
  });
  const s = useQuery({
    queryKey: anahtarlar.emirler(liste.sorgu),
    queryFn: () => api.get<EmirListeCevabi>(`${KOK}/emirler${sorguMetni(liste.sorgu)}`),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (s.data) liste.sayfaEsitle(s.data.sayfa, liste.sorgu.sayfa); }, [s.data]);
  if (s.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(s.error, 'Değişiklik emirleri alınamadı')} yenile={() => { void s.refetch(); }} />;
  return (
    <Tablo
      etiket="Değişiklik emirleri (ECO)" sutunlar={EMIR_SUTUNLARI} satirlar={s.data?.satirlar ?? []} satirAnahtari={(e) => e.id}
      satirSec={(e) => { void gezin(emirYolu(e.id)); }} mesgul={s.isPending || s.isPlaceholderData}
      bosMesaj={s.isPending ? 'Yükleniyor' : 'Bu süzgeçte değişiklik emri yok.'}
      arac={{
        arama: { deger: liste.suzgecler.ara, degistir: (ara) => { liste.suzgecDegistir({ ara }); }, yerTutucu: 'Kayıt no ya da başlık' },
        sag: <Secim etiket="Durum" value={liste.suzgecler.kapsam} secenekler={KAPSAM_SECENEKLERI} onChange={(e) => { liste.suzgecDegistir({ kapsam: e.target.value as ListeKapsami }); }} />,
        csv: { ad: 'degisiklik-emirleri' },
      }}
      {...(s.data ? { sayfalama: { sayfa: s.data.sayfa, sayfaBoyu: s.data.sayfaBoyu, toplam: s.data.toplam, degistir: liste.sayfaDegistir } } : {})}
    />
  );
}

export function Degisiklikler() {
  const oturum = useOturum();
  const [adres, adresYaz] = useSearchParams();
  const [yeni, yeniYaz] = useState(false);
  // Prototipte ECO bölümü açık gelir.
  const bolum: Bolum = adres.get('bolum') === 'talep' ? 'talep' : 'emir';
  const talepAcabilir = oturum.data?.islemler.includes('degisiklik-yonetimi.talep-ac') === true;
  return (
    <section className="tc-dy">
      <SayfaBasligi
        baslik="Değişiklikler" simge="list"
        alt="Talepler (ECR) CCB kararına kadar, değişiklik emirleri (ECO) uygulama ve kapanışa kadar izlenir."
        birincil={talepAcabilir ? { etiket: 'Yeni değişiklik talebi', simge: 'plus', yap: () => { yeniYaz(true); } } : undefined}
      />
      <Kart>
        <Sekmeler
          etiket="Değişiklik türü" secili={bolum}
          sec={(b) => { adresYaz((a) => { const y = new URLSearchParams(a); y.set('bolum', b); return y; }, { replace: true }); }}
          sekmeler={[{ anahtar: 'talep', baslik: 'Talepler (ECR)' }, { anahtar: 'emir', baslik: 'Değişiklik emirleri (ECO)' }]}
        />
        {bolum === 'talep' ? <Talepler /> : <Emirler />}
      </Kart>
      {yeni && <YeniTalep kapat={() => { yeniYaz(false); }} />}
    </section>
  );
}
