import { AgHatasi, ApiHatasi, IstekKesildi, istekKimligiMi } from './api.ts';

function onaltilik(baytlar: Uint8Array, bas: number, son: number): string {
  let metin = '';
  for (let i = bas; i < son; i += 1) metin += baytlar[i]!.toString(16).padStart(2, '0');
  return metin;
}

// Tekrar korumalı komutun kimliği (UUID v4). `randomUUID` yalnız güvenli bağlamda vardır; kurum içi sunucuya düz
// http ile bağlanan tablette yoktur, orada kimlik aynı güçteki `getRandomValues` ile kurulur. Zayıf rastgelelikle
// yedek yoktur: çakışan kimlik, başka bir komutun saklanan cevabını bu komutun cevabı diye döndürür.
export function yeniIstekKimligi(): string {
  const kripto = (globalThis as { crypto?: Partial<Pick<Crypto, 'randomUUID' | 'getRandomValues'>> }).crypto;
  // İki yöntem de nesnesinin üstünden çağrılır: tarayıcı ayrık çağrıyı reddeder.
  if (typeof kripto?.randomUUID === 'function') return kripto.randomUUID();
  if (typeof kripto?.getRandomValues !== 'function') {
    throw new Error('İstek kimliği üretilemiyor: tarayıcıda güvenli rastgele sayı üreteci yok');
  }
  const b = kripto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  return `${onaltilik(b, 0, 4)}-${onaltilik(b, 4, 6)}-${onaltilik(b, 6, 8)}-${onaltilik(b, 8, 10)}-${onaltilik(b, 10, 16)}`;
}

// Sonucu bilinmeyen hata: komut sunucuda uygulanmış olabilir. Ağ hatası ve zaman aşımında cevap gelmemiştir; 5xx'te
// sunucu COMMIT'i gönderdikten sonra bağlantısını yitirmiş, yazı kalıcı olduğu halde hata dönmüş olabilir (aradaki
// vekilin 502/504 sayfası da böyledir). Sunucunun karar verip reddettiği istek (4xx) ve çağıranın iptali değildir.
// Bu hatadan sonraki her yeniden gönderim aynı kimlikle yapılır; yeni kimlik komutu ikinci kez uygular.
export function yenidenDenenebilirMi(hata: unknown): boolean {
  if (hata instanceof IstekKesildi) return hata.neden === 'zaman-asimi';
  if (hata instanceof ApiHatasi) return hata.durum >= 500;
  return hata instanceof AgHatasi;
}

// Tek denemenin isteğe yayılacak seçenekleri: `cagri.post(yol, { ...deneme, parametre, govde })`.
export interface Deneme {
  istekKimligi: string;
  zamanAsimiMs: number;
  sinyal?: AbortSignal;
}

export interface TekrarSecenegi {
  // Komutun kimliği. Kuyruk ya da elle yeniden gönderim kimliği komutla birlikte saklar (`yeniIstekKimligi()`, komut
  // oluşurken) ve her gönderimde aynısını verir. Verilmezse bu çağrı için üretilir ve çağrı bitince yitirilir.
  istekKimligi?: string;
  // İlk istekten sonra en çok kaç kez yeniden gönderileceği; sıfır yeniden denemez. Varsayılan 2.
  tekrar?: number;
  // İlk yeniden denemeden önceki bekleme (ms); her denemede iki katına çıkar. Varsayılan 1000 (1, 2 sn).
  ilkBeklemeMs?: number;
  // Tek denemenin süre sınırı (ms): takılan bağlantı bu sürede kesilir ve yeniden denenir. Varsayılan 5000.
  zamanAsimiMs?: number;
  // Çağıranın iptali: süren isteği ve beklemeyi keser, yeni deneme başlatmaz.
  sinyal?: AbortSignal;
}

const AZAMI_BEKLEME_MS = 2_147_483_647;

function bekle(ms: number, sinyal: AbortSignal | undefined): Promise<void> {
  return new Promise((coz, red) => {
    const iptal = () => {
      clearTimeout(sayac);
      red(new IstekKesildi('iptal'));
    };
    const sayac = setTimeout(() => {
      sinyal?.removeEventListener('abort', iptal);
      coz();
    }, ms);
    sinyal?.addEventListener('abort', iptal, { once: true });
  });
}

// Yazma komutunu tek kimlikle gönderir; sonucu bilinmeyen hatada aynı kimlikle yeniden dener. Sunucu aynı kimliği
// ikinci kez işlemediği için komut en çok bir kez uygulanır. Denemeler tükenince son hata aynen fırlar; çağıran
// iptal ederse `IstekKesildi('iptal')`.
// YALNIZ sunucuda tekrar korumalı tanımlanmış uçla kullanılır: korumasız uçta yeniden deneme (5xx dahil) çift kayıt yazar.
// Süre sınırı ve iptal `gonder`e verilen denemeyle taşınır; isteğe yayılmazsa takılan bağlantı sınırsız bekler.
// En uzun toplam süre: (tekrar + 1) x zamanAsimiMs + ilkBeklemeMs x (2^tekrar - 1); varsayılanla 3 x 5 + 3 = 18 sn.
export async function tekrarKorumaliGonder<T>(gonder: (deneme: Deneme) => Promise<T>, secenek: TekrarSecenegi = {}): Promise<T> {
  const { tekrar = 2, ilkBeklemeMs = 1000, zamanAsimiMs = 5000, sinyal } = secenek;
  if (!Number.isInteger(tekrar) || tekrar < 0) throw new RangeError(`tekrar sıfır ya da artı tam sayı olmalı: ${tekrar}`);
  if (!(ilkBeklemeMs > 0 && ilkBeklemeMs * 2 ** Math.max(tekrar - 1, 0) <= AZAMI_BEKLEME_MS)) {
    throw new RangeError(`ilkBeklemeMs artı olmalı ve en uzun bekleme ${AZAMI_BEKLEME_MS} ms'yi aşmamalı: ${ilkBeklemeMs}`);
  }
  if (!(zamanAsimiMs > 0 && zamanAsimiMs <= AZAMI_BEKLEME_MS)) {
    throw new RangeError(`zamanAsimiMs 1 ile ${AZAMI_BEKLEME_MS} arasında olmalı: ${zamanAsimiMs}`);
  }
  // Bozuk kimlikle gönderilen komut sunucuda korunmaz: yeniden deneme çift kayıt yazar.
  if (secenek.istekKimligi !== undefined && !istekKimligiMi(secenek.istekKimligi)) throw new RangeError('istekKimligi UUID biçiminde olmalı');
  if (sinyal?.aborted) throw new IstekKesildi('iptal');
  const istekKimligi = secenek.istekKimligi ?? yeniIstekKimligi();
  const istekSecenegi: Deneme = sinyal ? { istekKimligi, zamanAsimiMs, sinyal } : { istekKimligi, zamanAsimiMs };
  for (let deneme = 0; ; deneme += 1) {
    try {
      return await gonder({ ...istekSecenegi });
    } catch (hata) {
      if (deneme >= tekrar || !yenidenDenenebilirMi(hata)) throw hata;
      if (sinyal?.aborted) throw new IstekKesildi('iptal');
      await bekle(ilkBeklemeMs * 2 ** deneme, sinyal);
    }
  }
}
