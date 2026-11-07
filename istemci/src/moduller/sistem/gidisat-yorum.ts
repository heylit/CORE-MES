import { OLAY_DONGUSU_ESIGI_MS, YANIT_ESIGI_MS, sayiMetni, type Nokta } from './performans.ts';

// Grafiğin altındaki tek cümle (2231): iyi mi, kötü mü, ne yapılır. Yalnız grafikteki veriden ve sunucunun eşiklerinden çıkar;
// ölçü yoksa yorum da "ölçü yok" der, iyi sayılmaz.
export interface Yorum { ton: 'tamam' | 'uyari' | 'pasif'; ozet: string; aciklama: string }

// İşlemci eşiği sunucudaki "İşlemci dolu" kuralıyla aynıdır (saglik kurallar.ts, islemci).
export const ISLEMCI_ESIGI_YUZDE = 90;
// Ana iş parçacığı için sunucuda eşik yok; yorum yalnız "yoğun" der, uyarı açılmaz.
const MESGUL_YUZDE = 70;

const OLCU_YOK: Yorum = { ton: 'pasif', ozet: 'Ölçü yok.', aciklama: 'Bu aralıkta ölçülen değer yok; sunucu kapalıydı ya da yeni açıldı.' };

const dolu = (n: readonly Nokta[]): number[] => n.flatMap((x) => (x.deger === null ? [] : [x.deger]));
const enCok = (n: readonly Nokta[]): number | null => { const d = dolu(n); return d.length === 0 ? null : Math.max(...d); };
const enAz = (n: readonly Nokta[]): number | null => { const d = dolu(n); return d.length === 0 ? null : Math.min(...d); };

export function yanitYorumu(p95: readonly Nokta[]): Yorum {
  const kotu = enCok(p95);
  if (kotu === null) return OLCU_YOK;
  const asan = dolu(p95).filter((d) => d > YANIT_ESIGI_MS).length;
  if (asan === 0) {
    return { ton: 'tamam', ozet: 'Hızlı.', aciklama: `En kötü an ${sayiMetni(kotu)} ms; sınırın (1 saniye) altında. Kullanıcı bekleme hissetmez.` };
  }
  return {
    ton: 'uyari', ozet: `${asan} ölçüde sınır aşıldı.`,
    aciklama: `En kötü an ${sayiMetni(kotu)} ms. Kullanıcılar ekranların geç açıldığını hissetmiş olabilir; o saatlerdeki yavaş işlemlere bakın.`,
  };
}

// Sunucu hatası (5xx) kullanıcının gördüğü hatadır; varsa yoğunluğun önüne geçer.
export function yogunlukYorumu(istek: readonly Nokta[], etiket: (an: Date) => string, sunucuHatasi: number | null): Yorum {
  const tepe = istek.reduce<Nokta | null>((m, n) => (n.deger !== null && (m === null || (m.deger ?? -1) < n.deger) ? n : m), null);
  if (tepe === null || tepe.deger === null) return OLCU_YOK;
  if (sunucuHatasi !== null && sunucuHatasi > 0) {
    return {
      ton: 'uyari', ozet: `${sayiMetni(sunucuHatasi)} istek sunucu hatasıyla bitti.`,
      aciklama: 'Kullanıcı ekranda "beklenmeyen hata" gördü; Koruma durumu sayfasındaki son sunucu hatalarına bakın.',
    };
  }
  if (tepe.deger === 0) return { ton: 'tamam', ozet: 'Kullanım yok.', aciklama: 'Bu aralıkta sunucuya istek gelmedi.' };
  return {
    ton: 'tamam', ozet: `En yoğun an ${etiket(tepe.an)}, ${sayiMetni(tepe.deger)} istek.`,
    aciklama: 'Aynı anda yanıt süresi yükselmediyse sistem bu yükü rahat taşıyor.',
  };
}

export function islemciYorumu(makine: readonly Nokta[], uygulama: readonly Nokta[]): Yorum {
  const m = enCok(makine);
  const u = enCok(uygulama);
  if (m === null) return u === null ? OLCU_YOK : { ton: 'tamam', ozet: `Bu uygulama en çok %${sayiMetni(u)}.`, aciklama: 'Makinenin toplam işlemcisi ölçülemedi.' };
  if (m >= ISLEMCI_ESIGI_YUZDE) {
    return { ton: 'uyari', ozet: 'İşlemci doldu.', aciklama: `En çok %${sayiMetni(m)}; sınır %${ISLEMCI_ESIGI_YUZDE}. Aynı makinede başka bir program çalışıyor olabilir; bilgi işleme sorun.` };
  }
  // Uygulamanın payı küçükse yükü başka program taşıyordur; yönetici bunu bilgi işleme götürür.
  const baskasi = u !== null && u * 2 < m;
  return {
    ton: 'tamam', ozet: 'Rahat.',
    aciklama: baskasi
      ? `İşlemci en çok %${sayiMetni(m)} kullanıldı; bunun %${sayiMetni(u)} kadarı bu uygulamadan, kalanı aynı makinedeki başka programlar.`
      : `İşlemci en çok %${sayiMetni(m)} kullanıldı; sınırın (%${ISLEMCI_ESIGI_YUZDE}) altında.`,
  };
}

// Eşik yalnız toplam bellek bilindiğinde (dakika ölçüsü) vardır; saatlik aralıkta yorum yalnız en az boşu söyler.
export function bellekYorumu(bos: readonly Nokta[], uygulama: readonly Nokta[], esikMb: number | null): Yorum {
  const az = enAz(bos);
  if (az === null) return OLCU_YOK;
  const u = dolu(uygulama).at(-1);
  const uygulamaMetni = u === undefined ? '' : ` Bu uygulama ${sayiMetni(u)} MB kullanıyor.`;
  if (esikMb !== null && az <= esikMb) {
    return { ton: 'uyari', ozet: 'Bellek azaldı.', aciklama: `Makinede boş bellek ${sayiMetni(az)} MB'a indi; sınır ${sayiMetni(esikMb)} MB. Sunucu yavaşlayabilir, bilgi işleme haber verin.` };
  }
  return {
    ton: 'tamam', ozet: 'Yeterli.',
    aciklama: `Makinede en az ${sayiMetni(az)} MB boş kaldı.${uygulamaMetni} Boş bellek azalırken uygulamanınki düz gidiyorsa belleği başka program kullanıyordur.`,
  };
}

export function mesguliyetYorumu(anaIs: readonly Nokta[]): Yorum {
  const tepe = enCok(anaIs);
  if (tepe === null) return OLCU_YOK;
  return {
    ton: tepe < MESGUL_YUZDE ? 'tamam' : 'uyari', ozet: tepe < MESGUL_YUZDE ? 'Boşta.' : 'Yoğun.',
    aciklama: `En çok %${sayiMetni(tepe)} doldu. %100'e yaklaşırsa istekler sıra bekler ve ekranlar yavaşlar; işlemci boş görünse bile.`,
  };
}

export function takilmaYorumu(dongu: readonly Nokta[]): Yorum {
  const tepe = enCok(dongu);
  if (tepe === null) return OLCU_YOK;
  if (tepe < OLAY_DONGUSU_ESIGI_MS) {
    return { ton: 'tamam', ozet: 'Takılma yok.', aciklama: `En uzun takılma ${sayiMetni(tepe)} ms; sınırın (${OLAY_DONGUSU_ESIGI_MS} ms) altında.` };
  }
  return { ton: 'uyari', ozet: 'Sunucu tıkandı.', aciklama: `En uzun takılma ${sayiMetni(tepe)} ms. Ağır bir rapor ya da iş sunucuyu meşgul etti; o saatteki işlere bakın.` };
}

// `bekleyen`: hat bekleyen ya da hat dolu olduğu için reddedilen istek; ölçü yoksa null.
export function hatYorumu(kullanimda: readonly Nokta[], boyut: number | null, bekleyen: number | null): Yorum {
  const tepe = enCok(kullanimda);
  if (tepe === null) return OLCU_YOK;
  if (bekleyen !== null && bekleyen > 0) {
    return { ton: 'uyari', ozet: `${sayiMetni(bekleyen)} istek hat bekledi.`, aciklama: 'Hatlar yetmedi; ekranlarda "sistem meşgul" görülmüş olabilir. Bilgi işlemle hat sayısını konuşun.' };
  }
  return {
    ton: 'tamam', ozet: 'Bol.',
    aciklama: boyut === null ? `Aynı anda en çok ${sayiMetni(tepe)} hat kullanıldı; hat bekleyen istek olmadı.` : `${boyut} hattan en çok ${sayiMetni(tepe)} tanesi aynı anda doldu; hat bekleyen istek olmadı.`,
  };
}

export function girisYorumu(basarili: number, hatali: number): Yorum {
  if (hatali === 0) {
    return { ton: 'tamam', ozet: 'Hatalı giriş yok.', aciklama: basarili === 0 ? 'Son 24 saatte giriş olmadı.' : 'Parola deneyen kimse görünmüyor.' };
  }
  return { ton: 'uyari', ozet: `${hatali} hatalı giriş.`, aciklama: 'Tek tük olması normaldir; bir saatte yığılma varsa Girişler sayfasından kime ait olduğuna bakın.' };
}
