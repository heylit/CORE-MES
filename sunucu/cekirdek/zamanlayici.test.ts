import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { setTimeout as bekle } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { veritabaniAc } from './db.ts';
import type { Db, Veritabani } from './db.ts';
import { testSemasiAc } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';
import {
  EN_KISA_ARALIK_MS, NEDEN_EN_UZUN, OTURUMSUZ_VERITABANI, isBekliyor, isDurumlari, isTanimi, isiBirKezCalistir, modulIsleriniKesfet,
  zamanlayiciKur,
} from './zamanlayici.ts';
import type { IsCalisi, IsTanimi, TxDisiIs } from './zamanlayici.ts';

const bos = async (): Promise<void> => undefined;
const sessiz = { error: () => undefined, warn: () => undefined };

async function olana(kosul: () => boolean, sinirMs = 5000): Promise<void> {
  const son = Date.now() + sinirMs;
  while (!kosul()) {
    if (Date.now() > son) throw new Error('Koşul süresinde gerçekleşmedi');
    await bekle(20);
  }
}

function sozVer(): { soz: Promise<void>; coz: () => void } {
  let coz = (): void => undefined;
  const soz = new Promise<void>((c) => { coz = c; });
  return { soz, coz };
}

test('tanım: geçerli tanım kabul edilir ve donar; boş ya da biçimsiz ad, 1 sn altı ya da kesirli aralık anında hata', () => {
  const is = isTanimi({ ad: 'arkon-yineleyici', aralikMs: EN_KISA_ARALIK_MS, calis: bos });
  assert.equal(is.ad, 'arkon-yineleyici');
  assert.equal(Object.isFrozen(is), true);
  for (const ad of ['', ' ', 'Buyuk', 'bosluk var', '-bas', 'son-', 'ç']) {
    assert.throws(() => isTanimi({ ad, aralikMs: 5000, calis: bos }), /İş adı/, ad);
  }
  for (const aralikMs of [EN_KISA_ARALIK_MS - 1, 0, -5, 1500.5, Number.NaN]) {
    assert.throws(() => isTanimi({ ad: 'x', aralikMs, calis: bos }), /aralığı/, String(aralikMs));
  }
});

test('tanım: yinelenen ad ve isTanimi dışından gelen nesne zamanlayıcıda reddedilir', () => {
  const vt = {} as Veritabani;
  const a = isTanimi({ ad: 'a', aralikMs: 5000, calis: bos });
  assert.doesNotThrow(() => zamanlayiciKur({ vt, gunluk: sessiz, isler: [a, isTanimi({ ad: 'b', aralikMs: 5000, calis: bos })] }));
  assert.throws(() => zamanlayiciKur({ vt, gunluk: sessiz, isler: [a, isTanimi({ ad: 'a', aralikMs: 9000, calis: bos })] }), /yineleniyor: a/);
  assert.throws(() => zamanlayiciKur({ vt, gunluk: sessiz, isler: [{ ad: 'c', aralikMs: 1, calis: bos }] }), /isTanimi/);
});

test('tanım (txDisi): yalnız txDisi taşıyan tanım kabul edilir; ikisi birden, hiçbiri ve işlev olmayan txDisi reddedilir', () => {
  const is = isTanimi({ ad: 'kopru', aralikMs: 5000, txDisi: bos });
  assert.equal(Object.isFrozen(is), true);
  assert.equal(is.txDisi, bos);
  assert.equal(is.calis, undefined);
  assert.throws(() => isTanimi({ ad: 'iki', aralikMs: 5000, calis: bos, txDisi: bos }), /yalnız birini/);
  assert.throws(() => isTanimi({ ad: 'hic', aralikMs: 5000 }), /calis ya da txDisi işlevi yok/);
  assert.throws(() => isTanimi({ ad: 'sayi', aralikMs: 5000, txDisi: 5 as unknown as TxDisiIs }), /txDisi işlevi yok/);
  assert.throws(() => isTanimi({ ad: 'sayi', aralikMs: 5000, calis: 5 as unknown as IsCalisi }), /calis ya da txDisi işlevi yok/);
});

test('txDisi: oturumda yöntemi olmayan veritabanıyla tur açık hata verir; iş ve transaction koşmaz', async () => {
  let cagri = 0;
  const vt = { tx: async () => { cagri += 1; }, okumaTx: async () => { cagri += 1; } } as unknown as Veritabani;
  const is = isTanimi({ ad: 'oturumsuz', aralikMs: 5000, txDisi: async () => { cagri += 1; } });
  await assert.rejects(isiBirKezCalistir(vt, is), (hata: Error) => hata.message === `${OTURUMSUZ_VERITABANI}: oturumsuz`);
  assert.equal(cagri, 0);
});

describe('keşif', () => {
  let klasor = '';
  const zamanlayiciYolu = pathToFileURL(join(import.meta.dirname, 'zamanlayici.ts')).href;
  const yaz = async (kok: string, ad: string, icerik: string | null): Promise<void> => {
    await mkdir(join(kok, ad), { recursive: true });
    if (icerik !== null) await writeFile(join(kok, ad, 'isler.ts'), icerik);
  };
  const tekIs = (ad: string): string =>
    `import { isTanimi } from '${zamanlayiciYolu}';\nexport const isler = [isTanimi({ ad: '${ad}', aralikMs: 2000, calis: async () => undefined })];\n`;

  before(async () => { klasor = await mkdtemp(join(tmpdir(), 'tmiv2-isler-')); });
  after(async () => { await rm(klasor, { recursive: true, force: true }); });

  test('isler.ts olan modülün işi bulunur, olmayan modül atlanır', async () => {
    const kok = join(klasor, 'iyi');
    await yaz(kok, 'birinci', tekIs('birinci-is'));
    await yaz(kok, 'isiz', null);
    assert.deepEqual((await modulIsleriniKesfet(kok)).map((i) => i.ad), ['birinci-is']);
  });

  test('dizi vermeyen isler.ts ve iki modülde aynı ad açılışı durdurur', async () => {
    const bozuk = join(klasor, 'bozuk');
    const ikiz = join(klasor, 'ikiz');
    await yaz(bozuk, 'tek', 'export const isler = 5;\n');
    await assert.rejects(modulIsleriniKesfet(bozuk), /iş dizisi vermiyor.*moduller\/tek\/isler\.ts/);
    await yaz(ikiz, 'a', tekIs('ortak'));
    await yaz(ikiz, 'b', tekIs('ortak'));
    await assert.rejects(modulIsleriniKesfet(ikiz), /yineleniyor: ortak/);
  });
});

// Süre sınırı: kapanış ya da kilit kusurunda test asılı kalmaz, kırmızı olur.
describe('çalışma (gerçek PostgreSQL)', { timeout: 40_000 }, () => {
  let vt: Veritabani | undefined;
  let sema = '';
  let ayar: TestVeritabani['ayar'] | undefined;
  let kaldir: (() => Promise<void>) | undefined;
  const acik = (): Veritabani => {
    if (!vt) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return vt;
  };
  const yaz = (db: Db, ad: string): Promise<unknown> => db.sorgu('INSERT INTO iz (ad) VALUES ($1)', [ad]);
  const izler = async (): Promise<string[]> =>
    (await acik().sorgu<{ ad: string }>('SELECT ad FROM iz ORDER BY id')).map((s) => s.ad);
  const kilidiTut = (anahtar: string, birak: Promise<void>): Promise<void> => acik().tx(async (db) => {
    await db.sorgu('SELECT pg_advisory_xact_lock(hashtext($1))', [anahtar]);
    await birak;
  });

  before(async () => {
    const ortam = await testSemasiAc('zamanlayici');
    ({ kaldir, sema, ayar } = ortam);
    await ortam.sahip.sorgu("CREATE TABLE iz (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ad text NOT NULL CHECK (ad <> 'yasak'))");
    vt = ortam.vt;
  });
  after(async () => { await kaldir?.(); });

  test('işlem: başarılı turun yazısı kalır; hata atan turun yazısı geri alınır', async () => {
    assert.equal(await isiBirKezCalistir(acik(), isTanimi({ ad: 'kalir', aralikMs: 5000, calis: (db) => yaz(db, 'kalir').then(bos) })), 'tamam');
    await assert.rejects(isiBirKezCalistir(acik(), isTanimi({
      ad: 'gider', aralikMs: 5000,
      calis: async (db) => { await yaz(db, 'gider'); throw new Error('dur'); },
    })), /dur/);
    assert.deepEqual(await izler(), ['kalir']);
  });

  test('kilit: aynı şemada aynı iş kilidi tutuluyorsa tur atlanır ve calis çağrılmaz; başka şemanın kilidi turu durdurmaz', async () => {
    let cagri = 0;
    const is = isTanimi({ ad: 'kilitli', aralikMs: 5000, calis: async () => { cagri += 1; } });
    const birak = sozVer();
    const tutan = kilidiTut(`${sema}:is-kilitli`, birak.soz);
    const yabanci = sozVer();
    const baskasi = kilidiTut('baska_sema:is-kilitli', yabanci.soz);
    // Kilitler her durumda bırakılır: kırmızı test koşuyu asılı bırakmasın.
    try {
      await bekle(100);
      assert.equal(await isiBirKezCalistir(acik(), is), 'atlandi');
      assert.equal(cagri, 0);
      birak.coz();
      await tutan;
      assert.equal(await isiBirKezCalistir(acik(), is), 'tamam');
      assert.equal(cagri, 1);
    } finally {
      birak.coz();
      yabanci.coz();
      await Promise.all([tutan, baskasi]);
    }
  });

  test('hata: tur hata atınca durum "hata", özet ham ileti ve değer taşımaz; sonraki tur yine koşar ve durumu düzeltir', async () => {
    let tur = 0;
    const gunluge: unknown[] = [];
    const zamanlayici = zamanlayiciKur({
      vt: acik(),
      gunluk: { error: (nesne) => { gunluge.push(nesne.err); }, warn: () => undefined },
      isler: [isTanimi({
        ad: 'bozuk', aralikMs: EN_KISA_ARALIK_MS,
        calis: async (db) => {
          tur += 1;
          if (tur === 1) await yaz(db, 'yasak');
          if (tur === 2) throw new Error('gizli-ileti 12345');
        },
      })],
    });
    zamanlayici.baslat();
    try {
      await olana(() => tur >= 1 && zamanlayici.durumlar()[0]?.sonBitis !== null);
      const ilk = zamanlayici.durumlar()[0];
      assert.equal(ilk?.sonSonuc, 'hata');
      assert.equal(ilk?.sonHata, 'Veritabanı hatası 23514 (kısıt: iz_ad_check)');
      await olana(() => tur >= 2 && zamanlayici.durumlar()[0]?.sonBitis !== null && zamanlayici.durumlar()[0]?.sonHata !== ilk?.sonHata);
      assert.equal(zamanlayici.durumlar()[0]?.sonHata, 'Beklenmeyen hata (Error)');
      await olana(() => tur >= 3 && zamanlayici.durumlar()[0]?.sonSonuc === 'tamam');
      assert.equal(zamanlayici.durumlar()[0]?.sonHata, null);
      assert.equal(gunluge.length, 2);
      assert.equal(JSON.stringify(zamanlayici.durumlar()).includes('yasak') || JSON.stringify(zamanlayici.durumlar()).includes('gizli'), false);
      assert.deepEqual(await izler(), ['kalir']);
    } finally {
      await zamanlayici.durdur(2000);
    }
  });

  test('bekleme: iş isBekliyor dönünce durum "bekliyor" ve nedeni görünür, hata yazılmaz; günlüğe yalnız durum ya da neden değişince düşer', async () => {
    let tur = 0;
    const uyarilar: string[] = [];
    const hatalar: unknown[] = [];
    // Turlar: bekliyor A, bekliyor A, bekliyor B, tamam, bekliyor A, sonra hep tamam.
    const plan = ['A', 'A', 'B', null, 'A'];
    const zamanlayici = zamanlayiciKur({
      vt: acik(),
      gunluk: { error: (nesne) => { hatalar.push(nesne.err); }, warn: (_nesne, mesaj) => { uyarilar.push(mesaj); } },
      isler: [isTanimi({
        ad: 'bekleyen', aralikMs: EN_KISA_ARALIK_MS,
        calis: async () => {
          const neden = plan[tur];
          tur += 1;
          return neden ? isBekliyor(`Bağlantı ayarı eksik ${neden}`) : undefined;
        },
      })],
    });
    zamanlayici.baslat();
    try {
      await olana(() => tur >= 1 && zamanlayici.durumlar()[0]?.sonBitis !== null);
      assert.deepEqual(
        (({ sonSonuc, sonHata, sonNeden }) => ({ sonSonuc, sonHata, sonNeden }))(zamanlayici.durumlar()[0] ?? { sonSonuc: null, sonHata: null, sonNeden: null }),
        { sonSonuc: 'bekliyor', sonHata: null, sonNeden: 'Bağlantı ayarı eksik A' },
      );
      await olana(() => tur >= 6 && zamanlayici.durumlar()[0]?.sonSonuc === 'tamam', 12_000);
      assert.equal(zamanlayici.durumlar()[0]?.sonNeden, null);
      assert.deepEqual(uyarilar, [
        'Zamanlanmış iş bekliyor: bekleyen: Bağlantı ayarı eksik A',
        'Zamanlanmış iş bekliyor: bekleyen: Bağlantı ayarı eksik B',
        'Zamanlanmış iş bekliyor: bekleyen: Bağlantı ayarı eksik A',
      ]);
      assert.deepEqual(hatalar, []);
    } finally {
      await zamanlayici.durdur(2000);
    }
  });

  test('bekleme: isBekliyor boş ya da uzun nedeni reddeder; elle kurulmuş biçimsiz dönüş tur hatasıdır', async () => {
    assert.throws(() => isBekliyor(' '), /Bekleme nedeni/);
    assert.throws(() => isBekliyor('x'.repeat(NEDEN_EN_UZUN + 1)), /Bekleme nedeni/);
    assert.equal(isBekliyor(` ${'x'.repeat(NEDEN_EN_UZUN)} `).neden.length, NEDEN_EN_UZUN);
    assert.equal(await isiBirKezCalistir(acik(), isTanimi({ ad: 'bekle-bir', aralikMs: 5000, calis: async () => isBekliyor('Kapalı') })), 'bekliyor');
    const bicimsiz = isTanimi({ ad: 'bicimsiz', aralikMs: 5000, calis: async () => ({ durum: 'bekliyor', neden: '' }) });
    await assert.rejects(isiBirKezCalistir(acik(), bicimsiz), /Bekleme nedeni/);
    const yabanci = isTanimi({ ad: 'yabanci', aralikMs: 5000, calis: (async () => 'tamam') as unknown as () => Promise<void> });
    await assert.rejects(isiBirKezCalistir(acik(), yabanci), /tanımsız değer/);
  });

  test('üst üste binme: yavaş tur bitmeden aynı işin ikinci turu başlamaz; aralık tur bitişinden sayılır', async () => {
    let suren = 0;
    let enCok = 0;
    const baslamalar: number[] = [];
    const bitisler: number[] = [];
    const zamanlayici = zamanlayiciKur({
      vt: acik(), gunluk: sessiz,
      isler: [isTanimi({
        ad: 'yavas', aralikMs: EN_KISA_ARALIK_MS,
        calis: async () => {
          suren += 1;
          enCok = Math.max(enCok, suren);
          baslamalar.push(Date.now());
          await bekle(1300);
          bitisler.push(Date.now());
          suren -= 1;
        },
      })],
    });
    zamanlayici.baslat();
    try {
      await olana(() => baslamalar.length >= 2, 8000);
      assert.equal(enCok, 1);
      assert.equal((baslamalar[1] ?? 0) - (bitisler[0] ?? Infinity) >= EN_KISA_ARALIK_MS - 50, true);
    } finally {
      await zamanlayici.durdur(3000);
    }
  });

  test('kapanış: durdur süren turu bekler ve yeni tur kurmaz; süre dolarsa tur bitmese de döner', async () => {
    let tur = 0;
    let bitti = false;
    const zamanlayici = zamanlayiciKur({
      vt: acik(), gunluk: sessiz,
      isler: [isTanimi({ ad: 'kapanan', aralikMs: EN_KISA_ARALIK_MS, calis: async () => { tur += 1; await bekle(400); bitti = true; } })],
    });
    zamanlayici.baslat();
    await olana(() => tur === 1);
    await zamanlayici.durdur(5000);
    assert.equal(bitti, true);
    await bekle(EN_KISA_ARALIK_MS + 300);
    assert.equal(tur, 1);

    const takili = sozVer();
    let girdi = false;
    const asili = zamanlayiciKur({
      vt: acik(), gunluk: sessiz,
      isler: [isTanimi({ ad: 'asili', aralikMs: EN_KISA_ARALIK_MS, calis: async () => { girdi = true; await takili.soz; } })],
    });
    asili.baslat();
    try {
      await olana(() => girdi);
      const once = Date.now();
      await asili.durdur(100);
      assert.equal(Date.now() - once < 1000, true);
    } finally {
      takili.coz();
    }
  });

  test('kapanış iki tur arasında: bekleyen tur kurulmuş olsa da durdur sonrası koşmaz; günlük hata atsa da iş sürer', async () => {
    let tur = 0;
    const zamanlayici = zamanlayiciKur({
      vt: acik(), gunluk: sessiz,
      isler: [isTanimi({ ad: 'arada', aralikMs: EN_KISA_ARALIK_MS, calis: async () => { tur += 1; } })],
    });
    zamanlayici.baslat();
    await zamanlayici.durdur(100);
    await bekle(EN_KISA_ARALIK_MS + 300);
    assert.equal(tur, 0);

    let deneme = 0;
    const bozukGunluk = zamanlayiciKur({
      vt: acik(),
      gunluk: { error: () => { throw new Error('günlük yazılamadı'); }, warn: () => { throw new Error('günlük yazılamadı'); } },
      isler: [isTanimi({ ad: 'gunluksuz', aralikMs: EN_KISA_ARALIK_MS, calis: async () => { deneme += 1; if (deneme === 1) throw new Error('ilk'); } })],
    });
    bozukGunluk.baslat();
    try {
      await olana(() => bozukGunluk.durumlar()[0]?.sonSonuc === 'tamam');
      assert.equal(deneme >= 2, true);
    } finally {
      await bozukGunluk.durdur(2000);
    }
  });

  test('süreçte tek zamanlayıcı: ikinci başlatma reddedilir; durumlar başlayanınkidir, durunca boşalır', async () => {
    const isler: IsTanimi[] = [isTanimi({ ad: 'tek', aralikMs: 60_000, calis: bos })];
    const birinci = zamanlayiciKur({ vt: acik(), gunluk: sessiz, isler });
    assert.deepEqual(isDurumlari(), []);
    birinci.baslat();
    try {
      assert.throws(() => { birinci.baslat(); }, /bir kez/);
      assert.throws(() => { zamanlayiciKur({ vt: acik(), gunluk: sessiz, isler }).baslat(); }, /başka bir zamanlayıcı/);
      assert.deepEqual(isDurumlari(), [{
        ad: 'tek', aralikMs: 60_000, sonBaslama: null, sonBitis: null, sonSonuc: null, sonHata: null, sonNeden: null, sonSaglikliBitis: null,
      }]);
    } finally {
      await birinci.durdur(100);
    }
    assert.deepEqual(isDurumlari(), []);
  });

  // Kilidi tutan oturumun transaction durumu sunucudan okunur; anahtar turun kilidiyle aynı ifadeyle kurulur.
  const kilitSahibi = async (ad: string): Promise<Array<{ durum: string | null; txAcik: boolean }>> =>
    acik().sorgu<{ durum: string | null; txAcik: boolean }>(
      `SELECT a.state AS durum, a.xact_start IS NOT NULL AS "txAcik"
         FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE l.locktype = 'advisory' AND l.granted AND l.objsubid = 1
          AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND l.classid::text::bigint = ((hashtext($1)::bigint >> 32) & 4294967295)
          AND l.objid::text::bigint = (hashtext($1)::bigint & 4294967295)`,
      [`${sema}:is-${ad}`],
    );

  test('txDisi: aynı işin eşzamanlı ikinci turu (iki biçimde de) atlanır; tur bitince kilit bırakılır, sonraki tur koşar', async () => {
    let cagri = 0;
    const tut = sozVer();
    let girdi = false;
    // Yalnız ilk tur bekler: kilit kusurunda ikinci tur da girerse test asılı kalmaz, kırmızı olur.
    const is = isTanimi({
      ad: 'esli', aralikMs: 5000,
      txDisi: async () => { cagri += 1; if (cagri === 1) { girdi = true; await tut.soz; } } });
    const ilk = isiBirKezCalistir(acik(), is);
    try {
      await olana(() => girdi);
      assert.equal(await isiBirKezCalistir(acik(), is), 'atlandi');
      assert.equal(await isiBirKezCalistir(acik(), isTanimi({ ad: 'esli', aralikMs: 5000, calis: async () => { cagri += 100; } })), 'atlandi');
      assert.equal(cagri, 1);
    } finally {
      tut.coz();
    }
    assert.equal(await ilk, 'tamam');
    assert.deepEqual(await kilitSahibi('esli'), []);
    assert.equal(await isiBirKezCalistir(acik(), is), 'tamam');
    assert.equal(cagri, 2);
  });

  test('txDisi: dış bekleme sırasında kilidi tutan oturumda transaction açık değil; işin kısa transaction\'ı beklemeden önce kalıcı', async () => {
    const tut = sozVer();
    let bekliyor = false;
    const ilk = isiBirKezCalistir(acik(), isTanimi({
      ad: 'kopru-bekler', aralikMs: 5000,
      txDisi: async (v) => {
        await v.tx(async (db) => { await yaz(db, 'kopru-oncesi'); });
        bekliyor = true;
        await tut.soz;
      },
    }));
    try {
      await olana(() => bekliyor);
      assert.deepEqual(await kilitSahibi('kopru-bekler'), [{ durum: 'idle', txAcik: false }]);
      assert.equal((await izler()).includes('kopru-oncesi'), true);
    } finally {
      tut.coz();
    }
    assert.equal(await ilk, 'tamam');

    // Ölçünün kendisi sınanır: calis biçiminde bekleyen tur kilidi açık transaction'da tutar.
    const tut2 = sozVer();
    let girdi = false;
    const eski = isiBirKezCalistir(acik(), isTanimi({ ad: 'tx-bekler', aralikMs: 5000, calis: async () => { girdi = true; await tut2.soz; } }));
    try {
      await olana(() => girdi);
      assert.deepEqual(await kilitSahibi('tx-bekler'), [{ durum: 'idle in transaction', txAcik: true }]);
    } finally {
      tut2.coz();
    }
    assert.equal(await eski, 'tamam');
  });

  test('txDisi: tur hata verince kilit bırakılır, sonraki tur alır; önceki transaction\'ın yazısı kalır; isBekliyor da döner', async () => {
    let tur = 0;
    const is = isTanimi({
      ad: 'kopru-hata', aralikMs: 5000,
      txDisi: async (v) => {
        tur += 1;
        if (tur === 1) {
          await v.tx(async (db) => { await yaz(db, 'hata-oncesi'); });
          throw new Error('köprü cevap vermedi');
        }
        return tur === 2 ? isBekliyor('Köprü kapalı') : undefined;
      },
    });
    await assert.rejects(isiBirKezCalistir(acik(), is), /köprü cevap vermedi/);
    assert.deepEqual(await kilitSahibi('kopru-hata'), []);
    assert.equal(await isiBirKezCalistir(acik(), is), 'bekliyor');
    assert.equal(await isiBirKezCalistir(acik(), is), 'tamam');
    assert.equal((await izler()).filter((ad) => ad === 'hata-oncesi').length, 1);
  });

  test('oturumda: bağlantı havuza kilitsiz, şeması korunarak döner; açık transaction bırakan iş hata alır, bağlantı kapanır; bitmiş db reddeder', async () => {
    if (!ayar) throw new Error('Test ayarı yok');
    const tekli = veritabaniAc(ayar, { sema, havuzBoyutu: 1 });
    const pidOku = async (): Promise<number | undefined> => (await tekli.tek<{ pid: number }>('SELECT pg_backend_pid() AS pid'))?.pid;
    try {
      const oturumda = tekli.oturumda?.bind(tekli);
      if (!oturumda) throw new Error('oturumda yok');
      let kalan: Db | undefined;
      const pid = await oturumda(async (db) => {
        kalan = db;
        await db.sorgu('SELECT pg_advisory_lock(hashtext($1))', [`${sema}:sizinti`]);
        return (await db.tek<{ pid: number }>('SELECT pg_backend_pid() AS pid'))?.pid;
      });
      // Tekli havuzda aynı bağlantı yeniden verilir: arama yolu açılıştaki gibi, kilit bırakılmış.
      assert.equal(await pidOku(), pid);
      assert.equal(Array.isArray(await tekli.sorgu('SELECT ad FROM iz')), true);
      const kilit = await acik().tx(async (db) =>
        db.tek<{ alindi: boolean }>('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS alindi', [`${sema}:sizinti`]));
      assert.equal(kilit?.alindi, true);
      await assert.rejects(kalan?.sorgu('SELECT 1') ?? Promise.resolve(), /Oturum bitti/);

      await assert.rejects(oturumda(async (db) => { await db.sorgu('BEGIN'); }), (hata: { code?: unknown }) => hata.code === '25001');
      assert.notEqual(await pidOku(), pid);
    } finally {
      await tekli.kapat();
    }
  });
});
