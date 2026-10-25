// Prototipin MA_MENU sırası. "Değişiklik kaydı" yok (210.3); prototipin "Ayarlar" penceresi üst baştaki düğmeden açılır, burada bölüm değildir.
export const AYAR_MENUSU = [
  { baslik: '', bolumler: [{ anahtar: 'ozet', ad: 'Genel bakış' }] },
  {
    baslik: 'Hammadde',
    bolumler: [
      { anahtar: 'aile', ad: 'Aileler ve sınıflar' }, { anahtar: 'kalite', ad: 'Kaliteler' }, { anahtar: 'ozellik', ad: 'Teknik özellikler' },
      { anahtar: 'durum', ad: 'Durum ve işlem seçenekleri' }, { anahtar: 'varsayilan', ad: 'Sınıf varsayılanları' }, { anahtar: 'tol', ad: 'Tolerans normları' },
    ],
  },
  { baslik: 'Tüm türler', bolumler: [{ anahtar: 'kural', ad: 'Ad, açıklama ve zorunlu alanlar' }] },
  {
    baslik: 'Diğer türler',
    bolumler: [
      { anahtar: 'ym', ad: 'Yarı mamul alanları' }, { anahtar: 'mm', ad: 'Mamul alanları' },
      { anahtar: 'sarf', ad: 'Sarf kategorileri' }, { anahtar: 'db', ad: 'Demirbaş kategorileri' },
    ],
  },
  {
    baslik: 'Genel listeler',
    bolumler: [{ anahtar: 'sertifika', ad: 'Sertifikalar' }, { anahtar: 'birim', ad: 'Stok birimleri' }, { anahtar: 'belge', ad: 'Belge türleri' }],
  },
  { baslik: 'Yönetim', bolumler: [{ anahtar: 'roller', ad: 'Roller ve yetkiler' }] },
] as const;

export type AyarBolumu = (typeof AYAR_MENUSU)[number]['bolumler'][number]['anahtar'];

const ANAHTARLAR: readonly string[] = AYAR_MENUSU.flatMap((g) => g.bolumler.map((b) => b.anahtar));

// Bilinmeyen ya da boş bölüm Genel bakış'a düşer.
export const gecerliBolum = (b: string | null): AyarBolumu => (b && ANAHTARLAR.includes(b) ? b as AyarBolumu : 'ozet');
