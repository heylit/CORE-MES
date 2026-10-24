import { fmt } from '../bicim.ts';
import { grade, metinAyristir, type KuralBaglami } from '../kurallar/index.ts';
import { kayitTamamla } from '../tipler.ts';

// Prototipin Kılavuz görünümü (39-kilavuz-arayuz, renderKilavuz) metinleri aynen; ekran yalnız çizer.

export const ADIMLAR = [
  { simge: 'magnifier', ad: '1. Ara', alt: 'Malzemeyi yazdığın gibi yaz' },
  { simge: 'shield', ad: '2. Kontrol et', alt: 'Katalogda varsa onu kullan' },
  { simge: 'wrench', ad: '3. Aç', alt: 'Bilgiler dolu gelir, kontrol et' },
  { simge: 'eye', ad: '4. Onaya gönder', alt: 'Sorumlu onaylayınca kart aktif olur' },
] as const;

export const QR_ADIMLARI = [
  { simge: 'barcode', ad: 'Etiketi okut', alt: 'Katalog\'un üstündeki "QR okut" ile kamerayı aç' },
  { simge: 'eye', ad: 'Kartı gör', alt: 'Kod, kalite, ölçü, konum, belgeler' },
  { simge: 'shield', ad: 'Uyarıya dikkat', alt: 'Pasif kart yerine geçen kartı gösterir' },
] as const;

export const TUR_ACIKLAMALARI = [
  { tur: 'hammadde', acik: 'Satın alıp işlediğin ya da olduğu gibi kullandığın malzeme', ornek: '42CrMo4 Ø50 çubuk, 316L 2B sac, PA6 çubuk, EPDM levha' },
  { tur: 'yarimamul', acik: 'Bizde işlem görmüş, bir sonraki üretimde kullanılan parça', ornek: 'Tornalanmış mil, lazerle kesilmiş braket, kaynaklı şase' },
  { tur: 'mamul', acik: 'Satılan ya da sevk edilen son ürün', ornek: 'Hidrolik güç ünitesi, pompa grubu, makine' },
  { tur: 'sarf', acik: 'Üretimde tüketilen, ürüne girmeyen ya da girse de stoklanıp tüketilen malzeme', ornek: 'Kaynak teli, kesme diski, cıvata, eldiven, kesme yağı' },
  { tur: 'demirbas', acik: 'Şirketin kullandığı, tüketilmeyen varlık', ornek: 'CNC torna, kumpas, forklift, dizüstü bilgisayar' },
  { tur: 'hizmet', acik: 'Satın alınan ya da satılan, stoklanmayan iş; reçeteye girmez', ornek: 'Alodin kaplama, hidrojen gevrekliği giderme, fason torna, nakliye' },
  { tur: 'ticari_mal', acik: 'Olduğu gibi alınıp satılan, stoklanan ürün; üretilmez, reçeteye girmez', ornek: 'Rulman, hidrolik hortum, bağlantı elemanı seti, yedek parça' },
] as const;

export type KararTuru = 'yeni' | 'talep' | 'birlestir' | 'pasif';
export const KARARLAR: readonly { durum: string; yap: string; neden: string; tur: KararTuru }[] = [
  { durum: 'Ölçü, kalite, form ya da teslim durumu farklı', yap: 'Yeni kart', neden: 'Başka bir malzemedir; stokta ayrı tutulmalı.', tur: 'yeni' },
  { durum: 'Tedarikçi, sertifika, not, açıklama, depo yeri değişti', yap: 'Değişiklik talebi', neden: 'Aynı malzeme; kart onaylanınca güncellenir.', tur: 'talep' },
  { durum: 'Aktif kartta yanlış girilmiş ölçü (hareket yok)', yap: 'Değişiklik talebi', neden: 'Onaylayan kişi düzeltmeyi kontrol eder.', tur: 'talep' },
  { durum: 'Teknik resim revizyonu, parça eskisinin yerine kullanılabiliyor', yap: 'Değişiklik talebi (revizyon alanı)', neden: 'Form, montaj ve işlev aynıysa kod değişmez.', tur: 'talep' },
  { durum: 'Teknik resim revizyonu, eskisinin yerine kullanılamıyor', yap: 'Yeni kart', neden: 'Eski ve yeni parça karışmamalı.', tur: 'yeni' },
  { durum: 'Aynı malzeme iki kez açılmış', yap: 'Birleştir', neden: 'Asıl kart kalır, diğeri pasife alınır; ERP kodu eşleme listesiyle taşınır.', tur: 'birlestir' },
  { durum: 'Malzeme artık kullanılmıyor', yap: 'Pasife al', neden: 'Kart silinmez; geçmiş belgeler ve hareketler bozulmaz.', tur: 'pasif' },
];

export const IYI_GEREKCE = [
  '"Müşteri X\'e özel; sertifika paketi farklı (EN 10204 3.2)."',
  '"Tedarikçi Y\'nin özel toleranslı malzemesi; standart kartla karışmamalı."',
  '"Savunma projesi için ayrı izlenebilirlik gerekiyor."',
] as const;
export const KOTU_GEREKCE = ['"Farklı."', '"Acil lazım."', '"Diğer kartı bulamadım." (önce ara)'] as const;

export const ARAMA_IPUCLARI = [
  'Kalite için W.Nr, AISI, SUS, EN AW adı ya da eski adlar (ST37, Ck45) kullanılabilir.',
  'Ölçüleri 3x1250x2500, 40*5 ya da Ø50 diye yaz; virgül ve nokta aynı sayılır.',
  'Durum ve yüzey kodları tanınır: 2B, BA, T6, H111, +QT, sıcak hadde, ıslah.',
  'Anlaşılmayan kelimeler ayrıca gösterilir; kart açarken o alanları kendin seç.',
] as const;

export const SIK_HATALAR = [
  { hata: 'Aramadan kart açmak', dogru: 'Her zaman önce arama kutusunu kullan.' },
  { hata: 'Kart adını elle uzun uzun yazmak', dogru: 'Ad seçimlerden oluşur; yalnız gerekiyorsa değiştir.' },
  { hata: 'Ölçüsü farklı malzemeyi değişiklik talebiyle düzeltmek', dogru: 'Ölçü farklıysa yeni karttır.' },
  { hata: 'Kullanılmayan kartı silmek', dogru: 'Pasife al; geçmiş bozulmaz.' },
  { hata: 'Eski ERP kodunu boş bırakmak', dogru: 'İlk yüklemede doldur; eşleştirme ve mükerrer kontrolü bununla yapılır.' },
] as const;

export const ORNEK_METINLER = ['316L 2B 3x1250x2500', '42CrMo4 ø50x6000 sıcak hadde', 'ST37 lama 40x5', '304 boru 48,3x2', '6082 T6 levha 10 mm 1500x3000', 'Delrin çubuk 50'] as const;

export interface AnlasilanParca { ad: string; deger: string }
export interface OrnekSatiri { metin: string; parcalar: AnlasilanParca[] }

// Prototipteki `orn` hesabı: arama kutusunun örnekleri nasıl anladığı (yıldızlı ölçü varsayılandır).
export function ornekSatirlari(b: KuralBaglami): OrnekSatiri[] {
  return ORNEK_METINLER.map((metin) => {
    const p = metinAyristir(metin, b);
    const parcalar: AnlasilanParca[] = [];
    const g = p.grade ? grade(kayitTamamla({ fam: p.fam, cls: p.cls, grade: p.grade }), b) : null;
    if (g) parcalar.push({ ad: 'Kalite', deger: g.ad });
    const form = p.form ? b.t.FORMS[p.form] : undefined;
    if (form) parcalar.push({ ad: 'Form', deger: form.ad });
    if (form && Object.keys(p.dims).length > 0) {
      parcalar.push({ ad: 'Ölçü', deger: form.dims.map(([k]) => fmt(p.dims[k]) + (p.varsayilanOlcu.includes(k) ? '*' : '')).join('×') });
    }
    for (const [k, v] of Object.entries(p.opts)) {
      const o = p.fam ? b.t.FAMS[p.fam]?.opts.find((x) => x.k === k) : undefined;
      parcalar.push({ ad: o ? o.ad.split(' /')[0] ?? o.ad : k, deger: Array.isArray(v) ? v.join(', ') : String(v) });
    }
    return { metin, parcalar };
  });
}
