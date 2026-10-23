import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { gunleriKos } from '../gun-dongusu.ts';
import { KosuKaydi } from '../kayit.ts';
import { DOSYA, adimSatiriOku } from '../sozlesme.ts';
import { rastgeleUret } from '../tohum.ts';
import tedarik, {
  acikSatirBul, girisHareketiDenetle, kartSec, kayitGovdesi, onayEkle, retYoluMu, siparisEkle, siparisSatirIdsi, talepBul, talepOku, teklifKur,
} from './tedarik.ts';
import type { Cevap, RolIstemcisi } from '../senaryo.ts';
import type { AdimSatiri } from '../sozlesme.ts';
import type { Hesap } from '../../hesaplar.ts';
import type { Talep } from './tedarik.ts';

const gecici = mkdtempSync(join(tmpdir(), 'tmiv2-robot-tedarik-'));
after(() => { rmSync(gecici, { recursive: true, force: true }); });

const talep = (alan: Record<string, unknown> = {}): Talep => talepOku({
  id: 't1', no: 'T-1', durum: 'taslak', surum: 1, talepEdenAdi: 'x', acanKisiId: 3, olusturma: 'z', guncelleme: 'z',
  kalemler: [{ id: 'k1' }, { id: 'k2' }], onaylar: [], karar: null, ...alan,
});

describe('tedarik yardımcıları', () => {
  it('kayıt gövdesi sunucu alanlarını atar, sürümü ve değişeni taşır', () => {
    const g = kayitGovdesi(talep(), { durum: 'degerlendirme' });
    assert.deepEqual(Object.keys(g).sort(), ['durum', 'id', 'kalemler', 'karar', 'onaylar', 'surum']);
    assert.equal(g['durum'], 'degerlendirme');
    assert.equal(g['surum'], 1);
  });

  it('kart seçimi birimsizi atlar; boş liste açık iletiyle düşer', () => {
    const r = rastgeleUret(1);
    assert.deepEqual(kartSec({ malzemeler: [{ no: 1, kod: 'A', birim: null }, { no: 2, kod: 'B', birim: 'adet' }] }, r), { no: 2, kod: 'B', birim: 'adet' });
    assert.throws(() => kartSec({ malzemeler: [{ no: 1, kod: 'A', birim: ' ' }] }, r), /örnek veri/);
    assert.throws(() => kartSec({ hata: 'x' }, r), /dizi değil/);
  });

  it('teklif her kaleme fiyat verir; veri BNZ- önekli, tutar ondalık metin', () => {
    const q = teklifKur(talep(), rastgeleUret(2), '2026-10-23');
    assert.match(String(q['tedarikciAdi']), /^BNZ-TEDARIKCI-/);
    const fiyatlar = q['fiyatlar'] as { kalemId: string; birimFiyat: string }[];
    assert.deepEqual(fiyatlar.map((f) => f.kalemId), ['k1', 'k2']);
    for (const f of fiyatlar) assert.match(f.birimFiyat, /^\d+\.\d{2}$/);
    assert.equal(q['firmaId'], null);
  });

  it('ret onayı ekler ve değerlendirmeye döndürür; onay durumu değiştirmez; eski onaylar korunur', () => {
    const eski = { id: 'o0', sonuc: 'ret' };
    const ret = onayEkle(talep({ durum: 'onayda', onaylar: [eski] }), 'ret', 'n');
    assert.equal(ret['durum'], 'degerlendirme');
    assert.deepEqual((ret['onaylar'] as { sonuc: string }[]).map((o) => o.sonuc), ['ret', 'ret']);
    assert.equal(onayEkle(talep({ durum: 'onayda' }), 'onay', '')['durum'], 'onayda');
  });

  it('sipariş kararın teklifine yazılır; kararsız talepte düşer', () => {
    const g = siparisEkle(talep({ durum: 'onayda', karar: { teklifId: 'q1', siparisler: [] } }), 'BNZ-S', '2026-10-23');
    assert.equal(g['durum'], 'siparis_verildi');
    assert.deepEqual((g['karar'] as { siparisler: unknown[] }).siparisler, [{ teklifId: 'q1', siparisNo: 'BNZ-S', siparisTarihi: '2026-10-23', beklenenTeslim: null }]);
    assert.throws(() => siparisEkle(talep(), 'x', 'y'), /nesne değil/);
  });

  it('okuyucular eksik kaydı açık iletiyle düşürür', () => {
    assert.throws(() => talepBul({ talepler: [] }, 't1'), /açılışta yok/);
    assert.throws(() => siparisSatirIdsi(talep({ karar: { siparisler: [] } })), /sipariş sayısı/);
    assert.throws(() => acikSatirBul({ satirlar: [{ id: 5 }] }, 6), /mal kabul listesinde yok/);
    assert.throws(() => girisHareketiDenetle({ satirlar: [{ id: 1, tur: 'giris', girisKaynagi: 'mal_kabul', miktar: '4.000' }] }, 1, '5'), /hareket miktarı/);
    assert.doesNotThrow(() => girisHareketiDenetle({ satirlar: [{ id: 1, tur: 'giris', girisKaynagi: 'mal_kabul', miktar: '5.000' }] }, 1, '5'));
  });

  it('ikinci kopya ret yolunu yürür', () => {
    assert.deepEqual([1, 2, 3, 4].map(retYoluMu), [false, true, false, true]);
  });
});

// Satın alma ve stok uçlarının kara kutu taklidi: senaryonun yolu, sırası ve rolleri doğru mu (sunucu kuralları sunucu testlerinde).
function sahteSunucu(bozuk: { malKabul?: number } = {}): { istemci: (h: Hesap) => RolIstemcisi; cagrilar: string[] } {
  const cagrilar: string[] = [];
  const talepler = new Map<string, Record<string, unknown>>();
  let satirNo = 100;
  const acik: Record<string, unknown>[] = [];
  const hareketler: Record<string, unknown>[] = [];
  const kisi: Record<string, number> = { 'ornek.satinalma': 1, 'ornek.mudur': 2, 'ornek.depo': 3 };
  const cevap = (durum: number, govde: unknown): Promise<Cevap> => Promise.resolve({ durum, govde });
  const istemci = (h: Hesap): RolIstemcisi => ({
    istek(yontem, yol, govde) {
      cagrilar.push(`${h} ${yontem} ${yol.split('?')[0] ?? yol}`);
      const g = (govde ?? {}) as Record<string, unknown>;
      if (yol.startsWith('/api/satin-alma-malzeme-secenekleri')) return cevap(200, { malzemeler: [{ no: 7, kod: 'K', birim: 'adet' }] });
      if (yol === '/api/satin-alma-talepleri/hizli-ac') {
        const id = String(g['id']);
        const kalem = (g['kalemler'] as { miktar: string }[])[0]!;
        talepler.set(id, { id, no: `T-${String(talepler.size + 1)}`, durum: 'taslak', surum: 1, kalemler: [{ id: `k-${id}`, miktar: kalem.miktar }], onaylar: [], karar: null, teklifler: [] });
        return cevap(200, { id, no: talepler.get(id)!['no'], durum: 'taslak' });
      }
      if (yol === '/api/satin-alma-acilis') {
        const goster = [...talepler.values()].map((t) => {
          const k = t['karar'] as { siparisler: { satirlar: { id: number }[] }[] } | null;
          const teslim = k?.siparisler[0]?.satirlar.every((s) => !acik.some((a) => a['id'] === s.id)) === true && k.siparisler.length > 0;
          return teslim ? { ...t, durum: 'teslim_alindi', karar: { ...k, siparisler: k.siparisler.map((x) => ({ ...x, teslimDurumu: 'tamam' })) } } : t;
        });
        return cevap(200, { kullanici: { id: kisi[h] }, talepler: goster });
      }
      const kaydet = /^\/api\/satin-alma-talepleri\/([^/]+)\/kaydet$/.exec(yol);
      if (kaydet !== null) {
        const eski = talepler.get(kaydet[1]!)!;
        if (g['surum'] !== eski['surum']) return cevap(409, { mesaj: 'sürüm' });
        const gecis = `${String(eski['durum'])}>${String(g['durum'])}`;
        if (gecis === 'degerlendirme>siparis_verildi') return cevap(422, { mesaj: 'geçiş yok' });
        let karar = g['karar'] as Record<string, unknown> | null;
        if (g['durum'] === 'siparis_verildi' && karar !== null) {
          const siparisler = (karar['siparisler'] as Record<string, unknown>[]).map((s) => ({ ...s, satirlar: [{ id: (satirNo += 1) }] }));
          karar = { ...karar, siparisler };
          const miktar = (eski['kalemler'] as { miktar: string }[])[0]!.miktar;
          acik.push({ id: satirNo, talepNo: eski['no'], malzemeId: 7, kalanMiktar: miktar });
        }
        const yeni = { ...eski, ...g, karar, no: eski['no'], surum: Number(eski['surum']) + 1 };
        talepler.set(kaydet[1]!, yeni);
        return cevap(200, yeni);
      }
      if (yol.startsWith('/api/satin-alma-taleplerim')) {
        return cevap(200, { talepler: [...talepler.values()].map((t) => ({ id: t['id'], durum: t['durum'] })) });
      }
      if (yol === '/api/stok/acik-siparis-satirlari') return cevap(200, { satirlar: acik });
      if (yol === '/api/stok/mal-kabul') {
        if (bozuk.malKabul !== undefined) return cevap(bozuk.malKabul, { mesaj: 'bozuk' });
        const s = (g['satirlar'] as { siparisSatirId: number; miktar: string }[])[0]!;
        acik.splice(acik.findIndex((a) => a['id'] === s.siparisSatirId), 1);
        hareketler.push({ id: hareketler.length + 1, tur: 'giris', girisKaynagi: 'mal_kabul', miktar: `${s.miktar}.000` });
        return cevap(200, { hareketIdler: [hareketler.length] });
      }
      if (yol.startsWith('/api/stok/hareketler')) return cevap(200, { satirlar: hareketler });
      return cevap(404, { mesaj: yol });
    },
  });
  return { istemci, cagrilar };
}

const kayitAc = (kosuId: string): KosuKaydi => new KosuKaydi({
  kok: gecici, kosuId, taban: 'abc1234', tohum: 7, gunSayisi: 1, roller: [...tedarik.roller], senaryolar: ['tedarik'],
  model: { kip: 'kapali', ustSinir: 0 }, simdi: () => new Date('2026-10-23T10:00:00Z'),
});
const satirlar = (k: KosuKaydi): AdimSatiri[] => readFileSync(join(k.klasor, DOSYA.adimlar), 'utf8').split('\n')
  .filter((s) => s !== '').map((s) => adimSatiriOku(s) as AdimSatiri);

describe('tedarik senaryosu', () => {
  it('onay ve ret yolları uçtan uca geçer; roller ve sıra beklenen', async () => {
    const k = kayitAc('t1');
    const s = sahteSunucu();
    await gunleriKos({ kayit: k, senaryolar: [tedarik], istemci: s.istemci, tohum: 3, gunSayisi: 1, esZamanli: 1 });
    const adimlar = satirlar(k);
    assert.deepEqual(adimlar.filter((a) => a.sonuc !== 'gecti').map((a) => `${a.adim}: ${a.ileti ?? ''}`), []);
    const onay = adimlar.slice(0, 11).map((a) => `${a.rol} ${a.adim}`);
    assert.deepEqual(onay, [
      'ornek.depo malzeme kartı seç', 'ornek.depo talep aç', 'ornek.satinalma talebi iş kutusunda bul', 'ornek.satinalma teklif gir',
      'ornek.satinalma karar ver, onaya gönder', 'ornek.mudur onay bekleyen talebi aç', 'ornek.mudur talebi onayla', 'ornek.satinalma sipariş ver',
      'ornek.depo açık sipariş satırını bul', 'ornek.depo mal kabul', 'ornek.depo stok hareketini gör',
    ]);
    assert.deepEqual(adimlar.slice(12).map((a) => a.adim).slice(6), [
      'talebi reddet', 'reddedilen talep siparişe geçmez', 'reddedilen talebi iptal et', 'talep eden iptali görür', 'iptal talep mal kabulde yok',
    ]);
    assert.equal(s.cagrilar.filter((c) => c.endsWith('/api/stok/mal-kabul')).length, 1);
  });

  it('yazma düşerse senaryo durur ve yazma yeniden gönderilmez', async () => {
    const k = kayitAc('t2');
    const s = sahteSunucu({ malKabul: 500 });
    await gunleriKos({ kayit: k, senaryolar: [{ ...tedarik, kopya: 1 }], istemci: s.istemci, tohum: 3, gunSayisi: 1, esZamanli: 1 });
    const son = satirlar(k).at(-1)!;
    assert.deepEqual([son.adim, son.sonuc, son.beklenen, son.gelen], ['mal kabul', 'dustu', '200', '500']);
    assert.equal(s.cagrilar.filter((c) => c.endsWith('/api/stok/mal-kabul')).length, 1);
  });
});
