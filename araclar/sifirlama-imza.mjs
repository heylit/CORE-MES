#!/usr/bin/env node
// CORE MES "Sifirdan basla" imza araci (kart 3728). Tek dosya, yalniz Node'un kendi modulleri; internete baglanmaz.
// Gizli anahtar yalniz bu bilgisayarda ve USB'de durur; hicbir yere gonderilmez.
//
//   node sifirlama-imza.mjs uret <klasor>          anahtar cifti uretir (gizli anahtar parolayla sifreli)
//   node sifirlama-imza.mjs imzala <gizli.pem> <istek-dosyasi>   istegi imzalar, yanina .izin dosyasi yazar
//   node sifirlama-imza.mjs dogrula <acik.pem> <izin-dosyasi>    izni acik anahtarla dener
//   node sifirlama-imza.mjs parmak-izi <acik.pem>                 acik anahtarin kisa ozeti

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const GIZLI_AD = 'coremes-sifirlama-gizli.pem';
const ACIK_AD = 'coremes-sifirlama-acik.pem';

function dur(ileti) {
  process.stderr.write(`HATA: ${ileti}\n`);
  process.exit(1);
}

// Parola ekrana yazilmadan okunur. Komut gecmisine ya da ortam degiskenine girmesin diye baska yol yoktur.
function parolaSor(soru) {
  if (!process.stdin.isTTY) dur('Parola yalniz klavyeden girilir (komut penceresinde calistirin).');
  return new Promise((coz) => {
    process.stdout.write(soru);
    const girdi = process.stdin;
    girdi.setRawMode(true);
    girdi.resume();
    girdi.setEncoding('utf8');
    let parola = '';
    const dinle = (parca) => {
      for (const ch of parca) {
        if (ch === '\r' || ch === '\n') {
          girdi.setRawMode(false);
          girdi.pause();
          girdi.removeListener('data', dinle);
          process.stdout.write('\n');
          coz(parola);
          return;
        }
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (ch === '\u0008' || ch === '\u007f') { parola = parola.slice(0, -1); continue; }
        parola += ch;
      }
    };
    girdi.on('data', dinle);
  });
}

// Onay satiri ekrana yazilarak okunur (parola degildir).
function satirSor(soru) {
  return new Promise((coz) => {
    process.stdout.write(soru);
    process.stdin.setRawMode?.(false);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (d) => { process.stdin.pause(); coz(String(d).split(/\r?\n/)[0]); });
  });
}

function parmakIzi(acikPem) {
  const der = createPublicKey(acikPem).export({ type: 'spki', format: 'der' });
  const h = createHash('sha256').update(der).digest('hex').slice(0, 16).toUpperCase();
  return h.match(/.{4}/g).join('-');
}

async function uret(klasor) {
  if (!klasor) dur('Klasor verin, or. E:\\ (USB).');
  if (!existsSync(klasor)) mkdirSync(klasor, { recursive: true });
  const gizliYol = join(klasor, GIZLI_AD);
  const acikYol = join(klasor, ACIK_AD);
  if (existsSync(gizliYol) || existsSync(acikYol)) dur(`${klasor} icinde anahtar zaten var; ustune yazilmaz.`);
  const p1 = await parolaSor('Gizli anahtar parolasi (en az 12 karakter): ');
  if (p1.length < 12) dur('Parola en az 12 karakter olmali.');
  const p2 = await parolaSor('Parola tekrar: ');
  if (p1 !== p2) dur('Parolalar ayni degil.');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: p1 },
  });
  writeFileSync(gizliYol, privateKey, { mode: 0o600, flag: 'wx' });
  writeFileSync(acikYol, publicKey, { flag: 'wx' });
  process.stdout.write(`\nGizli anahtar: ${gizliYol}  (KIMSEYE VERMEYIN)\nAcik anahtar : ${acikYol}\nParmak izi   : ${parmakIzi(publicKey)}\n\n`);
  process.stdout.write('Asagidaki acik anahtari (yalniz bunu) sohbete yapistirabilirsiniz:\n\n' + publicKey);
}

async function imzala(gizliYol, istekYol) {
  if (!gizliYol || !istekYol) dur('Kullanim: imzala <gizli.pem> <istek-dosyasi>');
  const istek = readFileSync(istekYol);
  if (istek.length === 0 || istek.length > 8192) dur('Istek dosyasi bos ya da cok buyuk.');
  let alanlar = {};
  try { alanlar = JSON.parse(istek.toString('utf8')); } catch { dur('Istek dosyasi CORE MES istegi degil.'); }
  if (alanlar.tur !== 'coremes-sifirlama') dur('Istek dosyasi CORE MES sifirlama istegi degil.');
  process.stdout.write(`\nImzalanacak istek:\n  Ortam   : ${alanlar.ortam}\n  Kurulum : ${alanlar.kurulum}\n  Son     : ${alanlar.son}\n`);
  if ((await satirSor('Bu kurulumu SIFIRLAMAK icin imzalansin mi? (evet yazin): ')).trim().toLowerCase() !== 'evet') dur('Imzalanmadi.');
  const parola = await parolaSor('Gizli anahtar parolasi: ');
  let anahtar;
  try {
    anahtar = createPrivateKey({ key: readFileSync(gizliYol), passphrase: parola });
  } catch {
    dur('Parola yanlis ya da dosya gizli anahtar degil.');
  }
  const imza = sign(null, istek, anahtar);
  const izin = { surum: 1, istek: istek.toString('base64'), imza: imza.toString('base64'), parmak_izi: parmakIzi(createPublicKey(anahtar).export({ type: 'spki', format: 'pem' })) };
  const cikti = `${istekYol}.izin`;
  writeFileSync(cikti, JSON.stringify(izin, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(`\nIzin dosyasi: ${cikti}\nBu dosyayi sifirlama ekranina yukleyin. Gizli anahtar dosyasini yuklemeyin.\n`);
}

function dogrula(acikYol, izinYol) {
  if (!acikYol || !izinYol) dur('Kullanim: dogrula <acik.pem> <izin-dosyasi>');
  const izin = JSON.parse(readFileSync(izinYol, 'utf8'));
  const tamam = verify(null, Buffer.from(izin.istek, 'base64'), createPublicKey(readFileSync(acikYol)), Buffer.from(izin.imza, 'base64'));
  process.stdout.write(tamam ? `GECERLI (${basename(izinYol)})\n` : 'GECERSIZ: imza bu acik anahtarla dogrulanmadi.\n');
  process.exit(tamam ? 0 : 2);
}

const [komut, a, b] = process.argv.slice(2);
if (komut === 'uret') await uret(a);
else if (komut === 'imzala') await imzala(a, b);
else if (komut === 'dogrula') dogrula(a, b);
else if (komut === 'parmak-izi') process.stdout.write(parmakIzi(readFileSync(a)) + '\n');
else dur('Komut: uret | imzala | dogrula | parmak-izi (dosyanin basindaki aciklamaya bakin).');
