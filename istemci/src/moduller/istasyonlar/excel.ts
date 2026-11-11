// Excel ile toplu giriş (2627): iş merkezi, istasyon ve makine tek dosyada; yetkinlik ayrı dosyada. Şablon sayfanın o anki verisinden kurulur.
// Satırlar sayfanın formundaki alanlardır; tesis satırları `/istasyonlar/toplu-kaydet`e, yetkinlik `/kisi-yetkinlikleri/toplu`ya tek komutla gider.
import type {
  IsMerkezi, SurumluIstasyon, SurumluMakine, TesisTopluSatiri, TopluKaydetCevabi,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import { YazimReddi, gonderimNumaralari, sayfaTanimi, type ExcelSutunu, type ExcelTanimi, type ListeSecenegi, type PlanSatiri } from '../../ortak/excel/kurallar.ts';
import type { YazimSonucu } from '../../ortak/excel/ExcelPenceresi.tsx';
import { api } from '../../ortak/veri/api.ts';
import { BAGLANTI_ADLARI, KAPASITE_KAYNAGI_ADLARI, TIP_ADLARI } from './etiketler.ts';
import type { TesisVerisi } from './tesisVerisi.ts';

const sozluktenListe = (s: Record<string, string>): ListeSecenegi[] => Object.entries(s).map(([kod, ad]) => ({ kod, ad }));
const MERKEZ_SAYFASI = 'İş merkezleri';
const ISTASYON_SAYFASI = 'İstasyonlar';
const MAKINE_SAYFASI = 'Makineler';
const kodSutunu: ExcelSutunu = { anahtar: 'kod', baslik: 'Kod', tur: 'kod', zorunlu: true, not: 'Harf ya da rakamla başlar, en çok 24 karakter. Var olan kod satırı güncellemedir.' };
const adSutunu: ExcelSutunu = { anahtar: 'ad', baslik: 'Ad', tur: 'metin', zorunlu: true, enUzun: 120, genislik: 30 };
const aktifSutunu: ExcelSutunu = { anahtar: 'aktif', baslik: 'Aktif', tur: 'evet-hayir', not: 'Boşsa yeni kayıt aktif açılır.' };

export function tesisTanimi(v: TesisVerisi): ExcelTanimi {
  const merkezKodu = new Map(v.merkezler.map((m) => [m.id, m.kod]));
  const istasyonKodu = new Map(v.istasyonlar.map((i) => [i.id, i.kod]));
  const merkezler: ListeSecenegi[] = v.merkezler.filter((m) => m.aktif).map((m) => ({ kod: m.kod, ad: m.ad }));
  const istasyonlar: ListeSecenegi[] = v.istasyonlar.filter((i) => i.aktif).map((i) => ({ kod: i.kod, ad: i.ad }));
  const kisiler: ListeSecenegi[] = (v.kisiler ?? []).filter((k) => k.aktif).map((k) => ({ kod: String(k.id), ad: k.ad }));
  return {
    ad: 'istasyonlar', baslik: 'İş merkezleri, istasyonlar ve makineler',
    kilavuz: [
      'Üç sayfa sırayla yazılır: önce iş merkezleri, sonra istasyonlar, sonra makineler. Aynı dosyada açtığınız iş merkezinin kodunu istasyonda kullanabilirsiniz.',
      'Silme Excel\'den yapılmaz; kaydı pasife almak için Aktif sütununa Hayır yazın.',
    ],
    sayfalar: [
      sayfaTanimi<IsMerkezi>({
        ad: MERKEZ_SAYFASI, kayitTuru: 'is-merkezi', anahtarSutun: 'kod', kayitlar: v.merkezler, anahtar: (m: IsMerkezi) => m.kod,
        sutunlar: [kodSutunu, adSutunu, { anahtar: 'aciklama', baslik: 'Açıklama', tur: 'metin', enUzun: 200, genislik: 40 }, aktifSutunu],
        satir: (m: IsMerkezi) => ({ kod: m.kod, ad: m.ad, aciklama: m.aciklama, aktif: m.aktif }),
      }),
      sayfaTanimi<SurumluIstasyon>({
        ad: ISTASYON_SAYFASI, kayitTuru: 'istasyon', anahtarSutun: 'kod', kayitlar: v.istasyonlar, anahtar: (i: SurumluIstasyon) => i.kod,
        sutunlar: [
          kodSutunu, adSutunu,
          { anahtar: 'isMerkeziKodu', baslik: 'İş merkezi', tur: 'liste', zorunlu: true, liste: merkezler, dosyadakiSayfa: MERKEZ_SAYFASI, genislik: 30 },
          { anahtar: 'tip', baslik: 'Tip', tur: 'liste', liste: sozluktenListe(TIP_ADLARI), not: 'Boşsa Talaşlı.' },
          { anahtar: 'kapasiteKaynagi', baslik: 'Kapasite kaynağı', tur: 'liste', zorunlu: true, liste: sozluktenListe(KAPASITE_KAYNAGI_ADLARI) },
          { anahtar: 'sorumluKisiId', baslik: 'Sorumlu', tur: 'liste', liste: kisiler, genislik: 28 },
          { anahtar: 'uretimAlani', baslik: 'Üretim alanı', tur: 'evet-hayir', not: 'Evet: stokta bu istasyona konum açılır.' },
          aktifSutunu,
        ],
        satir: (i: SurumluIstasyon) => ({
          kod: i.kod, ad: i.ad, isMerkeziKodu: merkezKodu.get(i.isMerkeziId) ?? null, tip: i.tip, kapasiteKaynagi: i.kapasiteKaynagi,
          sorumluKisiId: i.sorumluKisiId === null ? null : String(i.sorumluKisiId), uretimAlani: i.uretimAlani, aktif: i.aktif,
        }),
      }),
      sayfaTanimi<SurumluMakine>({
        ad: MAKINE_SAYFASI, kayitTuru: 'makine', anahtarSutun: 'kod', kayitlar: v.makineler, anahtar: (m: SurumluMakine) => m.kod,
        sutunlar: [
          kodSutunu, adSutunu,
          { anahtar: 'tur', baslik: 'Tür', tur: 'metin', enUzun: 200 },
          { anahtar: 'markaModel', baslik: 'Marka / model', tur: 'metin', enUzun: 200, genislik: 24 },
          { anahtar: 'seriNo', baslik: 'Seri no', tur: 'metin', enUzun: 200 },
          { anahtar: 'istasyonKodu', baslik: 'İstasyon', tur: 'liste', liste: istasyonlar, dosyadakiSayfa: ISTASYON_SAYFASI, genislik: 30, not: 'Boşsa makine istasyonsuz kalır.' },
          // 2902 (madde 6): yeni satırda İstasyon boşken bu iş merkezinde makinenin kodu ve adıyla istasyon açılır.
          { anahtar: 'yeniIstasyonIsMerkeziKodu', baslik: 'Yeni istasyonun iş merkezi', tur: 'liste', liste: merkezler, dosyadakiSayfa: MERKEZ_SAYFASI, genislik: 30,
            not: 'Yalnız yeni makinede ve İstasyon boşken: makine için bu iş merkezinde yeni istasyon açılır.' },
          { anahtar: 'baglantiTuru', baslik: 'Bağlantı türü', tur: 'liste', liste: sozluktenListe(BAGLANTI_ADLARI) },
          { anahtar: 'baglantiAdresi', baslik: 'Bağlantı adresi', tur: 'metin', enUzun: 200, not: 'Yalnız bağlantı türü seçiliyken.' },
          aktifSutunu,
        ],
        satir: (m: SurumluMakine) => ({
          kod: m.kod, ad: m.ad, tur: m.tur, markaModel: m.markaModel, seriNo: m.seriNo, istasyonKodu: m.istasyonId === null ? null : istasyonKodu.get(m.istasyonId) ?? null,
          yeniIstasyonIsMerkeziKodu: null,
          baglantiTuru: m.baglantiTuru, baglantiAdresi: m.baglantiAdresi, aktif: m.aktif,
        }),
      }),
    ],
  };
}

// Plan satırı sözleşmenin satırına çevrilir. Sorumlu listede kişinin kimliğiyle durur; sunucu yine var ve aktif mi diye bakar.
export function tesisSatiri(p: PlanSatiri, satir: number): TesisTopluSatiri {
  const d: Record<string, unknown> = { ...p.degerler };
  if (typeof d['sorumluKisiId'] === 'string') d['sorumluKisiId'] = Number(d['sorumluKisiId']);
  const kayit = p.kayitTuru as TesisTopluSatiri['kayit'];
  if (p.islem === 'ekle') return { kayit, islem: 'ekle', satir, ...d } as TesisTopluSatiri;
  // Yeni istasyon yalnız eklemede açılır; güncelleme satırı bu sütunu taşımaz.
  delete d['yeniIstasyonIsMerkeziKodu'];
  const e = p.eslesen as { id: number; surum: number };
  return { kayit, islem: 'guncelle', satir, id: e.id, surum: e.surum, ...d } as TesisTopluSatiri;
}

export const tesisYaz = (satirlar: readonly PlanSatiri[], istekKimligi: string): Promise<TopluKaydetCevabi> => {
  const no = gonderimNumaralari(satirlar);
  return api.post<TopluKaydetCevabi>('/istasyonlar/toplu-kaydet', { satirlar: satirlar.map((p, i) => tesisSatiri(p, no[i] ?? i + 1)) }, { istekKimligi });
};

// Yetkinlik: kişi başına satır, aktif istasyon (ve makine) başına Evet/Hayır sütunu. Boş hücre değişmez (Veri koşulu 2).
const istasyonAnahtari = (id: number) => `i${String(id)}`;
const makineAnahtari = (id: number) => `m${String(id)}`;
interface YetkinlikSatiri { id: number; ad: string; istasyonIdleri: readonly number[]; makineIdleri: readonly number[] }

export function yetkinlikTanimi(v: TesisVerisi): ExcelTanimi | null {
  if (v.yetkinlikler == null || v.kisiler == null) return null;
  const istasyonlar = v.istasyonlar.filter((i) => i.aktif);
  const makineler = v.makineler.filter((m) => m.aktif && m.istasyonId !== null && istasyonlar.some((i) => i.id === m.istasyonId));
  const Y = new Map(v.yetkinlikler.map((y) => [y.kisiId, y]));
  const kisiler: YetkinlikSatiri[] = v.kisiler.filter((k) => k.aktif)
    .map((k) => ({ id: k.id, ad: k.ad, istasyonIdleri: Y.get(k.id)?.istasyonIdleri ?? [], makineIdleri: Y.get(k.id)?.makineIdleri ?? [] }));
  const kisiSutunu: ExcelSutunu = { anahtar: 'kisi', baslik: 'Kişi', tur: 'liste', zorunlu: true, liste: kisiler.map((k) => ({ kod: String(k.id), ad: k.ad })), genislik: 30 };
  const sayfa = (ad: string, kayitTuru: string, sutunlar: ExcelSutunu[], deger: (k: YetkinlikSatiri, s: ExcelSutunu) => boolean) => sayfaTanimi<YetkinlikSatiri>({
    ad, kayitTuru, anahtarSutun: 'kisi', kayitlar: kisiler, anahtar: (k: YetkinlikSatiri) => String(k.id), ekleme: false as const,
    sutunlar: [kisiSutunu, ...sutunlar],
    satir: (k: YetkinlikSatiri) => Object.fromEntries([['kisi', String(k.id)], ...sutunlar.map((s) => [s.anahtar, deger(k, s)])]) as Record<string, string | boolean>,
  });
  return {
    ad: 'yetkinlik', baslik: 'Yetkinlik',
    kilavuz: [
      'Her satır bir kişidir; istasyon ya da makine sütununa Evet yazarsanız kişi yetkin olur, Hayır yazarsanız yetkinliği kalkar. Boş hücre değişmez.',
      'Makine yetkinliği yalnız kişi o makinenin istasyonunda yetkinse açılır (sayfadaki kural).',
      'Geçerlilik bitişi ve dayanak kişi kartında girilir.',
    ],
    sayfalar: [
      sayfa('İstasyon yetkinliği', 'istasyon-yetkinligi',
        istasyonlar.map((i) => ({ anahtar: istasyonAnahtari(i.id), baslik: i.kod, tur: 'evet-hayir' as const, not: i.ad })),
        (k, s) => k.istasyonIdleri.some((id) => istasyonAnahtari(id) === s.anahtar)),
      sayfa('Makine yetkinliği', 'makine-yetkinligi',
        makineler.map((m) => ({ anahtar: makineAnahtari(m.id), baslik: m.kod, tur: 'evet-hayir' as const, not: m.ad })),
        (k, s) => k.makineIdleri.some((id) => makineAnahtari(id) === s.anahtar)),
    ],
  };
}

export const YETKINLIK_DEGISIKLIK_EN_COK = 2000;
export function yetkinlikGovdesi(satirlar: readonly PlanSatiri[]): { degisiklikler: { kisiId: number; istasyonId: number; yetkin: boolean }[]; makineler: { kisiId: number; makineId: number; yetkin: boolean }[] } {
  const degisiklikler: { kisiId: number; istasyonId: number; yetkin: boolean }[] = [];
  const makineler: { kisiId: number; makineId: number; yetkin: boolean }[] = [];
  for (const p of satirlar) {
    const kisiId = Number(p.degerler['kisi']);
    for (const f of p.farklar) {
      const yetkin = p.degerler[f.alan] === true;
      const id = Number(f.alan.slice(1));
      if (f.alan.startsWith('i')) degisiklikler.push({ kisiId, istasyonId: id, yetkin });
      else makineler.push({ kisiId, makineId: id, yetkin });
    }
  }
  return { degisiklikler, makineler };
}

export async function yetkinlikYaz(satirlar: readonly PlanSatiri[]): Promise<YazimSonucu> {
  const g = yetkinlikGovdesi(satirlar);
  if (g.degisiklikler.length > YETKINLIK_DEGISIKLIK_EN_COK || g.makineler.length > YETKINLIK_DEGISIKLIK_EN_COK) {
    throw new YazimReddi(`Bir seferde en çok ${String(YETKINLIK_DEGISIKLIK_EN_COK)} hücre değişebilir; dosyayı bölün.`);
  }
  await api.post('/kisi-yetkinlikleri/toplu', g);
  return { eklenen: 0, guncellenen: new Set(satirlar.map((p) => p.degerler['kisi'])).size };
}
