// Excel ile toplu giriş (2627): Personel sayfasının "Kişi ekle" formundaki alanlar (ad, sicil no, görev). Rol, hesap, parola ve PIN
// toplu girişe girmez (yetki modeli; sayfada tek tek). Var olan kişi yalnız sicil no ile bulunur, adla eşleştirilmez: sicilsiz satır yeni kişidir.
import type { KisiOzeti, KisiTopluKaydetCevabi, KisiTopluSatiri } from '#paylasilan/sozlesme/kisiler.ts';
import { sayfaTanimi, type ExcelTanimi, type PlanSatiri } from '../../ortak/excel/kurallar.ts';
import { api } from '../../ortak/veri/api.ts';

export const KISI_SAYFASI = 'Kişiler';

export function kisiTanimi(kisiler: readonly KisiOzeti[]): ExcelTanimi {
  const sicilli = kisiler.filter((k): k is KisiOzeti & { sicilNo: string } => k.sicilNo !== null);
  return {
    ad: 'kisiler', baslik: 'Personel',
    kilavuz: [
      'Her satır bir kişidir. Sicil no var olan bir kişininkiyse satır o kişiyi günceller; sicil no boş ya da yeni ise yeni kişi açılır.',
      'Kişi adla eşleştirilmez: aynı adda iki kişi olabilir. Var olan kişiyi güncellemek için sicil numarasını yazın.',
      'Güncellemede boş hücre değişmez. Rol, giriş hesabı, parola ve PIN kişinin satırından tek tek verilir.',
      'Özlüğü İK personel kartından gelen kişinin ad, sicil no ve görevi burada değişmez; İK\'da değiştirin.',
    ],
    sayfalar: [sayfaTanimi<KisiOzeti & { sicilNo: string }>({
      ad: KISI_SAYFASI, kayitTuru: 'kisi', anahtarSutun: 'sicilNo', kayitlar: sicilli, anahtar: (k) => k.sicilNo,
      sutunlar: [
        { anahtar: 'sicilNo', baslik: 'Sicil no', tur: 'metin', enUzun: 200, not: 'Var olan sicil no satırı günceller; boşsa yeni kişi açılır.' },
        { anahtar: 'ad', baslik: 'Ad soyad', tur: 'metin', zorunlu: true, enUzun: 200, genislik: 32 },
        { anahtar: 'gorev', baslik: 'Görev', tur: 'metin', enUzun: 200, genislik: 28 },
      ],
      satir: (k) => ({ sicilNo: k.sicilNo, ad: k.ad, gorev: k.gorev }),
      kilitli: (k) => (k.ozlukIk
        ? 'Bu kişinin ad, sicil no ve görevi İK personel kartından gelir; İK\'da değiştirin.'
        : k.korumali ? 'Bu kişinin kaydını düzenleme yetkiniz yok.' : null),
    })],
  };
}

// Plan satırı sözleşmenin satırına çevrilir; güncellemede yalnız dolu hücreler gider.
export function kisiSatiri(p: PlanSatiri, satir: number): KisiTopluSatiri {
  const d = p.degerler as { ad?: string; sicilNo?: string; gorev?: string };
  if (p.islem === 'ekle') return { islem: 'ekle', satir, ad: d.ad ?? '', sicilNo: d.sicilNo ?? null, gorev: d.gorev ?? null };
  // Sicil no eşleşme anahtarıdır, güncellemede gönderilmez (hücrede harf farkıyla yazılmış olabilir).
  const e = p.eslesen as KisiOzeti;
  const { sicilNo: _anahtar, ...alanlar } = d;
  return { islem: 'guncelle', satir, id: e.id, surum: e.surum, ...alanlar };
}

export const kisiYaz = (satirlar: readonly PlanSatiri[], istekKimligi: string): Promise<KisiTopluKaydetCevabi> =>
  api.post<KisiTopluKaydetCevabi>('/kisiler/toplu-kaydet', { satirlar: satirlar.map((p, i) => kisiSatiri(p, i + 1)) }, { istekKimligi });
