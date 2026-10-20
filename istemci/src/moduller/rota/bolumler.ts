import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';

// Merkezin bölümleri: prototipin yan menüsüyle aynı gruplar, sıra ve adlar. Hepsi bu sayfanın içindedir (alt yol);
// başka sayfaya gidilmez. Bölümlerin tanım metinleri prototiptendir.
export interface Bolum {
  anahtar: string;
  yol: string;
  baslik: string;
  simge: SimgeAdi;
  aciklama: string;
  // Hazır değilse bölümde gelecek içerik; hazırsa null.
  sirada: { sira: number; icerik: string[] } | null;
}

export const BOLUMLER: readonly { grup: string; bolumler: readonly Bolum[] }[] = [
  { grup: 'Atölye', bolumler: [
    { anahtar: 'stok', yol: '/rota/stok', baslik: 'Stok', simge: 'box',
      aciklama: 'Eldeki miktar, statülü stok ve hareketler.',
      sirada: null },
  ] },
  { grup: 'Ana veriler', bolumler: [
    { anahtar: 'rotalar', yol: '/rota', baslik: 'Ürün ve rotalar', simge: 'tool', aciklama: '', sirada: null },
    { anahtar: 'operasyonlar', yol: '/rota/operasyonlar', baslik: 'Rota revizyonları', simge: 'edit',
      aciklama: 'Ürün başına yürürlükteki ve açık rota revizyonu. Operasyon kataloğu İstasyonlar > Operasyon tipleri sayfasındadır.',
      sirada: null },
    { anahtar: 'sablonlar', yol: '/rota/sablonlar', baslik: 'Rota şablonları', simge: 'gantt',
      aciklama: 'Yeni rotanın başlangıç adımları; biri varsayılan.',
      sirada: null },
    { anahtar: 'malzemeler', yol: '/rota/malzemeler', baslik: 'Malzemeler', simge: 'cube',
      aciklama: 'Hammadde, sarf ve mamul kartları.',
      sirada: null },
    { anahtar: 'kaynaklar', yol: '/rota/kaynaklar', baslik: 'Kaynaklar', simge: 'cpu',
      aciklama: 'İş merkezleri, istasyonlar, makineler, personel, vardiya saatleri, molalar ve tatiller.',
      sirada: null },
  ] },
];

export const TUM_BOLUMLER: readonly Bolum[] = BOLUMLER.flatMap((g) => g.bolumler);
