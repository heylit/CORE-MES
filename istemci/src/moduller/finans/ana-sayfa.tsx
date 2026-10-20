import { useQuery } from '@tanstack/react-query';
import type { Islem } from '#paylasilan/islemler.ts';
import type { AylikSeriCevabi, FinansOzetiCevabi } from '#paylasilan/sozlesme/finans.ts';
import { IkiSeriKarti } from '../../ortak/arayuz/PanoGrafikleri.tsx';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';

// Bütün finans kartları tek ucu okur; sorgu anahtarı ortak olduğundan istek bir kez gider.
function useOzet() {
  return useQuery({ queryKey: ['finans', 'ozet'], queryFn: () => api.get<FinansOzetiCevabi>('/finans/ozet') });
}

// Kur listesi Ayarlar'dadır (finans.yonet); okuyan finans ana sayfasına gider, sayfayı açamayana bağlantı verilmez.
function useYol(): string | undefined {
  const islemler = useOturum().data?.islemler ?? [];
  const secenekler: [Islem, string][] = [['finans.yonet', '/finans/ayarlar'], ['sayfa.finans', '/finans']];
  return secenekler.find(([islem]) => islemler.includes(islem))?.[1];
}

const gunMetni = (tarih: string): string => tarih.split('-').reverse().join('.');
const tlMetni = (tutar: string): string => `${Number(tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

// Rakam kartları finansın kendi sayfasına gider; sayfayı açamayana bağlantı verilmez.
function useSayfaYolu(yol: string): string | undefined {
  return (useOturum().data?.islemler ?? []).includes('sayfa.finans') ? yol : undefined;
}

type SayiAlani = 'gecikenTahsilat' | 'yaklasanOdeme' | 'portfoyCek';
function sayiKarti(alan: SayiAlani, baslik: string, simge: 'alert' | 'clock' | 'tag', yol: string, ton?: 'uyari') {
  return function FinansSayiKarti() {
    const o = useOzet();
    const hedef = useSayfaYolu(yol);
    const r = o.data?.[alan];
    // Kart #162: faturası gelmemiş siparişin ödemesi sayıya ve toplama girmez, yanında ayrı tahmin olarak yazılır.
    const sp = alan === 'yaklasanOdeme' ? o.data?.yaklasanSiparis : undefined;
    const siparis = sp && sp.sayi > 0 ? ` · siparişten ${sp.sayi}, ${sp.tutarTl === null ? 'kur eksik' : `${tlMetni(sp.tutarTl)} tahmini`}` : '';
    return <SayiKarti baslik={baslik} simge={simge} sayi={r?.sayi} altMetin={r ? `Toplam ${tlMetni(r.tutarTl)}${siparis}` : undefined} yol={hedef} ton={ton} hata={o.isError} />;
  };
}

function NakitKarti() {
  const o = useOzet();
  const yol = useSayfaYolu('/finans/nakit');
  const nakit = o.data?.nakitTl;
  const sayi = nakit === undefined ? undefined : nakit === null ? null : Math.round(Number(nakit));
  const altMetin = nakit === undefined ? undefined : nakit === null ? 'Hesap ya da döviz kuru eksik' : 'Banka ve kasa, TL karşılığı';
  return <SayiKarti baslik="Nakit (TL)" simge="chart" sayi={sayi} altMetin={altMetin} yol={yol} hata={o.isError} />;
}

// Yöneticinin şirket özeti (kart #664): finans ana sayfasındaki dört rakam, aynı tanımla sunucudan; kuruşsuz TL.
type TlAlani = 'nakitTl' | 'alacakTl' | 'borcTl' | 'aylikKarTl';
function tlKarti(alan: TlAlani, baslik: string, simge: 'lira' | 'down' | 'up' | 'chart', yol: string, altMetin: string, bosMetin?: string) {
  return function FinansTlKarti() {
    const o = useOzet();
    const hedef = useSayfaYolu(yol);
    const deger = o.data?.[alan];
    const sayi = deger === undefined ? undefined : deger === null ? null : Math.round(Number(deger));
    const alt = deger === undefined ? undefined : deger === null ? bosMetin : altMetin;
    return <SayiKarti baslik={baslik} simge={simge} sayi={sayi} altMetin={alt} yol={hedef} hata={o.isError} />;
  };
}

function kurKarti(paraBirimi: string) {
  return function KurKarti() {
    const o = useOzet();
    const yol = useYol();
    const satir = o.data?.kurlar.find((k) => k.paraBirimi === paraBirimi);
    const sayi = o.data === undefined ? undefined : satir ? Number(satir.kur) : null;
    const altMetin = o.data === undefined ? undefined : satir ? `1 ${paraBirimi}, ${gunMetni(satir.tarih)} kuru` : 'Finansta kur girilmemiş';
    return <SayiKarti baslik={`${paraBirimi} kuru`} simge="lira" sayi={sayi} altMetin={altMetin} yol={yol} hata={o.isError} />;
  };
}

// Aylık gelir ve gider, TL (kart #1080, #1117). Tutarı bilinmeyen ay (kur eksik) çizilmez, sıfır uydurulmaz; atlandığı yazılır.
const ayAdi = (ay: string): string => `${ay.slice(5)}.${ay.slice(2, 4)}`;
function AylikGelirGider() {
  const s = useQuery({ queryKey: ['finans', 'aylik-seri'], queryFn: () => api.get<AylikSeriCevabi>('/finans/aylik-seri') });
  const yol = useSayfaYolu('/finans/gelir-tablosu');
  const aylar = s.data?.aylar;
  const noktalar = aylar?.flatMap((a) => (a.gelirTl === null || a.giderTl === null ? []
    : [{ etiket: ayAdi(a.ay), birinci: Math.round(Number(a.gelirTl)), ikinci: Math.round(Number(a.giderTl)) }]));
  const atlanan = aylar && noktalar ? aylar.length - noktalar.length : 0;
  return (
    <IkiSeriKarti baslik="Aylık gelir ve gider" simge="lira" seriAdlari={['Gelir', 'Gider']} birim="TL" noktalar={noktalar}
      altMetin={atlanan > 0 ? `Son 12 ay · ${atlanan} ayın kuru eksik, gösterilmedi` : 'Son 12 ay'} yol={yol} hata={s.isError} />
  );
}

export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'finans-geciken-tahsilat', sira: 500, bolum: 'uyari', islem: 'finans.oku', ekran: sayiKarti('gecikenTahsilat', 'Vadesi geçmiş tahsilat', 'alert', '/finans/firmalar', 'uyari') },
  { anahtar: 'finans-yaklasan-odeme', sira: 500, bolum: 'is', islem: 'finans.oku', ekran: sayiKarti('yaklasanOdeme', '7 gün içinde ödeme', 'clock', '/finans/kayitlar') },
  { anahtar: 'finans-nakit', sira: 480, bolum: 'ozet', islem: 'finans.oku', ekran: NakitKarti },
  { anahtar: 'finans-portfoy-cek', sira: 490, bolum: 'ozet', islem: 'finans.oku', ekran: sayiKarti('portfoyCek', 'Portföydeki çek ve senet', 'tag', '/finans/cekler') },
  { anahtar: 'finans-kur-usd', sira: 500, bolum: 'ozet', islem: 'finans.oku', ekran: kurKarti('USD') },
  { anahtar: 'finans-kur-eur', sira: 510, bolum: 'ozet', islem: 'finans.oku', ekran: kurKarti('EUR') },
  { anahtar: 'finans-yonetim-nakit', sira: 160, bolum: 'yonetim', islem: 'finans.oku', ekran: tlKarti('nakitTl', 'Kasada ve bankada', 'lira', '/finans/nakit', 'TL karşılığı', 'Hesap ya da döviz kuru eksik') },
  { anahtar: 'finans-yonetim-alacak', sira: 170, bolum: 'yonetim', islem: 'finans.oku', ekran: tlKarti('alacakTl', 'Alacak', 'down', '/finans/firmalar', 'Açık satış ve portföydeki çek, TL') },
  { anahtar: 'finans-yonetim-borc', sira: 180, bolum: 'yonetim', islem: 'finans.oku', ekran: tlKarti('borcTl', 'Borç', 'up', '/finans/firmalar', 'Açık alış ve verilen çek, TL') },
  { anahtar: 'finans-yonetim-kar', sira: 190, bolum: 'yonetim', islem: 'finans.oku', ekran: tlKarti('aylikKarTl', 'Aylık ortalama kâr', 'chart', '/finans/gelir-tablosu', 'Son 3 tamamlanmış ay, TL') },
  { anahtar: 'finans-yonetim-aylik', sira: 830, bolum: 'yonetim', islem: 'finans.oku', ekran: AylikGelirGider },
];
