import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { ayarOku } from '#cekirdek/ayar.ts';
import { uygulamaHavuzuAc } from '#cekirdek/db.ts';
import { CANLI_RED, modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { CALISMA_KLASORU, HESAP_DOSYASI } from './yollar.ts';

// Ekran testlerinin verisi: göçleri uygulanmış boş veritabanına modüllerin örnek verisi (yalnız ORN- kayıtları) yüklenir.
// Bütün örnek hesaplar bu koşuya özel tek parolayı alır; parola depoya girmez, yalnız işletim sisteminin geçici klasöründe durur.
const ayar = ayarOku();
if (ayar.ortam === 'canli') {
  console.error(CANLI_RED);
  process.exit(1);
}

const parola = randomBytes(12).toString('base64url');
const vt = await uygulamaHavuzuAc(ayar);
try {
  const sonuc = await ornekVeriYukle(vt, await modulOrnekVerileriniKesfet(), {
    ortam: ayar.ortam, parolaUret: () => parola, bildir: () => {},
  });
  if (sonuc.durum === 'yuklu' || sonuc.yuklu !== undefined) {
    // Parolası bilinmeyen hesaplarla test koşmaz: önceki koşunun dosyası varsa o kullanılır.
    if (!existsSync(HESAP_DOSYASI)) {
      console.error('Örnek veri bu veritabanında zaten yüklü ve parolası bilinmiyor. Ekran testleri boş bir veritabanı ister (TMIV2_PG_DATABASE).');
      process.exitCode = 1;
    } else {
      console.log('Örnek veri zaten yüklü; önceki koşunun hesapları kullanılacak.');
    }
  } else {
    mkdirSync(CALISMA_KLASORU, { recursive: true, mode: 0o700 });
    writeFileSync(HESAP_DOSYASI, JSON.stringify({ parola }), { mode: 0o600 });
    console.log(`Örnek veri yüklendi: ${sonuc.moduller.join(', ')}`);
  }
} finally {
  await vt.kapat();
}
