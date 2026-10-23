import { describe, expect, it } from 'vitest';
import { D, H, M } from './bicim.ts';
import {
  bahisleriAc, bahisleriKodla, bahsedildi, baslamaMetni, benimYanitim, bendenOnayBekliyor, duyuruBekliyor, iletiParcalari,
  kanalAdiDuzelt, kanalKimligi, kisiAnahtari, okunmamis, onayDurumu, onizleme, sayaclar, sonrakiZaman, teslimEtiketi,
  tepkiAnahtari, tepkiEmojisi, yalnizEmoji, yanitBekleyenDavet,
} from './kurallar.ts';
import type { Duyuru, Gorev, Kanal, Onay, SiparisOzeti, Toplanti } from './tipler.ts';

const BEN = '5';
const A = '11';
const B = '12';
const SIMDI = new Date(2026, 9, 23, 10, 0, 0).getTime();
const ad = (id: string) => ({ [A]: 'Örnek Kişi A', [B]: 'Örnek Kişi B' }[id] ?? 'Ekip arkadaşı');

describe('anahtarlar', () => {
  it('kişi anahtarı izinli karakteri değiştirmez, ötekini kodlar (eski ekranla aynı)', () => {
    expect(kisiAnahtari('12')).toBe('12');
    expect(kisiAnahtari('a.b')).toBe('a_x2e_b');
  });
  it('genel tepki anahtarı emojiye geri döner', () => {
    expect(tepkiAnahtari('👍')).toBe('e1f44d');
    expect(tepkiEmojisi(tepkiAnahtari('🙏'))).toBe('🙏');
    expect(tepkiEmojisi('ezz')).toBe('❓');
  });
  it('kanal adı ve kimliği', () => {
    expect(kanalAdiDuzelt('  Sevkiyat Ekibi! ')).toBe('sevkiyat-ekibi');
    expect(kanalAdiDuzelt('Üretim')).toBe('üretim');
    expect(kanalKimligi('üretim', [])).toBe('uretim');
    expect(kanalKimligi('üretim', ['uretim', 'uretim-2'])).toBe('uretim-3');
    expect(kanalKimligi('!!!', [])).toBe('kanal');
  });
});

describe('onay', () => {
  const onay = (o: Partial<Onay>): Onay => ({ title: 'x', by: A, approvers: [BEN, B], round: 1, votes: {}, createdAt: 0, ...o });
  it('hepsi onaylarsa onaylandı, biri reddederse reddedildi, yoksa bekliyor', () => {
    expect(onayDurumu(onay({})).s).toBe('wait');
    expect(onayDurumu(onay({ votes: { [BEN]: { u: BEN, d: 'ok', ts: 1, r: 1 }, [B]: { u: B, d: 'ok', ts: 1, r: 1 } } })).s).toBe('ok');
    expect(onayDurumu(onay({ votes: { [B]: { u: B, d: 'no', ts: 1, r: 1 } } })).s).toBe('no');
  });
  it('yeniden gönderimde eski turun oyu sayılmaz', () => {
    const o = onay({ round: 2, votes: { [B]: { u: B, d: 'no', ts: 1, r: 1 } } });
    expect(onayDurumu(o).s).toBe('wait');
    expect(bendenOnayBekliyor(o, BEN)).toBe(true);
  });
  it('oy verdiysem benden beklemez; onaylayıcı değilsem beklemez', () => {
    expect(bendenOnayBekliyor(onay({ votes: { [BEN]: { u: BEN, d: 'ok', ts: 1, r: 1 } } }), BEN)).toBe(false);
    expect(bendenOnayBekliyor(onay({ approvers: [B] }), BEN)).toBe(false);
  });
});

describe('duyuru', () => {
  const d: Duyuru = { by: A, ts: 0, text: 'x', cid: 'genel', mid: null, ack: {} };
  it('başkasının okumadığım duyurusu bekler; kendi duyurum ve okuduğum beklemez', () => {
    expect(duyuruBekliyor(d, BEN)).toBe(true);
    expect(duyuruBekliyor({ ...d, ack: { [BEN]: BEN } }, BEN)).toBe(false);
    expect(duyuruBekliyor({ ...d, by: BEN }, BEN)).toBe(false);
  });
});

describe('kanal okunmamış ve bahis', () => {
  const k = (o: Partial<Kanal>): Kanal & { id: string } => ({ id: 'genel', name: 'genel', lastAt: 100, lastBy: A, ...o });
  it('son ileti okunandan yeniyse ve başkasınınsa okunmamış; açık kanal sayılmaz', () => {
    expect(okunmamis(k({}), { genel: 50 }, BEN, null)).toBe(true);
    expect(okunmamis(k({}), { genel: 100 }, BEN, null)).toBe(false);
    expect(okunmamis(k({ lastBy: BEN }), {}, BEN, null)).toBe(false);
    expect(okunmamis(k({}), {}, BEN, 'genel')).toBe(false);
  });
  it('kişi bahsi ya da başkasının @herkes bahsi okumadan sonraysa bahsedildi', () => {
    expect(bahsedildi(k({ mentions: { [BEN]: 90 } }), { genel: 50 }, BEN, null)).toBe(true);
    expect(bahsedildi(k({ mentions: { [BEN]: 40 } }), { genel: 50 }, BEN, null)).toBe(false);
    expect(bahsedildi(k({ everyone: 90, everyoneBy: A }), { genel: 50 }, BEN, null)).toBe(true);
    expect(bahsedildi(k({ everyone: 90, everyoneBy: BEN }), { genel: 50 }, BEN, null)).toBe(false);
  });
});

describe('teslim etiketi', () => {
  it('gecikti, bugün, yarın, n gün kaldı, tarih', () => {
    expect(teslimEtiketi(SIMDI - 2 * D, SIMDI)).toMatchObject({ t: '2 gün gecikti', c: 'late' });
    expect(teslimEtiketi(SIMDI + H, SIMDI)).toMatchObject({ t: 'Bugün', c: 'soon' });
    expect(teslimEtiketi(SIMDI + D, SIMDI)).toMatchObject({ t: 'Yarın', c: 'soon' });
    expect(teslimEtiketi(SIMDI + 5 * D, SIMDI)).toMatchObject({ t: '5 gün kaldı', c: '' });
    expect(teslimEtiketi(SIMDI + 10 * D, SIMDI)?.c).toBe('');
    expect(teslimEtiketi(null, SIMDI)).toBeNull();
  });
});

describe('toplantı ve zamanlı mesaj', () => {
  const mt: Toplanti = { title: 'x', start: SIMDI + 30 * M, dur: 30, attendees: [BEN], by: A, rsvp: {}, createdAt: 0 };
  it('düzenleyenin yanıtı katılıyor; benim yanıtım haritadan', () => {
    expect(benimYanitim(mt, A)).toBe('yes');
    expect(benimYanitim(mt, BEN)).toBeNull();
    expect(benimYanitim({ ...mt, rsvp: { [BEN]: { u: BEN, r: 'maybe', ts: 1 } } }, BEN)).toBe('maybe');
  });
  it('yanıtsız gelecekteki davet bekler; iptal ya da geçmiş beklemez', () => {
    expect(yanitBekleyenDavet(mt, BEN, SIMDI)).toBe(true);
    expect(yanitBekleyenDavet({ ...mt, cancelled: true }, BEN, SIMDI)).toBe(false);
    expect(yanitBekleyenDavet({ ...mt, start: SIMDI - M }, BEN, SIMDI)).toBe(false);
  });
  it('başlama metni', () => {
    expect(baslamaMetni(SIMDI + 30 * M, SIMDI)).toBe('30 dk sonra');
    expect(baslamaMetni(SIMDI - 10 * M, SIMDI)).toBe('Şimdi');
    expect(baslamaMetni(SIMDI - 2 * H, SIMDI)).toBe('Bitti');
  });
  it('sonraki zaman: her gün, hafta içi (hafta sonu atlanır), her hafta', () => {
    const cuma = new Date(2026, 9, 23, 16, 0, 0).getTime();
    expect(sonrakiZaman(cuma, 'daily', cuma)).toBe(cuma + D);
    expect(new Date(sonrakiZaman(cuma, 'weekdays', cuma)).getDay()).toBe(1);
    expect(sonrakiZaman(cuma, 'weekly', cuma)).toBe(cuma + 7 * D);
  });
});

describe('sayaçlar', () => {
  it('eski ekranın counts hesabı', () => {
    const s = sayaclar({
      ben: BEN, acikKanal: null, okunan: { genel: 0 }, simdi: SIMDI,
      kanallar: [{ id: 'genel', name: 'genel', lastAt: 10, lastBy: A }, { id: 'eski', name: 'eski', lastAt: 10, lastBy: BEN }],
      gorevler: [{ title: 'g', to: BEN, by: A, status: 'todo', due: null, createdAt: 0 }, { title: 'g2', to: BEN, by: A, status: 'done', due: null, createdAt: 0 }] satisfies Gorev[],
      onaylar: [{ title: 'o', by: A, approvers: [BEN], round: 1, votes: {}, createdAt: 0 }],
      duyurular: [{ by: A, ts: 0, text: 'x', cid: 'genel', mid: null, ack: {} }],
      toplantilar: [{ title: 't', start: SIMDI + H, attendees: [BEN], by: A, createdAt: 0 }],
      siparisler: [
        { id: '1', no: '1', musteri: 'm', urun: 'u', hedef: 10, birim: 'adet', teslim: SIMDI + D, durum: 'uretimde', uretilen: 1 },
        { id: '2', no: '2', musteri: 'm', urun: 'u', hedef: 10, birim: 'adet', teslim: SIMDI + 30 * D, durum: 'sirada', uretilen: 0 },
        { id: '3', no: '3', musteri: 'm', urun: 'u', hedef: 10, birim: 'adet', teslim: SIMDI - D, durum: 'sevk', uretilen: 10 },
      ] satisfies SiparisOzeti[],
    });
    expect(s).toEqual({ sohbet: 1, isler: 2, siparis: 1, duyuru: 1, toplanti: 1, baslik: 3 });
  });
});

describe('ileti metni', () => {
  const bilinen = new Map([['Örnek Kişi A', A], ['Örnek', B]]);
  it('bahisleri kodlar, uzun ad önce eşleşir', () => {
    expect(bahisleriKodla('@Örnek Kişi A bakar mısın?', bilinen)).toEqual({ out: `<@${A}> bakar mısın?`, ids: [A] });
    expect(bahisleriKodla('e-posta@Örnek', bilinen).ids).toEqual([]);
  });
  it('bahisleri geri açar ve eşlemeyi verir', () => {
    const r = bahisleriAc(`<@${A}> selam`, ad);
    expect(r.metin).toBe('@Örnek Kişi A selam');
    expect(r.eslesme.get('Örnek Kişi A')).toBe(A);
  });
  it('önizleme türüne göre', () => {
    expect(onizleme({ by: A, ts: 0, kind: 'msg', text: `**Merhaba** <@${A}>` }, ad)).toBe('Merhaba @Örnek Kişi A');
    expect(onizleme({ by: A, ts: 0, kind: 'approval' }, ad)).toBe('🖋 Onay isteği');
    expect(onizleme({ by: A, ts: 0, kind: 'msg', att: { name: 'a.pdf', type: 'application/pdf', size: 1 } }, ad)).toBe('📎 a.pdf');
  });
  it('yalnız emoji iletisi', () => {
    expect(yalnizEmoji('👍')).toBe(true);
    expect(yalnizEmoji('👍 tamam')).toBe(false);
  });
  it('parçalar: kod, kişi, herkes, bağlantı, kalın, madde', () => {
    const s = iletiParcalari(`- **Not** \`kod **x**\` <@${A}> @herkes https://ornek.test/a.`);
    expect(s).toHaveLength(1);
    expect(s[0]?.madde).toBe(true);
    expect(s[0]?.parcalar).toEqual([
      { tur: 'metin', metin: 'Not', kalin: true },
      { tur: 'metin', metin: ' ', kalin: false },
      { tur: 'kod', metin: 'kod **x**' },
      { tur: 'metin', metin: ' ', kalin: false },
      { tur: 'kisi', id: A, kalin: false },
      { tur: 'metin', metin: ' ', kalin: false },
      { tur: 'herkes', kalin: false },
      { tur: 'metin', metin: ' ', kalin: false },
      { tur: 'baglanti', adres: 'https://ornek.test/a', kalin: false },
      { tur: 'metin', metin: '.', kalin: false },
    ]);
    expect(iletiParcalari('a\nb')).toHaveLength(2);
    expect(iletiParcalari('<script>x</script>')[0]?.parcalar).toEqual([{ tur: 'metin', metin: '<script>x</script>', kalin: false }]);
  });
});
