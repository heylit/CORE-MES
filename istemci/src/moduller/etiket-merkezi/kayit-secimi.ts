import type { KayitSecimi, KayitTuru, SablonTuru } from '#paylasilan/sozlesme/etiket-merkezi.ts';

// Sahip ekranlar seçili kayıtları adresle gönderir: ?tur=konum&id=1,2,3 (lot: parti kimliği, istasyon: istasyon kimliği, refakat: üretim emri kimliği, malzeme: kart no,
// mal-kabul: mal kabul belgesi kimliği). Sınırlar sunucudakiyle aynıdır (sözleşme
// değer olarak ithal edilemez; sunucu ayrıca reddeder). Geçersiz adres seçim değildir: örnek değerli sayfa açılır.
const TURLER: readonly KayitTuru[] = ['konum', 'lot', 'istasyon', 'refakat', 'malzeme', 'mal-kabul'];
const EN_COK_KAYIT = 200;
export const KAYIT_BASLIKLARI: Record<KayitTuru, string> = {
  konum: 'Konum etiketleri', lot: 'Lot etiketleri', istasyon: 'İstasyon etiketleri', refakat: 'Refakat kartları', malzeme: 'Malzeme etiketleri',
  'mal-kabul': 'Mal kabul lot etiketleri',
};
// Mal kabul seçimi o kabulün lotlarını lot şablonuyla basar (sunucudaki kayitSablonTuru ile aynı).
export const kayitSablonTuru = (t: KayitTuru): SablonTuru => (t === 'mal-kabul' ? 'lot' : t);
// Etikete ne basıldığı ve kayıt değişince ne yapılacağı.
export const KAYIT_NOTLARI: Record<KayitTuru, string> = {
  konum: 'Etikete stoktaki konum kodu basılır; kod değiştiyse eski etiketi sökün.',
  lot: 'Etikete stoktaki lot bilgisi basılır (lot no, malzeme, parti, giriş).',
  malzeme: 'Etikete kartın adı, stok kodu ve kart no QR kodu basılır.',
  'mal-kabul': 'Seçili mal kabulden açılan her lot için bir etiket basılır (lot no, malzeme, parti, giriş).',
  istasyon: 'Etikete istasyonun stok konum kodu basılır; konumu açılmamış istasyon basılmaz.',
  refakat: 'Karta üretim emrinin refakat kartı bilgisi basılır (emir no, ürün, adet, termin, işlem sırası); iptal emir basılmaz.',
};

export function kayitSecimiOku(adres: URLSearchParams): KayitSecimi | null {
  const tur = TURLER.find((t) => t === adres.get('tur'));
  const parcalar = (adres.get('id') ?? '').split(',').map((p) => p.trim()).filter((p) => p !== '');
  if (!tur || parcalar.length === 0 || parcalar.some((p) => !/^[1-9][0-9]{0,9}$/.test(p))) return null;
  // Yinelenen kimlik bir kez basılır (sunucuyla aynı).
  const idler = [...new Set(parcalar.map(Number))];
  if (idler.some((n) => n > 2147483647) || idler.length > EN_COK_KAYIT) return null;
  return { tur, idler };
}

// Seçim adreste kalır: sayfa yenilenince ya da bağlantı paylaşılınca aynı kayıtlar açılır. Diğer parametrelere dokunulmaz.
export function kayitSecimiYaz(adres: URLSearchParams, secim: KayitSecimi | null): URLSearchParams {
  const yeni = new URLSearchParams(adres);
  if (secim === null || secim.idler.length === 0) { yeni.delete('tur'); yeni.delete('id'); return yeni; }
  yeni.set('tur', secim.tur);
  yeni.set('id', secim.idler.join(','));
  return yeni;
}
