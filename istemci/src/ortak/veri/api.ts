import { ISTEK_KIMLIGI_BASLIGI, istekKimligiMi } from '#paylasilan/istek-kimligi.ts';
import { HATA_KODU_BASLIGI, type HataGovdesi } from '#paylasilan/hata.ts';
import { cevapGeldi, ulasilamadi, yazmaBelirsiz } from './baglanti.ts';
import { vekilCevabiMi } from './vekil.ts';

const BICIMSIZ: HataGovdesi = { kod: 'SUNUCU', mesaj: 'Beklenmeyen sunucu cevabı' };

const IZ_BICIMI = /^[\w-]{1,64}$/;

// 5xx cevabındaki istek kimliği (başlık); kullanıcı bunu bilgi işleme söyler. Biçimsizse yok sayılır.
function izOku(deger: string | null | undefined): string | null {
  return typeof deger === 'string' && IZ_BICIMI.test(deger) ? deger : null;
}

export class ApiHatasi extends Error {
  readonly durum: number;
  readonly govde: HataGovdesi;
  // Sunucunun kendi yazdığı ileti, hata kodu varsa sonunda; cevap hata biçiminde değilse (gövdesiz, vekil sayfası) null.
  readonly sunucuIletisi: string | null;
  readonly iz: string | null;
  constructor(durum: number, govde: HataGovdesi | null, hataKodu?: string | null) {
    super((govde ?? BICIMSIZ).mesaj);
    this.name = 'ApiHatasi';
    this.durum = durum;
    this.govde = govde ?? BICIMSIZ;
    this.iz = izOku(hataKodu);
    const ileti = govde !== null && govde.mesaj.trim() !== '' ? govde.mesaj : null;
    this.sunucuIletisi = ileti === null || this.iz === null ? ileti : `${ileti} Hata kodu: ${this.iz}`;
  }
}

// Yükleme hatasını gösteren ekranların çoğu hata nesnesini durum kutusuna vermez; kutu son sunucu hata kodunu buradan okur.
// Kod bu süreden eskiyse gösterilmez: başka bir ekranın eski hatası yeni hataya yapıştırılmasın.
export const HATA_KODU_SURESI_MS = 60_000;
let sonHata: { iz: string; zaman: number } | null = null;

export function sonHataKodu(simdi: number = Date.now()): string | null {
  return sonHata !== null && simdi - sonHata.zaman <= HATA_KODU_SURESI_MS ? sonHata.iz : null;
}

export const OTURUM_BITTI = 'oturum:bitti';

function govdeyeCevir(ham: unknown): HataGovdesi | null {
  if (ham && typeof ham === 'object' && 'kod' in ham && 'mesaj' in ham && typeof ham.mesaj === 'string') return ham as HataGovdesi;
  return null;
}

export type KesilmeNedeni = 'zaman-asimi' | 'iptal';

// Cevap alınmadan bırakılan istek. Sunucuya ulaşmış ve işlenmiş olabilir: yazma komutu kendiliğinden yeniden
// denenmez, durum sunucudan yeniden okunur. Tek istisna tekrar korumalı uca istek kimliğiyle giden komuttur (`istek-kimligi.ts`).
export class IstekKesildi extends Error {
  readonly neden: KesilmeNedeni;
  constructor(neden: KesilmeNedeni) {
    super(neden === 'zaman-asimi' ? 'İstek zaman aşımına uğradı' : 'İstek iptal edildi');
    this.name = 'IstekKesildi';
    this.neden = neden;
  }
}

// Sunucuya ulaşılamadı ya da cevap okunurken bağlantı koptu: isteğin işlenip işlenmediği bilinmez. Tarayıcı bunu
// TypeError ile bildirir; aynı tipi programlama hatası da taşıdığı için ayrı tiptir. TypeError'dan türer: onu
// sınayan ekran aynı sonucu alır.
export class AgHatasi extends TypeError {
  readonly neden: unknown;
  constructor(neden: unknown) {
    super(neden instanceof Error ? neden.message : 'Sunucuya ulaşılamadı');
    this.name = 'AgHatasi';
    this.neden = neden;
  }
}

export const ULASILAMADI_ILETISI = 'Sunucuya şu an ulaşılamıyor (güncelleme ya da bağlantı kesintisi). Bağlantı gelince yeniden deneyin.';

// Hata gösteren her ekranın tek kuralı: sunucu ileti yazdıysa o gösterilir (kullanıcıya göre yazılır); sunucuya
// ulaşılamadıysa kullanıcı nedenini ve ne yapacağını görür (kaydetme kendiliğinden yeniden denenmez); cevap ileti
// taşımıyorsa ekranın kendi iletisi.
export function hataIletisi(hata: unknown, ekranIletisi: string): string {
  if (hata instanceof AgHatasi) return ULASILAMADI_ILETISI;
  return hata instanceof ApiHatasi && hata.sunucuIletisi !== null ? hata.sunucuIletisi : ekranIletisi;
}

export interface IstekSecenegi {
  // Oturum açma denemesinin reddi de 401'dir; orada biten bir oturum yoktur.
  oturumBitirmez?: boolean;
  // Cevabın tamamı bu sürede (ms) gelmezse istek kesilir. Verilmezse süre sınırı yoktur. Sıfır, eksi, NaN ve
  // zamanlayıcının taşıyamadığı süre reddedilir (RangeError, istek gitmez): hesap hatası sınırsız beklemeye dönmesin.
  zamanAsimiMs?: number;
  // Çağıranın iptali (ekran kapandı, sorgu vazgeçti).
  sinyal?: AbortSignal;
}

// Başlık adı ve kimlik biçimi sunucuyla tek kaynaktan gelir. Biçim denetimi: depodan bozuk okunan kuyruk öğesi gibi
// değerler gönderilmeden ayıklanır.
export { ISTEK_KIMLIGI_BASLIGI, istekKimligiMi };

export interface YazmaSecenegi extends IstekSecenegi {
  // Tekrar korumalı komutun kimliği (UUID): aynı kimlikle yinelenen isteğe sunucu ilk cevabı döner. Verilmezse
  // başlık gitmez; yeniden denemede yeni kimlik üretilmez, ilk isteğinki yollanır.
  istekKimligi?: string;
  // Kullanıcının göndermediği, ekranın kendiliğinden attığı yazma (açılışta denenen hazırlık gibi): ulaşılamazsa ya da süresi dolarsa
  // "sonucu bilinmeyen kayıt" sayılmaz; kullanıcı yeniden girecek bir şey göndermedi. Bağlantı durumu yine güncellenir.
  arkaPlan?: boolean;
}

// Okuma yinelenebilir, kimlik taşımaz: yazma seçeneği değişkenle de okumaya verilemez.
export type OkumaSecenegi = IstekSecenegi & { istekKimligi?: never };

// Tarayıcı zamanlayıcısı daha uzun süreyi taşırır ve hemen çalıştırır.
const AZAMI_ZAMAN_ASIMI_MS = 2_147_483_647;

const yazmaBilgisi = (yontem: string, secenek: YazmaSecenegi): { istekKimligi?: string } | null =>
  yontem === 'GET' || secenek.arkaPlan === true ? null : { ...(secenek.istekKimligi === undefined ? {} : { istekKimligi: secenek.istekKimligi }) };

async function istek<T>(yontem: string, yol: string, govde?: unknown, secenek: YazmaSecenegi = {}): Promise<T> {
  const baslik: Record<string, string> = { Accept: 'application/json' };
  if (govde !== undefined) baslik['Content-Type'] = 'application/json';
  if (secenek.istekKimligi !== undefined && yontem !== 'GET') {
    // Bozuk kimlik başlığa yazılmaz: sunucu reddeder, komut da kimliksiz yeniden gönderilmiş olur.
    if (!istekKimligiMi(secenek.istekKimligi)) throw new RangeError('istekKimligi UUID biçiminde olmalı');
    baslik[ISTEK_KIMLIGI_BASLIGI] = secenek.istekKimligi;
  }
  // Gövde istekten önce kurulur: metne çevrilemeyen gövde çağıranın hatasıdır, ağ hatası sayılıp yeniden denenmez.
  const govdeMetni = govde === undefined ? undefined : JSON.stringify(govde);
  const { zamanAsimiMs, sinyal } = secenek;
  if (zamanAsimiMs !== undefined && !(zamanAsimiMs > 0 && zamanAsimiMs <= AZAMI_ZAMAN_ASIMI_MS)) {
    throw new RangeError(`zamanAsimiMs 1 ile ${AZAMI_ZAMAN_ASIMI_MS} arasında olmalı: ${zamanAsimiMs}`);
  }
  // Seçenek verilmeyen çağrıda fetch'e sinyal gitmez: var olan çağrıların isteği aynı kalır.
  const kesici = zamanAsimiMs !== undefined || sinyal !== undefined ? new AbortController() : null;
  let neden: KesilmeNedeni | null = null;
  const kes = (n: KesilmeNedeni) => {
    neden ??= n;
    kesici?.abort();
  };
  const iptalEt = () => { kes('iptal'); };
  if (sinyal?.aborted) throw new IstekKesildi('iptal');
  sinyal?.addEventListener('abort', iptalEt, { once: true });
  const sayac = zamanAsimiMs === undefined ? undefined : setTimeout(() => { kes('zaman-asimi'); }, zamanAsimiMs);
  let cevap: Response;
  let metin: string;
  try {
    cevap = await fetch(`/api${yol}`, {
      method: yontem,
      credentials: 'include',
      headers: baslik,
      body: govdeMetni,
      ...(kesici ? { signal: kesici.signal } : {}),
    });
    // Süre gövdenin okunmasını da kapsar: başlıklar gelip gövde takılırsa istek yine kesilir.
    metin = await cevap.text();
  } catch (hata) {
    // fetch'in kendi iptal hatası tarayıcıya göre değişir; hangisinin kestiğini yalnız burası bilir.
    const yazma = yazmaBilgisi(yontem, secenek);
    if (neden !== null) {
      // Süresi dolan yazma sunucuda işlenmiş olabilir; çağıranın iptali (ekran kapandı) belirsizlik sayılmaz.
      if (neden === 'zaman-asimi' && yazma !== null) yazmaBelirsiz(yazma.istekKimligi);
      throw new IstekKesildi(neden);
    }
    ulasilamadi(yazma);
    throw new AgHatasi(hata);
  } finally {
    clearTimeout(sayac);
    sinyal?.removeEventListener('abort', iptalEt);
  }
  if (vekilCevabiMi(cevap.status, metin)) {
    ulasilamadi(yazmaBilgisi(yontem, secenek));
    throw new AgHatasi(new Error(`Sunucuya ulaşılamadı (vekil cevabı ${String(cevap.status)})`));
  }
  cevapGeldi(yontem === 'GET' ? undefined : secenek.istekKimligi);
  let veri: unknown = null;
  if (metin) {
    try { veri = JSON.parse(metin); } catch { veri = null; }
  }
  if (!cevap.ok) {
    if (cevap.status === 401 && secenek.oturumBitirmez !== true) window.dispatchEvent(new CustomEvent(OTURUM_BITTI));
    const hata = new ApiHatasi(cevap.status, govdeyeCevir(veri), cevap.headers.get(HATA_KODU_BASLIGI));
    if (hata.iz !== null) sonHata = { iz: hata.iz, zaman: Date.now() };
    throw hata;
  }
  return veri as T;
}

export const api = {
  get: <T>(yol: string, secenek?: OkumaSecenegi) => istek<T>('GET', yol, undefined, secenek),
  post: <T>(yol: string, govde?: unknown, secenek?: YazmaSecenegi) => istek<T>('POST', yol, govde, secenek),
  put: <T>(yol: string, govde?: unknown, secenek?: YazmaSecenegi) => istek<T>('PUT', yol, govde, secenek),
  sil: <T>(yol: string, secenek?: YazmaSecenegi) => istek<T>('DELETE', yol, undefined, secenek),
};
