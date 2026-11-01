import { useQuery } from '@tanstack/react-query';
import type { PlanliDurusListeCevabi, TakvimCevabi, VardiyaPersoneliCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';

// Bugün başlayan vardiyalar: aktif iş merkezlerinde, aktif vardiyalardan, haftalık düzende bugünün ISO gününe açık olanlar.
// Tatil ya da kapalı gün bütün vardiyaları kapatır (VR-02); sayı sıfırdır, neden alt metindedir.
function bugununVardiyalari(t: TakvimCevabi): { sayi: number; altMetin: string } {
  const kapali = t.gunler.find((g) => g.tarih === t.bugun);
  if (kapali) return { sayi: 0, altMetin: `${kapali.tur === 'tatil' ? 'Tatil' : 'Kapalı gün'}${kapali.ad ? `: ${kapali.ad}` : ''}` };
  const gun = ((new Date(`${t.bugun}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const aktifMerkez = new Set(t.isMerkezleri.filter((m) => m.aktif).map((m) => m.id));
  const aktifVardiya = new Set(t.vardiyalar.filter((v) => v.aktif).map((v) => v.id));
  const acik = t.matris.filter((h) => h.gun === gun && aktifMerkez.has(h.isMerkeziId) && aktifVardiya.has(h.vardiyaId));
  const merkezler = new Set(acik.map((h) => h.isMerkeziId)).size;
  return { sayi: new Set(acik.map((h) => h.vardiyaId)).size, altMetin: `${merkezler.toLocaleString('tr-TR')} iş merkezinde` };
}

function BugununVardiyasi() {
  const takvim = useQuery({ queryKey: anahtarlar.takvim, queryFn: () => api.get<TakvimCevabi>('/vardiya-takvimi') });
  const ozet = takvim.data && bugununVardiyalari(takvim.data);
  return <SayiKarti baslik="Bugünkü vardiya" simge="clock" yol="/vardiya" hata={takvim.isError} sayi={ozet?.sayi} altMetin={ozet?.altMetin} />;
}

// Kişinin kendi vardiyası: tatil ve kapalı gün önce gelir; vardiyası seçilmemiş kişiye bu söylenir, vardiya uydurulmaz.
// Vardiyanın bugün kişinin iş merkezinde açık olup olmadığı burada bilinmez (iş merkezi ataması Vardiya ekranının verisidir).
export function vardiyamOzeti(t: TakvimCevabi, kisiId: number): { metin: string; altMetin: string } {
  const kapali = t.gunler.find((g) => g.tarih === t.bugun);
  if (kapali) return { metin: kapali.tur === 'tatil' ? 'Tatil' : 'Kapalı gün', altMetin: kapali.ad ?? 'Bugün çalışma yok' };
  const atama = t.kisiVardiyalari.find((k) => k.kisiId === kisiId);
  const vardiya = atama && t.vardiyalar.find((v) => v.id === atama.vardiyaId);
  if (!vardiya) return { metin: 'Seçilmemiş', altMetin: 'Vardiyanızı amirinize sorun' };
  return { metin: vardiya.ad, altMetin: `${vardiya.baslangic.slice(0, 5)} - ${vardiya.bitis.slice(0, 5)}` };
}

function Vardiyam() {
  const oturum = useOturum();
  const takvim = useQuery({ queryKey: anahtarlar.takvim, queryFn: () => api.get<TakvimCevabi>('/vardiya-takvimi') });
  const kisiId = oturum.data?.id;
  const ozet = takvim.data && kisiId !== undefined ? vardiyamOzeti(takvim.data, kisiId) : undefined;
  return <SayiKarti baslik="Vardiyam" simge="clock" hata={takvim.isError} metin={ozet?.metin} altMetin={ozet?.altMetin} />;
}

// Sayı aktif tanımdır, bugünkü gerçekleşme değil: tekrarlı duruşun açılımı sunucudadır (VR-15), ekranda yeniden kurulmaz.
function PlanliDuruslar() {
  const liste = useQuery({
    queryKey: [...anahtarlar.planliDuruslar(), 'pano'],
    queryFn: () => api.get<PlanliDurusListeCevabi>('/planli-duruslar?yalnizAktif=true&sayfaBoyu=1'),
  });
  return (
    <SayiKarti baslik="Planlı duruş" simge="pause" yol="/vardiya/planli-duruslar" hata={liste.isError}
      sayi={liste.data?.toplam} altMetin="aktif tanım, takvimden düşülür" />
  );
}

// Vardiya ekranındaki personel listesiyle aynı kaynak: istasyona atanmış kişilerden vardiyası seçilmeyenler.
// Bu kişiler iş merkezinin bütün açık vardiyalarında sayılır; kart, seçimin yapılacağı ekrana götürür.
function VardiyasizKisiler() {
  const personel = useQuery({ queryKey: anahtarlar.personel, queryFn: () => api.get<VardiyaPersoneliCevabi>('/vardiya-personeli') });
  return (
    <SayiKarti baslik="Vardiyası seçilmemiş kişi" simge="user" yol="/vardiya/personel" hata={personel.isError}
      sayi={personel.data?.personel.filter((p) => p.vardiyaId === null).length} altMetin="istasyona atanmış, vardiyası yok" />
  );
}

export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'vardiya-secilmeyen', sira: 44, bolum: 'is', islem: 'vardiya.yaz', ekran: VardiyasizKisiler },
  { anahtar: 'vardiya-vardiyam', sira: 44, bolum: 'ozet', islem: 'terminal.uret', ekran: Vardiyam },
  { anahtar: 'vardiya-bugun', sira: 45, bolum: 'ozet', islem: 'sayfa.vardiya', ekran: BugununVardiyasi },
  { anahtar: 'vardiya-planli-durus', sira: 46, bolum: 'ozet', islem: 'sayfa.vardiya', ekran: PlanliDuruslar },
];

export { anaSayfaKaynaklari } from './pano-kaynaklari.tsx';
