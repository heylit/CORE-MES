// Mini pano ayrı küçük pencereden açılır (3093 a): üstte duran pencere tarayıcıda onu açan sayfaya bağlıdır ve o sayfa
// yenilenince kapanır. Açan sayfa ana CORE MES sekmesi değil bu küçük pencere olunca ana sayfayı yenilemek panoyu kapatmaz.
export const MINI_PANO_YOLU = '/profil/mini-pano';
const PENCERE_ADI = 'tmi-mini-pano';
const PENCERE_OLCUSU = 'popup,width=420,height=360';
const KANAL = 'tmi-mini-pano';

// Aynı adlı pencere açıksa yeniden yüklenmez, öne gelir: adresi yeniden vermek onu yeniler ve panoyu kapatırdı.
// Yalnız tıklamanın ardından çağrılır; tarayıcı açılır pencereyi kullanıcı eylemi olmadan engeller.
export function panoPenceresiniAc(): boolean {
  const pencere = window.open('', PENCERE_ADI, PENCERE_OLCUSU);
  if (pencere === null) return false;
  let bos = true;
  try { bos = pencere.location.href === 'about:blank'; } catch { bos = false; }
  if (bos) pencere.location.href = `${window.location.origin}${MINI_PANO_YOLU}`;
  pencere.focus();
  return true;
}

// var: bu tarayıcıda pano penceresi açık (pano üstte açık olmasa da).
export interface PanoDurumu { acik: boolean; var: boolean }

export const panoDurumuMu = (d: unknown): d is PanoDurumu =>
  typeof d === 'object' && d !== null && typeof (d as PanoDurumu).acik === 'boolean' && typeof (d as PanoDurumu).var === 'boolean';

// Ayrı açılmış iki CORE MES sekmesi aynı adlı pencereyi birbirinde bulamaz (tarayıcı adı yalnız kendi açtığı pencereler
// arasında arar): her biri yeni pano penceresi açardı. Açmadan önce kanaldan sorulur; açık bir pano penceresi yanıt verirse
// yenisi açılmaz, o pencere öne çağrılır. Yanıt süresi tıklamanın açılır pencere izni içinde kalacak kadar kısadır.
const YANIT_MS = 250;
export function panoPenceresiVarMi(kanal: BroadcastChannel | null): Promise<boolean> {
  if (kanal === null) return Promise.resolve(false);
  return new Promise((coz) => {
    const z = setTimeout(() => { kanal.removeEventListener('message', dinle); coz(false); }, YANIT_MS);
    function dinle(o: MessageEvent<unknown>) {
      if (!panoDurumuMu(o.data) || !o.data.var) return;
      clearTimeout(z);
      kanal?.removeEventListener('message', dinle);
      coz(true);
    }
    kanal.addEventListener('message', dinle);
    kanal.postMessage('sor');
  });
}

// Küçük pencere panonun açık olup olmadığını ana sekmelere duyurur; ana sekme açılışta sorar (Hesap menüsündeki "(açık)").
export function panoKanali(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(KANAL);
}

export const panoPenceresindeMi = (): boolean => typeof window !== 'undefined' && window.name === PENCERE_ADI;

// Pano penceresinde üstteki pano Hesap menüsünün kalıcı eyleminde tutulur, sayfada değil: pencerede başka sayfaya geçilse
// de kapanmaz. Sayfa yalnız durumu okur ve açtırır.
interface PanoDenetimi { acik: boolean; ac: () => void }
let denetim: PanoDenetimi = { acik: false, ac: () => undefined };
const dinleyiciler = new Set<() => void>();
export function panoDenetiminiYaz(yeni: PanoDenetimi): void {
  if (yeni.acik === denetim.acik && yeni.ac === denetim.ac) return;
  denetim = yeni;
  for (const d of dinleyiciler) d();
}
export function panoDenetimineAbone(d: () => void): () => void {
  dinleyiciler.add(d);
  return () => { dinleyiciler.delete(d); };
}
export const panoDenetimi = (): PanoDenetimi => denetim;

// Açık pano penceresi varsa onu öne çağırır, yoksa açar. false: tarayıcı açılır pencereyi engelledi.
export async function panoPenceresiniAcYaDaOneGetir(): Promise<boolean> {
  const kanal = panoKanali();
  try {
    if (await panoPenceresiVarMi(kanal)) { kanal?.postMessage('one-gel'); return true; }
    return panoPenceresiniAc();
  } finally { kanal?.close(); }
}

// Pano üstte açılınca taşıyıcı pencere küçülüp ekranın köşesine çekilir (3153 b): pano onu açan pencere açık kaldıkça
// yaşar, bu yüzden pencere kapatılamaz; sayfa kendini simge durumuna da küçültemez. Tarayıcı alt sınırda durdurur (Linux
// Chromium'da 180x100 ölçüldü), reddederse pencere olduğu gibi kalır; hata gösterilmez.
export interface PencereKonumu { genislik: number; yukseklik: number; x: number; y: number }

export function koseyeCekil(pencere: Window = window): PencereKonumu | null {
  try {
    const onceki = { genislik: pencere.outerWidth, yukseklik: pencere.outerHeight, x: pencere.screenX, y: pencere.screenY };
    const ekran = pencere.screen as Screen & { availLeft?: number; availTop?: number };
    pencere.resizeTo(1, 1);
    pencere.moveTo((ekran.availLeft ?? 0) + ekran.availWidth, (ekran.availTop ?? 0) + ekran.availHeight);
    return onceki;
  } catch { return null; }
}

export function yerineDon(onceki: PencereKonumu | null, pencere: Window = window): void {
  if (onceki === null) return;
  try {
    pencere.resizeTo(onceki.genislik, onceki.yukseklik);
    pencere.moveTo(onceki.x, onceki.y);
  } catch { /* tarayıcı izin vermedi: pencere olduğu gibi kalır */ }
}
