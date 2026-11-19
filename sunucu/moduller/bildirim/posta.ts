import { readFileSync } from 'node:fs';
import { isIP, Socket } from 'node:net';
import { connect as tlsBagla, type TLSSocket } from 'node:tls';
import { agAraliklariniCoz, type AgAraligi } from '#paylasilan/ag-araligi.ts';

// ADR 0015: posta sunucusuyla konuşan tek dosya. İki adres: kurum içi (TMIV2_POSTA_SUNUCUSU; yalnız IP, yalnız kurum içi blok, ad
// çözülmez; kurum içi sunucu ve yerel aktarıcı kipleri) ve tek tanımlı dış servis (TMIV2_POSTA_DIS_SUNUCUSU; alan adı, yalnız 465 ya
// da 587, TLS zorunlu, sertifika sistem güven deposuyla doğrulanır, kullanıcı ve parola zorunlu; 3397-4 a). Hangisinin kullanılacağını
// Sistem Ayarları'ndaki kip seçer; adres yalnız ortamdadır. Alıcı yalnız TMIV2_POSTA_ALAN_ADI listesindeki alan adlarına gider.
// Varsayılan kapalı: seçili kipin adresi yoksa hiç bağlanılmaz. Yeni paket yok. Hata metni adresi ve parolayı taşımaz.
export const POSTA_DEGISKENLERI = [
  'TMIV2_POSTA_SUNUCUSU', 'TMIV2_POSTA_DIS_SUNUCUSU', 'TMIV2_POSTA_ALAN_ADI', 'TMIV2_POSTA_GONDEREN', 'TMIV2_POSTA_GUVENLIK',
  'TMIV2_POSTA_KULLANICI', 'TMIV2_POSTA_PAROLA', 'TMIV2_POSTA_SERTIFIKA', 'TMIV2_POSTA_SERTIFIKA_ADI',
] as const;

export type PostaGuvenligi = 'starttls' | 'tls' | 'yok';
export interface PostaAyari {
  // Kurum içinde IP; dış serviste alan adı.
  sunucu: string;
  dis: boolean;
  kapi: number;
  guvenlik: PostaGuvenligi;
  alanAdlari: string[];
  gonderen: string;
  kimlik: { kullanici: string; parola: string } | null;
  // Kurum içi sertifika otoritesi (PEM) ve sertifikadaki ad; ad yalnız kimlik denetimi içindir, çözülmez.
  ca: string | null;
  sertifikaAdi: string | null;
}

// ADR 0014'teki kurum içi bloklar.
const KURUM_ICI = agAraliklariniCoz('10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 127.0.0.0/8 fc00::/7 fe80::/10 ::1/128').araliklar;
const BIT = { 4: 32, 6: 128 } as const;
const kurumIcinde = (r: AgAraligi): boolean => KURUM_ICI.some((k) => {
  if (k.surum !== r.surum || k.onek > r.onek) return false;
  const kBoyut = (1n << BigInt(BIT[k.surum] - k.onek)) - 1n;
  return r.ag >= k.ag && r.ag <= k.ag + kBoyut;
});
export function kurumIciAdresMi(ip: string): boolean {
  const { araliklar, hata } = agAraliklariniCoz(ip);
  const r = araliklar[0];
  return hata === null && araliklar.length === 1 && r !== undefined && kurumIcinde(r);
}

const ALAN_ADI = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ADRES = /^[a-z0-9._%+-]{1,64}@([a-z0-9.-]{1,253})$/;

// Alıcı adresi küçük harfe çevrilmiş ve alan adı listede olmalıdır; başlık enjeksiyonu için satır sonu ve boşluk geçmez.
export function izinliAdresMi(adres: string, alanAdlari: readonly string[]): boolean {
  const e = ADRES.exec(adres.trim().toLowerCase());
  return e !== null && alanAdlari.includes(e[1] ?? '');
}

type Ortamlar = Readonly<Record<string, string | undefined>>;
const gecersiz = (ad: string, neden: string) => new Error(`Ortam değişkeni geçersiz: ${ad} (${neden})`);

function ortakAlanlar(env: Ortamlar) {
  const alanAdlari = [...new Set((env['TMIV2_POSTA_ALAN_ADI'] ?? '').split(/[\s,]+/).map((a) => a.trim().toLowerCase()).filter((a) => a !== ''))];
  if (alanAdlari.length === 0 || !alanAdlari.every((a) => ALAN_ADI.test(a))) throw gecersiz('TMIV2_POSTA_ALAN_ADI', 'şirket alan adları listesi olmalı');
  const gonderen = env['TMIV2_POSTA_GONDEREN']?.trim().toLowerCase() ?? '';
  if (!izinliAdresMi(gonderen, alanAdlari)) throw gecersiz('TMIV2_POSTA_GONDEREN', 'izinli alan adında e-posta adresi olmalı');
  const guvenlikHam = env['TMIV2_POSTA_GUVENLIK']?.trim() ?? '';
  const guvenlik = (guvenlikHam === '' ? 'starttls' : guvenlikHam) as PostaGuvenligi;
  if (!['starttls', 'tls', 'yok'].includes(guvenlik)) throw gecersiz('TMIV2_POSTA_GUVENLIK', 'starttls, tls ya da yok');
  const kullanici = env['TMIV2_POSTA_KULLANICI']?.trim() ?? '';
  const parola = env['TMIV2_POSTA_PAROLA'] ?? '';
  if ((kullanici === '') !== (parola === '')) throw gecersiz('TMIV2_POSTA_KULLANICI', 'kullanıcı ve parola birlikte verilir');
  if (kullanici !== '' && guvenlik === 'yok') throw gecersiz('TMIV2_POSTA_GUVENLIK', 'parola şifresiz bağlantıda gönderilmez');
  return { alanAdlari, gonderen, guvenlik, kimlik: kullanici === '' ? null : { kullanici, parola } };
}

// Değişken yoksa kurum içi adres yoktur (null). Geçersiz değer açılışta durdurur; ileti değişkenin adını söyler, değerini söylemez.
export function postaAyariOku(env: Ortamlar, dosyaOku: (yol: string) => string = (y) => readFileSync(y, 'utf8')): PostaAyari | null {
  const ham = env['TMIV2_POSTA_SUNUCUSU']?.trim() ?? '';
  if (ham === '') return null;
  const e = /^(?:\[([0-9a-f:.]+)\]|([0-9.]+)):(\d{1,5})$/i.exec(ham);
  const ip = e?.[1] ?? e?.[2] ?? '';
  const kapi = Number(e?.[3] ?? 0);
  if (e === null || isIP(ip) === 0 || kapi < 1 || kapi > 65535) throw gecersiz('TMIV2_POSTA_SUNUCUSU', '<ip>:<kapı> biçiminde olmalı; ad yazılmaz');
  if (!kurumIciAdresMi(ip)) throw gecersiz('TMIV2_POSTA_SUNUCUSU', 'yalnız kurum içi adres: 10/8, 172.16/12, 192.168/16, 127/8, fc00::/7, fe80::/10');
  const o = ortakAlanlar(env);
  const caYolu = env['TMIV2_POSTA_SERTIFIKA']?.trim() ?? '';
  let ca: string | null = null;
  if (caYolu !== '') {
    try { ca = dosyaOku(caYolu); } catch { throw gecersiz('TMIV2_POSTA_SERTIFIKA', 'okunamadı'); }
    if (!ca.includes('-----BEGIN CERTIFICATE-----')) throw gecersiz('TMIV2_POSTA_SERTIFIKA', 'PEM sertifika dosyası olmalı');
  }
  const sertifikaAdi = env['TMIV2_POSTA_SERTIFIKA_ADI']?.trim().toLowerCase() ?? '';
  if (sertifikaAdi !== '' && !ALAN_ADI.test(sertifikaAdi) && !/^[a-z0-9-]{1,63}$/.test(sertifikaAdi)) throw gecersiz('TMIV2_POSTA_SERTIFIKA_ADI', 'sunucu adı olmalı');
  return { sunucu: ip, dis: false, kapi, ...o, ca, sertifikaAdi: sertifikaAdi === '' ? null : sertifikaAdi };
}

// Dış posta servisi (3397-4 a): yalnız alan adı (IP yazılmaz), 465 (doğrudan TLS) ya da 587 (STARTTLS zorunlu); şifresiz bağlantı ve
// kimliksiz gönderim yok. Kurum içi sertifika otoritesi burada kullanılmaz: sertifika sistemin güven deposuyla ve sunucu adıyla doğrulanır.
export function disPostaAyariOku(env: Ortamlar): PostaAyari | null {
  const ham = env['TMIV2_POSTA_DIS_SUNUCUSU']?.trim().toLowerCase() ?? '';
  if (ham === '') return null;
  const e = /^([^:\s]+):(465|587)$/.exec(ham);
  const ad = e?.[1] ?? '';
  if (e === null || isIP(ad) !== 0 || !ALAN_ADI.test(ad)) throw gecersiz('TMIV2_POSTA_DIS_SUNUCUSU', '<alan adı>:465 ya da <alan adı>:587 olmalı; IP yazılmaz');
  const kapi = Number(e[2]);
  const o = ortakAlanlar({ ...env, TMIV2_POSTA_GUVENLIK: env['TMIV2_POSTA_GUVENLIK']?.trim() === 'yok' ? 'yok' : kapi === 465 ? 'tls' : 'starttls' });
  if (o.guvenlik === 'yok') throw gecersiz('TMIV2_POSTA_GUVENLIK', 'dış posta servisine şifresiz bağlanılmaz');
  if (o.kimlik === null) throw gecersiz('TMIV2_POSTA_KULLANICI', 'dış posta servisinde kullanıcı ve parola zorunlu');
  return { sunucu: ad, dis: true, kapi, ...o, ca: null, sertifikaAdi: ad };
}

// Ortam değişmedikçe aynı ayar; açılışta bir kez çağrılır ki geçersiz değer sunucuyu açılışta durdursun (push.ts ile aynı).
// `dis`: Sistem Ayarları'nda seçili kip dış posta servisiyse dış adres, değilse kurum içi adres.
let onbellek: { ham: string; ic: PostaAyari | null; dis: PostaAyari | null } | null = null;
export function ortamPostaAyari(dis: boolean, env: Ortamlar = process.env): PostaAyari | null {
  const ham = JSON.stringify(POSTA_DEGISKENLERI.map((d) => env[d] ?? null));
  if (onbellek?.ham !== ham) onbellek = { ham, ic: postaAyariOku(env), dis: disPostaAyariOku(env) };
  return dis ? onbellek.dis : onbellek.ic;
}
ortamPostaAyari(false);

// --- İleti -------------------------------------------------------------------------------------------------------------

export interface Ileti {
  alici: string;
  aliciAdi: string | null;
  gonderenAdi: string;
  konu: string;
  metin: string;
  html: string;
  // HTML'de cid:simge ile anılan gömülü küçük resim (PNG); dış adresten resim çekilmez.
  simgePng: Buffer | null;
  // HTML'de cid:logo ile anılan kurum logosu (PNG, kart 3435-2 logo a); şablonda kapalıysa ya da yüklü değilse null.
  logoPng?: Buffer | null | undefined;
}

const b64Satirlar = (b: Buffer): string => (b.toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');
// RFC 2047: ASCII dışı ad ve konu UTF-8 base64 kodlanır; satır sonu ve denetim karakteri atılır.
const temiz = (s: string): string => s.replace(/[\r\n\t\x00-\x1f\x7f]+/g, ' ').trim();
function baslikKodla(s: string): string {
  const t = temiz(s);
  if (/^[\x20-\x7e]*$/.test(t)) return t;
  const parcalar: string[] = [];
  let parca = '';
  for (const k of t) {
    if (Buffer.byteLength(parca + k) > 45) { parcalar.push(parca); parca = ''; }
    parca += k;
  }
  if (parca !== '') parcalar.push(parca);
  return parcalar.map((p) => `=?UTF-8?B?${Buffer.from(p).toString('base64')}?=`).join('\r\n ');
}
const adresBasligi = (ad: string | null, adres: string): string =>
  (ad === null || temiz(ad) === '' ? `<${adres}>` : `${baslikKodla(ad.replace(/["<>]/g, ''))} <${adres}>`);

export function iletiKur(gonderen: string, i: Ileti, simdi: Date, sinir: string): string {
  const alanAdi = gonderen.slice(gonderen.indexOf('@') + 1);
  const kimlik = `<${simdi.getTime().toString(36)}.${sinir}@${alanAdi}>`;
  const satirlar = [
    `From: ${adresBasligi(i.gonderenAdi, gonderen)}`,
    `To: ${adresBasligi(i.aliciAdi, i.alici)}`,
    `Subject: ${baslikKodla(i.konu)}`,
    `Date: ${simdi.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: ${kimlik}`,
    'MIME-Version: 1.0',
    'Auto-Submitted: auto-generated',
    `Content-Type: multipart/alternative; boundary="a${sinir}"`,
    '',
    `--a${sinir}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64Satirlar(Buffer.from(i.metin)),
    `--a${sinir}`,
  ];
  const html = ['Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64Satirlar(Buffer.from(i.html))];
  const gomulu: [string, Buffer][] = [];
  if (i.simgePng !== null) gomulu.push(['simge', i.simgePng]);
  if (i.logoPng) gomulu.push(['logo', i.logoPng]);
  if (gomulu.length === 0) satirlar.push(...html);
  else {
    satirlar.push(`Content-Type: multipart/related; boundary="r${sinir}"`, '', `--r${sinir}`, ...html);
    for (const [ad, png] of gomulu) {
      satirlar.push(
        `--r${sinir}`, 'Content-Type: image/png', 'Content-Transfer-Encoding: base64', `Content-ID: <${ad}>`, `Content-Disposition: inline; filename="${ad}.png"`, '',
        b64Satirlar(png),
      );
    }
    satirlar.push(`--r${sinir}--`);
  }
  satirlar.push(`--a${sinir}--`, '');
  return satirlar.join('\r\n');
}

// --- SMTP --------------------------------------------------------------------------------------------------------------

export const POSTA_SURESI_MS = 15_000;
export type GonderimSonucu = { tamam: true } | { tamam: false; neden: string; kalici: boolean };

// Bağlantı soyutlaması: testte sahte sunucu, üretimde soket.
export interface Hat {
  yaz(satir: string): void;
  oku(): Promise<{ kod: number; satirlar: string[] }>;
  tlsYukselt(): Promise<void>;
  kapat(): void;
}
export type HatAc = (ayar: PostaAyari) => Promise<Hat>;

function hatKur(ilk: Socket | TLSSocket, ayar: PostaAyari): Hat {
  let soket: Socket | TLSSocket = ilk;
  let tampon = '';
  let bekleyen: ((h: Error | null) => void) | null = null;
  let hata: Error | null = null;
  const dinle = (s: Socket | TLSSocket) => {
    s.setEncoding('utf8');
    s.on('data', (d: string) => { tampon += d; bekleyen?.(null); });
    s.on('error', (h) => { hata = h; bekleyen?.(h); });
    s.on('close', () => { hata ??= new Error('bağlantı kapandı'); bekleyen?.(hata); });
    s.setTimeout(POSTA_SURESI_MS, () => { hata = new Error('zaman aşımı'); s.destroy(); bekleyen?.(hata); });
  };
  dinle(soket);
  const yanit = (): { kod: number; satirlar: string[] } | null => {
    const satirlar: string[] = [];
    let i = 0;
    for (;;) {
      const son = tampon.indexOf('\r\n', i);
      if (son < 0) return null;
      const satir = tampon.slice(i, son);
      satirlar.push(satir.slice(4));
      i = son + 2;
      if (satir.charAt(3) !== '-') {
        tampon = tampon.slice(i);
        return { kod: Number(satir.slice(0, 3)), satirlar };
      }
    }
  };
  return {
    yaz: (satir) => { soket.write(`${satir}\r\n`); },
    oku: () => new Promise((coz, reddet) => {
      const dene = (h: Error | null) => {
        const y = yanit();
        if (y !== null) { bekleyen = null; coz(y); return; }
        if (h !== null || hata !== null) { bekleyen = null; reddet(h ?? hata); return; }
        bekleyen = dene;
      };
      dene(null);
    }),
    tlsYukselt: () => new Promise((coz, reddet) => {
      soket.removeAllListeners('data');
      soket.removeAllListeners('close');
      soket.setTimeout(0);
      const t = tlsBagla({ socket: soket as Socket, host: ayar.sertifikaAdi ?? ayar.sunucu, ca: ayar.ca ?? undefined, servername: ayar.sertifikaAdi ?? undefined, rejectUnauthorized: true });
      t.once('secureConnect', () => { soket = t; tampon = ''; dinle(t); coz(); });
      t.once('error', reddet);
    }),
    kapat: () => { soket.destroy(); },
  };
}

export const soketAc: HatAc = (ayar) => new Promise((coz, reddet) => {
  const bitti = (s: Socket | TLSSocket) => { s.removeListener('error', reddet); coz(hatKur(s, ayar)); };
  if (ayar.guvenlik === 'tls') {
    const s = tlsBagla({ host: ayar.sunucu, port: ayar.kapi, ca: ayar.ca ?? undefined, servername: ayar.sertifikaAdi ?? undefined, rejectUnauthorized: true, timeout: POSTA_SURESI_MS });
    s.once('secureConnect', () => bitti(s));
    s.once('error', reddet);
  } else {
    const s = new Socket();
    s.once('error', reddet);
    s.setTimeout(POSTA_SURESI_MS, () => s.destroy(new Error('zaman aşımı')));
    s.connect({ host: ayar.sunucu, port: ayar.kapi }, () => bitti(s));
  }
});

class SmtpHatasi extends Error {
  readonly kod: number;
  readonly asama: string;
  constructor(asama: string, kod: number) {
    super(`${asama}: ${String(kod)}`);
    this.kod = kod;
    this.asama = asama;
  }
}
// Defterde ve bildirimde okunan neden: hangi adımın reddedildiği ve sunucunun kodu.
const RED_METNI: Readonly<Record<string, string>> = {
  'Karşılama': 'Sunucu bağlantıyı kabul etmedi',
  EHLO: 'Sunucu tanışmayı reddetti',
  STARTTLS: 'Sunucu şifrelemeyi başlatmadı',
  Kimlik: 'Sunucu kullanıcı adı ve parolayı reddetti',
  'Gönderen': 'Sunucu gönderen adresini reddetti',
  'Alıcı': 'Sunucu alıcı adresini reddetti',
  DATA: 'Sunucu iletiyi reddetti',
  'Gönderim': 'Sunucu iletiyi reddetti',
};
async function bekle(hat: Hat, asama: string, beklenen: number): Promise<string[]> {
  const y = await hat.oku();
  if (Math.floor(y.kod / 100) !== beklenen) throw new SmtpHatasi(asama, y.kod);
  return y.satirlar;
}

// Kalıcı hata (5xx) yeniden denenmez; geçici hata ve bağlantı hatası yeniden denenir. Neden metni yalnız aşama ve kodu söyler.
// `yalnizSina`: bağlantı, şifreleme ve kimlik denenir, ileti gönderilmez (Sistem Ayarları "Bağlantıyı sına").
export async function postaGonder(ayar: PostaAyari, ileti: string, alici: string, ac: HatAc = soketAc, yalnizSina = false): Promise<GonderimSonucu> {
  if (!yalnizSina && !izinliAdresMi(alici, ayar.alanAdlari)) return { tamam: false, neden: 'Alıcı izinli alan adında değil', kalici: true };
  let hat: Hat | null = null;
  try {
    hat = await ac(ayar);
    await bekle(hat, 'Karşılama', 2);
    hat.yaz(`EHLO ${ayar.gonderen.slice(ayar.gonderen.indexOf('@') + 1)}`);
    const yetenekler = await bekle(hat, 'EHLO', 2);
    if (ayar.guvenlik === 'starttls') {
      if (!yetenekler.some((y) => /^STARTTLS\b/i.test(y))) return { tamam: false, neden: 'Sunucu STARTTLS sunmuyor', kalici: true };
      hat.yaz('STARTTLS');
      await bekle(hat, 'STARTTLS', 2);
      await hat.tlsYukselt();
      hat.yaz(`EHLO ${ayar.gonderen.slice(ayar.gonderen.indexOf('@') + 1)}`);
      await bekle(hat, 'EHLO', 2);
    }
    if (ayar.kimlik !== null) {
      const plain = Buffer.from(`\0${ayar.kimlik.kullanici}\0${ayar.kimlik.parola}`).toString('base64');
      hat.yaz(`AUTH PLAIN ${plain}`);
      await bekle(hat, 'Kimlik', 2);
    }
    if (yalnizSina) {
      hat.yaz('QUIT');
      return { tamam: true };
    }
    hat.yaz(`MAIL FROM:<${ayar.gonderen}>`);
    await bekle(hat, 'Gönderen', 2);
    hat.yaz(`RCPT TO:<${alici.trim().toLowerCase()}>`);
    await bekle(hat, 'Alıcı', 2);
    hat.yaz('DATA');
    await bekle(hat, 'DATA', 3);
    // Nokta ile başlayan satır ikilenir (RFC 5321 4.5.2); ileti base64 gövdeli olduğu için yalnız başlıkta olabilir.
    hat.yaz(`${ileti.replace(/\r\n\./g, '\r\n..')}\r\n.`);
    await bekle(hat, 'Gönderim', 2);
    hat.yaz('QUIT');
    return { tamam: true };
  } catch (h) {
    if (h instanceof SmtpHatasi) return { tamam: false, neden: `${RED_METNI[h.asama] ?? 'Sunucu reddetti'} (${String(h.kod)})`, kalici: h.kod >= 500 };
    const ileti = h instanceof Error && /zaman aşımı|timed? ?out/i.test(h.message) ? 'Sunucu yanıt vermedi' : 'Sunucuya bağlanılamadı';
    return { tamam: false, neden: ileti, kalici: false };
  } finally {
    hat?.kapat();
  }
}
