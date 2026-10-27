import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  belgeBicimiHatasi, bitenIsBeklenen, onayEskidiMi, onayIcerigi, onayOzetiDamgala,
  arkonRoluBul, arkonRoluSec, ILETILER, durusNedenleriniCevir, icerikSurumu, kayitSutunlari, silmeCakisiyorMu, tesisKur, yazimCakisiyorMu, yazmaReddi, yerelPaketReddi, yeniSurum,
  guvensizCizimleriAyikla, hizSiniriAsildi, kayitZamani, yuklemeKotasiHatasi, yansimaSirasi, yansimaNedeni, SAYIM_ERTELEME, GECICI_BEKLEME,
  girenMetni, hazirlikEksigi, isEmrindenTaslakPaket, TMI_PAKET_ALANLARI, paketParcasi, parcaSayimReddi, parcaOlayKarari, parcaYayini, butunPaketSablonu, PARCA_PLANDA_YOK, PARCA_OTEKI_CALISIYOR, PARCA_OTEKILER_BITMEDI, paketinEmri, paketIsEmri, PLANSIZ, planBaslatmaReddi, planDurumlari, plansizKaynak, planSiralayabilirMi, planSirasiReddi, planSirasiTasinacaklar, sablonPaket, siraOnaylari, siraOnayiniYaz, stokIstegiKarari, numuneTeslimGirdisi, numuneTesliminiKoru, tabanCoz, talimatAdimlari, tmiAlanlariniYaz, tmiBirlesikSurum, yansimaKarari,
  yenidenDenemeReddi, YENIDEN_YALNIZ_HATALI, YENIDEN_SONRAKI_YAZILDI, yenidenIlkParcaAcik, ilkParcaOlculeri, ilkParcaSayimiAsildi, kararBekleyenAdet, KARAR_BEKLIYOR_ALANI, REFAKAT_KARTI_ALANI, uyariBirlestir, kayitGovdesi, yenidenIlkParcaTabani, yenidenKarariDamgala, ikinciKontrolEksik, okuyabilirMi, kayitReddi, iletiBasi, iletiKacirildi, yetkiMatrisi, arkonVardiyalari, arkonTatilleri, arkonAletleri,
  belgedenDurusa, ISTASYONSUZ_YAYIN, ROTA_EKSIK_YAYIN, yayinEksigi, SIFIR_SAYIM, katilimYolu, tmidekiDurum, makineSecimi, MAKINE_SECIMI_GECERSIZ,
  cagriBildirimi, olcumAletKimligi, olcumAletleri, islemImzasi, yoklamaDenetimiGecerli, YOKLAMA_DENETIM_SURESI_MS, donemBaslangici, donemBasarisi, ekipOrtalamasi, fazlaMesaiSaati, mesaiGunleri, ozetOranlari, ozetRozetleri, tarihEkle,
} from './kurallar.ts';
import { dosyaTuruBul } from './kurallar.ts';
import { adimEmirDurumu, ilkParcaGereksinimi, istekKarari, istekKmPlani, kmKarariniAynala, kmOlcumGruplari, kmUyarisiniYaz, KM_UYARILARI, malzemeCizimleri, kaliteIstasyonuSec, tekKaliteIstasyonu, lotKarariDamgala, lotKarariGirdisi, lotKarariKoru, lotPaketi, tmiAqlPlani, kuyrukAlanlariniEkle, kuyrukSirasiReddi, planSaatleri } from './kurallar.ts';
import type { KatilimDurumu, TmiPlanDurumu } from './kurallar.ts';
import { AZAMI_MAKINE_SECIMI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { ARKON_ISLEMLERI } from '#paylasilan/islemler/arkon.ts';
import { maddeGorunurMu } from '#paylasilan/sayfa-tanimi.ts';
import type { IkinciMenuMaddesi } from '#paylasilan/sayfa-tanimi.ts';
import { ARKON_IKINCI_MENU } from '#paylasilan/sayfalar/arkon.ts';
import { ARKON_KAYIT_TURLERI } from '#paylasilan/sozlesme/arkon.ts';
import type { ArkonDeposu, ArkonRolu } from '#paylasilan/sozlesme/arkon.ts';
import { depoOkunur } from '../../../arkon/web/src/data/depo-okuma.ts';
import { cizimSilinir } from '../../../arkon/web/src/data/cizim-silme.ts';
import { gonderimSonucu } from '../../../arkon/web/src/data/gonderim-hatasi.ts';
import { sunucuyaGonderilir } from '../../../arkon/web/src/data/kayit-gonderimi.ts';
import type { SiradakiYansima } from './kurallar.ts';

test('Arkon rolü sıradaki ilk işlemdir; Arkon işlemi yoksa rol yoktur', () => {
  assert.equal(arkonRoluBul(['arkon.operator', 'arkon.kalite']), 'quality');
  assert.equal(arkonRoluBul(['arkon.amir', 'arkon.yonetici']), 'admin');
  assert.equal(arkonRoluBul(['terminal.uret', 'sayfa.arkon']), null);
  assert.equal(arkonRoluBul(['arkon.yansima-oku', 'sayfa.arkon']), null);
  assert.equal(arkonRoluBul(['arkon.yansima-oku', 'arkon.operator']), 'operator');
  assert.equal(arkonRoluBul(['arkon.yansima-yeniden', 'sayfa.arkon']), null);
});

test('Arkon rolü rolden gelen işlemlerdendir; rolde Arkon işlemi yoksa bütün işlemlerden', () => {
  assert.equal(arkonRoluSec(['arkon.operator'], ['arkon.operator', 'arkon.planlama']), 'operator');
  assert.equal(arkonRoluSec(['satin-alma.oku'], ['satin-alma.oku', 'arkon.kalite']), 'quality');
  assert.equal(arkonRoluSec([], []), null);
});

test('TMI ayarı kimse tarafından yazılamaz; ortak ayarı yalnız yönetici yazar; vardiya TMI Vardiya modülündedir', () => {
  assert.equal(yazmaReddi('kv', 'plant', 'admin', 'yaz'), 'tmiYonetir');
  assert.equal(yazmaReddi('kv', 'reasons', 'admin', 'sil'), 'tmiYonetir');
  assert.equal(yazmaReddi('kv', 'perms', 'lead', 'yaz'), 'tmiYonetir');
  assert.equal(yazmaReddi('kv', 'policy', 'admin', 'yaz'), null);
  assert.equal(yazmaReddi('kv', 'policy', 'lead', 'yaz'), 'yalnizYonetici');
  assert.equal(yazmaReddi('kv', 'shifts', 'admin', 'yaz'), 'tmiYonetir');
  assert.equal(yazmaReddi('kv', 'shifts', 'lead', 'yaz'), 'tmiYonetir');
  assert.equal(yazmaReddi('kv', 'handover', 'operator', 'yaz'), null);
  assert.equal(yazmaReddi('kv', 'constructor', 'operator', 'yaz'), 'yalnizYonetici');
  assert.equal(yazmaReddi('kv', 'handover', 'operator', 'sil'), 'yalnizYonetici');
});

test('depo yazımı ve silmesi rol tablosundandır; silme yazmadan dardır', () => {
  assert.equal(yazmaReddi('pkgs', 'x', 'operator', 'yaz'), 'rolYetmez');
  assert.equal(yazmaReddi('pkgs', 'x', 'prep', 'yaz'), null);
  assert.equal(yazmaReddi('pkgs', 'x', 'plan', 'yaz'), null);
  assert.equal(yazmaReddi('pkgs', 'x', 'plan', 'sil'), 'rolYetmez');
  assert.equal(yazmaReddi('results', 'x', 'operator', 'yaz'), null);
  assert.equal(yazmaReddi('results', 'x', 'operator', 'sil'), 'rolYetmez');
  assert.equal(yazmaReddi('maint', 'x', 'admin', 'sil'), null);
  // A7-K1 (#518): ölçü aleti TMI Kalibrasyon modülündedir; yönetici de yazamaz ve silemez.
  assert.equal(yazmaReddi('gauges', 'x', 'admin', 'yaz'), 'tmiYonetir');
  assert.equal(yazmaReddi('gauges', 'x', 'quality', 'sil'), 'tmiYonetir');
});

test('sürüm kuralı: var olan belgeye bildiği sürümsüz yazılmaz; olmayan belgeye yazılır; silmede taban eşleşmelidir', () => {
  assert.equal(yazimCakisiyorMu(5, null), true);
  assert.equal(yazimCakisiyorMu(5, 4), true);
  assert.equal(yazimCakisiyorMu(5, 5), false);
  assert.equal(yazimCakisiyorMu(null, null), false);
  assert.equal(yazimCakisiyorMu(null, 7), false);
  assert.equal(silmeCakisiyorMu(5, 4), true);
  assert.equal(silmeCakisiyorMu(5, 5), false);
  assert.equal(silmeCakisiyorMu(null, 4), false);
});

test('tesis kodlarla kurulur, istasyon TMI kimliğini taşır; iş merkezi ya da istasyonu bilinmeyen kayıt atlanır', () => {
  const tesis = tesisKur(
    [{ id: 1, kod: 'TAL', ad: 'Talaşlı', aciklama: null, aktif: true }],
    [
      { id: 5, kod: 'TZG-04', ad: 'Torna', isMerkeziId: 1, tip: 'markalama', aktif: true },
      { id: 6, kod: 'YOK-1', ad: 'Sahipsiz', isMerkeziId: 9, tip: 'talasli', aktif: true },
    ],
    [
      { id: 1, kod: 'M1', ad: 'Makine', tur: null, markaModel: null, seriNo: null, istasyonId: 5, baglantiTuru: 'dijital_giris', baglantiAdresi: null, aktif: true },
      { id: 2, kod: 'M2', ad: 'Boşta', tur: null, markaModel: null, seriNo: null, istasyonId: null, baglantiTuru: null, baglantiAdresi: null, aktif: true },
    ],
  );
  assert.deepEqual(tesis.sts, [{ id: 'TZG-04', name: 'Torna', wc: 'TAL', t: 'mark', active: true, tmi: 5 }]);
  assert.deepEqual(tesis.mcs.map((m) => [m.id, m.st, m.conn]), [['M1', 'TZG-04', 'io']]);
});

test('duruş nedeni Arkon biçimine çevrilir; boş alan yazılmaz', () => {
  assert.deepEqual(
    durusNedenleriniCevir([{ id: 1, kod: 'D-01', ad: 'Arıza', simge: null, kategori: 'planli', cagriEkibi: 'bakim', cagriGecikmeDk: null, aktif: true, sira: 1, surum: 1 }]),
    [{ code: 'D-01', l: 'Arıza', cat: 'p', team: 'bakim', active: true }],
  );
});

test('içerik sürümü içerik aynıyken aynı, değişince farklıdır; belge sürümü her yazımda artar', () => {
  assert.equal(icerikSurumu({ a: 1 }), icerikSurumu({ a: 1 }));
  assert.notEqual(icerikSurumu({ a: 1 }), icerikSurumu({ a: 2 }));
  assert.equal(yeniSurum(null, 1000), 1000);
  assert.equal(yeniSurum(1000, 1000), 1001);
  assert.equal(yeniSurum(5000, 1000), 5001);
});

test('kayıt sütunları: cid zorunlu, zaman pencere dışındaysa sunucu saatidir, sayı olmayan madde boş kalır', () => {
  assert.equal(kayitSutunlari({ at: 1 }, 0), null);
  const s = kayitSutunlari({ cid: 'x', at: 1e15, machine: 'TZG-04', itemId: '4' }, 2000);
  assert.deepEqual(s, { cid: 'x', zaman: new Date(2000), makine: 'TZG-04', isMerkezi: null, emirNo: null, paketId: null, maddeId: null });
});

test('kayıt zamanı penceresi: 12 saat geri ve 2 dakika ileri dahil esas, ötesi sunucu saati; sayı olmayan istemci zamanı sunucu saati', () => {
  const simdi = 100 * 3600e3;
  assert.equal(kayitZamani(simdi - 12 * 3600e3, simdi), simdi - 12 * 3600e3);
  assert.equal(kayitZamani(simdi - 12 * 3600e3 - 1, simdi), simdi);
  assert.equal(kayitZamani(simdi + 120e3, simdi), simdi + 120e3);
  assert.equal(kayitZamani(simdi + 120e3 + 1, simdi), simdi);
  for (const bozuk of ['5', null, undefined, Number.NaN, {}]) assert.equal(kayitZamani(bozuk, simdi), simdi);
  assert.equal(kayitSutunlari({ cid: 'x', at: simdi - 1000 }, simdi)?.zaman.getTime(), simdi - 1000);
});

test('ileti hızı: kayan pencerede sınıra ulaşan kişi reddedilir, pencere dışı eski istekler sayılmaz', () => {
  const sinir = { adet: 3, pencereMs: 1000 };
  assert.equal(hizSiniriAsildi([100, 200], 300, sinir), false);
  assert.equal(hizSiniriAsildi([100, 200, 250], 300, sinir), true);
  assert.equal(hizSiniriAsildi([100, 200, 250], 1150, sinir), false);
});

test('dosya kotası: açık yükleme sayısı, kişi baytı ve depo toplamı sırayla sınanır; sınır dahil geçer', () => {
  const sinir = { kisiAcikYukleme: 2, kisiAcikBayt: 100, depoBayt: 1000 } as const;
  const iyi = { kisiAdet: 1, kisiBayt: 50, depoBayt: 500, yeniBayt: 50 };
  assert.equal(yuklemeKotasiHatasi(iyi, sinir), null);
  assert.equal(yuklemeKotasiHatasi({ ...iyi, kisiAdet: 2 }, sinir), 'kotaYukleme');
  assert.equal(yuklemeKotasiHatasi({ ...iyi, yeniBayt: 51 }, sinir), 'kotaBayt');
  assert.equal(yuklemeKotasiHatasi({ ...iyi, depoBayt: 951 }, sinir), 'kotaDepo');
  assert.equal(yuklemeKotasiHatasi({ ...iyi, depoBayt: 950 }, sinir), null);
});

test('yansimaSirasi: öndeki ertelenmiş sayımların ardındaki ilk başlama öne alınır; başka olay araya girmişse ya da öndeki ertelenmemişse kayıt sırası', () => {
  const y = (komut: SiradakiYansima['komut'], ertelendi = false): SiradakiYansima => ({ komut, ertelendi });
  assert.deepEqual(yansimaSirasi([y('saglam', true), y('hurda'), y('basla-ya-da-devam'), y('saglam')]), [2, 0, 1, 3]);
  assert.deepEqual(yansimaSirasi([y('saglam', true), y('duraklat'), y('basla-ya-da-devam')]), [0, 1, 2]);
  assert.deepEqual(yansimaSirasi([y('saglam'), y('basla-ya-da-devam')]), [0, 1]);
  assert.deepEqual(yansimaSirasi([y('saglam', true)]), [0]);
  assert.deepEqual(yansimaSirasi([]), []);
});

test('listede bekleyen satırın nedeni kullanıcı metnidir: iç hata özeti dönmez; sonuçlanmış satırda saklı neden döner', () => {
  assert.equal(yansimaNedeni('bekliyor', null, SAYIM_ERTELEME), SAYIM_ERTELEME);
  assert.equal(yansimaNedeni('bekliyor', null, '40P01 arkon_kayit: deadlock detected'), GECICI_BEKLEME);
  assert.equal(yansimaNedeni('bekliyor', null, null), null);
  assert.equal(yansimaNedeni('hatali', 'Yalnız çalışan iş duraklatılır.', 'XX000: iç'), 'Yalnız çalışan iş duraklatılır.');
});

test('okumada güvensiz çizim ayıklanır: hazır sonuç girdisi bütünüyle atılır, başka yerdeki svg boşalır; temiz gövde aynı nesne döner', () => {
  const temiz = { id: 'p', derived: { a: { D: { svg: '<g class="x"></g>' } } }, notlar: [{ svg: '<path d="M0 0"/>' }] };
  assert.equal(guvensizCizimleriAyikla(temiz), temiz);
  const kirli = {
    id: 'p',
    derived: { a: { V: { n: 1 }, D: { svg: '<g onload="x"></g>', w: 1 } }, b: { D: { svg: '<g class="x"></g>' } } },
    notlar: [{ svg: '<script>1</script>' }, { svg: '<path d="M0 0"/>' }],
    cizim: { svg: { a: 1 } },
  };
  const once = structuredClone(kirli);
  assert.deepEqual(guvensizCizimleriAyikla(kirli), {
    id: 'p', derived: { b: { D: { svg: '<g class="x"></g>' } } }, notlar: [{ svg: '' }, { svg: '<path d="M0 0"/>' }], cizim: { svg: '' },
  });
  assert.deepEqual(kirli, once, 'saklanan gövde değişmez');
});

test('yeniden kuyruğa alma: yalnız "hatali" alınır; durum kaydı sonraki durum yazılmışsa alınmaz, sayım alınır', () => {
  assert.equal(yenidenDenemeReddi('hatali', 'counts', false), null);
  assert.equal(yenidenDenemeReddi('hatali', 'counts', true), null);
  assert.equal(yenidenDenemeReddi('hatali', 'events', false), null);
  assert.equal(yenidenDenemeReddi('hatali', 'events', true), YENIDEN_SONRAKI_YAZILDI);
  for (const sonuc of ['bekliyor', 'yazildi', 'reddedildi', 'eslenemedi']) assert.equal(yenidenDenemeReddi(sonuc, 'counts', false), YENIDEN_YALNIZ_HATALI, sonuc);
});

test('ilk parça ölçüleri tabletin numune planından çıkar (B-006): eski pakette sıklıktan, numune planında kapılı "first" kuralından', () => {
  const plan = [{ id: 1 }, { id: 2, freq: 'İlk parça' }, { id: 3, freq: 'Her 10 parça', crit: true }];
  assert.deepEqual(ilkParcaOlculeri({ plan }), [{ id: '1', olcen: 'q' }, { id: '2', olcen: 'q' }]);
  assert.deepEqual(ilkParcaOlculeri({ plan, rules: { q: { who: 'operator' } } }).map((o) => o.olcen), ['op', 'op']);
  assert.deepEqual(ilkParcaOlculeri({ plan, rules: { q: { firstPiece: false } } }), []);
  assert.deepEqual(ilkParcaOlculeri({ plan, opType: 'montaj' }), []);
  assert.equal(ilkParcaOlculeri({ plan, opType: 'bilinmeyen' }).length, 2);
  const samp = [{ when: 'first', gate: true, who: ['op', 'q'], items: 'crit' }, { when: 'first', gate: false, items: [1] }, { when: 'every', n: 5, gate: true, items: [2] }];
  assert.deepEqual(ilkParcaOlculeri({ plan, samp }), [{ id: '3', olcen: 'op' }]);
  assert.deepEqual(ilkParcaOlculeri({ plan, samp: [{ when: 'first', gate: true, items: [2] }, { when: 'first', gate: true, who: ['op'], items: [2] }] }), [{ id: '2', olcen: 'q' }]);
});

test('564 2 a: kalite istasyonu lot planı Kalite Merkezi hesabından; tek Ac majör sınıfın, durdurulmuş sıkılık ve geçersiz parti ayrı', () => {
  const sinif = (ad: string, aql: string, n: number, ac: number, yuzde100 = false) => ({ sinif: ad, aql, kod: 'H', n, ac, re: ac + 1, yuzde100, not: '' });
  const plan = {
    N: 500, ayar: { seviye: 'II', kr: '%100', mj: '1.0', mn: '2.5' }, siddet: 'Normal' as const, n: 50,
    siniflar: [sinif('Kritik', '%100', 500, 0, true), sinif('Majör', '1.0', 50, 1), sinif('Minör', '2.5', 50, 3)] as never,
  };
  const t = tmiAqlPlani({ plan });
  assert.ok(t !== null && 'n' in t);
  assert.deepEqual([t.n, t.ac, t.re, t.siddet, t.seviye, t.siniflar.length], [50, 1, 2, 'Normal', 'II', 3]);
  assert.deepEqual(tmiAqlPlani({ durduruldu: true }), { durduruldu: true });
  assert.equal(tmiAqlPlani({ gecersiz: true }), null);
});

test('564 1 b: numune emrin bu adımdan sonraki ilk kalite istasyonuna gider; önceki ya da kalite olmayan adım seçilmez', () => {
  const a = (id: number, sira: number, istasyonKodu: string | null, istasyonTipi: string | null) => ({ id, sira, istasyonKodu, istasyonTipi });
  const rota = [a(3, 3, 'KAL2', 'kalite'), a(1, 1, 'KAL0', 'kalite'), a(2, 2, 'TOR', 'uretim'), a(4, 4, 'KAL3', 'kalite')];
  assert.equal(kaliteIstasyonuSec(rota, 2), 'KAL2', 'sıraya göre sonraki ilk kalite adımı');
  assert.equal(kaliteIstasyonuSec(rota, 3), 'KAL3');
  assert.equal(kaliteIstasyonuSec(rota, 4), null, 'son adım');
  assert.equal(kaliteIstasyonuSec(rota, 9), null, 'rotada olmayan adım');
  assert.equal(kaliteIstasyonuSec([a(1, 1, 'TOR', 'uretim'), a(2, 2, null, 'kalite')], 1), null, 'istasyonsuz kalite adımı');
});

test('608 b: rotada kalite adımı yoksa numune tek aktif kalite istasyonuna gider; hiç yoksa ya da birden çoksa kutu yolu (null)', () => {
  const i = (kod: string, tip: string) => ({ kod, tip });
  assert.equal(tekKaliteIstasyonu([i('TOR', 'talasli'), i('KAL', 'kalite')], 'TOR'), 'KAL');
  assert.equal(tekKaliteIstasyonu([i('TOR', 'talasli'), i('MON', 'montaj')], 'TOR'), null, 'kalite istasyonu yok');
  assert.equal(tekKaliteIstasyonu([i('TOR', 'talasli'), i('KAL1', 'kalite'), i('KAL2', 'kalite')], 'TOR'), null, 'birden çok kalite istasyonu');
  assert.equal(tekKaliteIstasyonu([i('KAL', 'kalite')], 'KAL'), null, 'kendi istasyonuna gönderilmez');
  assert.equal(tekKaliteIstasyonu([i('KAL1', 'kalite'), i('KAL2', 'kalite')], 'KAL1'), 'KAL2', 'kaynak sayılmaz');
});

test('564 6 a, 600 a: kalite istasyonu lot kararı; Red ölçü ve gerekçe ister, sayısız sınıf null, verilen karar değişmez', () => {
  const lk = (ek: Record<string, unknown>) => ({ lotKarari: { karar: 'kabul', bulunan: { Kritik: 0, Majör: 0, Minör: null }, at: 5, ...ek } });
  assert.deepEqual(lotKarariGirdisi(lk({}), undefined), { istenen: 'Kabul', bulunan: { Kritik: 0, Majör: 0, Minör: null }, not: null, anahtar: '5' });
  assert.equal(lotKarariGirdisi({ meas: {} }, undefined), null, 'lot kararı yok');
  assert.equal(lotKarariGirdisi(lk({ bulunan: { Kritik: null, Majör: null, Minör: null } }), undefined), 'lotKarariGecersiz', 'hiç sayı yok');
  assert.equal(lotKarariGirdisi(lk({ bulunan: { Kritik: -1 } }), undefined), 'lotKarariGecersiz');
  assert.equal(lotKarariGirdisi(lk({ bulunan: { Majör: 1.5 } }), undefined), 'lotKarariGecersiz');
  assert.equal(lotKarariGirdisi(lk({ karar: 'belki' }), undefined), 'lotKarariGecersiz');
  assert.equal(lotKarariGirdisi(lk({ at: undefined }), undefined), 'lotKarariGecersiz');
  assert.equal(lotKarariGirdisi(lk({ karar: 'ret', not: 'çapak' }), undefined), 'lotKarariGecersiz', 'Red kusurlu sayısı ister');
  assert.equal(lotKarariGirdisi(lk({ karar: 'ret', bulunan: { Majör: 3 } }), undefined), 'lotKarariGecersiz', 'Red gerekçe ister');
  assert.deepEqual(lotKarariGirdisi(lk({ karar: 'ret', bulunan: { Majör: 3 }, not: '  çapak ' }), undefined),
    { istenen: 'Ret', bulunan: { Kritik: null, Majör: 3, Minör: null }, not: 'çapak', anahtar: '5' });
  const kayitli = { lotKarari: { ...lk({}).lotKarari, by: 'K', kayit: { no: 'LOT-1', karar: 'Kabul' } } };
  assert.equal(lotKarariGirdisi(kayitli, kayitli), null, 'aynısının yeniden yazılması');
  assert.equal(lotKarariGirdisi({ meas: {} }, kayitli), null, 'alanı taşımayan yazım');
  assert.equal(lotKarariGirdisi(lk({ karar: 'ret', not: 'x', bulunan: { Majör: 2 } }), kayitli), 'lotKarariVar');
  assert.deepEqual(lotKarariKoru({ meas: {} }, kayitli), { meas: {}, lotKarari: kayitli.lotKarari }, 'kayıtlı karar istemciden ezilmez');
  assert.deepEqual(lotKarariKoru({ meas: {} }, { lotKarari: 1 }), { meas: {} });
  assert.deepEqual(lotKarariDamgala(lk({}), 'K', { no: 'LOT-1', karar: 'Kabul' }), kayitli);
  assert.deepEqual(lotPaketi({ target: 40, partNo: 'P', part: 'Parça', machine: 'KAL' }), { N: 40, parcaNo: 'P', parcaAdi: 'Parça', istasyonKodu: 'KAL' });
  assert.deepEqual(lotPaketi({ target: 40, partNo: 'P', machine: 'KAL' }), { N: 40, parcaNo: 'P', parcaAdi: null, istasyonKodu: 'KAL' });
  assert.equal(lotPaketi({ target: '40', partNo: 'P', machine: 'KAL' }), null);
  assert.equal(lotPaketi(undefined), null);
});

test('798: numune isteği bağlı balonlarla Kalite Merkezi numunesi olur; kapıdaki kalite ölçüsü ilk parça numunesidir; bağsız plan numune açmaz', () => {
  const paket = { tmi: { opNo: 20 }, plan: [{ id: 1, kmBalon: 71 }, { id: 2, freq: 'Her 10 parça', kmBalon: 72 }, { id: 3, freq: 'Her 10 parça' }] };
  const istek = (items: unknown, ek: object = {}) => ({ pkgId: 'p', status: 'waiting', reason: 'İlk parça', cnt: 1, items, ...ek });
  assert.deepEqual(istekKmPlani(istek([1, 2]), paket), { ilkParca: true, km: { opNo: 20, balonlar: [71, 72], neden: 'İlk parça', parcaSayisi: 1 }, uyari: null });
  assert.deepEqual(istekKmPlani(istek([2, 3]), paket), { ilkParca: false, km: { opNo: 20, balonlar: [72], neden: 'İlk parça', parcaSayisi: 1 }, uyari: KM_UYARILARI.bagsizOlcu(1) }, '796 a: bağsız ölçü Arkon\'da kalır');
  assert.deepEqual(istekKmPlani(istek([3]), paket), { ilkParca: false, km: null, uyari: KM_UYARILARI.numuneAcilmadi });
  assert.deepEqual(istekKmPlani(istek([1]), { ...paket, tmi: {} }), { ilkParca: true, km: null, uyari: KM_UYARILARI.numuneAcilmadi }, 'adımsız paket');
  assert.deepEqual(istekKmPlani(istek([1]), { plan: [{ id: 1 }] }), { ilkParca: true, km: null, uyari: null }, 'Kalite Merkezi\'nden alınmamış plan');
  assert.equal(istekKmPlani(istek([1]), { ...paket, rules: { q: { who: 'operator' } } }).ilkParca, false, 'operatörün ölçtüğü kapı');
  assert.equal(istekKmPlani(istek([1], { reason: 'x'.repeat(90) }), paket).km?.neden.length, 80);
});

test('798: istek kararı durum karara girince ya da değişince doğar; Kalite Merkezi kararı açık isteğe aynalanır', () => {
  const istek = (status: string) => ({ pkgId: 'p', status, items: [1], at: Date.parse('2026-10-27T08:00:00Z') });
  assert.equal(istekKarari(istek('approved'), istek('waiting')), 'onay');
  assert.equal(istekKarari(istek('deviation'), istek('measuring')), 'sapma');
  assert.equal(istekKarari(istek('rejected'), undefined), 'ret');
  assert.equal(istekKarari(istek('approved'), istek('rejected')), 'onay', 'kararın değişmesi yeni karardır');
  assert.equal(istekKarari(istek('approved'), istek('approved')), null);
  assert.equal(istekKarari(istek('measuring'), istek('waiting')), null);
  const karar = { karar: 'ret' as const, not: 'çapak', kisi: 'Kalite', zaman: '2026-10-27T09:00:00.000Z' };
  assert.deepEqual(kmKarariniAynala(istek('measuring'), { numune: { karar, olculen: 2 }, ilkParcaKarari: null }),
    { ...istek('measuring'), kmOlculen: 2, status: 'rejected', decidedAt: Date.parse(karar.zaman), decidedBy: 'Kalite', note: 'çapak' });
  assert.deepEqual(kmKarariniAynala(istek('waiting'), { numune: { karar: null, olculen: 1 }, ilkParcaKarari: null }), { ...istek('waiting'), kmOlculen: 1, status: 'measuring' });
  assert.equal(kmKarariniAynala({ ...istek('measuring'), kmOlculen: 1 }, { numune: { karar: null, olculen: 1 }, ilkParcaKarari: null }), null, 'değişiklik yok');
  assert.equal(kmKarariniAynala(istek('approved'), { numune: { karar, olculen: 2 }, ilkParcaKarari: null }), null, 'kapanmış istek');
  const fai = (zaman: string) => ({ karar: 'onay' as const, zaman });
  assert.equal(kmKarariniAynala({ ...istek('waiting'), ilkParca: true }, { numune: null, ilkParcaKarari: fai('2026-10-27T09:00:00Z') })?.['status'], 'approved', 'ilk parça kararı');
  assert.equal(kmKarariniAynala({ ...istek('waiting'), ilkParca: true }, { numune: null, ilkParcaKarari: fai('2026-10-27T07:00:00Z') }), null, 'istekten önceki karar');
  assert.equal(kmKarariniAynala(istek('waiting'), { numune: null, ilkParcaKarari: fai('2026-10-27T09:00:00Z') }), null, 'periyodik numune ilk parça kararıyla kapanmaz');
});

test('798, 796 a: tezgah ölçümünün yalnız değişen ve balona bağlı ölçüsü Kalite Merkezi\'ne gider; mastar geçer/geçmez, sayı metin', () => {
  const paket = { plan: [{ id: 1, kmBalon: 71 }, { id: 2, kmBalon: 72, gauge: true }, { id: 3 }] };
  const eski = { 1: { v: 10, ok: true, by: 'A' } };
  assert.deepEqual(kmOlcumGruplari(paket, { 1: { v: 10, ok: true, by: 'B' }, 2: { v: 'Geçmez', ok: false, cnt: 4 }, 3: { v: 5, ok: true } }, eski), {
    gruplar: [{ parcaSayisi: 4, olcumler: [{ balonId: 72, nitel: 'gecmez' }] }], bagsiz: 1,
  });
  assert.deepEqual(kmOlcumGruplari(paket, { 1: { v: 10.0000004, ok: true, cnt: 4 } }, eski).gruplar, [{ parcaSayisi: 4, olcumler: [{ balonId: 71, deger: '10' }] }]);
  assert.deepEqual(kmOlcumGruplari(paket, { 1: { v: 'abc', ok: true } }, undefined), { gruplar: [], bagsiz: 1 }, 'sayı olmayan değer');
  assert.deepEqual(kmOlcumGruplari({ plan: [{ id: 1 }] }, { 1: { v: 1, ok: true } }, undefined), { gruplar: [], bagsiz: 0 }, 'bağsız plan');
  assert.deepEqual(kmUyarisiniYaz({ meas: {}, kmUyari: 'sahte' }, { kmUyari: 'eski' }, undefined), { meas: {}, kmUyari: 'eski' });
  assert.deepEqual(kmUyarisiniYaz({ meas: {} }, { kmUyari: 'eski' }, null), { meas: {} });
  assert.deepEqual(kmUyarisiniYaz({ meas: {} }, undefined, 'yeni'), { meas: {}, kmUyari: 'yeni' });
});

test('denetim #12: yeniden ilk parça kararın anından sonraki Kalite Merkezi onayıyla kapanır; ret, eski onay ve damgasız karar kapatmaz', () => {
  const paket = { fpRe: { on: true, at: Date.parse('2026-10-19T10:00:00Z') } };
  assert.equal(yenidenIlkParcaAcik(paket, undefined), true);
  assert.equal(yenidenIlkParcaAcik(paket, { karar: 'onay', zaman: '2026-10-19T09:59:59Z' }), true, 'karardan önceki onay');
  assert.equal(yenidenIlkParcaAcik(paket, { karar: 'ret', zaman: '2026-10-19T10:05:00Z' }), true);
  assert.equal(yenidenIlkParcaAcik(paket, { karar: 'onay', zaman: '2026-10-19T10:05:00Z' }), false);
  assert.equal(yenidenIlkParcaAcik({ fpRe: { on: true } }, { karar: 'onay', zaman: '2026-10-19T10:05:00Z' }), true, 'damgasız');
  assert.equal(yenidenIlkParcaAcik({ fpRe: { on: false, at: 1 } }, undefined), false);
  assert.equal(yenidenIlkParcaAcik({}, undefined), false);
});

test('131 b: kapı açıkken ilk sağlamdan sonrası sayılır mı', () => {
  const sag = (delta: number, kind = 'good') => ({ kind, delta });
  assert.equal(ilkParcaSayimiAsildi(sag(1), 0), false);
  assert.equal(ilkParcaSayimiAsildi(sag(1), 1), true);
  assert.equal(ilkParcaSayimiAsildi(sag(2), 0), true);
  assert.equal(ilkParcaSayimiAsildi(sag(-1), 5), false);
  assert.equal(ilkParcaSayimiAsildi(sag(1, 'scrap'), 5), false);
});

test('yeniden ilk parça kararı o anki sağlam sayımı sunucudan damgalar; istemcinin tabanı sayılmaz, değişmeyen karar damgayı korur', () => {
  const karar = { on: true, key: 'red:n1', why: 'red' };
  const yeni = yenidenKarariDamgala('pkgs', { fpRe: { ...karar, cnt: 99 } }, {}, 1000, [], 7) as { fpRe: { cnt: number } };
  assert.equal(yeni.fpRe.cnt, 7);
  assert.equal(yenidenIlkParcaTabani(yeni), 7);
  const ayni = yenidenKarariDamgala('pkgs', { note: 'x', fpRe: { ...karar, cnt: 1 } }, yeni, 2000, [], 12) as { fpRe: { cnt: number } };
  assert.equal(ayni.fpRe.cnt, 7);
  assert.equal(yenidenIlkParcaTabani({ fpRe: karar }), 0);
});

test('ikinci kontrol yalnız kurallı pakette, kritik ölçülü istekte ve onaya geçişte istenir (B-006)', () => {
  const paket = { plan: [{ id: 1, crit: true }, { id: 2 }], rules: { q: { critTwice: true } } };
  const onay = { status: 'approved', items: [1, 2] };
  assert.equal(ikinciKontrolEksik(onay, { status: 'measuring' }, paket), true);
  assert.equal(ikinciKontrolEksik({ ...onay, c2: true }, undefined, paket), false);
  assert.equal(ikinciKontrolEksik(onay, { status: 'approved' }, paket), false);
  assert.equal(ikinciKontrolEksik({ ...onay, items: [2] }, undefined, paket), false);
  assert.equal(ikinciKontrolEksik({ ...onay, status: 'deviation' }, undefined, paket), false);
  assert.equal(ikinciKontrolEksik(onay, undefined, { ...paket, rules: {} }), false);
  assert.equal(ikinciKontrolEksik({ ...onay, c2: 'evet' }, undefined, paket), true);
});

// B-005: tablet, rolün okuyamadığı depoyu istemez (arkon/web/src/data/depo-okuma.ts); listesi bu kuralla her rol ve depo için aynı kalmalı.
test('tabletin depo okuma listesi sunucunun okuma kuralıyla aynı', () => {
  const roller: ArkonRolu[] = ['admin', 'plan', 'prep', 'quality', 'maint', 'lead', 'operator'];
  const depolar: ArkonDeposu[] = ['pkgs', 'results', 'requests', 'kv', 'draws', 'downs', 'maint', 'gauges', 'logi'];
  for (const rol of roller) for (const depo of depolar) assert.equal(depoOkunur(depo, rol), okuyabilirMi(depo, rol), `${depo} ${rol}`);
});

// 124 a: planlamacı çizim kaydeder ama silemez; stüdyodaki Sil düğmesi sunucunun silme kuralıyla aynı rollere görünür.
test('stüdyonun çizim silme düğmesi sunucunun silme kuralıyla aynı rollere görünür; planlamacı kaydeder, silemez', () => {
  const roller: ArkonRolu[] = ['admin', 'plan', 'prep', 'quality', 'maint', 'lead', 'operator'];
  for (const rol of roller) assert.equal(cizimSilinir(rol), yazmaReddi('draws', 'c1', rol, 'sil') === null, rol);
  assert.equal(yazmaReddi('draws', 'c1', 'plan', 'yaz'), null);
  assert.equal(yazmaReddi('draws', 'c1', 'plan', 'sil'), 'rolYetmez');
});

// Y8: tablet her paket değişikliğinde değişiklik günlüğünü gönderip 400 alıyordu; sunucunun reddettiği türü göndermemeli, ötekileri göndermeli.
test('tablet sunucunun yalnız kendisinin yazdığı kayıt türünü göndermez', () => {
  for (const tur of ARKON_KAYIT_TURLERI) assert.equal(sunucuyaGonderilir(tur), kayitReddi(tur, {}) !== 'gunlukSunucu', tur);
});

// Uçtan uca deneme Y2: hazırlıkta yazılan iyi parça ertelenip üretime geçince sağlama yazılıyordu.
test('hazırlıkta iyi parça sayımı reddedilir; düzeltme, hurda ve öteki durumlar geçer', () => {
  assert.equal(kayitReddi('counts', { kind: 'good', delta: 1, state: 'setup' }), 'hazirliktaSayim');
  assert.equal(kayitReddi('counts', { kind: 'good', delta: -1, state: 'setup' }), null);
  assert.equal(kayitReddi('counts', { kind: 'scrap', delta: 1, state: 'setup' }), null);
  assert.equal(kayitReddi('counts', { kind: 'good', delta: 1, state: 'running' }), null);
  assert.equal(kayitReddi('counts', { kind: 'good', delta: 1 }), null);
  assert.equal(kayitReddi('events', { kind: 'good', delta: 1, state: 'setup' }), null);
});

// KD-001 (#383): sonucu bilinmeyen hata kuyrukta kalır, sunucunun açık reddi kuyruğu tıkamadan düşer; flush, Log.add, Docs.put ve Docs.del aynı kararı kullanır.
test('tablet gönderim hatası: bilinmeyen sonuç kuyruğa, açık ret düşmeye gider', () => {
  assert.equal(gonderimSonucu({ offline: true }), 'kuyruk');
  assert.equal(gonderimSonucu({}), 'kuyruk');
  for (const status of [401, 500, 502, 503]) assert.equal(gonderimSonucu({ status }), 'kuyruk', String(status));
  for (const status of [400, 403, 404, 409, 413, 422, 429]) assert.equal(gonderimSonucu({ status }), 'red', String(status));
});

test('KD-004 kural: imleç kalan en küçük kimlikten bir geriden daha gerideyse ya da tablo boşken sayaçtan gerideyse ileti kaçmıştır', () => {
  assert.equal(iletiKacirildi(10, { taban: 11, tavan: 20, sayac: 20 }), false);
  assert.equal(iletiKacirildi(9, { taban: 11, tavan: 20, sayac: 20 }), true);
  assert.equal(iletiKacirildi(20, { taban: null, tavan: null, sayac: 20 }), false);
  assert.equal(iletiKacirildi(19, { taban: null, tavan: null, sayac: 20 }), true);
  assert.equal(iletiBasi({ taban: null, tavan: null, sayac: 20 }), 20);
  assert.equal(iletiBasi({ taban: 11, tavan: 15, sayac: 20 }), 15);
});

test('ikinci menü: her Arkon rolü yalnız sabit matriste açabildiği sayfaların maddesini görür; operatör ekranı menüde yok', () => {
  // Operatör ekranı (page.op) menüde değildir: Üretim Terminali açar (kart #1073).
  const SAYFA: Record<string, string> = {
    pano: 'page.board', planlama: 'page.plan', hazirlik: 'page.prep', kalite: 'page.quality',
    cizim: 'page.draw', bakim: 'page.maint', raporlar: 'page.report',
  };
  const matris = yetkiMatrisi();
  const maddeler = ARKON_IKINCI_MENU.gruplar.flatMap((g): readonly IkinciMenuMaddesi[] => g.maddeler).filter((m) => m.anahtar in SAYFA);
  assert.equal(maddeler.length, Object.keys(SAYFA).length);
  for (const islem of ARKON_ISLEMLERI) {
    const rol = arkonRoluBul([islem]);
    if (rol === null) continue;
    const gorunen = maddeler.filter((m) => maddeGorunurMu(m, ['sayfa.arkon', islem])).map((m) => SAYFA[m.anahtar]).sort();
    const acabildigi = rol === 'admin' ? Object.values(SAYFA).sort() : (matris[rol] ?? []).filter((k) => k.startsWith('page.') && k !== 'page.op').sort();
    assert.deepEqual(gorunen, acabildigi, `${islem} (${rol})`);
  }
  assert.equal(ARKON_IKINCI_MENU.gruplar.flatMap((g): readonly IkinciMenuMaddesi[] => g.maddeler).some((m) => m.anahtar === 'operator'), false);
});

test('ikinci menü: Üretim Anomalisi maddesini Hazırlık ile aynı roller görür (kart #1193)', () => {
  const madde = (anahtar: string) => ARKON_IKINCI_MENU.gruplar.flatMap((g): readonly IkinciMenuMaddesi[] => g.maddeler).find((m) => m.anahtar === anahtar);
  const anomali = madde('anomali');
  const hazirlik = madde('hazirlik');
  assert.ok(anomali !== undefined && hazirlik !== undefined);
  assert.equal(anomali.yol, '/arkon/anomali');
  for (const islem of ARKON_ISLEMLERI) {
    assert.equal(maddeGorunurMu(anomali, ['sayfa.arkon', islem]), maddeGorunurMu(hazirlik, ['sayfa.arkon', islem]), islem);
  }
  assert.equal(maddeGorunurMu(anomali, ['sayfa.arkon', 'arkon.operator']), false);
});

// Adım 1 (kart #199): rotalı emirde paket iş emri başına.
const ISTASYON = { id: 3, kod: 'AI2', ad: 'Torna', tip: 'talasli' } as unknown as Parameters<typeof isEmrindenTaslakPaket>[0]['istasyon'];
const girdi = (ek: Partial<Parameters<typeof isEmrindenTaslakPaket>[0]> = {}): Parameters<typeof isEmrindenTaslakPaket>[0] => ({
  isEmri: { id: 41, uretimEmriId: 7, emirNo: 'UE-7', malzemeNo: 900, adet: 50, teslim: '2026-11-02', oncelik: 1, opNo: 20, ad: 'Frezeleme', ayarSuresiDk: '15', birimSureDk: '1.25' },
  emir: { parcaNo: 'P-1', parcaAd: 'Parça', acan: { id: 1, ad: 'Planlamacı' }, acilma: '2026-10-01T08:00:00Z' },
  istasyon: ISTASYON, makineKodu: 'M-5', revizyon: 'C', talimat: 'Pensi kontrol et\r\n\r\n  Ofseti doğrula ', sablon: null, plan: PLANSIZ, ...ek,
});

// 744 a: rotadaki "yok" seçimi taslağın ilk parça kuralını kapatır (şablonun öteki kuralları kalır); "her kurulumda" kural yazmaz. TMI kilidi
// yalnız "her kurulumda" ve talaşlı (ya da istasyonsuz) adımdadır.
test('744 a: adımın ilk parça seçimi taslak kuralına ve TMI kilidine', () => {
  assert.equal(isEmrindenTaslakPaket(girdi({ ilkParcaSecimi: 'her_kurulum' }))['rules'], undefined);
  assert.equal(isEmrindenTaslakPaket(girdi())['rules'], undefined);
  assert.deepEqual(isEmrindenTaslakPaket(girdi({ ilkParcaSecimi: 'yok' }))['rules'], { q: { firstPiece: false } });
  const sablon = { rules: { warns: ['w'], q: { who: 'operator', firstPiece: true }, prod: { scrapPct: 5 } } };
  assert.deepEqual(isEmrindenTaslakPaket(girdi({ ilkParcaSecimi: 'yok', sablon }))['rules'], { warns: ['w'], q: { who: 'operator', firstPiece: false }, prod: { scrapPct: 5 } });
  assert.equal(ilkParcaGereksinimi('her_kurulum', 'talasli'), 'gerekli');
  assert.equal(ilkParcaGereksinimi('her_kurulum', null), 'gerekli');
  assert.equal(ilkParcaGereksinimi('yok', 'talasli'), 'gerekmez');
  for (const tip of ['kalite', 'depo', 'markalama', 'boya', 'montaj'] as const) assert.equal(ilkParcaGereksinimi('her_kurulum', tip), 'gerekmez');
});

// 664: terminal başlığında Proje; paket emrin proje adını taşır, projesizde boş. TMI alanıdır: kayıtlı pakette de her okumada yazılır.
test('paket emrin proje adını taşır; projesiz emirde boş metin; proje TMI alanıdır', () => {
  assert.equal(isEmrindenTaslakPaket(girdi({ proje: 'Deneme proje' }))['proje'], 'Deneme proje');
  assert.equal(isEmrindenTaslakPaket(girdi())['proje'], '');
  assert.ok((TMI_PAKET_ALANLARI as readonly string[]).includes('proje'));
});

// Kullanıcı kararı 16.10: talaşlı (CNC) istasyondaki her emirde hazırlık tamamlanmadıysa uyarı; kilit yok.
test('CNC hazırlık eksiği yalnız talaşlı istasyonda; kurulum kaydı yoksa da uyarır, tamamsa uyarmaz', () => {
  assert.equal(hazirlikEksigi('talasli', undefined), 'yok');
  assert.equal(hazirlikEksigi('talasli', 'yok'), 'yok');
  assert.equal(hazirlikEksigi('talasli', 'suruyor'), 'suruyor');
  assert.equal(hazirlikEksigi('talasli', 'tamam'), null);
  for (const tip of ['kalite', 'depo', 'markalama', 'boya', 'montaj'] as const) assert.equal(hazirlikEksigi(tip, 'yok'), null, tip);
  assert.equal((isEmrindenTaslakPaket(girdi({ hazirlik: 'suruyor' }))['tmi'] as Record<string, unknown>)['hazirlik'], 'suruyor');
  assert.equal('hazirlik' in (isEmrindenTaslakPaket(girdi({ hazirlik: null }))['tmi'] as Record<string, unknown>), false);
  assert.deepEqual((isEmrindenTaslakPaket(girdi({ ilkParca: { karar: 'ret', zaman: 't' } }))['tmi'] as Record<string, unknown>)['ilkParca'], { karar: 'ret', zaman: 't' });
  assert.equal('ilkParca' in (isEmrindenTaslakPaket(girdi({ ilkParca: null }))['tmi'] as Record<string, unknown>), false);
});

// 521 3 a (H1): kayıtsız taslağın Malzeme alanı adımın rota girenleridir; dolu şablon ve giren yoksa boş kalır.
test('521 3 a: taslak pakete rota girenleri yazılır (kod, ad, miktar); şablonun dolu malzemesi korunur, giren yoksa alan boş', () => {
  const g = [{ kod: 'HM-YAP-00001', ad: 'Deneme çubuk', miktar: '40.5000', birim: 'kg' }, { kod: 'HM-2', ad: null, miktar: '3.0000', birim: null }];
  assert.equal(girenMetni(g), 'HM-YAP-00001 · Deneme çubuk · 40,5 kg; HM-2 · 3');
  assert.equal(isEmrindenTaslakPaket(girdi({ girenler: g }))['material'], 'HM-YAP-00001 · Deneme çubuk · 40,5 kg; HM-2 · 3');
  assert.equal(isEmrindenTaslakPaket(girdi({ girenler: g, sablon: { material: 'Elle yazılan' } }))['material'], 'Elle yazılan');
  assert.equal(isEmrindenTaslakPaket(girdi({ girenler: g, sablon: { material: '  ' } }))['material'], 'HM-YAP-00001 · Deneme çubuk · 40,5 kg; HM-2 · 3');
  assert.equal(isEmrindenTaslakPaket(girdi({ girenler: [] }))['material'], '');
  assert.equal(isEmrindenTaslakPaket(girdi())['material'], '');
});

// #1444: önceki biten adımın hurdası sonraki adımın adedinden düşer (OP10 40 -> 39 sağlam -> OP20 39); operatör kartının hedefi de o adettir.
test('iş emri taslağının hedefi adımın adedi; adım adedi yoksa emir adedi', () => {
  assert.equal(isEmrindenTaslakPaket(girdi({ isEmri: { ...girdi().isEmri, adet: 40, adimAdedi: 39 } }))['target'], 39);
  assert.equal(isEmrindenTaslakPaket(girdi({ isEmri: { ...girdi().isEmri, adet: 40 } }))['target'], 40);
});

test('iş emri taslağı: TMI alanları rotadan ve emirden; çevrim saniye, ayar dakika, termin teslim, öncelik 1 acil; adımlar talimattan; süre yoksa null', () => {
  const p = isEmrindenTaslakPaket(girdi());
  assert.equal(p['id'], 'tmi-ie-41');
  assert.equal(p['no'], 'UE-7');
  assert.equal(p['op'], 'Op 20 · Frezeleme');
  assert.equal(p['rev'], 'C');
  assert.equal(p['machine'], 'AI2');
  assert.equal(p['mc'], 'M-5');
  assert.equal(p['cycle'], 75);
  assert.equal(p['setup'], 15);
  assert.equal(p['due'], '2026-11-02');
  assert.equal(p['priority'], 'urgent');
  assert.equal(p['opType'], 'cnc');
  assert.equal(p['status'], 'draft');
  assert.deepEqual(p['tmi'], { emirId: 7, isEmriId: 41, opNo: 20, plan: PLANSIZ });
  assert.deepEqual((p['steps'] as { t: string }[]).map((a) => a.t), ['Pensi kontrol et', 'Ofseti doğrula']);
  const bos = isEmrindenTaslakPaket(girdi({ isEmri: { ...girdi().isEmri, birimSureDk: null, ayarSuresiDk: null, teslim: null, oncelik: 2 }, talimat: null }));
  assert.equal(bos['cycle'], null);
  assert.equal(bos['setup'], null);
  assert.equal(bos['due'], '');
  assert.equal(bos['priority'], 'normal');
  assert.deepEqual(bos['steps'], []);
  assert.deepEqual(talimatAdimlari(''), []);
});

test('şablon: aynı malzeme, revizyon ve operasyonun en son yayınlanmışı; resim, plan, kural, adım kopyalanır, TMI alanları ve durum kopyalanmaz', () => {
  const eski = { malzemeNo: 900, rev: 'C', tmi: { opNo: 20 }, publishedAt: 10, steps: [{ t: 'eski' }] };
  const baskaRev = { malzemeNo: 900, rev: 'B', tmi: { opNo: 20 }, publishedAt: 50, steps: [{ t: 'B' }] };
  const son = { malzemeNo: 900, rev: 'C', tmi: { opNo: 20 }, publishedAt: 20, steps: [{ t: 'son' }], plan: [{ id: 1 }], files: [{ name: 'a.pdf' }], primary: 'a.pdf', rules: { r: 1 },
    machine: 'BASKA', cycle: 1, status: 'published', opType: 'cnc', st: { a: 1 } };
  const yayinsiz = { malzemeNo: 900, rev: 'C', tmi: { opNo: 20 }, steps: [{ t: 'yayinsiz' }] };
  const baskaOp = { malzemeNo: 900, rev: 'C', tmi: { opNo: 30 }, publishedAt: 30 };
  const baskaMalzeme = { malzemeNo: 901, rev: 'C', tmi: { opNo: 20 }, publishedAt: 40 };
  const sablon = sablonPaket([eski, son, baskaRev, yayinsiz, baskaOp, baskaMalzeme, null], 900, 20, 'C');
  assert.equal(sablon, son);
  assert.equal(sablonPaket([eski], 900, 30, 'C'), null);
  assert.equal(sablonPaket([eski, son], 900, 20, 'D'), null);
  assert.equal(sablonPaket([{ ...eski, rev: '' }], 900, 20, null), null);
  const p = isEmrindenTaslakPaket(girdi({ sablon }));
  assert.deepEqual(p['steps'], son.steps);
  assert.deepEqual(p['files'], son.files);
  assert.equal(p['primary'], 'a.pdf');
  assert.deepEqual(p['st'], { a: 1 });
  assert.equal(p['machine'], 'AI2');
  assert.equal(p['cycle'], 75);
  assert.equal(p['status'], 'draft');
  assert.deepEqual(isEmrindenTaslakPaket(girdi({ sablon: { ...son, opType: 'kalite' } }))['st'], {});
});

test('kayıtlı iş emri paketi: TMI alanları yazılır, gerisi kalır; değişen yoksa aynı nesne ve aynı sürüm; okunan sürümle yazım kayıtlı sürüm sayılır', () => {
  const taslak = isEmrindenTaslakPaket(girdi());
  const kayitli = { ...taslak, cycle: 30, machine: 'ESKI', steps: [{ t: 'Hazırlık' }], plan: [{ id: 1 }] };
  const birlesik = tmiAlanlariniYaz(kayitli, taslak) as Record<string, unknown>;
  assert.equal(birlesik['cycle'], 75);
  assert.equal(birlesik['machine'], 'AI2');
  assert.deepEqual(birlesik['steps'], [{ t: 'Hazırlık' }]);
  assert.equal(tmiAlanlariniYaz(birlesik, taslak), birlesik);
  const surum = tmiBirlesikSurum(5, kayitli, birlesik);
  assert.notEqual(surum, 5);
  assert.equal(tmiBirlesikSurum(5, birlesik, birlesik), 5);
  assert.equal(tabanCoz(surum, { surum: 5, govde: kayitli }, birlesik), 5);
  assert.equal(tabanCoz(5, { surum: 5, govde: kayitli }, birlesik), 5);
  assert.equal(tabanCoz(4, { surum: 5, govde: kayitli }, birlesik), 4);
  assert.equal(tabanCoz(null, { surum: 5, govde: kayitli }, birlesik), null);
});

test('iş emri paketi kimliği kanoniktir; yansıma kararı iş emrini taşır, emir servis katmanında çözülür; stok isteği iş emrini taşır', () => {
  assert.equal(paketIsEmri('tmi-ie-41'), 41);
  for (const k of ['tmi-ie-041', 'tmi-ie-', 'tmi-ie-1x', 'tmi-ue-41', 41]) assert.equal(paketIsEmri(k), null, String(k));
  assert.deepEqual(yansimaKarari('events', { pkgId: 'tmi-ie-41', state: 'running' }), { emirId: null, isEmriId: 41, komut: { komut: 'basla-ya-da-devam', makineKodlari: [] }, neden: null });
  assert.equal(yansimaKarari('events', { pkgId: 'tmi-ue-7', state: 'running' }).emirId, 7);
  assert.match(yansimaKarari('events', { pkgId: 'baska', state: 'running' }).neden ?? '', /tmi-ie-<iş emri>/);
  assert.equal(paketinEmri('tmi-ie-41', { tmi: { emirId: 7 } }), 7);
  assert.equal(paketinEmri('tmi-ie-41', {}), null);
  assert.equal(paketinEmri('tmi-ue-8', { tmi: { emirId: 7 } }), 8);
  const karar = stokIstegiKarari({ kind: 'req', malzemeId: 3, qty: 2, st: 'AI2', pkgId: 'tmi-ie-41' }, undefined);
  assert.ok(karar !== null && 'girdi' in karar);
  assert.equal(karar.girdi.isEmriId, 41);
  assert.equal(karar.girdi.uretimEmriId, null);
});


test('numune teslimi (115 a, 125 a): yalnız yeni bekleyen numune isteği teslim açar; emirsiz ya da istasyonsuz istek açmaz; bağı yalnız sunucu yazar', () => {
  const istek = { status: 'waiting', machine: 'AI2', pkgId: 'tmi-ue-8', items: [1, 2] };
  assert.deepEqual(numuneTeslimGirdisi('rq1', istek, undefined), { istasyonKodu: 'AI2', uretimEmriId: 8, isEmriId: null, miktar: 1, kaynakKimligi: 'arkon:requests:rq1' });
  assert.equal(numuneTeslimGirdisi('rq1', { ...istek, pkgId: 'tmi-ie-41' }, undefined)?.isEmriId, 41);
  assert.equal(numuneTeslimGirdisi('rq1', istek, { ...istek }), null, 'güncelleme ikinci teslim açmaz');
  assert.equal(numuneTeslimGirdisi('rq1', { ...istek, status: 'approved' }, undefined), null);
  assert.equal(numuneTeslimGirdisi('rq1', { ...istek, pkgId: 'yerel-1' }, undefined), null, 'yerel paket stoğa gitmez');
  assert.equal(numuneTeslimGirdisi('rq1', { ...istek, machine: '' }, undefined), null);
  const bag = { id: 5, no: 'T-5' };
  assert.deepEqual(numuneTesliminiKoru({ ...istek, numuneTeslim: { id: 99 } }, undefined), istek, 'istemcinin bağı atılır');
  assert.deepEqual(numuneTesliminiKoru({ ...istek, status: 'approved' }, { ...istek, numuneTeslim: bag }), { ...istek, status: 'approved', numuneTeslim: bag });
  assert.deepEqual(numuneTesliminiKoru({ ...istek, kaliteIstasyonu: 'SAHTE' }, { ...istek, kaliteIstasyonu: 'KAL' }), { ...istek, kaliteIstasyonu: 'KAL' }, '564 1 b: kalite istasyonu yalnız sunucudan');
  assert.deepEqual(numuneTesliminiKoru({ ...istek, kmNumune: 9, ilkParca: false, kmOlculen: 5 }, { ...istek, kmNumune: 3, ilkParca: true }), { ...istek, kmNumune: 3, ilkParca: true }, '798: Kalite Merkezi bağı yalnız sunucudan');
});

test('131 b: kapı açıkken ilk sağlamdan sonrası karar bekler; düzeltme ve hurda beklemez; yansıma yalnız sunucunun alanını okur', () => {
  const sag = (delta: number, kind = 'good') => ({ kind, delta });
  assert.equal(kararBekleyenAdet(sag(1), 0), 0, 'ilk parça');
  assert.equal(kararBekleyenAdet(sag(3), 0), 2);
  assert.equal(kararBekleyenAdet(sag(2), 4), 2);
  assert.equal(kararBekleyenAdet(sag(-1), 4), 0);
  assert.equal(kararBekleyenAdet(sag(2, 'scrap'), 4), 0);
  const sayim = (ek: Record<string, unknown>) => yansimaKarari('counts', { pkgId: 'tmi-ue-7', kind: 'good', ...ek }).komut;
  assert.deepEqual(sayim({ delta: 3, [KARAR_BEKLIYOR_ALANI]: 2 }), { komut: 'saglam', adet: 3, kararBekliyor: 2, refakatPartisiId: null });
  assert.deepEqual(sayim({ delta: 3, [KARAR_BEKLIYOR_ALANI]: 9 }), { komut: 'saglam', adet: 3, kararBekliyor: 3, refakatPartisiId: null }, 'adetten fazlası beklemez');
  assert.deepEqual(sayim({ delta: -1, [KARAR_BEKLIYOR_ALANI]: 1 }), { komut: 'saglam', adet: -1, kararBekliyor: 0, refakatPartisiId: null });
  assert.deepEqual(sayim({ delta: 2, [KARAR_BEKLIYOR_ALANI]: '2' }), { komut: 'saglam', adet: 2, kararBekliyor: 0, refakatPartisiId: null });
  assert.equal(KARAR_BEKLIYOR_ALANI in kayitGovdesi({ kind: 'good', delta: 2, [KARAR_BEKLIYOR_ALANI]: 2 }, { id: 1, ad: 'A' }, 1), false, 'istemcinin alanı atılır');
});

test('toplu giriş (kart #1046) olağan sayımdır: N sağlam ve nedenli N hurda TMI\'ye aynı adetle gider; nedensiz hurda ve 0 adet yansımaz', () => {
  const sayim = (ek: Record<string, unknown>) => yansimaKarari('counts', { pkgId: 'tmi-ie-41', ...ek });
  assert.deepEqual(sayim({ kind: 'good', delta: 12, cycleMs: null }).komut, { komut: 'saglam', adet: 12, kararBekliyor: 0, refakatPartisiId: null });
  assert.deepEqual(sayim({ kind: 'scrap', delta: 3, reason: 'H-01', cycleMs: null }).komut, { komut: 'hurda', adet: 3, nedenKodu: 'H-01', refakatPartisiId: null });
  const nedensiz = sayim({ kind: 'scrap', delta: 3, reason: null });
  assert.equal(nedensiz.komut, null);
  assert.match(nedensiz.neden ?? '', /Hurda nedeni yok/);
  assert.deepEqual([sayim({ kind: 'good', delta: 0 }).komut, sayim({ kind: 'good', delta: 0 }).neden], [null, SIFIR_SAYIM]);
});

test('kart #156: sayım satırındaki refakat kartı komuta geçer; biçimi bozuk kart kartsız sayılır (emre aitliği stok denetler)', () => {
  const sayim = (ek: Record<string, unknown>) => yansimaKarari('counts', { pkgId: 'tmi-ie-41', ...ek }).komut;
  assert.deepEqual(sayim({ kind: 'good', delta: 2, [REFAKAT_KARTI_ALANI]: 37 }), { komut: 'saglam', adet: 2, kararBekliyor: 0, refakatPartisiId: 37 });
  assert.deepEqual(sayim({ kind: 'scrap', delta: 1, reason: 'H-01', [REFAKAT_KARTI_ALANI]: 37 }), { komut: 'hurda', adet: 1, nedenKodu: 'H-01', refakatPartisiId: 37 });
  assert.deepEqual(sayim({ kind: 'good', delta: -1, [REFAKAT_KARTI_ALANI]: 37 }), { komut: 'saglam', adet: -1, kararBekliyor: 0, refakatPartisiId: 37 }, 'düzeltme de kartla gider');
  for (const k of ['37', 0, -4, 1.5, 2147483648, null, {}]) {
    assert.deepEqual(sayim({ kind: 'good', delta: 2, [REFAKAT_KARTI_ALANI]: k }), { komut: 'saglam', adet: 2, kararBekliyor: 0, refakatPartisiId: null }, String(k));
  }
});

test('#157: kaydın uyarıları tek iletiye eklenir; boş uyarı eklenmez, aynı ileti tekrarlanmaz', () => {
  assert.equal(uyariBirlestir(null, null), null);
  assert.equal(uyariBirlestir(undefined, 'Kartın malzemesi başka konumda.'), 'Kartın malzemesi başka konumda.');
  assert.equal(uyariBirlestir('A.', ''), 'A.');
  assert.equal(uyariBirlestir('A.', 'B.'), 'A. B.');
  assert.equal(uyariBirlestir('A. B.', 'B.'), 'A. B.');
});

// Operatöre düşme (kart #199, A4): rotalı iş canlı planda iş emrinin kaynağına yerleşmeden başlatılmaz.
test('plan durumu: kaynak başına sıra, makinede aynı makine, kişide yalnız yerleşim', () => {
  const yer = (isEmriId: number, tur: 'makine' | 'kisi', id: number) => ({ isEmriId, kaynak: { tur, id } });
  const d = planDurumlari([yer(1, 'makine', 5), yer(2, 'makine', 6), yer(3, 'makine', 5), yer(4, 'kisi', 9)],
    new Map([[1, { tur: 'makine', id: 5 }], [2, { tur: 'makine', id: 7 }], [3, { tur: 'makine', id: 5 }], [4, { tur: 'makine', id: 5 }], [5, { tur: 'makine', id: 5 }]]));
  assert.deepEqual(d.get(1), { canli: true, sira: 1, eslesiyor: true, kaynak: { tur: 'makine', id: 5 }, zorunlu: true });
  assert.deepEqual(d.get(2), { canli: true, sira: 1, eslesiyor: false, kaynak: { tur: 'makine', id: 6 }, zorunlu: true });
  assert.deepEqual(d.get(3), { canli: true, sira: 2, eslesiyor: true, kaynak: { tur: 'makine', id: 5 }, zorunlu: true });
  assert.deepEqual(d.get(4), { canli: true, sira: 1, eslesiyor: true, kaynak: { tur: 'kisi', id: 9 }, zorunlu: true });
  assert.equal(d.get(5), undefined);
  assert.equal(planDurumlari([yer(1, 'kisi', 9)], new Map([[1, null]])).get(1)?.eslesiyor, false);
});

// 147 a: taslakta sırası değişen canlı iş etiketlenir; onaydaki taslak açıktakinden önce gelir, canlıda olmayan iş etiketlenmez.
test('sıra onayı: onayda açıktan önce gelir; yalnız canlı işe yazılır', () => {
  const o = siraOnaylari([{ isEmriId: 1, durum: 'acik' }, { isEmriId: 1, durum: 'onayda' }, { isEmriId: 1, durum: 'acik' }, { isEmriId: 2, durum: 'acik' }, { isEmriId: 3, durum: 'onayda' }]);
  assert.deepEqual([...o], [[1, 'onayda'], [2, 'taslakta'], [3, 'onayda']]);
  assert.equal(siraOnaylari([]).size, 0);
  const canli = { canli: true, sira: 1, eslesiyor: true, kaynak: { tur: 'makine', id: 5 }, zorunlu: true };
  const planlar = new Map<number, TmiPlanDurumu>([[1, canli], [2, { ...PLANSIZ, taslakta: true }], [4, canli]]);
  siraOnayiniYaz(planlar, o);
  assert.deepEqual(planlar.get(1), { ...canli, siraOnayi: 'onayda' });
  assert.equal(planlar.get(2)?.siraOnayi, undefined, 'canlıda olmayan iş');
  assert.equal(planlar.has(3), false, 'planda olmayan iş eklenmez');
  assert.deepEqual(planlar.get(4), canli);
});

test('başlatma reddi: yalnız bekleyen iş emrinin running olayında, plan canlı ve eşleşmiyorsa', () => {
  const run = { state: 'running', pkgId: 'tmi-ie-4' };
  const acik = { canli: true, sira: 1, eslesiyor: true, kaynak: { tur: 'makine', id: 5 }, zorunlu: true };
  assert.equal(planBaslatmaReddi('events', run, 'bekliyor', undefined), true);
  assert.equal(planBaslatmaReddi('events', run, 'bekliyor', PLANSIZ), true);
  assert.equal(planBaslatmaReddi('events', run, 'bekliyor', { ...acik, eslesiyor: false }), true);
  assert.equal(planBaslatmaReddi('events', run, 'bekliyor', acik), false);
  assert.equal(planBaslatmaReddi('events', run, 'calisiyor', undefined), false);
  assert.equal(planBaslatmaReddi('events', { ...run, state: 'paused' }, 'bekliyor', undefined), false);
  assert.equal(planBaslatmaReddi('events', { ...run, pkgId: 'tmi-ue-4' }, 'bekliyor', undefined), false);
  assert.equal(planBaslatmaReddi('counts', run, 'bekliyor', undefined), false);
  assert.deepEqual((isEmrindenTaslakPaket(girdi({ plan: acik }))['tmi'] as Record<string, unknown>)['plan'], acik);
});

test('canlı plan ayarı (kart #1257): kapalıyken başlatma plana bakılmaz, plan durumu yalnız bilgidir', () => {
  const run = { state: 'running', pkgId: 'tmi-ie-4' };
  assert.equal(planBaslatmaReddi('events', run, 'bekliyor', undefined, false), false);
  assert.equal(planBaslatmaReddi('events', run, 'bekliyor', PLANSIZ, false), false);
  assert.equal(planBaslatmaReddi('events', run, 'bekliyor', { ...PLANSIZ, zorunlu: false }), false, 'plan durumundaki ayar da yeter');
  assert.equal(planBaslatmaReddi('events', run, 'bekliyor', PLANSIZ, true), true);
  const d = planDurumlari([{ isEmriId: 1, kaynak: { tur: 'makine', id: 5 } }], new Map([[1, { tur: 'makine', id: 6 }]]), false);
  assert.deepEqual(d.get(1), { canli: true, sira: 1, eslesiyor: false, kaynak: { tur: 'makine', id: 5 }, zorunlu: false });
});

// Kart #1572: elle bölünmüş işin parçaları ayrı pakettir; kayıt iş emrine yazılır.
test('parça paketi kimliği: yalnız kanonik biçim, parça no sıfırdan büyük; iş emri parçadan okunur', () => {
  assert.deepEqual(paketParcasi('tmi-ie-41-p2'), { isEmriId: 41, no: 2 });
  assert.deepEqual(paketParcasi('tmi-ie-41'), { isEmriId: 41, no: null });
  assert.equal(paketIsEmri('tmi-ie-41-p2'), 41);
  for (const k of ['tmi-ie-41-p0', 'tmi-ie-41-p02', 'tmi-ie-041-p2', 'tmi-ie-41-p', 'tmi-ie-41-p2x', 'tmi-ue-41-p2', 41]) assert.equal(paketParcasi(k), null, String(k));
});

test('plan durumu bölünmüş işte: parçalar kendi kaynağında başlangıca göre sıralanır; iş zarfın kaynağındadır', () => {
  const t = (dk: number) => new Date(Date.UTC(2026, 9, 16, 8, dk));
  const parcalar = new Map<string, TmiPlanDurumu>();
  const d = planDurumlari([
    { isEmriId: 1, kaynak: { tur: 'makine', id: 5 }, baslangic: t(0), parcalar: [{ no: 1, kaynak: { tur: 'makine', id: 5 }, baslangic: t(0) }, { no: 2, kaynak: { tur: 'makine', id: 6 }, baslangic: t(20) }] },
    { isEmriId: 2, kaynak: { tur: 'makine', id: 6 }, baslangic: t(10) },
  ], new Map([[1, { tur: 'makine', id: 5 }], [2, { tur: 'makine', id: 6 }]]), true, parcalar);
  assert.deepEqual(parcalar.get('tmi-ie-1-p1'), { canli: true, sira: 1, eslesiyor: true, kaynak: { tur: 'makine', id: 5 }, zorunlu: true });
  assert.deepEqual(parcalar.get('tmi-ie-1-p2'), { canli: true, sira: 2, eslesiyor: true, kaynak: { tur: 'makine', id: 6 }, zorunlu: true }, 'makine 6 da önce iş 2');
  assert.deepEqual(d.get(1), { canli: true, sira: 1, eslesiyor: true, kaynak: { tur: 'makine', id: 5 }, zorunlu: true });
  assert.equal(d.get(2)?.sira, 1);
  assert.equal(parcalar.size, 2);
});

test('parça taslağı: kimlik, hedef ve tmi.parca parçadan; bütün paket işaretli; yayın bütün paketten geçer', () => {
  const p = isEmrindenTaslakPaket(girdi({ parca: { no: 2, adet: 15, toplam: 3 } }));
  assert.deepEqual([p['id'], p['target']], ['tmi-ie-41-p2', 15]);
  assert.deepEqual((p['tmi'] as Record<string, unknown>)['parca'], { no: 2, adet: 15, toplam: 3 });
  const b = isEmrindenTaslakPaket(girdi({ bolunmus: true }));
  assert.deepEqual([b['id'], b['target'], (b['tmi'] as Record<string, unknown>)['bolunmus']], ['tmi-ie-41', 50, true]);
  assert.equal('parca' in (isEmrindenTaslakPaket(girdi())['tmi'] as Record<string, unknown>), false);
  assert.equal('bolunmus' in (isEmrindenTaslakPaket(girdi())['tmi'] as Record<string, unknown>), false);
  const yayinda = { status: 'published', publishedAt: '2026-10-16T08:00:00Z' };
  assert.deepEqual(parcaYayini(p, yayinda), { ...p, status: 'published', publishedAt: '2026-10-16T08:00:00Z', dirty: false });
  assert.equal(parcaYayini(p, { status: 'draft' }), p);
  assert.equal(parcaYayini(p, null), p);
  assert.equal(butunPaketSablonu(null), null);
  assert.equal(butunPaketSablonu('x'), null);
  assert.deepEqual(butunPaketSablonu(yayinda), yayinda);
});

test('parça sayım sınırı: sağlam parça adedini aşamaz; düzeltme, hurda ve sınırdaki sayım geçer; plandan kalkan parça sağlam alamaz', () => {
  const parca = { no: 1, adet: 12 };
  assert.equal(parcaSayimReddi({ kind: 'good', delta: 2 }, parca, 10), null, 'tam sınır');
  assert.match(parcaSayimReddi({ kind: 'good', delta: 3 }, parca, 10) ?? '', /Parça 1 adedi 12: bu parçada en çok 2 sağlam/);
  assert.match(parcaSayimReddi({ kind: 'good', delta: 1 }, parca, 14) ?? '', /en çok 0 sağlam/, 'eksi kalan sıfır yazılır');
  assert.equal(parcaSayimReddi({ kind: 'good', delta: -3 }, parca, 14), null, 'düzeltme');
  assert.equal(parcaSayimReddi({ kind: 'scrap', delta: 50 }, parca, 12), null, 'hurda');
  assert.equal(parcaSayimReddi({ kind: 'good', delta: 1 }, null, 0), PARCA_PLANDA_YOK);
  assert.equal(parcaSayimReddi({ kind: 'good', delta: -1 }, null, 0), null);
});

test('parça olayı: öteki parça çalışırken iş emri değişmez; biten parça ötekiler bitmeden iş emrini bitirmez', () => {
  const k = (komut: Parameters<typeof parcaOlayKarari>[0]['komut']) => ({ emirId: null, isEmriId: 41, komut, neden: null });
  const basla = k({ komut: 'basla-ya-da-devam', makineKodlari: [] });
  const bitir = k({ komut: 'bitir' });
  assert.deepEqual(parcaOlayKarari(basla, 2, [null]), basla);
  assert.deepEqual(parcaOlayKarari(basla, 2, ['running']), { ...basla, komut: null, neden: PARCA_OTEKI_CALISIYOR });
  assert.deepEqual(parcaOlayKarari(k({ komut: 'duraklat' }), 3, ['done', 'running']).neden, PARCA_OTEKI_CALISIYOR);
  assert.deepEqual(parcaOlayKarari(k({ komut: 'durdur', nedenKodu: 'D1' }), 2, ['paused']).komut, { komut: 'durdur', nedenKodu: 'D1' });
  assert.deepEqual(parcaOlayKarari(bitir, 2, ['running']), { ...bitir, komut: null, neden: PARCA_OTEKILER_BITMEDI });
  assert.deepEqual(parcaOlayKarari(bitir, 2, ['paused']).komut, { komut: 'duraklat' });
  assert.deepEqual(parcaOlayKarari(bitir, 3, ['done']).komut, { komut: 'duraklat' }, 'üçüncü parçanın olayı yok');
  assert.deepEqual(parcaOlayKarari(bitir, 3, ['done', 'done']), bitir);
  const saglam = k({ komut: 'saglam', adet: 3, kararBekliyor: 0, refakatPartisiId: null });
  assert.deepEqual(parcaOlayKarari(saglam, 2, ['running']), saglam);
});

test('istasyonsuz ve rotasız iş emri paketi (kart #1257): istasyon boş, plan yok; istasyonsuz paket yayınlanamaz', () => {
  const p = isEmrindenTaslakPaket(girdi({ istasyon: null, makineKodu: null, plan: null }));
  assert.equal(p['machine'], '');
  assert.equal(p['opType'], 'cnc');
  assert.equal((p['tmi'] as Record<string, unknown>)['plan'], null);
  const yayin = { id: 'tmi-ie-4', status: 'published', version: 1, machine: '', steps: [{ t: 'a' }] };
  assert.equal(yayinEksigi('pkgs', yayin, { status: 'draft', version: 0 }), ISTASYONSUZ_YAYIN);
  assert.equal(yayinEksigi('pkgs', { ...yayin, machine: '  ' }, undefined), ISTASYONSUZ_YAYIN);
  assert.equal(yayinEksigi('pkgs', { ...yayin, machine: 'TZG-04' }, undefined), null);
  assert.equal(yayinEksigi('pkgs', { ...yayin, status: 'draft' }, undefined), null, 'taslak istasyonsuz kalabilir');
  assert.equal(yayinEksigi('pkgs', { ...yayin, id: 'tmi-ue-4' }, undefined), ISTASYONSUZ_YAYIN);
  assert.equal(yayinEksigi('pkgs', { ...yayin, id: 'yerel-1' }, undefined), null, 'eski yerel paket');
});

test('kart #1372: rotasında girensiz adım olan emrin paketi nedeni taşır ve yayınlanamaz', () => {
  const neden = 'Rotada girdi eksik (OP 10: giren (hammadde ya da yarı mamul) seçilmeli)';
  const p = isEmrindenTaslakPaket(girdi({ rotaEksik: neden }));
  assert.equal((p['tmi'] as Record<string, unknown>)['rotaEksik'], neden);
  assert.equal('rotaEksik' in (isEmrindenTaslakPaket(girdi())['tmi'] as Record<string, unknown>), false, 'tam rotada alan yazılmaz, paket sürümü değişmez');
  const yayin = { ...p, status: 'published', version: 1, steps: [{ t: 'a' }] };
  assert.equal(yayinEksigi('pkgs', yayin, { status: 'draft', version: 0 }), ROTA_EKSIK_YAYIN(neden));
  assert.equal(yayinEksigi('pkgs', { ...yayin, status: 'draft' }, undefined), null, 'taslak kalabilir');
  assert.equal(yayinEksigi('pkgs', { ...yayin, id: 'yerel-1' }, undefined), null, 'eski yerel paket');
});

test('Arkon Planlama sırası: yeni sıra aynı işlerden, görülen sıra canlıdakiyle aynı olmalı; Arkon rolünde plan.edit', () => {
  assert.equal(planSirasiReddi([1, 2, 3], [3, 1, 2], [9, 1, 2, 3]), null);
  assert.equal(planSirasiReddi([1, 2], [2, 1, 3], [1, 2]), 'planSiraGecersiz');
  assert.equal(planSirasiReddi([1, 2], [2, 2], [1, 2]), 'planSiraGecersiz');
  assert.equal(planSirasiReddi([1, 1], [1, 1], [1]), 'planSiraGecersiz');
  assert.equal(planSirasiReddi([1, 2], [2, 1], [2, 1]), 'planSiraEski');
  assert.equal(planSirasiReddi([1, 2], [2, 1], [1]), 'planSiraEski');
  const sabit = new Set([1]);
  assert.deepEqual(planSirasiTasinacaklar([1, 2, 3, 4], [1, 4, 2, 3], sabit), [4, 2, 3], 'sabit iş yerinde, yalnız taşınabilenler gider');
  assert.equal(planSirasiTasinacaklar([1, 2, 3], [2, 1, 3], sabit), 'planSiraSabit');
  assert.deepEqual(planSirasiTasinacaklar([2, 1, 3], [3, 1, 2], sabit), [3, 2], 'aradaki sabit iş');
  assert.equal(planSirasiTasinacaklar([2, 1, 3], [2, 3, 1], sabit), 'planSiraSabit');
  assert.equal(planSirasiTasinacaklar([1, 2], [1, 2], sabit), 'planSiraDegismedi');
  assert.match(ILETILER.planSiraSabit, /^Kilitli ya da dondurulmuş iş yerinden oynatılamaz/, 'başlamış iş sabit değil (kart #199, 3b)');
  assert.equal(planSiralayabilirMi('admin'), true);
  assert.equal(planSiralayabilirMi('plan'), true);
  for (const rol of ['prep', 'quality', 'lead', 'maint', 'operator'] as const) assert.equal(planSiralayabilirMi(rol), false, rol);
});

test('A5 yerel paket: yeni emir dışı paket reddedilir; TMI emri ve iş emri paketi, var olan yerel paket ve başka depo geçer', () => {
  assert.equal(yerelPaketReddi('pkgs', 'p-1', null), true);
  assert.equal(yerelPaketReddi('pkgs', 'tmi-ue-0012', null), true, 'kanonik olmayan TMI kimliği');
  assert.equal(yerelPaketReddi('pkgs', 'tmi-pd-3', null), true);
  assert.equal(yerelPaketReddi('pkgs', 'tmi-ue-12', null), false);
  assert.equal(yerelPaketReddi('pkgs', 'tmi-ie-7', null), false);
  assert.equal(yerelPaketReddi('pkgs', 'p-1', 5), false, 'var olan yerel paket');
  assert.equal(yerelPaketReddi('results', 'p-1', null), false);
});

test('plansızKaynak: bitmiş iş emri paketinden yalnız tmi.plan düşer; planı olmayan aynen döner', () => {
  const p = { id: 'tmi-ie-4', note: 'n', tmi: { emirId: 1, isEmriId: 4, opNo: 10, plan: PLANSIZ } };
  assert.deepEqual(plansizKaynak(p), { id: 'tmi-ie-4', note: 'n', tmi: { emirId: 1, isEmriId: 4, opNo: 10 } });
  assert.deepEqual(p.tmi.plan, PLANSIZ, 'girdi değişmez');
  const plansiz = { tmi: { emirId: 1 } };
  assert.equal(plansizKaynak(plansiz), plansiz);
  assert.equal(plansizKaynak(null), null);
});

test('A7-V1: TMI vardiyaları Arkon biçimine çevrilir; pasif atlanır, gece yarısını geçen mola dakikası doğru, aktif yoksa null', () => {
  const sonuc = arkonVardiyalari([
    { ad: 'Gündüz', baslangic: '08:00:00', bitis: '16:00:00', aktif: true, molalar: [{ baslangic: '12:00:00', bitis: '12:30:00' }] },
    { ad: 'Eski', baslangic: '07:00:00', bitis: '15:00:00', aktif: false, molalar: [] },
    { ad: 'Gece', baslangic: '22:00:00', bitis: '06:00:00', aktif: true, molalar: [{ baslangic: '23:50:00', bitis: '00:20:00' }] },
  ]);
  assert.deepEqual(sonuc, [
    { name: 'Gündüz', start: '08:00', end: '16:00', breaks: [{ at: '12:00', min: 30 }] },
    { name: 'Gece', start: '22:00', end: '06:00', breaks: [{ at: '23:50', min: 30 }] },
  ]);
  assert.equal(arkonVardiyalari([{ ad: 'Eski', baslangic: '07:00:00', bitis: '15:00:00', aktif: false, molalar: [] }]), null);
  assert.equal(arkonVardiyalari([]), null);
});

test('79: TMI tatil günleri Arkon biçimine tarih anahtarıyla çevrilir; kayıt yoksa ayar yok', () => {
  assert.deepEqual(arkonTatilleri([{ tarih: '2026-10-29', tur: 'tatil', ad: 'Bayram' }, { tarih: '2026-11-02', tur: 'kapali', ad: null }]),
    { '2026-10-29': { type: 'tatil', name: 'Bayram' }, '2026-11-02': { type: 'kapali', name: null } });
  assert.equal(arkonTatilleri([]), null);
});

test('A7-K1: TMI ölçü aleti Arkon alet biçimine çevrilir; boş alan yazılmaz, tarih tesis günü öğlesi, kullanım dışı out', () => {
  const ogle = Date.UTC(2026, 2, 10, 9, 0, 0);
  assert.deepEqual(arkonAletleri([
    {
      id: 7, no: 'MK-7', tur: 'Mikrometre', ad: '25-50', olcmeAraligi: '0,001', yer: 'Dolap', periyotGun: 180, kullanimDisi: false, sonKalibrasyon: '2026-03-10',
      kayitlar: [{ tarih: '2026-03-10', sonuc: 'uygun', sertifikaNo: 'S-1', aciklama: null, kisiAd: 'Deneme' }, { tarih: '2026-03-10', sonuc: 'uygunsuz', sertifikaNo: null, aciklama: 'ayar', kisiAd: null }],
    },
    { id: 8, no: 'KM-1', tur: 'Kumpas', ad: null, olcmeAraligi: null, yer: null, periyotGun: 365, kullanimDisi: true, sonKalibrasyon: null, kayitlar: [] },
  ]), [
    {
      id: 'tmi-alet-7', no: 'MK-7', type: 'Mikrometre', name: '25-50', range: '0,001', loc: 'Dolap', interval: 180, last: ogle, status: 'ok',
      cals: [{ at: ogle, by: 'Deneme', res: 'ok', cert: 'S-1' }, { at: ogle, by: '', res: 'nok', note: 'ayar' }],
    },
    { id: 'tmi-alet-8', no: 'KM-1', type: 'Kumpas', interval: 365, status: 'out', cals: [] },
  ]);
});

test('belgedenDurusa: gövdede active yoksa kaydın aktifliği kalır, yeni kayıt aktif açılır; active gelirse o yazılır', () => {
  const kimlikler = { merkez: new Map<string, number>(), istasyon: new Map<string, number>(), neden: new Map<string, number>() };
  const govde = { title: 'D', scope: 'all', target: '', from: Date.UTC(2026, 9, 7, 5, 0), to: Date.UTC(2026, 9, 7, 6, 0), rep: 'none' };
  const aktif = (g: unknown, mevcut: boolean | null) => { const c = belgedenDurusa(g, kimlikler, mevcut); return 'girdi' in c ? c.girdi.aktif : c.hata.ileti; };
  assert.equal(aktif(govde, false), false, 'pasif kayıt pasif kalır');
  assert.equal(aktif(govde, true), true);
  assert.equal(aktif(govde, null), true, 'yeni kayıt');
  assert.equal(aktif({ ...govde, active: true }, false), true, 'açıkça etkinleştirme');
  assert.equal(aktif({ ...govde, active: false }, true), false);
});

// Kart #1148: terminal makine seçimi ve aynı işe katılım.
test('makine seçimi: yok ya da boş seçim varsayılan makinedir; kod listesi tekrarsız, metin ve en çok 20; biçimsiz seçim geçersiz', () => {
  assert.deepEqual(makineSecimi(undefined), []);
  assert.deepEqual(makineSecimi(null), []);
  assert.deepEqual(makineSecimi([]), []);
  assert.deepEqual(makineSecimi(['M1', 'M2']), ['M1', 'M2']);
  for (const kotu of ['M1', ['M1', 'M1'], [''], [1], ['M1', null], { 0: 'M1' }, Array.from({ length: AZAMI_MAKINE_SECIMI + 1 }, (_, i) => `M${i}`)]) assert.equal(makineSecimi(kotu), null, JSON.stringify(kotu));
  assert.equal(makineSecimi(Array.from({ length: AZAMI_MAKINE_SECIMI }, (_, i) => `M${i}`))?.length, AZAMI_MAKINE_SECIMI);
});

test('yansıma kararı: çalışmaya geçiş seçilen makineleri taşır; yalnız mc (ekran varsayılanı) seçim değildir; biçimsiz seçim eşlenemez', () => {
  assert.deepEqual(yansimaKarari('events', { pkgId: 'tmi-ue-5', state: 'running', mcs: ['M2'] }).komut, { komut: 'basla-ya-da-devam', makineKodlari: ['M2'] });
  assert.deepEqual(yansimaKarari('events', { pkgId: 'tmi-ue-5', state: 'running', mc: 'M1' }).komut, { komut: 'basla-ya-da-devam', makineKodlari: [] });
  const kotu = yansimaKarari('events', { pkgId: 'tmi-ue-5', state: 'running', mcs: 'M2' });
  assert.deepEqual([kotu.komut, kotu.neden], [null, MAKINE_SECIMI_GECERSIZ]);
  assert.deepEqual(yansimaKarari('events', { pkgId: 'tmi-ue-5', state: 'paused', mcs: ['M2'] }).komut, { komut: 'duraklat' }, 'seçim yalnız başlatmada anlamlıdır');
});

test('katılım yolu: insanlı istasyonda çalışan işe başlatma katılımdır, makinelide emre gider; duraklatma ve bitirme başkası çalışırken yalnız kendi katılımıdır', () => {
  const durum = (benim: KatilimDurumu['benim'], ...digerleri: string[]): KatilimDurumu => ({ benim, digerleriAcik: digerleri });
  const yol = (...a: Parameters<typeof katilimYolu>) => katilimYolu(...a).yol;
  // Başlatma.
  assert.equal(yol('basla-ya-da-devam', 'basladi', 'insan', durum('yok', 'Ali')), 'katil', 'insanlı: başkası çalışıyor');
  assert.equal(yol('basla-ya-da-devam', 'basladi', 'insan', durum('duraklamis', 'Ali')), 'katil', 'duraklattığı işe döner');
  assert.equal(yol('basla-ya-da-devam', 'basladi', 'insan', durum('acik')), 'katil', 'zaten çalışıyor: katılım kuralı reddeder');
  assert.equal(yol('basla-ya-da-devam', 'basladi', 'insan', durum('yok')), 'emir', 'kimse çalışmıyor: iş devam eder');
  assert.equal(yol('basla-ya-da-devam', 'basladi', 'makine', durum('yok', 'Ali')), 'emir', 'makineli: TMI çalışan işe devamı reddeder');
  assert.equal(yol('basla-ya-da-devam', 'planli', 'insan', durum('yok')), 'emir');
  // İş TMI'de çalışıyorken: duraklattığı çalışmasına dönüş makineli istasyonda da katılımdır; açık çalışmaya başlatma değişiklik yapmaz.
  const calisan = (benim: KatilimDurumu['benim'], ...digerleri: string[]): KatilimDurumu => ({ benim, digerleriAcik: digerleri, emirCalisiyor: true });
  assert.equal(yol('basla-ya-da-devam', 'basladi', 'makine', calisan('duraklamis', 'Ali')), 'katil', 'makineli: kendi çalışmasına döner');
  assert.equal(yol('basla-ya-da-devam', 'basladi', 'insan', calisan('duraklamis')), 'katil', 'öteki ayrılmış, iş sürüyor');
  assert.equal(yol('basla-ya-da-devam', 'basladi', 'makine', calisan('acik')), 'degisiklik-yok', 'başka ekrandan başlatılmış kendi işi');
  assert.equal(yol('basla-ya-da-devam', 'basladi', 'insan', calisan('acik', 'Ali')), 'degisiklik-yok');
  assert.equal(yol('basla-ya-da-devam', 'basladi', 'makine', calisan('yok', 'Ali')), 'emir', 'katılımsız kişi: TMI reddeder');
  assert.equal(yol('basla-ya-da-devam', 'basladi', 'makine', { benim: 'duraklamis', digerleriAcik: [], emirCalisiyor: false }), 'emir', 'iş duraklamış: devam emre');
  // Duraklatma ve kuyruğa alma.
  for (const komut of ['duraklat', 'kuyruga-al'] as const) {
    assert.equal(yol(komut, 'basladi', 'insan', durum('acik', 'Ali')), 'katilim-duraklat', komut);
    assert.equal(yol(komut, 'basladi', 'insan', durum('acik')), 'emir', `${komut}: tek çalışan işi duraklatır`);
    assert.equal(yol(komut, 'basladi', 'insan', durum('yok')), 'emir', `${komut}: katılım satırı yok (eski iş)`);
    assert.equal(yol(komut, 'basladi', 'insan', durum('yok', 'Ali')), 'ret', `${komut}: katılımsız kişi başkasının işini duraklatamaz`);
    assert.equal(yol(komut, 'basladi', 'insan', durum('duraklamis', 'Ali')), 'ret', `${komut}: duraklattığı işi bir daha duraklatamaz`);
  }
  // Durdurma (duruş nedeniyle) işin kendisini keser: başkası çalışırken reddedilir.
  assert.equal(yol('durdur', 'basladi', 'insan', durum('acik', 'Ali')), 'ret');
  assert.equal(yol('durdur', 'basladi', 'makine', durum('yok', 'Ali')), 'ret');
  assert.equal(yol('durdur', 'basladi', 'insan', durum('acik')), 'emir');
  // Bitirme.
  assert.equal(yol('bitir', 'basladi', 'insan', durum('acik', 'Ali')), 'katilim-ayril');
  assert.equal(yol('bitir', 'basladi', 'insan', durum('duraklamis', 'Ali')), 'katilim-ayril');
  assert.equal(yol('bitir', 'basladi', 'insan', durum('yok', 'Ali')), 'ret');
  assert.equal(yol('bitir', 'basladi', 'insan', durum('acik')), 'emir');
  const ret = katilimYolu('durdur', 'basladi', 'insan', durum('acik', 'Ali', 'Veli'));
  assert.ok(ret.yol === 'ret' && ret.neden.includes('Ali, Veli'));
});

test('TMI hâli Arkon durumuyla: kişi kendi çalışmasını duraklattıysa iş sürse de duraklamış; iptalin karşılığı yok', () => {
  assert.equal(tmidekiDurum('planli', null, 'yok'), 'queued');
  assert.equal(tmidekiDurum('bitti', null, 'yok'), 'done');
  assert.equal(tmidekiDurum('iptal', null, 'yok'), null);
  assert.equal(tmidekiDurum('basladi', 'calisiyor', 'acik'), 'running');
  assert.equal(tmidekiDurum('basladi', 'calisiyor', 'yok'), 'running');
  assert.equal(tmidekiDurum('basladi', 'calisiyor', 'duraklamis'), 'paused');
  assert.equal(tmidekiDurum('basladi', 'durakli', 'yok'), 'paused');
  assert.equal(tmidekiDurum('basladi', 'durdu', 'yok'), 'stopped');
  assert.equal(tmidekiDurum('basladi', null, 'yok'), null);
});

test('operatör özeti: dönem başı, oranlar, isimsiz ekip ortalaması ve rozetler; veri yoksa boş', () => {
  assert.equal(tarihEkle('2026-10-31', 1), '2026-11-01');
  assert.equal(tarihEkle('2026-03-01', -1), '2026-02-28');
  assert.equal(donemBaslangici('2026-10-14', 'gun'), '2026-10-14');
  assert.equal(donemBaslangici('2026-10-14', 'hafta'), '2026-10-12', 'çarşamba: haftanın pazartesisi');
  assert.equal(donemBaslangici('2026-10-12', 'hafta'), '2026-10-12');
  assert.equal(donemBaslangici('2026-10-18', 'hafta'), '2026-10-12', 'pazar haftanın son günüdür');
  assert.equal(donemBaslangici('2026-10-14', 'ay'), '2026-10-01');

  assert.deepEqual(ozetOranlari(null, null, null), { kalite: null, saatlikSaglam: null });
  assert.deepEqual(ozetOranlari(90, 10, 7200), { kalite: 0.9, saatlikSaglam: 45 });
  assert.deepEqual(ozetOranlari(0, 0, 3600), { kalite: null, saatlikSaglam: 0 }, 'sayım düzeltmeyle sıfırlanmış: kalite bilinmez');
  assert.equal(ozetOranlari(10, 0, 0).saatlikSaglam, null, 'süre yoksa hız yok');

  assert.equal(ekipOrtalamasi([]), null);
  assert.equal(ekipOrtalamasi([1, 0.5]), null, 'iki kişi: tek kişi ortalamadan okunur');
  assert.equal(ekipOrtalamasi([1, 0.5, 0.75]), 0.75);

  const g = (tarih: string, saglam: number | null, hurda: number | null) => ({ tarih, saglam, hurda });
  assert.deepEqual(ozetRozetleri([], '2026-10-14'), []);
  const r = ozetRozetleri([g('2026-10-10', 50, 2), g('2026-10-11', null, null), g('2026-10-12', 80, 0), g('2026-10-13', 60, 0), g('2026-10-14', 20, 0)], '2026-10-14');
  assert.deepEqual(r.map((x) => x.kod), ['sifir-hurda', 'en-iyi-gun']);
  assert.equal(r[0]?.baslik, '3 gün üst üste sıfır hurda', 'kayıtsız gün seriyi bozmaz, sayılmaz da');
  assert.equal(r[0]?.aciklama, 'Seri bugün de sürüyor');
  assert.equal(r[1]?.aciklama, '12.10 · 80 adet');
  assert.deepEqual(ozetRozetleri([g('2026-10-14', 20, 1)], '2026-10-14'), [], 'tek gün: rozet yok');
});

test('operatör özeti: dönem başarısı beklenen adedi bilinen günlerden; bilinmeyen kayıtlı gün sayılır, kayıtsız gün sayılmaz', () => {
  const g = (tarih: string, saglam: number | null, beklenen: number | null, standartla = 0) => ({ tarih, saglam, hurda: null, beklenen, standartla });
  assert.equal(donemBasarisi([]), null);
  assert.equal(donemBasarisi([g('2026-10-13', 40, null)]), null);
  assert.deepEqual(donemBasarisi([g('2026-10-12', 90, 100, 1), g('2026-10-13', 40, null), g('2026-10-14', null, null), g('2026-10-15', null, 50)]),
    { uretilen: 90, beklenen: 150, oran: 0.6, eksikGun: 1, standartla: 1 });
});

describe('Özetim mesai ve fazla mesai kuralları', () => {
  test('mesaiGunleri: molayla bölünen aralıklar tek vardiyadır; gece vardiyası başladığı güne yazılır; gün boyu vardiyalar birleşmez', () => {
    const gun = (tarih: string) => ({ tarih, dakika: 480, kapali: null });
    const z = (s: string) => new Date(s).toISOString();
    const sonuc = mesaiGunleri([gun('2026-10-14'), gun('2026-10-15')], [
      { baslangic: '2026-10-13T18:00:00.000Z', bitis: '2026-10-14T01:00:00.000Z' },
      { baslangic: '2026-10-14T05:00:00.000Z', bitis: '2026-10-14T09:00:00.000Z' },
      { baslangic: '2026-10-14T09:30:00.000Z', bitis: '2026-10-14T14:00:00.000Z' },
      { baslangic: '2026-10-15T19:00:00.000Z', bitis: '2026-10-15T23:00:00.000Z' },
      { baslangic: '2026-10-15T23:30:00.000Z', bitis: '2026-10-16T03:00:00.000Z' },
    ]);
    assert.deepEqual(sonuc.map((m) => [m.baslangic, m.bitis]), [
      [z('2026-10-14T05:00:00Z'), z('2026-10-14T14:00:00Z')],
      [z('2026-10-15T19:00:00Z'), z('2026-10-16T03:00:00Z')],
    ]);
    assert.deepEqual(mesaiGunleri([gun('2026-10-18')], []).map((m) => m.baslangic), [null]);
    // Her gün 00:00-23:59 (tesis saati): ertesi günün parçası öğleden sonra biter, önceki güne yazılmaz.
    const tam = mesaiGunleri([gun('2026-10-14'), gun('2026-10-15')], [
      { baslangic: '2026-10-13T21:00:00.000Z', bitis: '2026-10-14T20:59:00.000Z' },
      { baslangic: '2026-10-14T21:00:00.000Z', bitis: '2026-10-15T20:59:00.000Z' },
    ]);
    assert.deepEqual(tam.map((m) => m.baslangic), [z('2026-10-13T21:00:00Z'), z('2026-10-14T21:00:00Z')]);
  });

  test('fazlaMesaiSaati: saati girilmemiş satır varsa toplam bilinmez; satır yoksa 0', () => {
    assert.equal(fazlaMesaiSaati([{ saat: 2.5 }, { saat: 3 }]), 5.5);
    assert.equal(fazlaMesaiSaati([{ saat: 2 }, { saat: null }]), null);
    assert.equal(fazlaMesaiSaati([]), 0);
  });
});

test('biten iş beklenen: bugünkü sağlam kayıttaki beklenenin altında sayılmaz; kayıt bilinmiyorsa null kalır', () => {
  assert.equal(bitenIsBeklenen(60, 70), 70);
  assert.equal(bitenIsBeklenen(60, 40), 60);
  assert.equal(bitenIsBeklenen(null, 70), null);
});

test('belge alanları: TMI\'nin okuduğu sonuç ve paket alanları türüyle denetlenir, Arkon\'un öteki alanları serbesttir', () => {
  assert.equal(belgeBicimiHatasi('results', { id: 'p1', state: 'setup', good: 3, scrap: 0, baseGood: 0, meas: {}, yeniAlan: 'x' }), null);
  assert.deepEqual(belgeBicimiHatasi('results', { state: 'calisiyor' }), { ileti: 'Belge alanı geçersiz: state.', alan: 'govde.state' });
  assert.deepEqual(belgeBicimiHatasi('results', { good: -1 }), { ileti: 'Belge alanı geçersiz: good.', alan: 'govde.good' });
  assert.deepEqual(belgeBicimiHatasi('results', { scrap: 1.5 }), { ileti: 'Belge alanı geçersiz: scrap.', alan: 'govde.scrap' });
  assert.equal(belgeBicimiHatasi('pkgs', { no: 'UE-1', machine: null, version: 2, target: '' }), null);
  assert.deepEqual(belgeBicimiHatasi('pkgs', { machine: 4 }), { ileti: 'Belge alanı geçersiz: machine.', alan: 'govde.machine' });
  assert.deepEqual(belgeBicimiHatasi('pkgs', { version: -1 }), { ileti: 'Belge alanı geçersiz: version.', alan: 'govde.version' });
  assert.equal(belgeBicimiHatasi('draws', { state: 'herhangi' }), null);
});

test('Arkon 33: onay içeriği plan, adımlar, dosyalar ve uyarılardır; özet onay anında yazılır, onay aynıysa korunur, yayında tutmazsa yayın durur', () => {
  const p = { status: 'draft', version: 1, updatedAt: 1, plan: [{ id: 'p' }], steps: [{ id: 's' }], files: [], rules: { warns: [{ id: 'w' }], other: 1 } };
  assert.equal(onayIcerigi(p), onayIcerigi({ ...p, status: 'published', version: 2, updatedAt: 9, publishedAt: 9, note: 'n', rules: { ...p.rules, other: 2 } }));
  for (const d of [{ plan: [] }, { steps: [] }, { files: [{ id: 'f' }] }, { rules: { warns: [] } }]) assert.notEqual(onayIcerigi(p), onayIcerigi({ ...p, ...d }));
  const onayli = onayOzetiDamgala('pkgs', { ...p, approval: { ok: true, at: 5, ozet: 'sahte' } }, p, 'O1') as { approval: unknown };
  assert.deepEqual(onayli.approval, { ok: true, at: 5, ozet: 'O1' });
  assert.deepEqual((onayOzetiDamgala('pkgs', { ...onayli, approval: { ok: true, at: 5, ozet: 'sahte' } }, onayli, 'O2') as { approval: unknown }).approval, { ok: true, at: 5, ozet: 'O1' });
  assert.deepEqual((onayOzetiDamgala('pkgs', { ...p, approval: { ok: false, at: 6, ozet: 'O1' } }, onayli, 'O2') as { approval: unknown }).approval, { ok: false, at: 6 });
  const yayin = { ...onayli, status: 'published' };
  assert.equal(onayEskidiMi('pkgs', yayin, onayli, 'prep', true, 'O1'), false);
  assert.equal(onayEskidiMi('pkgs', yayin, onayli, 'prep', true, 'O2'), true);
  assert.equal(onayEskidiMi('pkgs', yayin, onayli, 'prep', false, 'O2'), false);
  assert.equal(onayEskidiMi('pkgs', yayin, onayli, 'admin', true, 'O2'), false);
  assert.equal(onayEskidiMi('pkgs', yayin, { ...p, approval: { ok: true, at: 5 } }, 'prep', true, 'O2'), false);
  assert.equal(onayEskidiMi('pkgs', yayin, yayin, 'prep', true, 'O2'), false);
  assert.equal(onayEskidiMi('pkgs', { ...yayin, version: 2 }, yayin, 'prep', true, 'O2'), true);
});

test('150 a: yeni ya da değişen ölçüm alet kimliği taşır; değişmeyen ölçüme ve kaliteden kopyalanan sonuca bakılmaz', () => {
  assert.equal(olcumAletKimligi('tmi-alet-7'), 7);
  for (const k of ['tmi-alet-0', 'tmi-alet-x', 'alet-7', 7, undefined]) assert.equal(olcumAletKimligi(k), null);
  const eski = { results: { 1: { v: 1, ok: true, by: 'A' } } };
  assert.equal(olcumAletleri('requests', { results: { 1: { v: 1, ok: true, by: 'B' } } }, eski), null);
  assert.deepEqual(olcumAletleri('requests', { results: { ...eski.results, 2: { v: 2, ok: true } } }, eski), { eksik: true, aletler: [] });
  assert.deepEqual(olcumAletleri('requests', { results: { 1: { v: 9, ok: true, gid: 'tmi-alet-3' } } }, eski), { eksik: false, aletler: [3] });
  assert.equal(olcumAletleri('results', { meas: { 1: { v: 1, ok: true } } }, undefined), null);
  assert.deepEqual(olcumAletleri('results', { meas: { 1: { v: 1, ok: true, who: 'op' } } }, undefined), { eksik: true, aletler: [] });
  assert.equal(olcumAletleri('pkgs', { results: { 1: { v: 1 } } }, undefined), null);
});

test('İleti yoklaması denetimi süre ve işlem imzasıyla geçer (118 a)', () => {
  const imza = islemImzasi(['arkon.oku', 'arkon.yaz']);
  assert.equal(imza, islemImzasi(['arkon.yaz', 'arkon.oku']));
  const d = { an: 1000, imza };
  assert.equal(yoklamaDenetimiGecerli(d, 1000, imza), true);
  assert.equal(yoklamaDenetimiGecerli(d, 1000 + YOKLAMA_DENETIM_SURESI_MS - 1, imza), true);
  assert.equal(yoklamaDenetimiGecerli(d, 1000 + YOKLAMA_DENETIM_SURESI_MS, imza), false);
  assert.equal(yoklamaDenetimiGecerli(d, 999, imza), false);
  assert.equal(yoklamaDenetimiGecerli(d, 1000, islemImzasi(['arkon.oku'])), false);
});

test('298: yalnız açılan çağrı bildirilir; yer makine, yoksa istasyon; tanınmayan ekip, yersiz ve kimliksiz çağrı bildirilmez', () => {
  const ac = { phase: 'open', team: 'bakim', callId: '17', machine: 'IST-1', mc: 'MK-2', note: 'Takım kırıldı' };
  assert.deepEqual(cagriBildirimi(ac), { ekip: 'bakim', yer: 'MK-2', not: 'Takım kırıldı', cagriKimligi: '17' });
  assert.deepEqual(cagriBildirimi({ ...ac, mc: null, note: '' }), { ekip: 'bakim', yer: 'IST-1', not: null, cagriKimligi: '17' });
  assert.equal(cagriBildirimi({ ...ac, team: 'ayarci' })?.ekip, 'ayarci');
  assert.equal(cagriBildirimi({ ...ac, mc: null, machine: null }), null);
  for (const phase of ['ack', 'esc', 'done', 'cancel']) assert.equal(cagriBildirimi({ ...ac, phase }), null, phase);
  assert.equal(cagriBildirimi({ ...ac, team: 'mudur' }), null);
  assert.equal(cagriBildirimi({ ...ac, callId: '' }), null);
  assert.equal(cagriBildirimi({ ...ac, callId: 17 }), null);
});

// Kart 527: Üretim Hazırlık kuyruk sırası.
test('kuyruk sırası reddi: yeni sıra aynı işlerin dizilişi olmalı; ekran bugünkü kuyruğu ve Hazırlık sırasını görmeli', () => {
  const mevcut = [{ kimlik: 'a', sira: null }, { kimlik: 'b', sira: null }, { kimlik: 'c', sira: null }];
  assert.equal(kuyrukSirasiReddi(['a', 'b', 'c'], ['c', 'a', 'b'], mevcut), null);
  assert.equal(kuyrukSirasiReddi(['a', 'b', 'c'], ['c', 'a', 'a'], mevcut), 'gecersiz');
  assert.equal(kuyrukSirasiReddi(['a', 'b', 'c'], ['c', 'a'], mevcut), 'gecersiz');
  assert.equal(kuyrukSirasiReddi(['a', 'b'], ['b', 'a'], mevcut), 'eski', 'kuyrukta ekranın görmediği iş var');
  assert.equal(kuyrukSirasiReddi(['a', 'b', 'c', 'd'], ['d', 'a', 'b', 'c'], mevcut), 'eski', 'kuyruktan çıkmış iş');
  const sirali = [{ kimlik: 'a', sira: 2 }, { kimlik: 'b', sira: 1 }, { kimlik: 'c', sira: null }];
  assert.equal(kuyrukSirasiReddi(['b', 'a', 'c'], ['a', 'b', 'c'], sirali), null);
  assert.equal(kuyrukSirasiReddi(['b', 'c', 'a'], ['a', 'b', 'c'], sirali), null, 'sırasız işin yeri plandandır, denetlenmez');
  assert.equal(kuyrukSirasiReddi(['a', 'b', 'c'], ['c', 'b', 'a'], sirali), 'eski', 'başkasının sıralamasından önceki ekran');
});

test('plan saatleri paket kimliğiyle; kuyruk ve plan saati tmi alanına eklenir, yoksa gövde aynı kalır', () => {
  const t = (dk: number) => new Date(Date.UTC(2026, 9, 25, 8, dk));
  const saat = planSaatleri([
    { isEmriId: 5, baslangic: t(0), bitis: t(30) },
    { isEmriId: 6, baslangic: t(30), bitis: t(90), parcalar: [{ no: 1, baslangic: t(30), bitis: t(60) }, { no: 2, baslangic: t(60), bitis: t(90) }] },
  ]);
  assert.deepEqual(saat.get('tmi-ie-5'), { baslangic: '2026-10-25T08:00:00.000Z', bitis: '2026-10-25T08:30:00.000Z' });
  assert.deepEqual(saat.get('tmi-ie-6-p2'), { baslangic: '2026-10-25T09:00:00.000Z', bitis: '2026-10-25T09:30:00.000Z' });
  assert.equal(saat.get('tmi-ie-6')?.bitis, '2026-10-25T09:30:00.000Z', 'bölünmüş işin bütünü zarftır');
  const govde = { id: 'tmi-ie-5', tmi: { isEmriId: 5 } };
  assert.equal(kuyrukAlanlariniEkle(govde, { kuyruk: null, planSaati: null }), govde);
  assert.deepEqual(kuyrukAlanlariniEkle(govde, { kuyruk: { sira: 1, kisi: 'K', zaman: 'z' }, planSaati: saat.get('tmi-ie-5')! }), {
    id: 'tmi-ie-5', tmi: { isEmriId: 5, kuyruk: { sira: 1, kisi: 'K', zaman: 'z' }, planSaati: saat.get('tmi-ie-5') },
  });
});


describe('paralel adım (kart 639)', () => {
  test('adimEmirDurumu: iş emri paketinin kuralı adımın durumuyla okunur; açık olmayan emir kendi durumunu taşır', () => {
    assert.equal(adimEmirDurumu('basladi', 'bekliyor'), 'planli');
    assert.equal(adimEmirDurumu('planli', 'bekliyor'), 'planli');
    assert.equal(adimEmirDurumu('basladi', 'calisiyor'), 'basladi');
    assert.equal(adimEmirDurumu('basladi', 'tamam'), 'bitti');
    assert.equal(adimEmirDurumu('bitti', 'tamam'), 'bitti');
    assert.equal(adimEmirDurumu('iptal', 'bekliyor'), 'iptal');
    assert.equal(adimEmirDurumu('basladi', null), 'basladi', 'emir paketi');
  });
});

test('dosya türü ilk baytlardan bulunur; tanınmayan, kısa ve boş içerik türsüz kalır (731)', () => {
  const b = (m: string) => Buffer.from(m, 'latin1');
  assert.equal(dosyaTuruBul(b('%PDF-1.7\n%')), 'application/pdf');
  assert.equal(dosyaTuruBul(b('\x89PNG\r\n\x1a\n....')), 'image/png');
  assert.equal(dosyaTuruBul(b('\xff\xd8\xff\xe0')), 'image/jpeg');
  assert.equal(dosyaTuruBul(b('RIFF\x00\x00\x00\x00WEBPVP8 ')), 'image/webp');
  assert.equal(dosyaTuruBul(b('glTF\x02\x00\x00\x00')), 'model/gltf-binary');
  assert.equal(dosyaTuruBul(b('ISO-10303-21;\nHEADER;')), 'model/step');
  for (const m of ['', '%PD', 'RIFF\x00\x00\x00\x00WAVE', 'solid parca', 'S      1', ' %PDF-1.7']) assert.equal(dosyaTuruBul(b(m)), 'application/octet-stream', JSON.stringify(m));
});

test('karar 732 a: dosyasız taslak malzemenin yayında, Arkon\'un açtığı belgelerini önerir; önce teknik resim', () => {
  const belge = (id: number, dosyaTuru: string | null, ek: { revizyonId?: number | null; ozet?: string | null } = {}) => ({
    id, ad: `Belge ${String(id)}`, revizyonId: ek.revizyonId === undefined ? id * 10 : ek.revizyonId, dosyaTuru, ozet: ek.ozet === undefined ? 'a'.repeat(64) : ek.ozet,
  });
  const belgeler = [belge(4, 'step'), belge(2, 'pdf'), belge(3, 'png'), belge(5, 'pdf', { revizyonId: null }), belge(6, 'stl', { ozet: null }), belge(7, null), belge(1, 'pdf')];
  assert.deepEqual(malzemeCizimleri([], belgeler), [
    { belgeId: 1, ad: 'Belge 1', tip: 'pdf' }, { belgeId: 2, ad: 'Belge 2', tip: 'pdf' }, { belgeId: 4, ad: 'Belge 4', tip: 'model' },
  ]);
  assert.deepEqual(malzemeCizimleri(undefined, belgeler).length, 3, 'dosya alanı olmayan taslak da öneri alır');
  assert.deepEqual(malzemeCizimleri([{ kind: 'pdf', name: 'x.pdf' }], belgeler), [], 'dosyası olan taslak öneri almaz');
  assert.deepEqual(malzemeCizimleri([], []), []);
});
