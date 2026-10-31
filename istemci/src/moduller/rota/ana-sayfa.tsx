import { useQuery } from '@tanstack/react-query';
import type { PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { RevizyonOzetiCevabi } from '#paylasilan/sozlesme/rota.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { ADIMLI_OKUMA_ISLEMLERI, AdimliOzetCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { GrafikKarti } from '../../ortak/arayuz/GrafikKarti.tsx';
import type { GrafikNoktasi } from '../../ortak/arayuz/GrafikKarti.tsx';
import { AkisKarti, CubukListesiKarti } from '../../ortak/arayuz/PanoGrafikleri.tsx';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { EMIR_DURUMU } from '#paylasilan/sozlesme/emir-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';

// İki kart sunucunun saydığı revizyon özetini okur (tek istek, ürün listesi taşınmaz); anahtar liste anahtarının altındadır, liste yenilenince o da yenilenir.
function useRevizyonOzeti() {
  return useQuery({ queryKey: [...anahtarlar.liste, 'ozet'], queryFn: () => api.get<RevizyonOzetiCevabi>('/rota/revizyon-ozeti') });
}

function AcikRevizyon() {
  const o = useRevizyonOzeti();
  return <SayiKarti baslik="Açık rota revizyonu" simge="tool" sayi={o.data?.acikRevizyon} altMetin="Taslakta ya da onay bekliyor" yol="/recete-rota/schema" hata={o.isError} />;
}
function OnayBekleyen() {
  const o = useRevizyonOzeti();
  return <SayiKarti baslik="Onay bekleyen rota" simge="check" ton="uyari" sayi={o.data?.onayBekleyen} altMetin="Onaylanınca yürürlüğe alınabilir" yol="/recete-rota/schema" hata={o.isError} />;
}

// Şirket özeti (yönetici): emir sayılarını sunucu sayar (tek istek, emir listesi taşınmaz); arşivdeki emir sayılmaz. Anahtar emir anahtarlarının altındadır.
function useEmirOzeti() {
  return useQuery({ queryKey: ['rotalar', 'emirler', 'ozet'], queryFn: () => api.get<AdimliOzetCevabi>('/adimli-emirler/ozet') });
}

// Kartları planı okuyan da görür (karar 288 a), emir listesine giremez: bağlantı yalnız emir okuma kümesinden biriyle verilir.
function useEmirListesiYolu(): string | undefined {
  const k = useOturum().data;
  return k?.islemler.some((i) => EMIR_OKUYAN.includes(i)) ? '/uretim-emirleri' : undefined;
}

function AcikEmir() {
  const o = useEmirOzeti();
  return <SayiKarti baslik="Açık emir" simge="list" sayi={o.data?.acik} altMetin={`${EMIR_DURUMU.taslak.etiket}, ${EMIR_DURUMU.planli.etiket.toLocaleLowerCase('tr-TR')} ya da ${EMIR_DURUMU.basladi.etiket.toLocaleLowerCase('tr-TR')}`} yol={useEmirListesiYolu()} hata={o.isError} />;
}
function GecikenEmir() {
  const o = useEmirOzeti();
  return <SayiKarti baslik="Geciken emir" simge="clock" ton="uyari" sayi={o.data?.geciken} altMetin="Teslim tarihi geçmiş, kapanmamış" yol={useEmirListesiYolu()} hata={o.isError} />;
}

function UretimAkisi() {
  const o = useEmirOzeti();
  return (
    <AkisKarti
      baslik="Üretim akışı" simge="layers" yol={useEmirListesiYolu()} hata={o.isError}
      altMetin="Arşive alınmamış üretim emirleri"
      adimlar={[
        // Adlar emir durumunun tek sözlüğünden (1389 a).
        { etiket: EMIR_DURUMU.taslak.etiket, sayi: o.data?.taslak, altMetin: 'Planlanacak' },
        { etiket: EMIR_DURUMU.planli.etiket, sayi: o.data?.planli, altMetin: 'Başlamadı' },
        { etiket: EMIR_DURUMU.basladi.etiket, sayi: o.data?.basladi },
        { etiket: 'Geciken', sayi: o.data?.geciken, altMetin: 'Teslim tarihi geçmiş', dikkat: true },
        { etiket: 'Biten', sayi: o.data?.biten },
      ]}
    />
  );
}

// Planlama (kart #724): planlamacının kartları canlı planı okur (plan ekranıyla aynı sorgu anahtarı, `usePlan.ts planAnahtari(null)`, tek istek).
// usePlan ithal edilmez: ekran zinciri ana sayfa kayıt dosyasına döner ve kart dizisi yüklenmeden okunurdu.
function useCanliPlan() {
  return useQuery({ queryKey: ['rotalar', 'plan', 'canli'], queryFn: () => api.get<PlanCevabi>('/plan') });
}
// Plana göre teslimden sonra biten ya da işi yerleşmediği için bitişi bilinmeyen, teslimli emir (plan göstergesi).
function PlandaGeciken() {
  const p = useCanliPlan();
  return <SayiKarti baslik="Planda geciken emir" simge="clock" ton="uyari" sayi={p.data?.gostergeler.geciken} altMetin="Planlanan bitiş teslimden sonra" yol="/recete-rota/plan" hata={p.isError} />;
}
function PlanaGirmeyen() {
  const p = useCanliPlan();
  const sayi = p.data?.emirler.filter((e) => e.engelli).length;
  return <SayiKarti baslik="Plana girmeyen emir" simge="alert" ton="uyari" sayi={sayi} altMetin="Yerleşemeyen iş emri var" yol="/recete-rota/plan" hata={p.isError} />;
}

// Önümüzdeki yedi günde (bugün dahil) istasyonun dolu dakikasının çalışma dakikasına oranı; çalışma zamanı olmayan istasyon yazılmaz.
export function haftalikDoluluk(yuk: PlanCevabi['istasyonYuku'], gun = 7): GrafikNoktasi[] {
  const topla = (l: readonly number[]) => l.slice(0, gun).reduce((t, x) => t + x, 0);
  return yuk.flatMap((i) => {
    const kapasite = topla(i.kapasite);
    return kapasite > 0 ? [{ etiket: i.kod, deger: Math.round((topla(i.dolu) / kapasite) * 100) }] : [];
  });
}
function IstasyonDolulugu() {
  const p = useCanliPlan();
  return (
    <GrafikKarti baslik="Bu hafta istasyon doluluğu" simge="chart" tur="cubuk" birim="%" noktalar={p.data ? haftalikDoluluk(p.data.istasyonYuku) : undefined}
      altMetin="Önümüzdeki 7 gün, canlı plan" yol="/recete-rota/plan" hata={p.isError} />
  );
}

// Şirket özeti: aynı doluluk iş merkezi başına çubukla; kapasiteyi aşan istasyon hata tonunda.
function YonetimDolulugu() {
  const p = useCanliPlan();
  const satirlar = p.data && haftalikDoluluk(p.data.istasyonYuku).map((n) => ({ ...n, ton: n.deger > 100 ? ('hata' as const) : undefined }));
  return (
    <CubukListesiKarti baslik="Bu hafta istasyon doluluğu" simge="chart" birim="%" enUst={100} satirlar={satirlar}
      altMetin="Önümüzdeki 7 gün, canlı plan" bosMetin="Planda çalışma zamanı olan istasyon yok" yol="/recete-rota/plan" hata={p.isError} />
  );
}

// Şirket özeti kartlarını o veriyi okuyabilen görür (kart #1085): emirleri emir listesini okuyan ya da planı okuyan (özet ucu plan.oku kabul eder, 288 a), planı plan sayfasını açan.
// Liste uçtaki okuma kümesinin kopyasıdır; tip sunucudakiyle aynı kalmasını denetler (istemci sözleşmeden değer ithal etmez).
const EMIR_OKUMA_KUMESI: typeof ADIMLI_OKUMA_ISLEMLERI = ['sayfa.uretim-emirleri', 'sayfa.rota', 'uretim-emirleri.yaz', 'uretim-emirleri.fason', 'plan.yaz'];
const EMIR_OKUMA = EMIR_OKUMA_KUMESI[0];
const EMIR_OKUYAN: readonly Islem[] = EMIR_OKUMA_KUMESI;
const EMIR_OZETI_OKUYAN: readonly Islem[] = [...EMIR_OKUMA_KUMESI, 'plan.oku'];

// Rotayı yazan açık revizyonu, onaylayan onay bekleyeni görür; ikisini de taşıyan iki kartı da görür.
export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'rota-acik-revizyon', sira: 220, bolum: 'is', islem: 'rota.yaz', ekran: AcikRevizyon },
  { anahtar: 'rota-yonetim-acik-emir', sira: 100, bolum: 'yonetim', islem: EMIR_OKUMA, veya: EMIR_OZETI_OKUYAN, ekran: AcikEmir },
  { anahtar: 'rota-yonetim-geciken-emir', sira: 110, bolum: 'yonetim', islem: EMIR_OKUMA, veya: EMIR_OZETI_OKUYAN, ekran: GecikenEmir },
  { anahtar: 'rota-yonetim-uretim-akisi', sira: 500, bolum: 'yonetim', genis: true, islem: EMIR_OKUMA, veya: EMIR_OZETI_OKUYAN, ekran: UretimAkisi },
  { anahtar: 'plan-yonetim-doluluk', sira: 610, bolum: 'yonetim', islem: 'sayfa.rota', veya: ['plan.yaz', 'plan.oku'], ekran: YonetimDolulugu },
  { anahtar: 'rota-onay-bekleyen', sira: 215, bolum: 'is', islem: 'rota.onayla', ekran: OnayBekleyen },
  { anahtar: 'plan-geciken-emir', sira: 180, bolum: 'is', islem: 'plan.oku', veya: ['plan.yaz'], ekran: PlandaGeciken },
  { anahtar: 'plan-girmeyen-emir', sira: 185, bolum: 'is', islem: 'plan.oku', veya: ['plan.yaz'], ekran: PlanaGirmeyen },
  { anahtar: 'plan-istasyon-dolulugu', sira: 180, bolum: 'grafik', islem: 'plan.oku', veya: ['plan.yaz'], ekran: IstasyonDolulugu },
];
