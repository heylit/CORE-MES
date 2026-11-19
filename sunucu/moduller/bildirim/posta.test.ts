import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { createServer as tlsSunucuKur, TLSSocket } from 'node:tls';
import { after, describe, test } from 'node:test';
import { disPostaAyariOku, iletiKur, izinliAdresMi, kurumIciAdresMi, ortamPostaAyari, postaAyariOku, postaGonder, soketAc, type PostaAyari } from './posta.ts';

const TEMEL = { TMIV2_POSTA_SUNUCUSU: '10.0.0.25:25', TMIV2_POSTA_ALAN_ADI: 'ornek.local', TMIV2_POSTA_GONDEREN: 'mes@ornek.local' };

// Sahte posta sunucusu (yalnız 127.0.0.1): SMTP konuşmasını kaydeder; yanıtlar senaryoyla değişir.
interface Senaryo { ehlo?: string[]; rcpt?: string; karsilama?: string; sessiz?: boolean }
function sahteSunucu(sen: Senaryo = {}): Promise<{ sunucu: Server; kapi: number; komutlar: string[]; veri: string[] }> {
  const komutlar: string[] = [];
  const veri: string[] = [];
  const sunucu = createServer((s: Socket) => {
    if (sen.sessiz === true) return;
    let tampon = '';
    let veriKipi = false;
    s.write(`${sen.karsilama ?? '220 deneme hazir'}\r\n`);
    s.on('data', (d) => {
      tampon += d.toString('utf8');
      for (;;) {
        if (veriKipi) {
          const son = tampon.indexOf('\r\n.\r\n');
          if (son < 0) return;
          veri.push(tampon.slice(0, son));
          tampon = tampon.slice(son + 5);
          veriKipi = false;
          s.write('250 alindi\r\n');
          continue;
        }
        const i = tampon.indexOf('\r\n');
        if (i < 0) return;
        const satir = tampon.slice(0, i);
        tampon = tampon.slice(i + 2);
        komutlar.push(satir);
        const k = satir.slice(0, 4).toUpperCase();
        if (k === 'EHLO') s.write(`${(sen.ehlo ?? ['250-deneme', '250 8BITMIME']).join('\r\n')}\r\n`);
        else if (k === 'MAIL') s.write('250 tamam\r\n');
        else if (k === 'RCPT') s.write(`${sen.rcpt ?? '250 tamam'}\r\n`);
        else if (k === 'DATA') { veriKipi = true; s.write('354 basla\r\n'); }
        else if (k === 'QUIT') { s.write('221 hoscakal\r\n'); s.end(); }
        else s.write('502 yok\r\n');
      }
    });
  });
  return new Promise((coz) => {
    sunucu.listen(0, '127.0.0.1', () => {
      const a = sunucu.address();
      coz({ sunucu, kapi: typeof a === 'object' && a !== null ? a.port : 0, komutlar, veri });
    });
  });
}

// Kendinden imzalı deneme sertifikası (EC P-256, SAN'da tek DNS adı) testte üretilir; depoya anahtar girmez.
const tlv = (etiket: number, ...p: Buffer[]): Buffer => {
  const b = Buffer.concat(p);
  const n = b.length;
  const boy = n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]);
  return Buffer.concat([Buffer.from([etiket]), boy, b]);
};
const dizi = (...p: Buffer[]): Buffer => tlv(0x30, ...p);
const oid = (s: string): Buffer => {
  const a = s.split('.').map(Number);
  const cikti = [40 * (a[0] ?? 0) + (a[1] ?? 0)];
  for (const v of a.slice(2)) {
    const p = [v & 127];
    for (let x = v >> 7; x > 0; x >>= 7) p.unshift((x & 127) | 128);
    cikti.push(...p);
  }
  return tlv(0x06, Buffer.from(cikti));
};
const ad = (cn: string): Buffer => dizi(tlv(0x31, dizi(oid('2.5.4.3'), tlv(0x0c, Buffer.from(cn)))));
const utc = (d: Date): Buffer => tlv(0x17, Buffer.from(`${d.toISOString().replace(/[-:T]/g, '').slice(2, 14)}Z`));
function sertifikaUret(dnsAdi: string): { cert: string; key: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const alg = dizi(oid('1.2.840.10045.4.3.2'));
  const san = dizi(oid('2.5.29.17'), tlv(0x04, dizi(tlv(0x82, Buffer.from(dnsAdi)))));
  const tbs = dizi(
    tlv(0xa0, tlv(0x02, Buffer.from([2]))), tlv(0x02, Buffer.from([1])), alg, ad(dnsAdi),
    dizi(utc(new Date(Date.now() - 86_400_000)), utc(new Date(Date.now() + 86_400_000))), ad(dnsAdi),
    publicKey.export({ type: 'spki', format: 'der' }), tlv(0xa3, dizi(san)),
  );
  const der = dizi(tbs, alg, tlv(0x03, Buffer.concat([Buffer.from([0]), sign('sha256', tbs, privateKey)])));
  return {
    cert: `-----BEGIN CERTIFICATE-----\n${(der.toString('base64').match(/.{1,64}/g) ?? []).join('\n')}\n-----END CERTIFICATE-----\n`,
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

// Şifreli sahte posta sunucusu: 'tls' doğrudan TLS (465), 'starttls' düz başlayıp STARTTLS ile yükselir (587). Şifreli kanalda gelen
// komutlar kaydedilir; istemci sertifikayı reddederse hiçbir komut gelmez.
function sifreliSunucu(kip: 'tls' | 'starttls', s: { cert: string; key: string }): Promise<{ sunucu: Server; kapi: number; komutlar: string[] }> {
  const komutlar: string[] = [];
  const konus = (k: Socket | TLSSocket, karsila: boolean, yukselt: ((k: Socket) => void) | null) => {
    let tampon = '';
    let veriKipi = false;
    k.on('error', () => undefined);
    if (karsila) k.write('220 deneme\r\n');
    const dinleyici = (d: Buffer) => {
      tampon += d.toString('utf8');
      for (;;) {
        if (veriKipi) {
          const son = tampon.indexOf('\r\n.\r\n');
          if (son < 0) return;
          tampon = tampon.slice(son + 5);
          veriKipi = false;
          k.write('250 alindi\r\n');
          continue;
        }
        const i = tampon.indexOf('\r\n');
        if (i < 0) return;
        const satir = tampon.slice(0, i);
        tampon = tampon.slice(i + 2);
        const komut = satir.slice(0, 4).toUpperCase();
        if (yukselt === null) komutlar.push(komut);
        if (komut === 'EHLO') k.write(yukselt === null ? '250-deneme\r\n250 AUTH PLAIN\r\n' : '250-deneme\r\n250 STARTTLS\r\n');
        else if (komut === 'STAR' && yukselt !== null) { k.removeListener('data', dinleyici); k.write('220 basla\r\n', () => { yukselt(k as Socket); }); return; }
        else if (komut === 'AUTH') k.write('235 tamam\r\n');
        else if (komut === 'MAIL' || komut === 'RCPT') k.write('250 tamam\r\n');
        else if (komut === 'DATA') { veriKipi = true; k.write('354 basla\r\n'); }
        else if (komut === 'QUIT') { k.write('221 hoscakal\r\n'); k.end(); }
        else k.write('502 yok\r\n');
      }
    };
    k.on('data', dinleyici);
  };
  const sunucu = kip === 'tls'
    ? tlsSunucuKur({ cert: s.cert, key: s.key }, (k) => { konus(k, true, null); }).on('tlsClientError', () => undefined)
    : createServer((k) => {
      konus(k, true, (duz) => { konus(new TLSSocket(duz, { isServer: true, cert: s.cert, key: s.key }), false, null); });
    });
  return new Promise((coz) => {
    sunucu.listen(0, '127.0.0.1', () => {
      const a = sunucu.address();
      coz({ sunucu, kapi: typeof a === 'object' && a !== null ? a.port : 0, komutlar });
    });
  });
}

const ayarKur = (kapi: number, ek: Partial<PostaAyari> = {}): PostaAyari => ({
  sunucu: '127.0.0.1', dis: false, kapi, guvenlik: 'yok', alanAdlari: ['ornek.local'], gonderen: 'mes@ornek.local', kimlik: null, ca: null, sertifikaAdi: null, ...ek,
});

describe('posta göndericisi (ADR 0015, 3397)', () => {
  const acik: Server[] = [];
  after(() => { for (const s of acik) s.close(); });

  test('ortam değişkeni yoksa e-posta kapalıdır (null)', () => {
    assert.equal(postaAyariOku({}), null);
    assert.equal(postaAyariOku({ TMIV2_POSTA_SUNUCUSU: '  ' }), null);
  });

  test('geçerli ayar okunur: varsayılan güvenlik STARTTLS, alan adları küçük harfe çevrilir ve tekilleşir', () => {
    const a = postaAyariOku({ ...TEMEL, TMIV2_POSTA_ALAN_ADI: 'Ornek.Local, ornek.local ikinci.local' });
    assert.ok(a);
    assert.equal(a.sunucu, '10.0.0.25');
    assert.equal(a.dis, false);
    assert.equal(a.kapi, 25);
    assert.equal(a.guvenlik, 'starttls');
    assert.deepEqual(a.alanAdlari, ['ornek.local', 'ikinci.local']);
    assert.equal(a.kimlik, null);
    assert.equal(postaAyariOku({ ...TEMEL, TMIV2_POSTA_SUNUCUSU: '[fd00::5]:587' })?.sunucu, 'fd00::5');
  });

  test('geçersiz değer açılışı durdurur; ileti değişkenin adını söyler, değerini söylemez', () => {
    const red = (env: Record<string, string>, ad: string) =>
      assert.throws(() => postaAyariOku({ ...TEMEL, ...env }), (h: Error) => h.message.includes(ad) && !h.message.includes('gizli-parola'));
    red({ TMIV2_POSTA_SUNUCUSU: 'posta.ornek.local:25' }, 'TMIV2_POSTA_SUNUCUSU');
    red({ TMIV2_POSTA_SUNUCUSU: '8.8.8.8:25' }, 'TMIV2_POSTA_SUNUCUSU');
    red({ TMIV2_POSTA_SUNUCUSU: '10.0.0.25:70000' }, 'TMIV2_POSTA_SUNUCUSU');
    red({ TMIV2_POSTA_ALAN_ADI: '' }, 'TMIV2_POSTA_ALAN_ADI');
    red({ TMIV2_POSTA_GONDEREN: 'mes@baska.com' }, 'TMIV2_POSTA_GONDEREN');
    red({ TMIV2_POSTA_GUVENLIK: 'ssl' }, 'TMIV2_POSTA_GUVENLIK');
    red({ TMIV2_POSTA_KULLANICI: 'mes' }, 'TMIV2_POSTA_KULLANICI');
    red({ TMIV2_POSTA_KULLANICI: 'mes', TMIV2_POSTA_PAROLA: 'gizli-parola', TMIV2_POSTA_GUVENLIK: 'yok' }, 'TMIV2_POSTA_GUVENLIK');
    assert.throws(() => postaAyariOku({ ...TEMEL, TMIV2_POSTA_SERTIFIKA: '/yok' }, () => { throw new Error('yok'); }), /TMIV2_POSTA_SERTIFIKA/);
    assert.throws(() => postaAyariOku({ ...TEMEL, TMIV2_POSTA_SERTIFIKA: '/x' }, () => 'duz metin'), /PEM/);
  });

  test('dış posta servisi (3397-4 a): yalnız alan adı ve 465/587; TLS ve kimlik zorunlu, kurum içi sertifika kullanılmaz', () => {
    const DIS = { ...TEMEL, TMIV2_POSTA_SUNUCUSU: '', TMIV2_POSTA_KULLANICI: 'mes@ornek.local', TMIV2_POSTA_PAROLA: 'gizli-parola' };
    assert.equal(disPostaAyariOku(TEMEL), null);
    const a = disPostaAyariOku({ ...DIS, TMIV2_POSTA_DIS_SUNUCUSU: 'Smtp.Ornek-Servis.com:587', TMIV2_POSTA_SERTIFIKA: '/x' });
    assert.ok(a);
    assert.deepEqual({ sunucu: a.sunucu, dis: a.dis, kapi: a.kapi, guvenlik: a.guvenlik, ca: a.ca, sertifikaAdi: a.sertifikaAdi },
      { sunucu: 'smtp.ornek-servis.com', dis: true, kapi: 587, guvenlik: 'starttls', ca: null, sertifikaAdi: 'smtp.ornek-servis.com' });
    assert.equal(disPostaAyariOku({ ...DIS, TMIV2_POSTA_DIS_SUNUCUSU: 'smtp.ornek-servis.com:465', TMIV2_POSTA_GUVENLIK: 'starttls' })?.guvenlik, 'tls');
    const red = (env: Record<string, string>, ad: string) =>
      assert.throws(() => disPostaAyariOku({ ...DIS, TMIV2_POSTA_DIS_SUNUCUSU: 'smtp.ornek-servis.com:587', ...env }), (h: Error) => h.message.includes(ad) && !h.message.includes('gizli-parola'));
    red({ TMIV2_POSTA_DIS_SUNUCUSU: '203.0.113.5:587' }, 'TMIV2_POSTA_DIS_SUNUCUSU');
    red({ TMIV2_POSTA_DIS_SUNUCUSU: 'smtp.ornek-servis.com:25' }, 'TMIV2_POSTA_DIS_SUNUCUSU');
    red({ TMIV2_POSTA_DIS_SUNUCUSU: 'smtp.ornek-servis.com' }, 'TMIV2_POSTA_DIS_SUNUCUSU');
    red({ TMIV2_POSTA_KULLANICI: '', TMIV2_POSTA_PAROLA: '' }, 'TMIV2_POSTA_KULLANICI');
    red({ TMIV2_POSTA_GUVENLIK: 'yok' }, 'TMIV2_POSTA_GUVENLIK');
    red({ TMIV2_POSTA_GONDEREN: 'mes@baska.com' }, 'TMIV2_POSTA_GONDEREN');
  });

  test('kip seçimi: dış kip yalnız dış adresi, kurum içi kip yalnız kurum içi adresi kullanır; adresi olmayan kip kapalıdır', () => {
    assert.equal(ortamPostaAyari(true, TEMEL), null);
    assert.equal(ortamPostaAyari(false, TEMEL)?.sunucu, '10.0.0.25');
    const ikisi = { ...TEMEL, TMIV2_POSTA_DIS_SUNUCUSU: 'smtp.ornek-servis.com:465', TMIV2_POSTA_KULLANICI: 'mes@ornek.local', TMIV2_POSTA_PAROLA: 'p', TMIV2_POSTA_GUVENLIK: 'starttls' };
    assert.equal(ortamPostaAyari(true, ikisi)?.sunucu, 'smtp.ornek-servis.com');
    assert.equal(ortamPostaAyari(false, ikisi)?.sunucu, '10.0.0.25');
    assert.equal(ortamPostaAyari(false, { ...ikisi, TMIV2_POSTA_SUNUCUSU: '' }), null);
  });

  test('dış serviste STARTTLS sunulmazsa parola ve ileti şifresiz gitmez', async () => {
    const f = await sahteSunucu();
    acik.push(f.sunucu);
    const r = await postaGonder(ayarKur(f.kapi, { dis: true, guvenlik: 'starttls', kimlik: { kullanici: 'mes', parola: 'gizli-parola' } }), 'x', 'deneme@ornek.local', soketAc);
    assert.deepEqual(r, { tamam: false, neden: 'Sunucu STARTTLS sunmuyor', kalici: true });
    assert.ok(!f.komutlar.some((c) => c.startsWith('AUTH') || c.startsWith('MAIL')));
  });

  test('TLS: güvenilmeyen ya da adı tutmayan sertifikada parola ve ileti gitmez; güvenilen ve adı tutan sertifikada gider (465 ve 587)', async () => {
    const s = sertifikaUret('posta.ornek.local');
    for (const kip of ['tls', 'starttls'] as const) {
      const dene = async (ek: Partial<PostaAyari>) => {
        const f = await sifreliSunucu(kip, s);
        acik.push(f.sunucu);
        const r = await postaGonder(ayarKur(f.kapi, { guvenlik: kip, kimlik: { kullanici: 'mes', parola: 'gizli-parola' }, ...ek }), 'x', 'deneme@ornek.local', soketAc);
        return { r, komutlar: f.komutlar };
      };
      const guvenilmeyen = await dene({ ca: null, sertifikaAdi: 'posta.ornek.local', dis: true });
      assert.equal(guvenilmeyen.r.tamam, false, kip);
      assert.deepEqual(guvenilmeyen.komutlar, [], kip);
      const baskaAd = await dene({ ca: s.cert, sertifikaAdi: 'baska.ornek.local' });
      assert.equal(baskaAd.r.tamam, false, kip);
      assert.deepEqual(baskaAd.komutlar, [], kip);
      const dogru = await dene({ ca: s.cert, sertifikaAdi: 'posta.ornek.local' });
      assert.deepEqual(dogru.r, { tamam: true }, kip);
      assert.ok(dogru.komutlar.includes('AUTH') && dogru.komutlar.includes('DATA'), kip);
    }
  });

  test('kurum içi adres ve izinli alan adı', () => {
    for (const ip of ['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '127.0.0.1', 'fd12::1', '::1']) assert.equal(kurumIciAdresMi(ip), true, ip);
    for (const ip of ['172.32.0.1', '8.8.8.8', '2001:db8::1', 'posta']) assert.equal(kurumIciAdresMi(ip), false, ip);
    assert.equal(izinliAdresMi('Deneme@Ornek.Local', ['ornek.local']), true);
    assert.equal(izinliAdresMi('deneme@ornek.local.kotu.com', ['ornek.local']), false);
    assert.equal(izinliAdresMi('deneme@ornek.local\r\nBcc: x@kotu.com', ['ornek.local']), false);
  });

  test('ileti: başlıklar kodlanır, satır sonu başlığa sızmaz; simge gömülü parça olarak gelir', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const m = iletiKur('mes@ornek.local', {
      alici: 'deneme@ornek.local', aliciAdi: 'Deneme Kişi', gonderenAdi: 'CORE MES', konu: 'Gecikme\r\nBcc: x@kotu.com', metin: 'düz', html: '<p>h</p>', simgePng: png,
    }, new Date('2026-11-17T09:00:00Z'), 'sinir123');
    const [basliklar = ''] = m.split('\r\n\r\n');
    assert.doesNotMatch(basliklar, /^Bcc:/m);
    assert.match(basliklar, /^Subject: Gecikme Bcc: x@kotu\.com$/m);
    assert.match(basliklar, /^To: =\?UTF-8\?B\?.*\?= <deneme@ornek\.local>$/m);
    assert.match(m, /multipart\/related/);
    assert.match(m, /Content-ID: <simge>/);
    assert.match(m, /Content-Type: image\/png/);
    const resimsiz = iletiKur('mes@ornek.local', { alici: 'deneme@ornek.local', aliciAdi: null, gonderenAdi: 'CORE MES', konu: 'k', metin: 'm', html: 'h', simgePng: null }, new Date(), 's');
    assert.doesNotMatch(resimsiz, /image\/png/);
    const logolu = iletiKur('mes@ornek.local', {
      alici: 'deneme@ornek.local', aliciAdi: null, gonderenAdi: 'CORE MES', konu: 'k', metin: 'm', html: 'h', simgePng: png, logoPng: png,
    }, new Date(), 's');
    assert.match(logolu, /Content-ID: <simge>/);
    assert.match(logolu, /Content-ID: <logo>/);
    assert.equal(logolu.match(/^--rs$/gm)?.length, 3);
    assert.match(logolu, /^--rs--$/m);
  });

  test('gerçek soketle şifresiz gönderim: zarf, nokta ikileme ve QUIT', async () => {
    const f = await sahteSunucu();
    acik.push(f.sunucu);
    const r = await postaGonder(ayarKur(f.kapi), 'Subject: x\r\n\r\nsatir\r\n.nokta', 'Deneme@Ornek.Local', soketAc);
    assert.deepEqual(r, { tamam: true });
    await new Promise((coz) => setTimeout(coz, 50));
    assert.deepEqual(f.komutlar.slice(0, 4), ['EHLO ornek.local', 'MAIL FROM:<mes@ornek.local>', 'RCPT TO:<deneme@ornek.local>', 'DATA']);
    assert.equal(f.komutlar.at(-1), 'QUIT');
    assert.match(f.veri[0] ?? '', /\r\n\.\.nokta$/);
  });

  test('izinli alan adında olmayan alıcıya bağlantı açılmadan kalıcı ret', async () => {
    let acildi = false;
    const r = await postaGonder(ayarKur(1), 'x', 'deneme@baska.com', () => { acildi = true; throw new Error('açılmamalı'); });
    assert.deepEqual(r, { tamam: false, neden: 'Alıcı izinli alan adında değil', kalici: true });
    assert.equal(acildi, false);
  });

  test('5xx kalıcı, 4xx geçici; neden metni adres taşımaz', async () => {
    const k = await sahteSunucu({ rcpt: '550 yok' });
    const g = await sahteSunucu({ rcpt: '451 sonra' });
    acik.push(k.sunucu, g.sunucu);
    const kalici = await postaGonder(ayarKur(k.kapi), 'x', 'deneme@ornek.local', soketAc);
    assert.deepEqual(kalici, { tamam: false, neden: 'Sunucu alıcı adresini reddetti (550)', kalici: true });
    const gecici = await postaGonder(ayarKur(g.kapi), 'x', 'deneme@ornek.local', soketAc);
    assert.equal(gecici.tamam, false);
    assert.equal(!gecici.tamam && gecici.kalici, false);
    assert.doesNotMatch(JSON.stringify([kalici, gecici]), /127\.0\.0\.1|ornek\.local/);
  });

  test('STARTTLS istenip sunulmazsa ileti şifresiz gitmez', async () => {
    const f = await sahteSunucu();
    acik.push(f.sunucu);
    const r = await postaGonder(ayarKur(f.kapi, { guvenlik: 'starttls' }), 'x', 'deneme@ornek.local', soketAc);
    assert.deepEqual(r, { tamam: false, neden: 'Sunucu STARTTLS sunmuyor', kalici: true });
    assert.ok(!f.komutlar.some((c) => c.startsWith('MAIL')));
  });

  test('bağlanılamayan sunucu geçici hatadır', async () => {
    const f = await sahteSunucu();
    const kapi = f.kapi;
    await new Promise<void>((coz) => f.sunucu.close(() => coz()));
    const r = await postaGonder(ayarKur(kapi), 'x', 'deneme@ornek.local', soketAc);
    assert.deepEqual(r, { tamam: false, neden: 'Sunucuya bağlanılamadı', kalici: false });
  });

  test('sınama ileti göndermez: yalnız EHLO ve QUIT', async () => {
    const f = await sahteSunucu();
    acik.push(f.sunucu);
    assert.deepEqual(await postaGonder(ayarKur(f.kapi), '', '', soketAc, true), { tamam: true });
    await new Promise((coz) => setTimeout(coz, 50));
    assert.deepEqual(f.komutlar, ['EHLO ornek.local', 'QUIT']);
  });
});
