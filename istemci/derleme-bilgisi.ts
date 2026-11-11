// Kabuk ve Sistem Ayarları'ndaki sürüm satırı: sürüm package.json'dan, tarih ve commit git'ten ya da ortamdan.
export interface DerlemeBilgisi { surum: string; tarih: string; commit: string | null }

export interface DerlemeKaynaklari {
  env: Record<string, string | undefined>;
  paketSurumu: string;
  // git çıktısı ya da git yoksa null.
  git(argumanlar: string[]): string | null;
  simdi(): Date;
}

// Bilgi ana pakete define ile girer; ana paketin adındaki özet değişirse onu ithal eden bütün tembel parçaların adı da değişir ve
// derleme eski parçaları siler. Derleme anı yazılsaydı aynı kaynaktan her derleme açık sekmeleri "Uygulama güncellendi" uyarısına
// düşürürdü. Bu yüzden tarih commit'in zamanıdır: aynı kaynak aynı adları verir. Derleme anına yalnız git de yoksa düşülür.
export function derlemeBilgisi(k: DerlemeKaynaklari): DerlemeBilgisi {
  const commit = k.env['TMIV2_COMMIT']?.trim() || k.git(['rev-parse', 'HEAD'])?.trim() || null;
  // Güncelleyici kurduğu yayının adını verir (araclar/guncelleyici.ts derlemeOrtami); elle kurulumda package.json sürümü kalır.
  const surum = k.env['TMIV2_SURUM']?.trim() || k.paketSurumu;
  const commitZamani = commit === null ? null : k.git(['show', '-s', '--format=%cI', commit])?.trim() || null;
  const tarih = commitZamani === null || Number.isNaN(Date.parse(commitZamani)) ? k.simdi().toISOString() : new Date(commitZamani).toISOString();
  return { surum, tarih, commit };
}
