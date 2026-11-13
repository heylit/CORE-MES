import type { TalimatlarCevabi } from '#paylasilan/sozlesme/rota.ts';
import { AZAMI_ADIM_MEDYASI, girdiyeCevir, taslagaCevir } from '../sartnameler/kurallar.ts';
import type { TalimatKomutu } from '../sartnameler/veri.ts';

// Adım videosu (3209 a): sahne tarayıcıda bir tur oynatılıp MP4 kaydedilir ve talimat taslağının o adımına video medyası olarak eklenir.
// Sunucu talimat videosunu yalnız MP4 olarak kabul eder; tarayıcı MP4 kaydedemiyorsa düğme nedeniyle kapalıdır (WebM yüklenmez).

export const VIDEO_TURU = 'video/mp4';
export const VIDEO_KARE = 30;

export function videoDesteklenirMi(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function' && MediaRecorder.isTypeSupported(VIDEO_TURU);
}

export function tuvalKaydet(tuval: HTMLCanvasElement, sureMs: number): Promise<Blob> {
  return new Promise((coz, reddet) => {
    const akis = tuval.captureStream(VIDEO_KARE);
    const kayit = new MediaRecorder(akis, { mimeType: VIDEO_TURU });
    const parcalar: Blob[] = [];
    kayit.ondataavailable = (o) => { if (o.data.size > 0) parcalar.push(o.data); };
    kayit.onerror = () => { akis.getTracks().forEach((t) => { t.stop(); }); reddet(new Error('Video kaydı durdu.')); };
    kayit.onstop = () => { akis.getTracks().forEach((t) => { t.stop(); }); coz(new Blob(parcalar, { type: VIDEO_TURU })); };
    kayit.start();
    setTimeout(() => { if (kayit.state !== 'inactive') kayit.stop(); }, sureMs);
  });
}

// Videonun ekleneceği taslak: açık taslak yoksa yayındaki sürümden yeni taslak. Açık taslak bu sürümden açılmamışsa ya da adım sayısı
// değiştiyse hangi adıma ekleneceği belli değildir: null döner, kullanıcı videoyu talimat düzenleyicisinden ekler.
export function videoluTaslak(
  liste: TalimatlarCevabi, talimatSurum: number, adimNo: number, opNo: number, medya: { ozet: string; ad: string },
): { komut: TalimatKomutu } | { hata: string } {
  const son = liste.surumler[0] ?? null;
  if (son === null || son.surum !== talimatSurum) return { hata: 'Bu arada talimatın yeni sürümü yayınlandı; stüdyoyu kapatıp yeniden açın.' };
  const taslak = liste.taslak;
  if (taslak !== null && (taslak.tabanSurum !== talimatSurum || taslak.adimlar.length !== son.adimlar.length)) {
    return { hata: 'Açık talimat taslağı bu sürümden farklı; videoyu talimat düzenleyicisinden ekleyin.' };
  }
  const adimlar = (taslak ?? son).adimlar.map(taslagaCevir);
  const hedef = adimlar[adimNo];
  if (hedef === undefined) return { hata: 'Adım talimatta bulunamadı.' };
  if (hedef.medya.length >= AZAMI_ADIM_MEDYASI) return { hata: `Bu adımda en çok ${String(AZAMI_ADIM_MEDYASI)} resim ya da video olur; birini talimattan kaldırın.` };
  if (!hedef.medya.some((m) => m.ozet === medya.ozet)) hedef.medya = [...hedef.medya, { ...medya, tur: 'video', boyut: 1 }];
  return {
    komut: {
      ad: 'talimat-taslak-kaydet',
      govde: { opNo, okunanSurum: son.surum, taslakSurum: taslak?.surum ?? null, adimlar: adimlar.map(girdiyeCevir) },
    },
  };
}
