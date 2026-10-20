import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EkipGovdesi, EkiplerCevabi, IstasyonlarCevabi, SurumluEkip } from '#paylasilan/sozlesme/istasyonlar.ts';
import { DurumKutusu, Girdi, IsaretKutusu, Secim, Tablo } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { csvIndir } from './csv.ts';
import { durumSutunu } from './durumSutunu.tsx';
import { KayitPenceresi } from './KayitPenceresi.tsx';
import { KisiPaneli } from './KisiPaneli.tsx';
import { ListeAraclari, aramayaUyar } from './ListeAraclari.tsx';
import { useKayitIslemleri } from './kayitIslemleri.ts';

const istasyonlariGetir = () => api.get<IstasyonlarCevabi>('/istasyonlar?pasifler=true');

// Ekip silinmez, pasife alınır; pasif ekip kapasite saymaz (IK7). Üyelik kişinin toplam yüzdesine girer (IK6).
export function EkipFormu({ kayit, kapat }: { kayit: SurumluEkip | null; kapat: () => void }) {
  const [kod, kodYaz] = useState(kayit?.kod ?? '');
  const [ad, adYaz] = useState(kayit?.ad ?? '');
  const [istasyonId, istasyonIdYaz] = useState(kayit?.istasyonId == null ? '' : String(kayit.istasyonId));
  const [aktif, aktifYaz] = useState(kayit?.aktif ?? true);
  const { kaydet, hata, mesgul } = useKayitIslemleri('/ekipler', kapat);
  const istasyonlar = useQuery({ queryKey: anahtarlar.istasyonlar, queryFn: istasyonlariGetir });
  const secenekler = (istasyonlar.data?.istasyonlar ?? [])
    .filter((i) => i.aktif || i.id === kayit?.istasyonId)
    .map((i) => ({ deger: String(i.id), baslik: `${i.kod} - ${i.ad}${i.aktif ? '' : ' (pasif)'}` }));
  const govde: EkipGovdesi = { kod, ad, aktif, istasyonId: istasyonId === '' ? null : Number(istasyonId) };

  return (
    <KayitPenceresi
      baslik={kayit ? 'Ekip düzenle' : 'Yeni ekip'}
      kapat={kapat}
      kaydet={() => kaydet.mutate({ kayit, govde })}
      mesgul={mesgul}
      hata={hata}
      ek={kayit ? <KisiPaneli tur="ekip" hedefId={kayit.id} /> : undefined}
    >
      <Girdi etiket="Kod" value={kod} onChange={(o) => kodYaz(o.target.value)} required maxLength={24} ipucu="Büyük harfe çevrilir." />
      <Girdi etiket="Ad" value={ad} onChange={(o) => adYaz(o.target.value)} required />
      <Secim
        etiket="İstasyon"
        bosSecenek="Bağlı değil"
        secenekler={secenekler}
        value={istasyonId}
        onChange={(o) => istasyonIdYaz(o.target.value)}
        ipucu="Bağlı ekibin üyeleri o istasyonun kapasitesine sayılır."
      />
      <IsaretKutusu etiket="Aktif" checked={aktif} onChange={(o) => aktifYaz(o.target.checked)} />
    </KayitPenceresi>
  );
}

export function Ekipler({ yazabilir }: { yazabilir: boolean }) {
  const [secili, seciliYaz] = useState<SurumluEkip | 'yeni' | null>(null);
  const [ara, araYaz] = useState('');
  const [istasyon, istasyonYaz] = useState('');
  const liste = useQuery({
    queryKey: anahtarlar.ekipler,
    queryFn: () => api.get<EkiplerCevabi>('/ekipler?pasifler=true'),
  });
  const istasyonlar = useQuery({ queryKey: anahtarlar.istasyonlar, queryFn: istasyonlariGetir });
  if (liste.isPending || istasyonlar.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError || istasyonlar.isError) {
    return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); void istasyonlar.refetch(); }} />;
  }
  const istasyonAdi = new Map(istasyonlar.data.istasyonlar.map((i) => [i.id, `${i.kod} - ${i.ad}`]));
  const gorunen = liste.data.ekipler.filter((e) => (istasyon === '' || e.istasyonId === Number(istasyon)) && aramayaUyar(ara, [e.kod, e.ad]));
  const csv = () => csvIndir('ekipler', ['Kod', 'Ad', 'İstasyon', 'Üye', 'Durum'],
    gorunen.map((e) => [e.kod, e.ad, e.istasyonId === null ? null : istasyonAdi.get(e.istasyonId) ?? null, e.uyeSayisi, e.aktif ? 'Aktif' : 'Pasif']));

  return (
    <>
      <ListeAraclari
        ara={ara}
        araYaz={araYaz}
        araIpucu="Kod ya da ad"
        suzgec={{
          etiket: 'İstasyon',
          bosSecenek: 'Tüm istasyonlar',
          secenekler: istasyonlar.data.istasyonlar.map((i) => ({ deger: String(i.id), baslik: `${i.kod} - ${i.ad}` })),
          deger: istasyon,
          degistir: istasyonYaz,
        }}
        csv={csv}
        csvKapali={gorunen.length === 0}
        yeni={yazabilir ? { metin: 'Yeni ekip', ac: () => seciliYaz('yeni') } : undefined}
      />
      <Tablo
        etiket="Ekipler"
        satirlar={gorunen}
        satirAnahtari={(s) => s.id}
        satirSec={yazabilir ? seciliYaz : undefined}
        bosMesaj={liste.data.ekipler.length === 0 ? 'Ekip yok.' : 'Aramaya uyan ekip yok.'}
        sutunlar={[
          { anahtar: 'kod', baslik: 'Kod', mono: true, kirilmaz: true, hucre: (s) => s.kod },
          { anahtar: 'ad', baslik: 'Ad', hucre: (s) => s.ad },
          { anahtar: 'istasyon', baslik: 'İstasyon', hucre: (s) => (s.istasyonId === null ? null : istasyonAdi.get(s.istasyonId)) },
          { anahtar: 'uye', baslik: 'Üye', hizala: 'sag', mono: true, hucre: (s) => s.uyeSayisi },
          durumSutunu<SurumluEkip>(),
        ]}
      />
      {secili !== null && (
        <EkipFormu key={secili === 'yeni' ? 'yeni' : secili.id} kayit={secili === 'yeni' ? null : secili} kapat={() => seciliYaz(null)} />
      )}
    </>
  );
}
