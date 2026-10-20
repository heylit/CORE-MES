/* Gönderim kuyruğu öğesinin sahibi. Ortak tablette bir kişinin bağlantısızken yaptığı yazma, sonra giren kişinin oturumuyla
   gönderilmemeli: sunucu kişi alanlarını oturumdan yazar, kayıt yanlış kişiye geçer. Öğe yalnız kuyruğa alan kişinin oturumunda
   gönderilir; başkasının oturumunda kuyrukta bekler. Sahipsiz öğe (bu sürümden önce kuyruğa girmiş) eskisi gibi gider. */
export interface SahipliOge { uid?: string }

export function kuyrukGonderilir(oge: SahipliOge, oturumdaki: string | null | undefined): boolean {
  if (oge.uid === undefined) return true;
  return oturumdaki !== null && oturumdaki !== undefined && oge.uid === oturumdaki;
}
