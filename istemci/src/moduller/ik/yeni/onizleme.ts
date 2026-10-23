// "Başka bir gözle görüntüle": İK, bir çalışanın ya da yöneticinin İK İşlemlerim ekranını onun gözüyle görür. Önizleme salt okunurdur
// (210.6): bugünkü çerçevede önizlemede yapılan işlem gerçek kayıt oluşturuyordu.
export interface IkOnizleme {
  rol: 'calisan' | 'yonetici';
  // Önizlenen personel kaydı.
  personel: string;
}

export const ONIZLEME_ILETISI = 'Önizleme salt okunurdur; burada kayıt değişmez.';
