// Açılışta oturum kişisi sunucunun `/me` cevabıyla tazelenir. Terminal istasyon seçici yetkili istasyonları (`sts`) buradan okur;
// alan düşerse operatör hiçbir istasyonu göremez ("Tanımlı istasyon yok"). Makine seçicisi çalışabildiği makineleri (`mks`, 2046 a) okur;
// `mks` yoksa (null) süzmez.
interface MeCevabi<R> { id: string; name: string; role: R; wcs?: string[] | null; st?: string | null; sts?: string[] | null; mks?: string[] | null }

export function oturumKisisi<R>(me: MeCevabi<R>): { id: string; name: string; role: R; wcs: string[]; st: string | null; sts: string[]; mks: string[] | null } {
  return { id: me.id, name: me.name, role: me.role, wcs: me.wcs || [], st: me.st ?? null, sts: me.sts || [], mks: me.mks ?? null };
}
