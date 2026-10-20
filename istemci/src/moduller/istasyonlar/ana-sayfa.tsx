import { useQuery } from '@tanstack/react-query';
import type { Islem } from '#paylasilan/islemler.ts';
import type { PanoOzetiCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { ParcaCubuguKarti, type Parca } from '../../ortak/arayuz/PanoGrafikleri.tsx';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';

// Üç kart tek ucu okur; sorgu anahtarı ortak olduğundan istek bir kez gider (#483).
function usePanoOzeti() {
  return useQuery({ queryKey: anahtarlar.panoOzeti, queryFn: () => api.get<PanoOzetiCevabi>('/istasyonlar/pano-ozeti') });
}

// Kart herkese görünebilir ama sayfayı açamayan için bağlantı olmaz: tıklayan yetki sayfasına düşmesin.
function useYol(...secenekler: [Islem, string][]): string | undefined {
  const islemler = useOturum().data?.islemler ?? [];
  return secenekler.find(([islem]) => islemler.includes(islem))?.[1];
}

function DuranMakine() {
  const ozet = usePanoOzeti();
  const yol = useYol(['sayfa.istasyonlar', '/istasyonlar/makineler'], ['arkon.bakim', '/arkon/bakim']);
  const m = ozet.data?.makine;
  return (
    <SayiKarti
      baslik="Duran makine" simge="alert" ton="uyari" yol={yol} hata={ozet.isError}
      sayi={m && m.ariza + m.bakim} altMetin={m && `${m.ariza} arıza, ${m.bakim} bakım`}
    />
  );
}

function CalisanMakine() {
  const ozet = usePanoOzeti();
  const yol = useYol(['sayfa.istasyonlar', '/istasyonlar/makineler']);
  const m = ozet.data?.makine;
  return <SayiKarti baslik="Çalışan makine" simge="cpu" yol={yol} hata={ozet.isError} sayi={m?.calisir} altMetin={m && `${m.toplam} makineden`} />;
}

// Şirket özeti: makinelerin durum dağılımı. Durum satırı olmayan makine çalışır sayılmaz, "Durumu girilmemiş" diliminde kalır.
function MakineDurumu() {
  const ozet = usePanoOzeti();
  const yol = useYol(['sayfa.istasyonlar', '/istasyonlar/makineler']);
  const m = ozet.data?.makine;
  const parcalar: Parca[] | undefined = m && [
    { etiket: 'Çalışıyor', deger: m.calisir, durum: 'calisiyor' },
    { etiket: 'Bakımda', deger: m.bakim, durum: 'durakli' },
    { etiket: 'Arızada', deger: m.ariza, durum: 'durdu' },
    { etiket: 'Durumu girilmemiş', deger: Math.max(0, m.toplam - m.calisir - m.bakim - m.ariza), durum: 'sirada' },
  ];
  return (
    <ParcaCubuguKarti
      baslik="Makine durumu" simge="cpu" birim="makine" parcalar={parcalar} yol={yol} hata={ozet.isError}
      ozet={m && `${m.calisir.toLocaleString('tr-TR')} / ${m.toplam.toLocaleString('tr-TR')}`} bosMetin="Kayıtlı makine yok"
    />
  );
}

function Personel() {
  const ozet = usePanoOzeti();
  const yol = useYol(['sayfa.vardiya', '/vardiya/personel'], ['sayfa.personel', '/personel']);
  const p = ozet.data?.personel;
  return <SayiKarti baslik="Personel" simge="user" yol={yol} hata={ozet.isError} sayi={p?.kisi} altMetin={p && `${p.isMerkezi} iş merkezine bağlı`} />;
}

// Şirket özeti kartını pano ucunu okuyabilen görür (uçtaki okuma kümesi, kart #1085).
const PANO_OKUYAN: readonly Islem[] = ['istasyonlar.yaz', 'sayfa.terminal', 'sayfa.vardiya', 'sayfa.personel', 'arkon.bakim'];

export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'istasyonlar-makine-durumu', sira: 600, bolum: 'yonetim', islem: 'sayfa.istasyonlar', veya: PANO_OKUYAN, ekran: MakineDurumu },
  { anahtar: 'istasyonlar-duran-makine', sira: 30, bolum: 'uyari', islem: 'sayfa.istasyonlar', veya: ['sayfa.terminal', 'arkon.bakim'], ekran: DuranMakine },
  { anahtar: 'istasyonlar-calisan-makine', sira: 30, bolum: 'ozet', islem: 'sayfa.istasyonlar', ekran: CalisanMakine },
  { anahtar: 'istasyonlar-personel', sira: 40, bolum: 'ozet', islem: 'sayfa.vardiya', veya: ['sayfa.personel'], ekran: Personel },
];
