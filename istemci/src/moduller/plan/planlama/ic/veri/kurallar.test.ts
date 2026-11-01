import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { derle, girdiKur, planOku, plandanBitenler, saatYaz, veriDenetimi } from '../../motor/kurallar.ts';
import { ornekCalisma } from '../../motor/ornek.ts';
import {
  KATALOG, aileler, bedelEsigi, bedelOku, durumSayilari, ekMesaiDenetle, girdiSaati, girdidenSaat, gunSirasi, gunTarihi, kapasiteMatrisi, karsilama,
  listeFormuOku, listeYaz, matrisDenetle, matrisYaz, parametreOku, parametreYaz, siparisDurumu, siparisSuz, silmeEngeli, tanimsizGecis, vardiyaSuresi,
  vardiyalar, durusDenetle, kisitDegistir,
} from './kurallar.ts';
import { calismaKur } from './test-veri.tsx';
import { ufukKur } from '../../ufuk-olcegi.ts';

const cxKur = (c = calismaKur()) => derle(girdiKur(c, plandanBitenler(c, planOku(c))));

// Bu dosyanın beklenen değerleri 63 günlük ufukla kuruldu; testin konusu varsayılan ufuk değil (1681 b ile varsayılan 120 gün).
beforeEach(() => { ufukKur({ ufukGun: 63 }); });
afterEach(() => { ufukKur(null); });

describe('Veri ve kısıtlar hesapları', () => {
  it('kısıt kataloğu bugünkü sayfanınki: 6 grup, durum sayıları', () => {
    expect(KATALOG.map((g) => g.l.length)).toEqual([11, 6, 7, 12, 4, 7]);
    expect(durumSayilari()).toEqual({ tam: 28, yaklasik: 5, karar: 2, yok: 12 });
  });

  it('parametre sınır dışını reddeder, seçimi ve boş fasoncuyu okur; yazma yerine göre', () => {
    const famK = KATALOG.flatMap((g) => g.l).find((k) => k.id === 'aile')?.p?.[0];
    const mat = KATALOG.flatMap((g) => g.l).find((k) => k.id === 'malzeme')?.p?.[0];
    const fason = KATALOG.flatMap((g) => g.l).find((k) => k.id === 'fasonTalas')?.p?.[0];
    if (!famK || !mat || !fason) throw new Error('katalog');
    expect(parametreOku(famK, '2')).toEqual({ hata: 'Değer 0 ile 1 arasında olmalı.' });
    expect(parametreOku(famK, '')).toEqual({ hata: 'Değer 0 ile 1 arasında olmalı.' });
    expect(parametreOku(famK, '0,5')).toEqual({ hata: 'Değer 0 ile 1 arasında olmalı.' });
    expect(parametreOku(famK, '0.5')).toEqual({ deger: 0.5 });
    expect(parametreOku(mat, 'sert')).toEqual({ deger: 'sert' });
    expect(parametreOku(fason, '')).toEqual({ deger: null });
    const t = calismaKur();
    expect(parametreYaz(t, 'w', 'famK', 0.3)).toBe(false);
    expect(parametreYaz(t, 'w', 'famK', 0.5)).toBe(true);
    expect(parametreYaz(t, 'ayarlar', 'faiSaat', 2)).toBe(true);
    expect([t.w.famK, (t.D.ayarlar as Record<string, unknown>).faiSaat, (t.D.ayarlar as Record<string, unknown>).tasimaSaat]).toEqual([0.5, 2, 0.5]);
    kisitDegistir(t, 'ariza', false); kisitDegistir(t, 'tatil', true);
    expect(t.kapali).toEqual(['ariza']);
  });

  it('bedel yalnız aynı veri sürümünde okunur; gürültü eşiği temelin %3ü, en az 1 saat', () => {
    const b = bedelOku(calismaKur());
    expect(b?.liste).toEqual([{ id: 'tatil', dW: 0.2 }, { id: 'ariza', dW: 4 }]);
    expect(b && bedelEsigi(b)).toBe(1);
    expect(bedelOku(calismaKur((c) => { c.dataVer = 4; }))).toBeNull();
  });

  it('sipariş süzgeci ve durumu', () => {
    const c = calismaKur(); const J = planOku(c)?.J ?? {};
    expect(siparisSuz(c.D.siparisler, J, 'gec', '').map((s) => s.id)).toEqual(['S1']);
    expect(siparisSuz(c.D.siparisler, J, 'yuksek', '').map((s) => s.id)).toEqual(['S1']);
    expect(siparisSuz(c.D.siparisler, J, 'hepsi', 'govde', (id) => (id === 'U2' ? 'Deneme govde' : id)).map((s) => s.id)).toEqual(['S2']);
    expect([siparisDurumu(J, 'S1'), siparisDurumu(J, 'S2'), siparisDurumu(J, 'S3'), siparisDurumu(null, 'S1')]).toEqual([
      { ad: '3 sa geç', ton: 'hata' }, { ad: 'Zamanında', ton: 'tamam' }, { ad: 'Planda yok', ton: 'pasif' }, null,
    ]);
  });

  it('kapasite matrisi: açık vardiyada yetkin kimse yoksa hata, kapalı vardiya kapalı', () => {
    const m = kapasiteMatrisi(calismaKur().D);
    expect([m.gruplar, m.vardiyalar]).toEqual([['Torna', 'Freze'], ['V1', 'V2']]);
    expect(m.hucre('Torna', 'V1')).toEqual({ acik: true, kisi: 1, ihtiyac: 1, ton: null });
    expect(m.hucre('Freze', 'V1')).toEqual({ acik: true, kisi: 0, ihtiyac: 0.5, ton: 'hata' });
    expect(m.hucre('Torna', 'V2').acik).toBe(false);
    expect([m.ayarci('V1'), m.ayarci('V2')]).toEqual([{ acik: true, kisi: 1 }, { acik: false, kisi: 0 }]);
    expect(vardiyaSuresi(vardiyalar(calismaKur().D)[1]!)).toBe(8);
  });

  it('malzeme karşılaması: önce yüksek öncelik stoktan, sonra satın alma söz + gecikme', () => {
    const c = calismaKur(); const k = karsilama(cxKur(c));
    expect(k.map((x) => [x.siparis, x.kaynak, x.ihtiyac, x.eksik, saatYaz(c.D, x.hazir)])).toEqual([
      ['S1', 'stok', 4, 0, '19.10 Pzt 07:00'], ['S2', 'satın alma', 10, 0, '22.10 Per 10:00'],
    ]);
    const eksik = karsilama(cxKur(calismaKur((x) => { x.D.satinalma = []; })));
    expect(eksik.map((x) => [x.siparis, x.kaynak, x.eksik, x.hazir])).toEqual([['S1', 'stok', 0, 7], ['S2', 'eksik', 9, null]]);
  });

  it('ayar matrisi: aileler, tanımsız geçiş, yazma ve silme', () => {
    const c = calismaKur();
    expect([aileler(c.D), tanimsizGecis(c.D)]).toEqual([['A', 'B'], 1]);
    expect([matrisDenetle(''), matrisDenetle('20'), matrisDenetle('-1')]).toEqual([{ dk: null }, { dk: 20 }, { hata: 'Ayar süresi sıfır ya da pozitif dakika olmalı.' }]);
    matrisYaz(c, 'B', 'A', 20); expect(tanimsizGecis(c.D)).toBe(0);
    matrisYaz(c, 'A', 'B', null); expect(c.D.ayarMatrisi).toEqual([{ den: 'B', ye: 'A', dk: 20 }]);
  });

  it('takvim: tarih-saat kutusu plan saatine, gün plan gününe döner; arıza ve ek mesai denetimi', () => {
    const c = calismaKur(); const D = c.D;
    expect([girdiSaati(D, 31), girdidenSaat(D, '2026-10-20T07:00'), gunTarihi(D, 5), gunSirasi(D, '2026-10-24')]).toEqual(['2026-10-20T07:00', 31, '2026-10-24', 5]);
    expect([durusDenetle(null, 3), durusDenetle(5, 5), durusDenetle(-2, 3), durusDenetle(3, 5)]).toEqual([
      'Başlangıç ve bitişi girin.', 'Bitiş başlangıçtan sonra olmalı.', 'Plan başlangıcından önce olamaz.', null,
    ]);
    expect([ekMesaiDenetle(c, { m: 'T2', gun: 5, vardiya: 'V1' }), ekMesaiDenetle(c, { m: 'T2', gun: 99, vardiya: 'V1' }), ekMesaiDenetle(c, { m: 'T1', gun: 5, vardiya: 'V1' })])
      .toEqual(['Bu ek mesai zaten var.', 'Gün plan ufku içinde olmalı.', null]);
  });

  it('planlamaya özgü liste: zorunlu alan, kod tekrarı, düzenlemede formda olmayan alan korunur; silme engeli', () => {
    const c = calismaKur();
    expect(listeFormuOku(c, 'aparat', { id: 'AP1', ad: '', adet: '0' }, null)).toEqual({ hata: ['Ad boş olamaz.', 'Adet en az 1.', 'AP1 zaten var.'] });
    const o = listeFormuOku(c, 'tedarikci', { id: 'TD1', ad: 'Yeni ad', ortGecikmeGun: '2', sapmaGun: '' }, 'TD1');
    if (!('kayit' in o)) throw new Error('form');
    (c.D.tedarikciler as Record<string, unknown>[])[0]!.not = 'kalır';
    listeYaz(c, 'tedarikci', o.kayit, 'TD1');
    expect(c.D.tedarikciler).toEqual([{ id: 'TD1', ad: 'Yeni ad', ortGecikmeGun: 2, not: 'kalır' }]);
    expect([silmeEngeli(c.D, 'aparat', 'AP1'), silmeEngeli(c.D, 'tedarikci', 'TD1'), silmeEngeli(c.D, 'aparat', 'AP9')]).toEqual([
      'U1 rotasında kullanılıyor.', 'Bu tedarikçiye bağlı satın alma var.', null,
    ]);
  });

  it('veri denetimi motorun denetimidir: örnek kayıtta 10 bulgu, test kaydında dört tür; eski kısıt sürümünde personel kapalı sayılır', () => {
    const o = ornekCalisma();
    expect(veriDenetimi(o, derle(girdiKur(o, plandanBitenler(o, planOku(o)))))).toHaveLength(10);
    const c = calismaKur();
    expect(veriDenetimi(c, cxKur(c)).map((b) => b.k)).toEqual(['personel', 'ayar', 'tezgah', 'amac']);
    const eski = calismaKur((x) => { delete (x as { kisitSurum?: number }).kisitSurum; });
    expect(eski.kapali).toEqual(['tatil', 'personel']);
    expect(veriDenetimi(eski, cxKur(eski)).map((b) => b.k)).toEqual(['ayar', 'tezgah', 'amac']);
  });
});

describe('dondurma ufku (248 a)', () => {
  it('alt sınır 4 saattir', () => {
    const k = KATALOG.flatMap((g) => g.l).find((x) => x.id === 'dondurma');
    expect(k?.p?.[0]).toMatchObject({ k: 'dondurma', min: 4, birim: 'sa' });
  });
});
