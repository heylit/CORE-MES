/* "Bu paketi stüdyoda aç" çizim sayfasına gider. Rol çizim sayfasını göremiyorsa yönlendirici ilk açık sayfaya (çoğu rolde Operatör)
   atar ve kişi paketten kopar; bu yüzden sayfaya gidilmez, neden açılmadığı söylenir (Akış A provası). */
export const STUDYO_KAPALI = "Çizim stüdyosu bu rolde açık değil · resmi Çizim Merkezi'nden ekleyin";

export const studyoAcilir = (gorur: (sayfa: string) => boolean): boolean => gorur('cizim');
