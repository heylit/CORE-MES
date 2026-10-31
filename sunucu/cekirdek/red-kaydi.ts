// Reddedilen istek (1363 a): oturumsuz istek, yetki ya da kapsam reddi, cihaz profili reddi ve var olmayan adres. Reddedilen isteğin
// transaction'ı geri alınır; olay aynı transaction'da yazılamaz. Çekirdek modül ithal etmez: olay süreç belleğindeki sınırlı tampona
// girer, Güvenlik Merkezi taraması tamponu kendi tablosuna boşaltır. Yeniden başlatmada boşaltılmamış olaylar kaybolur.

export const RET_NEDENLERI = ['oturum-yok', 'yetki', 'kapsam', 'dis-izleyici', 'cihaz', 'dosya-turu', 'adres-yok'] as const;
export type RetNedeni = (typeof RET_NEDENLERI)[number];

export interface RetOlayi {
  zaman: Date;
  neden: RetNedeni;
  kisiId: number | null;
  yontem: string;
  // Kayıtlı uçta yol kalıbı (kimlik taşımaz); var olmayan adreste istenen yol, sorgu dizgesi olmadan ve kısaltılarak.
  yol: string;
  ip: string | null;
}

// Saldırı anında bellek büyümesin: tampon doluyken en eski olay düşer, düşen sayı boşaltmada bildirilir.
export const TAMPON_EN_COK = 5000;
export const YOL_EN_COK = 200;

// İstenen yol saldırganın elindedir: sorgu dizgesi atılır, denetim karakterleri silinir, uzunluk sınırlanır.
export function yoluTemizle(adres: string): string {
  const yol = adres.split('?')[0] ?? '';
  return yol.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, YOL_EN_COK);
}

export class RetTamponu {
  private olaylar: RetOlayi[] = [];
  private dusen = 0;
  private readonly enCok: number;

  constructor(enCok: number = TAMPON_EN_COK) {
    this.enCok = enCok;
  }

  ekle(olay: RetOlayi): void {
    if (this.olaylar.length >= this.enCok) {
      this.olaylar.shift();
      this.dusen += 1;
    }
    this.olaylar.push(olay);
  }

  bosalt(): { olaylar: RetOlayi[]; dusen: number } {
    const sonuc = { olaylar: this.olaylar, dusen: this.dusen };
    this.olaylar = [];
    this.dusen = 0;
    return sonuc;
  }
}

const surecTamponu = new RetTamponu();

export function retKaydet(olay: RetOlayi): void {
  surecTamponu.ekle(olay);
}

// Yalnız Güvenlik Merkezi taraması çağırır; boşaltılan olay tampondan çıkar.
export function retOlaylariniBosalt(): { olaylar: RetOlayi[]; dusen: number } {
  return surecTamponu.bosalt();
}

// Çekirdekte istek, Fastify isteğinin yalnız bu iki alanıdır: kayıt adresi, kimlik ve sorguyu taşımaz.
interface RetIstegi { readonly ip: string; readonly url: string }

const kaydedilen = new WeakSet<object>();
const kisiler = new WeakMap<object, number>();

// Uç kapısı reddi kendi nedeniyle yazar; hata işleyicisi aynı isteği ikinci kez yazmaz.
export function istekReddiniKaydet(istek: RetIstegi, olay: Pick<RetOlayi, 'neden' | 'kisiId' | 'yontem' | 'yol'>): void {
  kaydedilen.add(istek);
  retKaydet({ ...olay, zaman: new Date(), ip: istek.ip === '' ? null : istek.ip });
}

// Kapıdan geçen istekte kişi bilinir; işleyicinin kapsam reddini hata işleyicisi bu kişiyle yazar.
export function istekKisisiniIsaretle(istek: object, kisiId: number): void {
  kisiler.set(istek, kisiId);
}

// Hata işleyicisi çağırır: kapıdan geçmiş isteğin işleyicide aldığı yetki reddi (kapsam dışı kayıt ya da modülün kendi denetimi).
// Kapıdan geçmemiş istekte kişi yoktur; o red kapıda yazılmıştır ya da açık uçtadır (girişin kendi kaydı vardır).
export function isleyiciReddiniKaydet(istek: RetIstegi & { readonly method: string }, yol: string | null, kapsam: boolean): void {
  if (kaydedilen.has(istek)) return;
  const kisiId = kisiler.get(istek);
  if (kisiId === undefined) return;
  istekReddiniKaydet(istek, { neden: kapsam ? 'kapsam' : 'yetki', kisiId, yontem: istek.method, yol: yol ?? yoluTemizle(istek.url) });
}

// Var olmayan adres (adres taraması): kişi bilinmez, istenen yol temizlenerek yazılır.
export function adresYokKaydet(istek: RetIstegi & { readonly method: string }): void {
  istekReddiniKaydet(istek, { neden: 'adres-yok', kisiId: null, yontem: istek.method, yol: yoluTemizle(istek.url) });
}
