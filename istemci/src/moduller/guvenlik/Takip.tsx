import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GirisListeCevabi, KilitAcCevabi, KilitListeCevabi, OturumlarCevabi } from '#paylasilan/sozlesme/guvenlik.ts';
import { Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Rozet, Secim, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { BOS, SONUC_ADI, zamanMetni } from './gorunum.ts';
import './guvenlik.css';

type GirisSatiri = GirisListeCevabi['satirlar'][number];
type OturumSatiri = OturumlarCevabi['oturumlar'][number];
type KilitSatiri = KilitListeCevabi['satirlar'][number];

const GIRIS_SUTUNLARI: readonly Sutun<GirisSatiri>[] = [
  { anahtar: 'zaman', baslik: 'Zaman', kirilmaz: true, hucre: (g) => zamanMetni(g.zaman) },
  { anahtar: 'ad', baslik: 'Kullanıcı adı', hucre: (g) => <span className="tc-guvenlik-kaynak">{g.kullaniciAdi}</span> },
  { anahtar: 'ip', baslik: 'Cihaz', mono: true, hucre: (g) => g.ip ?? BOS },
  { anahtar: 'sonuc', baslik: 'Sonuç', hucre: (g) => <Rozet ton={g.sonuc === 'hatali' ? 'hata' : 'tamam'}>{SONUC_ADI[g.sonuc]}</Rozet> },
];

export function GuvenlikGirisler() {
  const [sayfa, sayfaYaz] = useState(1);
  const [sonuc, sonucYaz] = useState('');
  const [ara, araYaz] = useState('');
  const sorgu = useQuery({
    queryKey: anahtarlar.girisler(sayfa, sonuc, ara.trim()),
    queryFn: () => {
      const q = new URLSearchParams({ sayfa: String(sayfa) });
      if (sonuc) q.set('sonuc', sonuc);
      if (ara.trim()) q.set('ara', ara.trim());
      return api.get<GirisListeCevabi>(`/guvenlik/girisler?${q.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
  return (
    <div className="tc-guvenlik">
      <p className="tc-guvenlik-not">Her giriş denemesi; parola ya da PIN kaydedilmez.</p>
      <div className="tc-guvenlik-suzgec">
        <Girdi etiket="Ara" type="search" placeholder="Kullanıcı adı ya da cihaz" value={ara} maxLength={80}
          onChange={(o) => { araYaz(o.target.value); sayfaYaz(1); }} />
        <Secim etiket="Sonuç" value={sonuc} bosSecenek="Hepsi" onChange={(o) => { sonucYaz(o.target.value); sayfaYaz(1); }}
          secenekler={[{ deger: 'hatali', baslik: SONUC_ADI.hatali }, { deger: 'basarili', baslik: SONUC_ADI.basarili }]} />
      </div>
      {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
        : sorgu.isError ? <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />
          : (
            <Tablo
              etiket="Giriş denemeleri"
              sutunlar={GIRIS_SUTUNLARI}
              satirlar={sorgu.data.satirlar}
              satirAnahtari={(g) => g.id}
              bosMesaj="Bu süzgeçte giriş denemesi yok"
              mesgul={sorgu.isPlaceholderData}
              sayfalama={{ sayfa: sorgu.data.sayfa, sayfaBoyu: sorgu.data.sayfaBoyu, toplam: sorgu.data.toplam, degistir: sayfaYaz }}
            />
          )}
    </div>
  );
}

export function GuvenlikOturumlar() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const oturum = useOturum();
  const yonetir = oturum.data?.islemler.includes('guvenlik.yonet') ?? false;
  const [kapanacak, kapanacakYaz] = useState<OturumSatiri | null>(null);
  const sorgu = useQuery({ queryKey: anahtarlar.oturumlar, queryFn: () => api.get<OturumlarCevabi>('/guvenlik/oturumlar') });
  const kapat = useMutation({
    mutationFn: (id: number) => api.post<{ id: number }>(`/guvenlik/oturumlar/${id}/kapat`),
    onSuccess: async () => { bildir('tamam', 'Oturum kapatıldı.'); kapanacakYaz(null); await istemci.invalidateQueries({ queryKey: anahtarlar.kok }); },
    onError: async (h) => { bildir('hata', hataIletisi(h, 'Oturum kapatılamadı.')); kapanacakYaz(null); await istemci.invalidateQueries({ queryKey: anahtarlar.oturumlar }); },
  });
  const sutunlar: readonly Sutun<OturumSatiri>[] = [
    { anahtar: 'kisi', baslik: 'Kişi', hucre: (o) => (
      <span className="tc-guvenlik-kaynak">{o.kisiAdi} {o.buOturum && <Rozet ton="bilgi">Bu oturum</Rozet>}</span>
    ) },
    { anahtar: 'acildi', baslik: 'Açıldı', kirilmaz: true, hucre: (o) => zamanMetni(o.acildi) },
    { anahtar: 'son', baslik: 'Son görülme', kirilmaz: true, hucre: (o) => zamanMetni(o.sonGorulme) },
    ...(yonetir ? [{
      anahtar: 'islem', baslik: 'İşlem', hizala: 'sag' as const,
      hucre: (o: OturumSatiri) => (o.buOturum ? BOS : <Dugme simge="x" onClick={() => kapanacakYaz(o)}>Kapat</Dugme>),
    }] : []),
  ];
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />;
  const { oturumlar } = sorgu.data;
  return (
    <div className="tc-guvenlik">
      <KilitliHesaplar yonetir={yonetir} />
      <Tablo
        etiket="Açık oturumlar"
        sutunlar={sutunlar}
        satirlar={oturumlar}
        satirAnahtari={(o) => o.id}
        bosMesaj="Açık oturum yok"
      />
      <OnayPenceresi
        acik={kapanacak !== null}
        baslik="Oturum kapatılsın mı?"
        onayMetni="Oturumu kapat"
        tehlikeli
        yukleniyor={kapat.isPending}
        onayla={() => { if (kapanacak !== null) kapat.mutate(kapanacak.id); }}
        vazgec={() => kapanacakYaz(null)}
      >
        <p>{kapanacak?.kisiAdi} bu cihazda yeniden giriş yapmak zorunda kalır.</p>
      </OnayPenceresi>
    </div>
  );
}

// Etkin hesap kilitleri; açma adın bütün etkin kilitlerini açar, açan kişi ve an sunucudan yazılır.
function KilitliHesaplar({ yonetir }: { yonetir: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [sayfa, sayfaYaz] = useState(1);
  const [acilacak, acilacakYaz] = useState<KilitSatiri | null>(null);
  const sorgu = useQuery({
    queryKey: anahtarlar.kilitler(sayfa),
    queryFn: () => api.get<KilitListeCevabi>(`/guvenlik/kilitler?sayfa=${String(sayfa)}`),
    placeholderData: keepPreviousData,
  });
  const ac = useMutation({
    mutationFn: (id: number) => api.post<KilitAcCevabi>(`/guvenlik/kilitler/${id}/ac`),
    onSuccess: async () => { bildir('tamam', 'Kilit açıldı.'); acilacakYaz(null); await istemci.invalidateQueries({ queryKey: anahtarlar.kok }); },
    onError: async (h) => { bildir('hata', hataIletisi(h, 'Kilit açılamadı.')); acilacakYaz(null); await istemci.invalidateQueries({ queryKey: anahtarlar.kok }); },
  });
  const sutunlar: readonly Sutun<KilitSatiri>[] = [
    { anahtar: 'ad', baslik: 'Kullanıcı adı', hucre: (k) => <span className="tc-guvenlik-kaynak">{k.kullaniciAdi}</span> },
    { anahtar: 'kilitlendi', baslik: 'Kilitlendi', kirilmaz: true, hucre: (k) => zamanMetni(k.kilitlendi) },
    { anahtar: 'bitis', baslik: 'Kendiliğinden açılır', kirilmaz: true, hucre: (k) => zamanMetni(k.bitis) },
    ...(yonetir ? [{
      anahtar: 'islem', baslik: 'İşlem', hizala: 'sag' as const,
      hucre: (k: KilitSatiri) => <Dugme simge="lock" onClick={() => acilacakYaz(k)}>Kilidi aç</Dugme>,
    }] : []),
  ];
  return (
    <Kart baslik="Kilitli hesaplar">
      {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
        : sorgu.isError ? <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />
          : (
            <Tablo
              etiket="Kilitli hesaplar"
              sutunlar={sutunlar}
              satirlar={sorgu.data.satirlar}
              satirAnahtari={(k) => k.id}
              bosMesaj="Kilitli hesap yok"
              mesgul={sorgu.isPlaceholderData}
              sayfalama={{ sayfa: sorgu.data.sayfa, sayfaBoyu: sorgu.data.sayfaBoyu, toplam: sorgu.data.toplam, degistir: sayfaYaz }}
            />
          )}
      <OnayPenceresi
        acik={acilacak !== null}
        baslik="Kilit açılsın mı?"
        onayMetni="Kilidi aç"
        yukleniyor={ac.isPending}
        onayla={() => { if (acilacak !== null) ac.mutate(acilacak.id); }}
        vazgec={() => acilacakYaz(null)}
      >
        <p>{acilacak?.kullaniciAdi} hemen yeniden giriş deneyebilir. Hatalı denemeleri kişinin kendisinin yaptığından emin olun.</p>
      </OnayPenceresi>
    </Kart>
  );
}
