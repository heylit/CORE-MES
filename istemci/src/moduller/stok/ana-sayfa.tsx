import { useQuery } from '@tanstack/react-query';
import type { Islem } from '#paylasilan/islemler.ts';
import type { AylikStokDegeriCevabi, PanelCevabi, StokOzetiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { GrafikKarti } from '../../ortak/arayuz/GrafikKarti.tsx';
import { IkiSeriKarti } from '../../ortak/arayuz/PanoGrafikleri.tsx';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Dört kart tek özet ucunu paylaşır (aynı sorgu anahtarı, tek istek); yetkisiz sayı uçta null gelir.
function useOzet() {
  return useQuery({ queryKey: [...anahtarlar.hepsi, 'ozet'], queryFn: () => api.get<StokOzetiCevabi>('/stok/ozet') });
}

function AcikIstekler() {
  const o = useOzet();
  return <SayiKarti baslik="Açık malzeme istekleri" simge="truck" sayi={o.data?.acikIstek} altMetin="Üretimden gelen, teslim edilmemiş" yol="/stok/hazirlik" hata={o.isError} />;
}
function DusukStok() {
  const o = useOzet();
  return <SayiKarti baslik="Düşük stok" simge="alert" ton="uyari" sayi={o.data?.dusukStok} altMetin="Kritik seviyede ya da altında" yol="/stok/malzemeler?durum=kritik" hata={o.isError} />;
}
function SayimBekleyen() {
  const o = useOzet();
  return <SayiKarti baslik="Sayım bekleyen göz" simge="clock" sayi={o.data?.sayimBekleyen} altMetin="Süresi dolmuş ya da hiç sayılmamış" yol="/stok" hata={o.isError} />;
}
function EksikEmir() {
  const o = useOzet();
  return <SayiKarti baslik="Malzemesi eksik emir" simge="box" ton="uyari" sayi={o.data?.eksikEmir} altMetin="Kalan sarfı stokta yetmeyen açık emir" yol="/uretim-emirleri" hata={o.isError} />;
}

// Şirket özeti (yönetici): iş kutusunun panel ucunu ve önbelleğini paylaşır.
function usePanel() {
  return useQuery({ queryKey: [...anahtarlar.hepsi, 'panel'], queryFn: () => api.get<PanelCevabi>('/stok/panel') });
}
function StokDegeri() {
  const p = usePanel();
  const d = p.data;
  // Sayı kartı yalnız sayı gösterir: değer tam TL'ye yuvarlanır, kuruşlu değer ve öteki gruplar stok panosundadır. Değer yalnız
  // kullanılabilir stoktandır (228 a): red, hurda, fason ve yoldaki bakiye sayılmaz.
  const sayi = d === undefined ? undefined : d.guncelDeger === null ? null : Math.round(Number(d.guncelDeger));
  // Değer yalnız finans rakamlarını görene hesaplanır (#680); öteki okuyan "Veri yok" ile nedenini görür.
  const alt = d?.degerGorunur === false ? 'Değer finans yetkisiyle görünür'
    : `Yalnız kullanılabilir · TL, ortalama alış fiyatıyla${d?.guncelFiyatsizKart ? ` · ${d.guncelFiyatsizKart} kartın fiyatı yok` : ''}`;
  return <SayiKarti baslik="Stok değeri" simge="box" sayi={sayi} altMetin={alt} yol="/stok" hata={p.isError} />;
}
function KritikEksi() {
  const p = usePanel();
  const d = p.data;
  return <SayiKarti baslik="Kritik ya da eksi stok" simge="alert" ton="uyari" sayi={d ? d.kritik + d.eksi : undefined} altMetin="Kritik seviyede ya da eksi bakiyede" yol="/stok/malzemeler?durum=kritik" hata={p.isError} />;
}

// Son yedi günün hareket sayısı: giriş (sayım fazlası dahil) ve çıkış (sayım eksiği dahil).
const gunAdi = (gun: string): string => gun.slice(5).split('-').reverse().join('.');
function StokHareketi() {
  const p = usePanel();
  const noktalar = p.data?.gunluk.map((g) => ({ etiket: gunAdi(g.gun), birinci: g.giris, ikinci: g.cikis }));
  return (
    <IkiSeriKarti baslik="Stok hareketi, son 7 gün" simge="box" seriAdlari={['Giriş', 'Çıkış']} birim="hareket" noktalar={noktalar}
      yol="/stok" hata={p.isError} />
  );
}
// Ay sonu stok değeri (kart #1079, #1117). Değeri bilinmeyen ay çizilmez (sıfır uydurulmaz); değer finans yetkisiyle görünür (#680).
const ayAdi = (ay: string): string => `${ay.slice(5)}.${ay.slice(2, 4)}`;
function AylikStokDegeri() {
  const s = useQuery({ queryKey: [...anahtarlar.hepsi, 'panel', 'aylik-deger'], queryFn: () => api.get<AylikStokDegeriCevabi>('/stok/panel/aylik-deger') });
  const d = s.data;
  const noktalar = d === undefined ? undefined : !d.degerGorunur ? null
    : d.aylar.flatMap((a) => (a.stokDegeri === null ? [] : [{ etiket: ayAdi(a.ay), deger: Math.round(Number(a.stokDegeri)) }]));
  const altMetin = d?.degerGorunur === false ? 'Değer finans yetkisiyle görünür' : 'Ay sonu, ortalama alış fiyatıyla';
  return <GrafikKarti baslik="Stok değeri, aylık" simge="chart" tur="egri" birim="TL" noktalar={noktalar} altMetin={altMetin} yol="/stok" hata={s.isError} />;
}

// Stoğu okuyabilen herkes (stok sayfası ya da bir stok işlemi); uçtaki okuma kümesiyle aynı.
const OKUYAN: readonly Islem[] = ['stok.giris', 'stok.cikis', 'stok.transfer', 'stok.sayim', 'stok.tanim', 'stok.geri-al', 'stok.toplama'];

export const anaSayfaKartlari: AnaSayfaKarti[] = [
  // Şirket özeti kartlarını stoğu okuyan görür (kart #1085). Değer kartları finans rakamını görene görünür: değer uçta yalnız
  // finans.oku ile hesaplanır (#680), öteki okuyanda kart hep boş kalırdı. finans.oku taşıyan her rol stoğu da okur.
  { anahtar: 'stok-yonetim-deger', sira: 130, bolum: 'yonetim', islem: 'finans.oku', ekran: StokDegeri },
  { anahtar: 'stok-yonetim-kritik', sira: 140, bolum: 'yonetim', islem: 'sayfa.stok', veya: OKUYAN, ekran: KritikEksi },
  { anahtar: 'stok-yonetim-hareket', sira: 620, bolum: 'yonetim', islem: 'sayfa.stok', veya: OKUYAN, ekran: StokHareketi },
  { anahtar: 'stok-yonetim-aylik-deger', sira: 820, bolum: 'yonetim', islem: 'finans.oku', ekran: AylikStokDegeri },
  { anahtar: 'stok-acik-istekler', sira: 200, bolum: 'is', islem: 'stok.transfer', ekran: AcikIstekler },
  { anahtar: 'stok-dusuk', sira: 200, bolum: 'uyari', islem: 'sayfa.stok', veya: OKUYAN, ekran: DusukStok },
  { anahtar: 'stok-eksik-emir', sira: 210, bolum: 'uyari', islem: 'sayfa.stok', veya: OKUYAN, ekran: EksikEmir },
  { anahtar: 'stok-sayim', sira: 200, bolum: 'ozet', islem: 'stok.sayim', ekran: SayimBekleyen },
];
