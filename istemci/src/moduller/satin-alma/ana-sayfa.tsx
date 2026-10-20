import { useQuery } from '@tanstack/react-query';
import { AkisKarti } from '../../ortak/arayuz/PanoGrafikleri.tsx';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { TalepAc } from './talep/TalepAc.tsx';
import { Taleplerim } from './talep/Taleplerim.tsx';
import { SURE, anahtarlar, cagri } from './talep/ortak.ts';

// Pano kartları tek özet ucunu paylaşır (aynı sorgu anahtarı, tek istek); yetkisiz sayı uçta null gelir (kart #489).
function useOzet() {
  return useQuery({ queryKey: anahtarlar.ozet, queryFn: () => cagri.get('/satin-alma/ozet', SURE) });
}

function OnayBekleyen() {
  const o = useOzet();
  return <SayiKarti baslik="Onay bekleyen satın alma talepleri" simge="check" ton="uyari" sayi={o.data?.onayBekleyen} altMetin="Kararı verilmiş, onayınızı bekliyor" yol="/satin-alma/onaylar" hata={o.isError} />;
}
function AcikTalepler() {
  const o = useOzet();
  return <SayiKarti baslik="Açık satın alma talepleri" simge="list" sayi={o.data?.acikTalep} altMetin="Sipariş verilmemiş" yol="/satin-alma/talepler" hata={o.isError} />;
}
function TeslimBekleyen() {
  const o = useOzet();
  return <SayiKarti baslik="Teslim beklenen sipariş satırı" simge="truck" sayi={o.data?.teslimBekleyenSatir} altMetin="Tamamı teslim alınmamış" yol="/satin-alma" hata={o.isError} />;
}
// Depo için aynı sayı mal kabule götürür; depo satın alma sayfasını görmez.
function MalKabulBekleyen() {
  const o = useOzet();
  return <SayiKarti baslik="Mal kabul bekleyen sipariş satırı" simge="truck" sayi={o.data?.teslimBekleyenSatir} altMetin="Satın alma siparişi, tamamı gelmemiş" yol="/stok/mal-kabul" hata={o.isError} />;
}
function AcikSiparisler() {
  const o = useOzet();
  return <SayiKarti baslik="Açık sipariş" simge="tag" sayi={o.data?.acikSiparis} altMetin="Teslimi tamamlanmamış" yol="/satin-alma" hata={o.isError} />;
}

// Şirket özeti (yönetici): onay bekleyen sayısı iş kutusunda da kart olduğundan burada alt metinde kalır.
// Sayı kartı yalnız sayı gösterir: tutar tam TL'ye yuvarlanır; kurlardan biri eksikse uç null verir.
function SirketOzeti() {
  const o = useOzet();
  const d = o.data;
  const sayi = d === undefined ? undefined : d.acikSiparisTutari === null ? null : Math.round(Number(d.acikSiparisTutari));
  const alt = `TL, açık siparişler${d?.onayBekleyen ? ` · ${d.onayBekleyen} talep onay bekliyor` : ''}`;
  return <SayiKarti baslik="Açık satın alma siparişi tutarı" simge="tag" sayi={sayi} altMetin={alt} yol="/satin-alma" hata={o.isError} />;
}

// Şirket özeti: tedarik akışı talepten teslime; kişinin göremediği sayı uçta null gelir ve adımda "–" yazar.
function TedarikAkisi() {
  const o = useOzet();
  const d = o.data;
  return (
    <AkisKarti
      baslik="Tedarik akışı" simge="truck" yol="/satin-alma" hata={o.isError}
      adimlar={[
        { etiket: 'Açık talep', sayi: d?.acikTalep, altMetin: 'Sipariş verilmemiş' },
        { etiket: 'Onay bekleyen', sayi: d?.onayBekleyen, dikkat: true },
        { etiket: 'Açık sipariş', sayi: d?.acikSiparis },
        { etiket: 'Teslim bekleyen satır', sayi: d?.teslimBekleyenSatir, altMetin: 'Mal kabulde' },
      ]}
    />
  );
}

// Talep ana sayfadan açılır (kart #375); satın alma ekranının menüsüne "Taleplerim" eklenmez.
export const anaSayfaKartlari: AnaSayfaKarti[] = [
  // Şirket özeti kartlarını satın almayı okuyan görür (kart #1085).
  { anahtar: 'satin-alma-yonetim-ozet', sira: 150, bolum: 'yonetim', islem: 'satin-alma.oku', veya: ['satin-alma.yaz'], ekran: SirketOzeti },
  { anahtar: 'satin-alma-yonetim-akis', sira: 510, bolum: 'yonetim', genis: true, islem: 'satin-alma.oku', veya: ['satin-alma.yaz'], ekran: TedarikAkisi },
  { anahtar: 'satin-alma-onay-bekleyen', sira: 300, bolum: 'is', islem: 'satin-alma.onayla', ekran: OnayBekleyen },
  { anahtar: 'satin-alma-acik-talep', sira: 310, bolum: 'is', islem: 'satin-alma.yaz', ekran: AcikTalepler },
  { anahtar: 'satin-alma-teslim-bekleyen', sira: 320, bolum: 'is', islem: 'satin-alma.yaz', ekran: TeslimBekleyen },
  { anahtar: 'satin-alma-mal-kabul-bekleyen', sira: 330, bolum: 'is', islem: 'stok.giris', ekran: MalKabulBekleyen },
  { anahtar: 'satin-alma-acik-siparis', sira: 300, bolum: 'ozet', islem: 'satin-alma.oku', veya: ['satin-alma.yaz'], ekran: AcikSiparisler },
  { anahtar: 'satin-alma-talep', sira: 100, islem: 'satin-alma.talep-ac', ekran: TalepAc },
  { anahtar: 'satin-alma-taleplerim', sira: 110, islem: 'satin-alma.talep-ac', ekran: Taleplerim },
];
