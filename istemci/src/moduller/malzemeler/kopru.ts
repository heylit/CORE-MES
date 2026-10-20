import type {
  FirmaSecenekleriCevabi, KatalogAyarlariCevabi, KatalogKartiKaydetCevabi, KatalogKartiRotasiCevabi, KatalogKartlariCevabi, KatalogSablonlariCevabi, KatalogSurumluKayitCevabi,
} from '#paylasilan/sozlesme/malzemeler.ts';
import type { SablonlarCevabi } from '#paylasilan/sozlesme/rota.ts';
import type { MalzemeKgFiyatlariCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import type { MalzemeKartBilgileriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { api } from '../../ortak/veri/api.ts';

// Prototipin gömülü modu (kanal "hammadde") istekleri TMI uçlarına çevrilir. Kural sunucudadır; köprü yalnız taşır.
// Çerçeve yalıtılmıştır ve TMI adına yalnız buradaki sabit istekleri yaptırabilir: yol ve yöntem burada yazılıdır,
// çerçeveden yalnız istek adı, kimlik ve gövde gelir.
export type KopruIsleyici = (tip: string, veri: unknown) => Promise<unknown>;

interface Baglam {
  kullanici: { id: number; ad: string };
  tema: 'acik' | 'koyu';
}

type Nesne = Record<string, unknown>;

// Kimlik yolun tek parçasıdır. Nokta parçasını tarayıcı adresten düşürür (".." bir üst yola çıkar): çerçeveden gelen
// kimlik isteği başka bir uca taşıyamamalı.
function yolParcasi(kimlik: unknown): string {
  const metin = String(kimlik);
  if (metin === '' || metin === '.' || metin === '..') throw new Error('Geçersiz kimlik.');
  return encodeURIComponent(metin);
}

type StokBilgisi = MalzemeKartBilgileriCevabi['satirlar'][number];

// DEP-60 (A7, #516): sipariş noktası (stoktaki kritik seviye) ve depo yeri (stoktaki varsayılan konum) stoktan gösterilir.
// Stok okunamazsa katalog yine açılır; kartlar kendi değerleriyle gelir.
async function stokBilgileri(): Promise<Map<string, StokBilgisi>> {
  const sonuc = new Map<string, StokBilgisi>();
  for (let sayfa = 1; sayfa <= 200; sayfa += 1) {
    const c = await api.get<MalzemeKartBilgileriCevabi>(`/stok/malzeme-kart-bilgileri?sayfa=${sayfa}&sayfaBoyu=500`);
    for (const x of c.satirlar) if (x.kartKimligi !== null) sonuc.set(x.kartKimligi, x);
    if (c.satirlar.length < c.sayfaBoyu || (c.toplam !== null && sayfa * c.sayfaBoyu >= c.toplam)) break;
  }
  return sonuc;
}
const sadeMiktar = (m: string): string => m.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
// Stokta konum yoksa kartın eski depo yeri metni kalır (silinmez); sipariş noktası yalnız stoktan gelir.
export function stokluKayit(kayit: Nesne, bilgi: StokBilgisi | undefined): Nesne {
  const g = { ...((kayit['g'] ?? {}) as Nesne) };
  delete g['siparisNoktasi'];
  if (bilgi?.kritikSeviye != null) g['siparisNoktasi'] = sadeMiktar(bilgi.kritikSeviye);
  if (bilgi?.varsayilanKonum != null) g['depoYeri'] = bilgi.varsayilanKonum;
  return { ...kayit, g };
}

// Kart listesi sayfa sayfa okunur: tek cevap birkaç yüz KB'ı aşmaz, sunucu büyük cevabı tek seferde hazırlamaz. Prototip bütün
// kartlarla çalıştığı için (arama, süzgeç, mükerrer, dışa aktarma) sayfalar burada birleşir. İptal kart gövdesiz gelir, ekrana gitmez.
export const KART_SAYFA_BOYU = 200;

type KartKaydi = { no: number; kayit: Nesne; surum: number };

// Kartın birim fiyatı satın almanın kg fiyatındandır (kullanıcı isteği 19.10.2026). Fiyat karta yazılmaz, yalnız ekranda gösterilir.
// Uç satın alma ya da maliyet okuma yetkisi ister: yetkisi olmayan rolde ya da uç okunamazsa sonuç null'dır ve ekran satırı hiç çizmez;
// yetkili rolde fiyatı olmayan kart haritada yoktur, ekran boş tutarı "—" yazar. Sorulacak kart yoksa yetki bilinmez: null.
export type KgFiyati = Pick<MalzemeKgFiyatlariCevabi['malzemeler'][number], 'kgFiyati' | 'birimFiyati' | 'paraBirimi' | 'gecerlilik'>;
const KG_FIYATI_PARCASI = 200;
const hammaddeMi = (kayit: Nesne): boolean => kayit['tur'] === undefined || kayit['tur'] === null || kayit['tur'] === '' || kayit['tur'] === 'hammadde';

async function kgFiyatlari(kartlar: readonly { kimlik: string; no: number }[]): Promise<{ fiyatlar: Record<string, KgFiyati> } | null> {
  const kimlikler = new Map(kartlar.map((k) => [k.no, k.kimlik]));
  const nolar = [...kimlikler.keys()];
  if (nolar.length === 0) return null;
  const sonuc: Record<string, KgFiyati> = {};
  try {
    for (let i = 0; i < nolar.length; i += KG_FIYATI_PARCASI) {
      const c = await api.get<MalzemeKgFiyatlariCevabi>(`/satin-alma-kg-fiyatlari/malzemeler?nolar=${nolar.slice(i, i + KG_FIYATI_PARCASI).join(',')}`);
      for (const m of c.malzemeler) {
        const kimlik = kimlikler.get(m.malzemeNo);
        if (kimlik !== undefined) sonuc[kimlik] = { kgFiyati: m.kgFiyati, birimFiyati: m.birimFiyati, paraBirimi: m.paraBirimi, gecerlilik: m.gecerlilik };
      }
    }
  } catch {
    return null;
  }
  return { fiyatlar: sonuc };
}

// Oturum önbelleği (kullanıcı kararı, #1323 "Önbellek"): kartlar sayfa yeniden açılınca baştan inmez; sunucudan yalnız son okumadan
// sonra değişenler istenir. Bellektedir: sayfa yenilenince ya da başka kişi girince baştan okunur.
let onbellek: { kisiId: number; an: string; kartlar: Map<string, KartKaydi> } | null = null;
export function kartOnbelleginiBosalt(): void { onbellek = null; }

export async function butunKartlar(kisiId: number): Promise<KartKaydi[]> {
  const eski = onbellek?.kisiId === kisiId ? onbellek : null;
  const kartlar = new Map(eski?.kartlar ?? []);
  const sonra = eski === null ? '' : `&${new URLSearchParams({ sonra: eski.an }).toString()}`;
  let an: string | null = null;
  for (let sayfa = 1; sayfa <= 10_000; sayfa += 1) {
    const c = await api.get<KatalogKartlariCevabi>(`/malzeme-katalogu-kartlari?sayfa=${sayfa}&sayfaBoyu=${KART_SAYFA_BOYU}${sonra}`);
    // İlk sayfanın anı en eskisidir: sayfalar arasında yazılan kart bir sonraki okumada yine gelir.
    an ??= c.an;
    for (const x of c.satirlar) {
      if (x.kayit === null) kartlar.delete(x.kimlik);
      else kartlar.set(x.kimlik, { no: x.no, kayit: x.kayit, surum: x.surum });
    }
    if (c.satirlar.length < c.sayfaBoyu || (c.toplam !== null && c.sayfa * c.sayfaBoyu >= c.toplam)) break;
  }
  if (an !== null) onbellek = { kisiId, an, kartlar };
  return [...kartlar.values()];
}

export function kopruKur(b: Baglam): KopruIsleyici {
  // Kartın son okunan sürümü: başkası arada yazmışsa sunucu 409 verir, prototip iletisini gösterir.
  const surumler = new Map<string, number>();
  // Son okunan listedeki kartların no'su: Etiket Merkezi kartı no ile açar (269 a).
  const kartNolari = new Map<string, number>();
  // Şablon ve ayar da son okunan sürümle yazılır; arada başkası yazmışsa 409 döner, ekran yeniden yüklemeyi söyler.
  const sablonSurumleri = new Map<string, number>();
  const ayarSurumleri = new Map<string, number>();
  // Ekran aynı ayarı art arda, beklemeden gönderebilir; aynı sekmenin iki kaydı birbirini eski sürüm saymasın diye sırayla gider.
  const ayarSirasi = new Map<string, Promise<unknown>>();
  // Son okunan listedeki hammadde kartları: kg fiyatı kartın sayı kimliğiyle sorulur.
  let hammaddeler: { kimlik: string; no: number }[] = [];
  return async (tip, veri) => {
    switch (tip) {
      case 'hazir': {
        const a = await api.get<KatalogAyarlariCevabi>('/malzeme-katalogu-ayarlari');
        ayarSurumleri.clear();
        for (const [anahtar, surum] of Object.entries(a.surumler)) if (surum !== null) ayarSurumleri.set(anahtar, surum);
        return {
          kullanici: b.kullanici,
          rol: a.rol,
          saltOkunur: a.rol === null,
          tema: b.tema,
          etiket: 'Kartlar TMI veritabanında',
          belgeler: false,
          sablonlar: true,
          rotaSablonlari: true,
          ayarlarSunucuda: true,
          ayarKaydedilir: a.ayarYazabilir,
          malzemeAyarlari: a.malzeme ?? {},
          operasyonTanimlari: a.operasyonlar,
          // MKK-18: liste yalnız istasyonlardan gelir ve salt okunurdur; boş liste de dışarıdan sayılır, prototipin kendi listesi açılmaz (kart #544).
          operasyonlar: a.operasyonTipleri.map((o) => ({ kod: o.kod, ad: o.ad, grup: o.grup, grupAdi: o.grupAdi, fason: o.grup === 'FAS', aktif: o.aktif })),
          operasyonKaynagi: 'İstasyonlar > Operasyon tipleri',
          // DEP-60: kartın depo yeri stoktan gelir; kartta salt okunur.
          depoYeriStoktan: true,
          genel: { ...(a.genel ?? {}), dortGoz: a.dortGoz },
          // Dört göz Sistem Ayarları'ndan gelir; prototipte değiştirilemez.
          onay: { dortGoz: a.dortGoz },
        };
      }
      case 'liste': {
        const [kartlar, stok] = await Promise.all([butunKartlar(b.kullanici.id), stokBilgileri().catch(() => null)]);
        surumler.clear();
        kartNolari.clear();
        hammaddeler = [];
        for (const k of kartlar) {
          surumler.set(String(k.kayit['id']), k.surum);
          kartNolari.set(String(k.kayit['id']), k.no);
          if (hammaddeMi(k.kayit)) hammaddeler.push({ kimlik: String(k.kayit['id']), no: k.no });
        }
        return kartlar.map((k) => (stok ? stokluKayit(k.kayit, stok.get(String(k.kayit['id']))) : k.kayit));
      }
      case 'kg-fiyatlari':
        return kgFiyatlari(hammaddeler);
      // 233 a: rotası olan kartın Operasyonlar ve Reçete adımı salt okunur çizilir. Okunamazsa null: ekran düzenlemeyi açık bırakır, sunucu yine reddeder.
      case 'kart-no':
        return typeof veri === 'string' ? kartNolari.get(veri) ?? null : null;
      case 'kart-rotasi': {
        if (typeof veri !== 'string' || !surumler.has(veri)) return null;
        return api.get<KatalogKartiRotasiCevabi>(`/malzeme-katalogu-kartlari/${yolParcasi(veri)}/rota`).catch(() => null);
      }
      case 'kaydet': {
        const { kayit, ozet } = veri as { kayit: Nesne; ozet: Nesne };
        const id = String(kayit['id']);
        const govde = {
          kayit,
          ozet: {
            stok_kodu: ozet['stok_kodu'] ?? null, tur: ozet['tur'], onay_durumu: ozet['onay_durumu'],
            benzersiz_anahtar: ozet['benzersiz_anahtar'] ?? null, mukerrer_gerekcesi: ozet['mukerrer_gerekcesi'] ?? null,
            ...(Array.isArray(ozet['uygulanmayan_zorunlu']) ? { uygulanmayan_zorunlu: ozet['uygulanmayan_zorunlu'] } : {}),
            // Ekranın hesapladığı ağırlık ve adlar (208 a); kg fiyatından birim fiyat sunucuda bunlarla bulunur. Yalnız gerçek değer geçer.
            birim_agirlik_kg: typeof ozet['birim_agirlik_kg'] === 'number' && ozet['birim_agirlik_kg'] > 0 ? ozet['birim_agirlik_kg'] : null,
            kalite_adi: typeof ozet['kalite_adi'] === 'string' ? ozet['kalite_adi'] : null,
            form_adi: typeof ozet['form_adi'] === 'string' ? ozet['form_adi'] : null,
            // Ekranın Açıklama 1, 2, 3'ü (334 a); Logo'ya gider.
            aciklama_1: typeof ozet['aciklama_1'] === 'string' ? ozet['aciklama_1'] : null,
            aciklama_2: typeof ozet['aciklama_2'] === 'string' ? ozet['aciklama_2'] : null,
            aciklama_3: typeof ozet['aciklama_3'] === 'string' ? ozet['aciklama_3'] : null,
          },
          surum: surumler.get(id) ?? null,
        };
        const c = await api.post<KatalogKartiKaydetCevabi>(`/malzeme-katalogu-kartlari/${yolParcasi(id)}/kaydet`, govde);
        surumler.set(id, c.surum);
        return { id: c.id, stok_kodu: c.stok_kodu };
      }
      case 'sil': {
        const id = String(veri);
        await api.post(`/malzeme-katalogu-kartlari/${yolParcasi(id)}/iptal`);
        surumler.delete(id);
        return true;
      }
      case 'sablon-liste': {
        const c = await api.get<KatalogSablonlariCevabi>('/malzeme-katalogu-sablonlari');
        sablonSurumleri.clear();
        for (const [kimlik, surum] of Object.entries(c.surumler)) sablonSurumleri.set(kimlik, surum);
        return { sablonlar: c.sablonlar, kaldirabilir: c.kaldirabilir };
      }
      case 'sablon-kaydet': {
        const sablon = veri as Nesne;
        const id = String(sablon['id']);
        const c = await api.post<KatalogSurumluKayitCevabi>(`/malzeme-katalogu-sablonlari/${yolParcasi(id)}/kaydet`, { sablon, surum: sablonSurumleri.get(id) ?? null });
        sablonSurumleri.set(id, c.surum);
        return true;
      }
      case 'sablon-sil':
        await api.post(`/malzeme-katalogu-sablonlari/${yolParcasi(veri)}/kaldir`);
        sablonSurumleri.delete(String(veri));
        return true;
      case 'rota-sablon-liste':
        // Rota şablonları Rota modülündedir (kart #688); kart yalnız sıra, kod ve adın kopyasını alır.
        return (await api.get<SablonlarCevabi>('/rota/sablonlar')).sablonlar.map((s) => ({
          id: s.id, ad: s.ad, varsayilan: s.varsayilan,
          adimlar: [...s.adimlar].sort((a, b) => a.sira - b.sira).map((a) => ({ kod: a.operasyonTipi.kod, ad: a.ad || a.operasyonTipi.ad })),
        }));
      case 'ayar-kaydet': {
        const { anahtar, deger } = veri as { anahtar: string; deger: Nesne };
        const yaz = async () => {
          const c = await api.post<KatalogSurumluKayitCevabi>(`/malzeme-katalogu-ayarlari/${yolParcasi(anahtar)}/kaydet`, { deger, surum: ayarSurumleri.get(anahtar) ?? null });
          ayarSurumleri.set(anahtar, c.surum);
        };
        const sira = (ayarSirasi.get(anahtar) ?? Promise.resolve()).catch(() => undefined).then(yaz);
        ayarSirasi.set(anahtar, sira);
        await sira;
        return true;
      }
      case 'firma-ara': {
        // Tedarikçi seçimi (kart #466): yalnız arama metni geçer; yol burada sabit.
        const ara = String((veri as { ara?: unknown } | null)?.ara ?? '');
        const c = await api.get<FirmaSecenekleriCevabi>(`/malzeme-firma-secenekleri?${new URLSearchParams({ ara }).toString()}`);
        return c.firmalar;
      }
      case 'ayar-kaydi-liste':
        // Ayar değişiklikleri TMI denetim kaydındadır; prototipin kendi listesi boş gösterilir.
        return [];
      case 'belge-yukle':
      case 'belge-sil':
        throw new Error('Bu kurulumda belge saklama yok.');
      default:
        throw new Error(`Bilinmeyen istek: ${tip}`);
    }
  };
}
