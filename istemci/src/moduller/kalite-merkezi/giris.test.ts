import { describe, expect, it } from 'vitest';
import type { KmKimlikCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { KITAPLIK_KIMLIKLERI, PIN_YERLERI, sayfaKur } from './sayfa.ts';
import { KM_PAKETI } from './uygulama/paket.ts';

// Giriş TMI oturumudur, ayrı PIN yoktur (yazılı onay 2026-10-16). Uygulamanın giriş kapısı, yetki denetimi, kullanıcı
// çipi ve kullanıcı formu çerçeveye kurulan sayfadan ayıklanıp sahte bir sayfa nesnesiyle koşturulur.
const kitapliklar = Object.fromEntries(KITAPLIK_KIMLIKLERI.map((k) => [k, ''])) as Parameters<typeof sayfaKur>[0]['kitapliklar'];
const kur = (kimlik: KmKimlikCevabi): string[] =>
  sayfaKur({ paket: KM_PAKETI, koken: 'http://localhost:4101', grafik: '', kitapliklar, kimlik }).split('\n');

// Uygulamanın satırları bir işlevin tanımıyla başlar; aynı adla sonradan tanımlanan (TMI'nin yerine koyduğu) sonuncusudur.
function islev(satirlar: string[], ad: string, sonuncu = false): string {
  const bas = (s: string) => s.startsWith(`function ${ad}(`);
  const i = sonuncu ? satirlar.findLastIndex(bas) : satirlar.findIndex(bas);
  if (i < 0) throw new Error(`Sayfadan ayıklanamadı: ${ad}`);
  let derinlik = 0;
  const cikti: string[] = [];
  for (let k = i; k < satirlar.length; k++) {
    const satir = satirlar[k] ?? '';
    cikti.push(satir);
    for (const ch of satir) {
      if (ch === '{') derinlik++;
      else if (ch === '}') derinlik--;
    }
    if (derinlik === 0) break;
  }
  return cikti.join('\n');
}
const sabit = (satirlar: string[], bas: string): string => {
  const s = satirlar.find((x) => x.startsWith(bas));
  if (!s) throw new Error(`Sayfadan ayıklanamadı: ${bas}`);
  return s;
};

interface Ogge { hidden: boolean; innerHTML: string }
interface Form { baslik: string; alanlar: { k: string; options?: unknown[] }[]; kaydet: (d: Record<string, unknown>) => Promise<void> }
interface Uygulama {
  authGate: () => boolean;
  can: (a: string) => boolean;
  openUser: (id?: string) => void;
  kullanici: () => { _id: string; ad: string; rol: string } | null;
  login: Ogge;
  chip: Ogge;
  formlar: Form[];
  kayitlar: [string, Record<string, unknown>][];
}

function uygulama(kimlik: KmKimlikCevabi, kullanicilar: Record<string, unknown>[]): Uygulama {
  const satirlar = kur(kimlik);
  const ayar = sabit(satirlar, '<script>window.__TMI_KM=').replace(/^<script>/, '').replace(/<\/script>$/, '');
  const kaynak = [
    sabit(satirlar, 'const ROLLER='), sabit(satirlar, 'const ROL_SEV='), sabit(satirlar, 'const YETKI='), sabit(satirlar, 'const YETKI_AD='),
    sabit(satirlar, 'const authOn='), islev(satirlar, 'can'), islev(satirlar, 'need'), islev(satirlar, 'tmiKullanici'),
    islev(satirlar, 'authGate'), islev(satirlar, 'userChip'), islev(satirlar, 'openUser', true),
  ].join('\n');
  const govde = `const window = {}; ${ayar};
    let USER = null; const ME = {}; const S = { kullanici: kullanicilar }; const login = { hidden: false, innerHTML: '' };
    const chip = { hidden: true, innerHTML: '' }; const formlar = []; const kayitlar = [];
    const $ = (s) => (s === '#login' ? login : s === '#userChip' ? chip : null);
    const esc = (x) => String(x); const toast = () => {}; const closeModal = () => {};
    const formModal = (baslik, alanlar, ilk, kaydet) => { formlar.push({ baslik, alanlar, kaydet }); };
    const save = async (c, r) => { kayitlar.push([c, r]); };
    ${kaynak}
    return { authGate, can, openUser, kullanici: () => USER, login, chip, formlar, kayitlar };`;
  return new Function('kullanicilar', govde)(kullanicilar) as Uygulama;
}

const KISI = { id: 7, ad: 'Deneme Kişi' };

describe('Kalite Merkezi girişi TMI oturumundandır', () => {
  it('PIN ekranı açılmaz: kullanıcı oturumdaki kişidir; rolü TMI işleminden, uygulamanın kullanıcı kaydından değil (195 a)', () => {
    const yok = uygulama({ kisi: KISI, yonetici: false, kisiler: [], onaylayabilir: false }, [{ _id: 'u_eski', ad: 'Eski', rol: 'Kalite yöneticisi', pin: 'x' }]);
    expect(yok.authGate()).toBe(true);
    expect(yok.login.hidden).toBe(true);
    expect(yok.kullanici()).toEqual({ _id: 'tmi-7', ad: 'Deneme Kişi', rol: 'Muayeneci' });
    expect(yok.can('onay')).toBe(false);
    expect(yok.chip.innerHTML).toContain('Deneme Kişi');
    expect(yok.chip.innerHTML).not.toContain('logout');

    // Kayıtta Kalite mühendisi yazsa da onay işlemi olmayan Muayenecidir: kayıt rol vermez.
    const kayitli = uygulama({ kisi: KISI, yonetici: false, kisiler: [], onaylayabilir: false }, [{ _id: 'tmi-7', ad: 'Kayıttaki Ad', rol: 'Kalite mühendisi', aktif: true }]);
    kayitli.authGate();
    expect(kayitli.kullanici()).toEqual({ _id: 'tmi-7', ad: 'Deneme Kişi', rol: 'Muayeneci' });
    expect(kayitli.can('onay')).toBe(false);

    // Kaydı olmasa da (ya da Muayeneci yazsa da) kalite-merkezi.onayla taşıyan Kalite mühendisidir: NCR, DÖF kapatır ve MRB kararı verir.
    for (const kullanicilar of [[], [{ _id: 'tmi-7', ad: 'x', rol: 'Muayeneci', aktif: true }]]) {
      const onayci = uygulama({ kisi: KISI, yonetici: false, kisiler: [], onaylayabilir: true }, kullanicilar);
      onayci.authGate();
      expect(onayci.kullanici()).toEqual({ _id: 'tmi-7', ad: 'Deneme Kişi', rol: 'Kalite mühendisi' });
      expect(onayci.can('onay')).toBe(true);
      expect(onayci.can('kullanici')).toBe(false);
    }
  });

  it('kullanıcı kaydı olmasa da yetki denetimi açıktır; TMI yöneticisi her zaman Kalite yöneticisidir', () => {
    const muayeneci = uygulama({ kisi: KISI, yonetici: false, kisiler: [], onaylayabilir: false }, []);
    muayeneci.authGate();
    expect(muayeneci.can('ayar')).toBe(false);
    expect(muayeneci.can('sil')).toBe(false);
    const yonetici = uygulama({ kisi: KISI, yonetici: true, kisiler: [], onaylayabilir: false }, [{ _id: 'tmi-7', ad: 'x', rol: 'Muayeneci' }]);
    yonetici.authGate();
    expect(yonetici.kullanici()?.rol).toBe('Kalite yöneticisi');
    expect(yonetici.can('kullanici')).toBe(true);
  });

  it('kullanıcı formu PIN istemez; kişi TMI kişileri arasından seçilir, kayıt "tmi-<kişi>" kimliğiyle PIN alanı olmadan yazılır', async () => {
    const u = uygulama(
      { kisi: KISI, yonetici: true, kisiler: [KISI, { id: 9, ad: 'İkinci Kişi' }], onaylayabilir: true },
      [{ _id: 'tmi-7', ad: 'Deneme Kişi', rol: 'Kalite mühendisi', pin: 'eski-ozet' }],
    );
    u.authGate();
    u.openUser();
    const [yeni] = u.formlar;
    expect(yeni?.alanlar.map((a) => a.k)).toEqual(['kisi', 'rol', 'aktif']);
    expect(yeni?.alanlar[0]?.options).toEqual([['', 'Seçin'], ['9', 'İkinci Kişi']]);
    await yeni?.kaydet({ kisi: '9', rol: 'Kalite mühendisi', aktif: true });
    expect(u.kayitlar).toEqual([['kullanici', { ad: 'İkinci Kişi', rol: 'Kalite mühendisi', aktif: true, _id: 'tmi-9' }]]);

    u.openUser('tmi-7');
    const duzenle = u.formlar[1];
    expect(duzenle?.alanlar.map((a) => a.k)).toEqual(['ad', 'rol', 'aktif']);
    await duzenle?.kaydet({ ad: 'Deneme Kişi', rol: 'Muayeneci', aktif: true });
    expect(u.kayitlar[1]).toEqual(['kullanici', { _id: 'tmi-7', ad: 'Deneme Kişi', rol: 'Muayeneci', aktif: true }]);
  });

  it('yönetici olmayan kullanıcı formunu açamaz', () => {
    const u = uygulama({ kisi: KISI, yonetici: false, kisiler: [], onaylayabilir: false }, [{ _id: 'tmi-7', ad: 'x', rol: 'Kalite mühendisi' }]);
    u.authGate();
    u.openUser();
    expect(u.formlar).toEqual([]);
  });

  it('paketin PIN yerleri değişmişse sayfa kurulmaz; kurulmuş sayfada PIN ile giriş metni kalmaz', () => {
    const sayfa = kur({ kisi: KISI, yonetici: false, kisiler: [], onaylayabilir: false }).join('\n');
    for (const [aranan] of PIN_YERLERI) expect(sayfa).not.toContain(aranan);
    expect(sayfa).not.toContain('Giriş PIN ile yapılır');
    const [ilk] = PIN_YERLERI[1]!;
    expect(() => sayfaKur({ paket: KM_PAKETI.replace(ilk, ''), koken: 'x', grafik: '', kitapliklar, kimlik: { kisi: KISI, yonetici: false, kisiler: [], onaylayabilir: false } }))
      .toThrow(/beklenen yer/);
  });
});
