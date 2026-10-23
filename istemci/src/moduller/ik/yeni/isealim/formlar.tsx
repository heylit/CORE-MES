import { useId, useMemo, useState, type ReactNode } from 'react';
import { CokSatir, Dugme, FormPenceresi, Girdi, IsaretKutusu, OnayPenceresi, Secim, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { useForm, type AlanHatalari } from '../../../../ortak/veri/form.ts';
import { ikSabitleri, motorKur, type IkSabitleri } from '../motor.ts';
import { adSoyad, paraKisa, tarih } from '../bicim.ts';
import type { IkAyarlar, Kayit, KayitTurleri, Personel, Pozisyon } from '../tipler.ts';
import { useIkDeposu, useIkKomutu, yeniKimlik, type IkDeposu } from '../veri.ts';
import { adayAdi, satirlar, surecteMi } from './kurallar.ts';
import { iseAlimMotoru, type IseAlimMotoru } from './motor-yuzu.ts';
import { bugun, secenekler } from './ortak.tsx';

// Kayıt formları (çerçevedeki SCHEMA): alan listesi veridir, form tek bileşendir. Sistem alanlarını (zaman, yazan) ekran yazmaz.

type FormTuru = 'perf' | 'train' | 'job' | 'cand' | 'intv';
type AlanTipi =
  | 'metin' | 'eposta' | 'tel' | 'cok' | 'tarih' | 'saat' | 'sayi' | 'para' | 'secim' | 'isaret'
  | 'personel' | 'personeller' | 'departman' | 'pozisyon' | 'aday' | 'kanal' | 'puanlar' | 'ismerkezi' | 'soruseti';

interface AlanTanimi {
  k: string;
  l: string;
  t?: AlanTipi;
  bolum?: string;
  zorunlu?: boolean;
  secenek?: (s: IkSabitleri) => readonly string[];
  ipucu?: string;
  // '@bugun', '@yil <metin>' ya da sabit değer; yalnız yeni kayıtta.
  ilk?: unknown;
  puan?: 'perf' | 'intv';
}

const sabit = (l: readonly string[]) => () => l;

const ALANLAR: Readonly<Record<FormTuru, readonly AlanTanimi[]>> = {
  perf: [
    { k: 'empId', l: 'Çalışan', t: 'personel', zorunlu: true }, { k: 'donem', l: 'Dönem', zorunlu: true, ilk: '@yil Yıllık' },
    { k: 'degerlendirenId', l: 'Değerlendiren', t: 'personel' }, { k: 'tarih', l: 'Değerlendirme tarihi', t: 'tarih', ilk: '@bugun' },
    { k: 'skorlar', l: 'Yetkinlik puanları (1 = çok zayıf, 5 = mükemmel)', t: 'puanlar', puan: 'perf' },
    { k: 'hedefler', l: 'Dönem hedefleri ve gerçekleşme', t: 'cok' }, { k: 'guclu', l: 'Güçlü yönler', t: 'cok' },
    { k: 'gelisim', l: 'Gelişim alanları', t: 'cok' }, { k: 'aksiyon', l: 'Aksiyon planı', t: 'cok' },
  ],
  train: [
    { k: 'ad', l: 'Eğitim adı', zorunlu: true }, { k: 'tur', l: 'Tür', t: 'secim', secenek: (s) => s.TRAIN_TYPES, ilk: 'Teknik' },
    { k: 'kurum', l: 'Eğitmen / kurum' }, { k: 'durum', l: 'Durum', t: 'secim', secenek: sabit(['Planlandı', 'Tamamlandı', 'İptal']), ilk: 'Planlandı' },
    { k: 'tarih', l: 'Tarih', t: 'tarih', zorunlu: true }, { k: 'sure', l: 'Süre (saat)', t: 'sayi' },
    { k: 'maliyet', l: 'Toplam maliyet (₺)', t: 'para' }, { k: 'gecerlilik', l: 'Sertifika geçerlilik bitişi', t: 'tarih' },
    { k: 'katilimcilar', l: 'Katılımcılar', t: 'personeller' }, { k: 'aciklama', l: 'Açıklama', t: 'cok' },
  ],
  job: [
    { bolum: 'Kadro', k: 'baslik', l: 'Pozisyon adı', zorunlu: true, ipucu: 'Şirket içindeki unvan.' },
    { bolum: 'Kadro', k: 'departmanId', l: 'Departman', t: 'departman' },
    { bolum: 'Kadro', k: 'isMerkeziId', l: 'İş merkezi', t: 'ismerkezi', zorunlu: true, ipucu: 'Adaylar ve görüşmeler de bu iş merkezinin kapsamındadır.' },
    { bolum: 'Kadro', k: 'adet', l: 'Alınacak kişi sayısı', t: 'sayi', ilk: 1 },
    { bolum: 'Kadro', k: 'gerekce', l: 'Talep nedeni', t: 'secim', secenek: sabit(['Yeni kadro', 'Ayrılan çalışanın yerine', 'Geçici / proje', 'Stajyer']), ilk: 'Yeni kadro' },
    { bolum: 'Kadro', k: 'yerineId', l: 'Yerine alınacak çalışan', t: 'personel' }, { bolum: 'Kadro', k: 'talepEdenId', l: 'Talep eden yönetici', t: 'personel' },
    { bolum: 'Kadro', k: 'sorumluId', l: 'İşe alım sorumlusu', t: 'personel' },
    { bolum: 'Kadro', k: 'durum', l: 'Durum', t: 'secim', secenek: sabit(['Taslak', 'Onay bekliyor', 'Açık', 'Beklemede', 'Kapandı']), ilk: 'Taslak' },
    { bolum: 'Kadro', k: 'acilis', l: 'Açılış tarihi', t: 'tarih', ilk: '@bugun' }, { bolum: 'Kadro', k: 'butce', l: 'Bütçe notu (iç)' },
    { bolum: 'Kadro', k: 'ucretMin', l: 'Ücret aralığı, en az (brüt)', t: 'para' }, { bolum: 'Kadro', k: 'ucretMax', l: 'Ücret aralığı, en çok (brüt)', t: 'para' },
    { bolum: 'İlan', k: 'ilanBaslik', l: 'İlan başlığı', ipucu: 'Adayların arayacağı yaygın unvan. Boşsa pozisyon adı kullanılır.' },
    { bolum: 'İlan', k: 'lokasyon', l: 'Lokasyon', ipucu: 'Boşsa Ayarlar’daki varsayılan lokasyon.' },
    { bolum: 'İlan', k: 'calismaSekli', l: 'Çalışma şekli', t: 'secim', secenek: sabit(['Ofis', 'Hibrit', 'Uzaktan', 'Saha', 'Vardiyalı']), ilk: 'Ofis' },
    { bolum: 'İlan', k: 'calismaTuru', l: 'Çalışma türü', t: 'secim', secenek: sabit(['Tam zamanlı', 'Yarı zamanlı', 'Dönemsel / proje', 'Stajyer', 'Serbest']), ilk: 'Tam zamanlı' },
    { bolum: 'İlan', k: 'deneyim', l: 'Deneyim', t: 'secim', secenek: sabit(['Deneyimsiz', '1 yıl ve üzeri', '2–5 yıl', '5–10 yıl', '10 yıl ve üzeri', 'Belirtilmemiş']) },
    { bolum: 'İlan', k: 'egitimSeviye', l: 'Eğitim seviyesi', t: 'secim', secenek: sabit(['İlköğretim', 'Lise', 'Ön lisans', 'Lisans', 'Yüksek lisans', 'Belirtilmemiş']) },
    { bolum: 'İlan', k: 'ozet', l: 'Pozisyon hakkında', t: 'cok', ipucu: '2–3 cümlelik kısa tanım.' },
    { bolum: 'İlan', k: 'sorumluluklar', l: 'Sorumluluklar', t: 'cok', ipucu: 'Her satıra bir madde.' },
    { bolum: 'İlan', k: 'nitelikler', l: 'Aranan nitelikler', t: 'cok', ipucu: 'Her satıra bir madde; yalnızca olmazsa olmazlar.' },
    { bolum: 'İlan', k: 'tercih', l: 'Tercih sebebi', t: 'cok', ipucu: 'Şart olmayan ama artı sayılan özellikler.' },
    { bolum: 'İlan', k: 'yanHaklar', l: 'Sunduklarımız', t: 'cok', ipucu: 'Boşsa Ayarlar’daki varsayılan yan haklar kullanılır.' },
    { bolum: 'İlan', k: 'ucretGoster', l: 'Ücret aralığını ilanda göster', t: 'isaret' },
    { bolum: 'Başvuru', k: 'sonBasvuru', l: 'Son başvuru tarihi', t: 'tarih' },
    { bolum: 'Başvuru', k: 'ilanKodu', l: 'İlan kodu', ipucu: 'Boşsa otomatik verilir; kanal ekiyle başvuru kaynağını izlemeye yarar.' },
    { bolum: 'Başvuru', k: 'basvuruEposta', l: 'Başvuru e-postası', t: 'eposta', ipucu: 'Boşsa Ayarlar’daki kariyer e-postası.' },
    { bolum: 'Başvuru', k: 'basvuruLink', l: 'Başvuru bağlantısı', ipucu: 'Boşsa kariyer sayfası adresi.' },
    { bolum: 'Mülakat', k: '_qset', l: 'Soru bankasından ekle', t: 'soruseti' },
    { bolum: 'Mülakat', k: 'mulakatSorulari', l: 'Mülakat soru seti', t: 'cok', ipucu: 'Her satıra bir soru. Görüşme değerlendirme formunda görüşmeciye gösterilir.' },
    { bolum: 'Mülakat', k: 'aciklama', l: 'İç notlar', t: 'cok' },
  ],
  cand: [
    { bolum: 'Aday', k: 'ad', l: 'Ad', zorunlu: true }, { bolum: 'Aday', k: 'soyad', l: 'Soyad', zorunlu: true },
    { bolum: 'Aday', k: 'eposta', l: 'E-posta', t: 'eposta' }, { bolum: 'Aday', k: 'telefon', l: 'Telefon', t: 'tel' },
    { bolum: 'Aday', k: 'jobId', l: 'Başvurduğu pozisyon', t: 'pozisyon', zorunlu: true }, { bolum: 'Aday', k: 'il', l: 'Yaşadığı il' },
    { bolum: 'Aday', k: 'kaynak', l: 'Başvuru kaynağı', t: 'kanal' }, { bolum: 'Aday', k: 'refEmpId', l: 'Öneren çalışan', t: 'personel' },
    { bolum: 'Aday', k: 'basvuruTarihi', l: 'Başvuru tarihi', t: 'tarih', ilk: '@bugun' },
    { bolum: 'Aday', k: 'asama', l: 'Aşama', t: 'secim', secenek: (s) => s.STAGES, ilk: 'Başvuru' },
    { bolum: 'Aday', k: 'kvkk', l: 'Aday KVKK aydınlatma metnini onayladı', t: 'isaret' },
    { bolum: 'Profil', k: 'mevcutSirket', l: 'Mevcut / son şirket' }, { bolum: 'Profil', k: 'mevcutPozisyon', l: 'Mevcut / son pozisyon' },
    { bolum: 'Profil', k: 'tecrubeYil', l: 'Toplam deneyim (yıl)', t: 'sayi' },
    { bolum: 'Profil', k: 'egitim', l: 'Eğitim düzeyi', t: 'secim', secenek: sabit(['İlköğretim', 'Lise', 'Ön lisans', 'Lisans', 'Yüksek lisans', 'Doktora']) },
    { bolum: 'Profil', k: 'okul', l: 'Okul ve bölüm' }, { bolum: 'Profil', k: 'yabanciDil', l: 'Yabancı diller' },
    { bolum: 'Profil', k: 'cvLink', l: 'Özgeçmiş veya LinkedIn bağlantısı' }, { bolum: 'Profil', k: 'ozet', l: 'Özgeçmiş özeti', t: 'cok' },
    { bolum: 'Teklif', k: 'maasBeklentisi', l: 'Ücret beklentisi (brüt ₺)', t: 'para' }, { bolum: 'Teklif', k: 'baslayabilir', l: 'En erken başlama tarihi', t: 'tarih' },
    { bolum: 'Teklif', k: 'teklifUcret', l: 'Teklif edilen brüt ücret (₺)', t: 'para' }, { bolum: 'Teklif', k: 'teklifTarihi', l: 'Teklif tarihi', t: 'tarih' },
    { bolum: 'Teklif', k: 'teklifYanit', l: 'Teklif yanıtı', t: 'secim', secenek: sabit(['Bekleniyor', 'Kabul etti', 'Reddetti', 'Pazarlık sürüyor']) },
    { bolum: 'Teklif', k: 'teklifNot', l: 'Teklif detayları (yan haklar, koşullar)', t: 'cok' },
    { bolum: 'Karar', k: 'redNedeni', l: 'Ret nedeni', t: 'secim', secenek: (s) => s.REJECT_REASONS }, { bolum: 'Karar', k: 'notlar', l: 'Genel notlar', t: 'cok' },
  ],
  intv: [
    { bolum: 'Planlama', k: 'candId', l: 'Aday', t: 'aday', zorunlu: true },
    { bolum: 'Planlama', k: 'tur', l: 'Görüşme türü', t: 'secim', secenek: (s) => s.INTV_TYPES, zorunlu: true, ilk: 'İK mülakatı' },
    { bolum: 'Planlama', k: 'tarih', l: 'Tarih', t: 'tarih', zorunlu: true, ilk: '@bugun' }, { bolum: 'Planlama', k: 'saat', l: 'Saat', t: 'saat', ilk: '10:00' },
    { bolum: 'Planlama', k: 'sure', l: 'Süre (dakika)', t: 'sayi', ilk: 45 },
    { bolum: 'Planlama', k: 'sekil', l: 'Görüşme şekli', t: 'secim', secenek: sabit(['Yüz yüze', 'Video görüşme', 'Telefon']), ilk: 'Yüz yüze' },
    { bolum: 'Planlama', k: 'yer', l: 'Yer veya görüşme bağlantısı' },
    { bolum: 'Planlama', k: 'durum', l: 'Durum', t: 'secim', secenek: (s) => s.INTV_STATES, ilk: 'Planlandı' },
    { bolum: 'Planlama', k: 'gorusmeciler', l: 'Görüşmeciler', t: 'personeller' },
    { bolum: 'Değerlendirme', k: 'skorlar', l: 'Yetkinlik puanları (1 = çok zayıf, 5 = mükemmel)', t: 'puanlar', puan: 'intv' },
    { bolum: 'Değerlendirme', k: 'oneri', l: 'Görüşmeci önerisi', t: 'secim', secenek: (s) => s.RECS },
    { bolum: 'Değerlendirme', k: 'guclu', l: 'Güçlü yönler', t: 'cok' }, { bolum: 'Değerlendirme', k: 'zayif', l: 'Gelişime açık yönler / riskler', t: 'cok' },
    { bolum: 'Değerlendirme', k: 'notlar', l: 'Görüşme notları', t: 'cok' },
  ],
};

export const alanlariOf = (tur: FormTuru, bolumler?: readonly string[]): readonly AlanTanimi[] =>
  ALANLAR[tur].filter((a) => bolumler === undefined || bolumler.includes(a.bolum ?? ''));

function ilkDeger(a: AlanTanimi, gun: string): unknown {
  if (a.ilk === '@bugun') return gun;
  if (typeof a.ilk === 'string' && a.ilk.startsWith('@yil')) return gun.slice(0, 4) + a.ilk.slice(4);
  return a.ilk;
}

const bosMu = (v: unknown): boolean => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

export function formIlkDegerleri(tur: FormTuru, kayit: Kayit | null, onDolu: Record<string, unknown>, tekIsMerkezi: number | null, gun: string): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  for (const a of ALANLAR[tur]) {
    if (a.t === 'soruseti') continue;
    d[a.k] = kayit ? kayit[a.k] ?? '' : ilkDeger(a, gun) ?? '';
  }
  if (!kayit && tekIsMerkezi !== null && tur === 'job') d['isMerkeziId'] = tekIsMerkezi;
  return kayit ? d : { ...d, ...onDolu };
}

export function formDogrula(alanlar: readonly AlanTanimi[], d: Record<string, unknown>): AlanHatalari {
  const h: AlanHatalari = {};
  for (const a of alanlar) if (a.zorunlu && bosMu(d[a.k])) h[a.k] = 'Bu alan zorunlu.';
  return h;
}

interface Baglam { depo: IkDeposu; m: IseAlimMotoru; s: IkSabitleri }

const metin = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
const sayiYa = (v: string): number | '' => (v.trim() === '' ? '' : Number(v.replace(',', '.')));

function puanKriterleri(a: AlanTanimi, b: Baglam): string[] {
  return a.puan === 'intv' ? b.m.mulakatKriterleri() : b.m.performansKriterleri();
}

function soruSetleri(b: Baglam): { id: string; ad: string; sorular: string }[] {
  const ayar = b.depo.ayarlar['soruSetleri'];
  const liste = Array.isArray(ayar) ? ayar : (b.s.DEFAULT_SETTINGS['soruSetleri'] as unknown[] | undefined) ?? [];
  return liste.flatMap((q) => {
    if (q === null || typeof q !== 'object') return [];
    const o = q as Record<string, unknown>;
    return [{ id: metin(o['id']), ad: metin(o['ad']), sorular: metin(o['sorular']) }];
  });
}

function AlanCiz({ a, d, degistir, hata, b, kayitKimligi }: {
  a: AlanTanimi; d: Record<string, unknown>; degistir: (y: Record<string, unknown>) => void; hata: string | undefined; b: Baglam; kayitKimligi: string | null;
}) {
  const v = d[a.k];
  const ortak = { etiket: a.l, ...(a.ipucu ? { ipucu: a.ipucu } : {}), ...(hata ? { hata } : {}), required: a.zorunlu ?? false, name: a.k };
  const yaz = (deger: unknown) => { degistir({ [a.k]: deger }); };
  const [seciliSet, seciliSetYaz] = useState('');
  const kimlik = useId();
  switch (a.t ?? 'metin') {
    case 'cok': return <CokSatir {...ortak} value={metin(v)} onChange={(o) => { yaz(o.target.value); }} />;
    case 'tarih': return <Girdi {...ortak} type="date" value={metin(v).slice(0, 10)} onChange={(o) => { yaz(o.target.value); }} />;
    case 'saat': return <Girdi {...ortak} type="time" value={metin(v)} onChange={(o) => { yaz(o.target.value); }} />;
    case 'sayi': case 'para':
      return <Girdi {...ortak} type="number" step={a.t === 'para' ? '0.01' : 'any'} min={a.t === 'para' ? 0 : undefined} inputMode="decimal" value={metin(v)} onChange={(o) => { yaz(sayiYa(o.target.value)); }} />;
    case 'eposta': return <Girdi {...ortak} type="email" value={metin(v)} onChange={(o) => { yaz(o.target.value); }} />;
    case 'tel': return <Girdi {...ortak} type="tel" value={metin(v)} onChange={(o) => { yaz(o.target.value); }} />;
    case 'isaret': return <IsaretKutusu etiket={a.l} name={a.k} checked={v === true} onChange={(o) => { yaz(o.target.checked); }} />;
    case 'secim': {
      const liste = a.secenek?.(b.s) ?? [];
      const s = metin(v);
      return <Secim {...ortak} value={s} bosSecenek="" secenekler={secenekler(s && !liste.includes(s) ? [...liste, s] : liste)} onChange={(o) => { yaz(o.target.value); }} />;
    }
    case 'kanal': {
      const liste = [...new Set([...b.m.kanallar().map((k) => k.ad), 'Referans', 'Üniversite', 'Diğer'])];
      const s = metin(v);
      return <Secim {...ortak} value={s} bosSecenek="" secenekler={secenekler(s && !liste.includes(s) ? [...liste, s] : liste)} onChange={(o) => { yaz(o.target.value); }} />;
    }
    case 'personel': {
      const liste = b.m.siraliPersonel().filter((e) => e.id !== kayitKimligi && (b.m.aktifler().some((x) => x.id === e.id) || e.id === v));
      return <Secim {...ortak} value={metin(v)} bosSecenek="" secenekler={liste.map((e) => ({ deger: e.id, baslik: adSoyad(e) + (e.pozisyon ? ` – ${e.pozisyon}` : '') }))} onChange={(o) => { yaz(o.target.value); }} />;
    }
    case 'departman':
      return <Secim {...ortak} value={metin(v)} bosSecenek="" secenekler={b.m.departmanlar().map((x) => ({ deger: x.id, baslik: x.ad ?? '—' }))} onChange={(o) => { yaz(o.target.value); }} />;
    case 'pozisyon':
      return <Secim {...ortak} value={metin(v)} bosSecenek="" secenekler={b.depo.tur('job').map((j) => ({ deger: j.id, baslik: (j.baslik ?? '—') + (j.durum !== 'Açık' ? ` (${j.durum ?? 'Taslak'})` : '') }))} onChange={(o) => { yaz(o.target.value); }} />;
    case 'aday': {
      const liste = b.depo.tur('cand').filter((c) => surecteMi(c) || c.id === v).sort((x, y) => adayAdi(x).localeCompare(adayAdi(y), 'tr'));
      return <Secim {...ortak} value={metin(v)} bosSecenek="" secenekler={liste.map((c) => ({ deger: c.id, baslik: adayAdi(c) + (c.jobId && b.depo.al(c.jobId) ? ` – ${String(b.depo.al(c.jobId)?.['baslik'] ?? '')}` : '') }))} onChange={(o) => { yaz(o.target.value); }} />;
    }
    case 'ismerkezi': {
      const liste = b.depo.ben.secenekler.isMerkezleri.map((x) => ({ deger: String(x.id), baslik: x.ad + (x.kod ? ` (${x.kod})` : '') }));
      const s = metin(v);
      return <Secim {...ortak} value={s} {...(liste.length === 1 ? {} : { bosSecenek: 'Seçin' })} secenekler={s && !liste.some((x) => x.deger === s) ? [...liste, { deger: s, baslik: s }] : liste} onChange={(o) => { yaz(o.target.value === '' ? '' : Number(o.target.value)); }} />;
    }
    case 'personeller': {
      const secili = new Set(Array.isArray(v) ? (v as string[]) : []);
      const liste = b.m.siraliPersonel().filter((e) => b.m.aktifler().some((x) => x.id === e.id) || secili.has(e.id));
      return (
        <fieldset className="tc-ika-coklu">
          <legend>{a.l}</legend>
          {liste.length === 0 && <p className="tc-ika-not">Aktif çalışan yok.</p>}
          {liste.map((e) => (
            <IsaretKutusu
              key={e.id} etiket={adSoyad(e)} checked={secili.has(e.id)}
              onChange={(o) => { const y = new Set(secili); if (o.target.checked) y.add(e.id); else y.delete(e.id); yaz([...y]); }}
            />
          ))}
        </fieldset>
      );
    }
    case 'puanlar': {
      const puanlar = v !== null && typeof v === 'object' ? (v as Record<string, number>) : {};
      return (
        <fieldset className="tc-ika-puanlar">
          <legend>{a.l}</legend>
          {puanKriterleri(a, b).map((kr, i) => (
            <div key={kr} className="tc-ika-puan-satir" role="radiogroup" aria-label={kr}>
              <span>{kr}</span>
              <span className="tc-ika-puan-secim">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n}>
                    <input type="radio" name={`${kimlik}-${i}`} value={n} checked={puanlar[kr] === n} onChange={() => { yaz({ ...puanlar, [kr]: n }); }} />
                    <span>{n}</span>
                  </label>
                ))}
              </span>
            </div>
          ))}
        </fieldset>
      );
    }
    case 'soruseti': {
      const setler = soruSetleri(b);
      return (
        <div className="tc-ika-soru-ekle">
          <Secim etiket={a.l} value={seciliSet} bosSecenek="Soru seti seçin" secenekler={setler.map((q) => ({ deger: q.id, baslik: `${q.ad} (${satirlar(q.sorular).length} soru)` }))} onChange={(o) => { seciliSetYaz(o.target.value); }} />
          <Dugme
            simge="plus" disabled={!seciliSet}
            onClick={() => {
              const q = setler.find((x) => x.id === seciliSet);
              if (!q) return;
              const var_ = satirlar(d['mulakatSorulari']);
              degistir({ mulakatSorulari: [...var_, ...satirlar(q.sorular).filter((s) => !var_.includes(s))].join('\n') });
            }}
          >Sorulara ekle</Dugme>
        </div>
      );
    }
    default: return <Girdi {...ortak} value={metin(v)} onChange={(o) => { yaz(o.target.value); }} />;
  }
}

export interface KayitFormuOzellikleri<T extends FormTuru> {
  acik: boolean;
  kapat: () => void;
  baslik: string;
  tur: T;
  kayit: KayitTurleri[T] | null;
  onDolu?: Partial<KayitTurleri[T]>;
  // Verilirse yalnız bu bölümler (çerçevedeki bölüm düzenleme); verilmezse tam form.
  bolumler?: readonly string[];
  // Görüşme değerlendirmesinde pozisyonun soru seti gibi, alanların üstünde gösterilen bilgi.
  ust?: ReactNode;
  kaydetMetni?: string;
  oncesi?: (d: KayitTurleri[T]) => KayitTurleri[T];
  sonra?: (d: KayitTurleri[T]) => void | Promise<void>;
  // Var olan kaydın tam formunda (bölüm formu değil) "Sil" vardır; silme iptaldir (IK-18) ve "Geri al" ile döner.
  silindi?: () => void;
  silMetni?: { baslik: string; ileti: string };
  depo: IkDeposu;
  m: IseAlimMotoru;
  s: IkSabitleri;
}

export function KayitFormu<T extends FormTuru>(o: KayitFormuOzellikleri<T>) {
  return o.acik ? <AcikForm {...o} /> : null;
}

function AcikForm<T extends FormTuru>({ kapat, baslik, tur, kayit, onDolu = {}, bolumler: secilen, ust, kaydetMetni, oncesi, sonra, silindi, silMetni, depo, m, s }: KayitFormuOzellikleri<T>) {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const [siliyor, siliyorYaz] = useState(false);
  const alanlar = alanlariOf(tur, secilen);
  const tek = depo.ben.secenekler.isMerkezleri.length === 1 ? depo.ben.secenekler.isMerkezleri[0]?.id ?? null : null;
  const gun = bugun();
  const form = useForm<Record<string, unknown>, KayitTurleri[T]>({
    ilk: formIlkDegerleri(tur, kayit, onDolu as Record<string, unknown>, tek, gun),
    dogrula: (d) => formDogrula(alanlar, d),
    hataIletisi: 'Kayıt yazılamadı.',
    alanEsle: (alan) => alan.replace(/^govde\./, ''),
    kaydet: async (d) => {
      const temel = kayit ?? ({ id: yeniKimlik(tur), kind: tur } as unknown as KayitTurleri[T]);
      let yeni = { ...temel, ...d } as KayitTurleri[T];
      if (tur === 'job' && !yeni['ilanKodu']) yeni = { ...yeni, ilanKodu: m.yeniIlanKodu() };
      if (oncesi) yeni = oncesi(yeni);
      await komut.kaydet(yeni);
      return yeni;
    },
    basarili: (yeni) => { kapat(); void sonra?.(yeni); },
  });
  const bolumler = [...new Set(alanlar.map((a) => a.bolum ?? ''))];
  const b: Baglam = { depo, m, s };
  const sil = async () => {
    if (!kayit) return;
    const once = { ...kayit };
    await komut.iptal(kayit.id);
    siliyorYaz(false);
    kapat();
    bildir('tamam', 'Silindi.', { eylem: { etiket: 'Geri al', yap: () => { void komut.kaydet(once).then(() => { bildir('tamam', 'Kayıt geri getirildi.'); }); } } });
    silindi?.();
  };
  return (
    <>
    <FormPenceresi acik kapat={kapat} baslik={baslik} form={form} {...(kaydetMetni ? { kaydetMetni } : {})}>
      {ust}
      {bolumler.map((bl) => (
        <div key={bl} className="tc-ika-form-bolum">
          {bl && bolumler.length > 1 && <h3>{bl}</h3>}
          {alanlar.filter((a) => (a.bolum ?? '') === bl).map((a) => (
            <AlanCiz key={a.k} a={a} d={form.degerler} degistir={form.degistir} hata={form.hata(a.k)} b={b} kayitKimligi={kayit?.id ?? null} />
          ))}
        </div>
      ))}
      {kayit && secilen === undefined && (
        <div className="tc-ika-form-sil">
          <Dugme tur="tehlike" simge="trash" onClick={() => { siliyorYaz(true); }}>Sil</Dugme>
        </div>
      )}
    </FormPenceresi>
    <OnayPenceresi
      acik={siliyor} baslik={silMetni?.baslik ?? 'Kayıt silinsin mi?'} onayMetni="Sil" tehlikeli yukleniyor={komut.calisiyor}
      onayla={() => { void sil().catch((h: unknown) => { siliyorYaz(false); bildir('hata', hataIletisi(h, 'Kayıt silinemedi.')); }); }} vazgec={() => { siliyorYaz(false); }}
    >
      <p>{silMetni?.ileti ?? 'Kayıt silinecek. Hemen ardından çıkan “Geri al” düğmesiyle geri getirebilirsiniz.'}</p>
    </OnayPenceresi>
    </>
  );
}

// Parçalar arası (P1 "Yerine pozisyon aç"): pozisyon formu ön dolu açılır; kaydedince pozisyon sayfasına geçmek çağıranın işidir.
export interface PozisyonFormuOzellikleri { acik: boolean; onDolu: Partial<Pozisyon>; kapat: () => void; kaydedildi?: (j: Pozisyon) => void }

export function PozisyonFormu({ acik, onDolu, kapat, kaydedildi }: PozisyonFormuOzellikleri) {
  const depo = useIkDeposu();
  const d = depo.data;
  const motor = useMemo(() => (d ? motorKur([...d.kayitlar.values()], d.ayarlar as IkAyarlar) : null), [d]);
  const s = ikSabitleri();
  if (!acik || !d || !motor || !s) return null;
  return (
    <KayitFormu
      acik tur="job" kayit={null} baslik="Pozisyon aç" kapat={kapat} depo={d} m={iseAlimMotoru(motor)} s={s}
      onDolu={{ sonBasvuru: gunSonra(30), ...onDolu }} {...(kaydedildi ? { sonra: kaydedildi } : {})}
    />
  );
}

function gunSonra(n: number): string {
  const t = new Date();
  t.setDate(t.getDate() + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// Bölümün alanları salt okunur (aday dosyasının Profil ve Teklif sekmeleri); boş alan "—".
export function degerMetni(a: Pick<AlanTanimi, 't'>, v: unknown, depo: IkDeposu): ReactNode {
  if (bosMu(v)) return null;
  switch (a.t ?? 'metin') {
    case 'tarih': return tarih(v);
    case 'para': return typeof v === 'number' ? paraKisa(v) : metin(v);
    case 'isaret': return v === true ? 'Evet' : 'Hayır';
    case 'personel': return adSoyad(depo.al(metin(v)) as Personel | null);
    case 'pozisyon': return metin(depo.al(metin(v))?.['baslik']) || '—';
    case 'cok': return <span className="tc-ika-uzun">{metin(v)}</span>;
    default: return metin(v);
  }
}

export function BolumDegerleri({ tur, bolum, kayit, depo }: { tur: FormTuru; bolum: string; kayit: Kayit; depo: IkDeposu }) {
  return (
    <dl className="tc-ika-tanim">
      {alanlariOf(tur, [bolum]).filter((a) => a.t !== 'soruseti').map((a) => (
        <div key={a.k}><dt>{a.l}</dt><dd>{degerMetni(a, kayit[a.k], depo) ?? '—'}</dd></div>
      ))}
    </dl>
  );
}
