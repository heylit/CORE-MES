import type { Plugin } from 'vite';

// Yalnız bileşen adları: büyük harfle başlar ve küçük harf içerir (ESLESTIRME_YOLU gibi sabitler tembel olamaz).
const BILESEN_ADI = /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/;
const ITHAL = /^import\s*\{([^}]*)\}\s*from\s*'(\.{1,2}\/[^']+\.tsx)';[ \t]*$/gm;

// Modülün rotalar.tsx dosyasındaki ekran ithallerini React.lazy'ye çevirir: her ekran ilk açılışında yüklenir, ana paket küçülür.
// Ad, ekran değil de değer olarak da kullanılabilecek bir şey içeren ithal (sabit, işlev, takma ad) olduğu gibi kalır.
// Değişiklik yoksa null döner.
export function tembellestir(kaynak: string): string | null {
  let degisti = false;
  // Tanım ithalin yerine yazılır: rotalar dizisinden önce gelmeli, yoksa dizi kurulurken ad henüz tanımsızdır.
  const cikti = kaynak.replace(ITHAL, (butun, adlar: string, dosya: string) => {
    const liste = adlar.split(',').map((a) => a.trim()).filter((a) => a !== '');
    if (liste.length === 0 || !liste.every((a) => BILESEN_ADI.test(a))) return butun;
    degisti = true;
    return liste.map((ad) => `const ${ad} = __tembel(() => import('${dosya}').then((m) => ({ default: m.${ad} })));`).join('\n');
  });
  return degisti ? `import { lazy as __tembel } from 'react';\n${cikti}` : null;
}

// Yalnız derlenmiş sürümde: geliştirme sunucusu dosyaları zaten tek tek sunar, testler ekranları doğrudan çizer.
export function tembelRotalar(): Plugin {
  return {
    name: 'tmi-tembel-rotalar',
    apply: 'build',
    enforce: 'pre',
    transform(kod, id) {
      if (!/\/src\/moduller\/[^/]+\/rotalar\.tsx$/.test(id.split('?')[0] ?? '')) return null;
      const yeni = tembellestir(kod);
      return yeni === null ? null : { code: yeni, map: null };
    },
  };
}
