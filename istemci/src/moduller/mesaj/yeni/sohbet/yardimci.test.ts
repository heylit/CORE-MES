import { describe, expect, it } from 'vitest';
import { isoTarihSaat as yerelTarihSaat } from '../bicim.ts';
import type { Ileti, Kayit } from '../tipler.ts';
import {
  akisOgeleri, bahisAdaylari, bahisSorgusu, bilinenKisiler, birlesir, iletiIslemleri, kanalOnizlemesi, okuyanlar, sonOkunacak,
  tepkiOzetleri, tepkiYamasi, yanitBilgisi, yazanlar, yaziyorMetni, zamanKisayollari, zamanlamaHatasi,
} from './yardimci.ts';

const DK = 6e4;
const T = new Date(2026, 9, 20, 10, 0).getTime();
const ileti = (x: Partial<Kayit<Ileti>>): Kayit<Ileti> => ({ id: 'm', surum: 1, by: '7', ts: T, kind: 'msg', text: 'selam', ...x });
const ad = (id: string) => ({ 7: 'Deneme Bir', 8: 'Deneme Iki' }[id] ?? 'Ekip arkadaşı');

describe('birlesir', () => {
  it('aynı kişinin 5 dakika içindeki iletisini birleştirir', () => {
    expect(birlesir(ileti({}), ileti({ ts: T + 4 * DK }))).toBe(true);
  });
  it('5 dakikayı aşan, başka kişinin, silinmişin ardından, duyuru ve otomatik uyarıyı ayrı tutar', () => {
    expect(birlesir(ileti({}), ileti({ ts: T + 5 * DK }))).toBe(false);
    expect(birlesir(ileti({}), ileti({ by: '8', ts: T + DK }))).toBe(false);
    expect(birlesir(ileti({ deleted: true }), ileti({ ts: T + DK }))).toBe(false);
    expect(birlesir(ileti({}), ileti({ kind: 'ann', ts: T + DK }))).toBe(false);
    expect(birlesir(ileti({ kind: 'auto' }), ileti({ ts: T + DK }))).toBe(false);
    expect(birlesir(null, ileti({}))).toBe(false);
  });
});

describe('akisOgeleri', () => {
  it('gün ayracı, okunma işaretinden sonraki ilk başkasının iletisinde "Yeni mesajlar" ve birleşme', () => {
    const liste = [
      ileti({ id: 'a', ts: T }),
      ileti({ id: 'b', ts: T + DK, by: '9' }),
      ileti({ id: 'c', ts: T + 2 * DK, by: '8' }),
      ileti({ id: 'd', ts: T + 3 * DK, by: '8' }),
      ileti({ id: 'e', ts: T + 864e5, by: '8' }),
    ];
    const o = akisOgeleri(liste, T + 30_000, '9');
    expect(o.map((x) => (x.tur === 'ileti' ? `${x.ileti.id}${x.devam ? '+' : ''}` : x.tur))).toEqual(['gun', 'a', 'b', 'yeni', 'c', 'd+', 'gun', 'e']);
  });
  it('işaret yoksa çizgi çizilmez', () => {
    expect(akisOgeleri([ileti({ by: '8' })], 0, '9').some((x) => x.tur === 'yeni')).toBe(false);
  });
});

describe('okundu', () => {
  it('son okunacak an ileti, kanal özeti, bahis ve @herkes zamanlarının en büyüğüdür', () => {
    const kanal = { name: 'genel', createdAt: 0, createdBy: '7', lastAt: T + 1, mentions: { 9: T + 5 }, everyone: T + 3 };
    expect(sonOkunacak(kanal, [ileti({ ts: T + 2 })], '9')).toBe(T + 5);
    expect(sonOkunacak({ name: 'x', createdAt: 0, createdBy: '7' }, [], '9')).toBe(0);
  });
  it('okuyanlar gönderen ve beni saymaz, kanal zamanı ileti zamanına ulaşanları sayar', () => {
    const okuma = { 7: { c: { genel: T } }, 8: { c: { genel: T } }, 9: { c: { genel: T } }, 10: { c: { genel: T - 1 } } };
    expect(okuyanlar(ileti({ by: '7' }), 'genel', okuma, '9')).toEqual(['8']);
  });
  it('bilinen kişiler: çevrimiçi, yazar, görev, onay ve duyuru tarafları; otomatik gönderen hariç', () => {
    const k = bilinenKisiler({
      cevrimici: ['1'],
      iletiler: [ileti({ by: '2' }), ileti({ by: '__bot' })],
      gorevler: [{ title: 'g', to: '3', by: '4', status: 'todo', due: null, createdAt: 0 }],
      onaylar: [{ title: 'o', by: '5', approvers: ['6'], round: 1, votes: {}, createdAt: 0 }],
      duyurular: [{ by: '7', ts: 0, text: 'd', cid: 'c', mid: null, ack: { 8: '8' } }],
    });
    expect(k.sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });
});

describe('tepkiler', () => {
  it('kurumsal tepkiyi etiketiyle, genel emojiyi anahtarından çözer; boş tepkiyi atlar', () => {
    const m = ileti({ rx: { c_tamam: { 9: '9', 8: '8' }, e1f44d: { 7: '7' }, c_bekliyor: { 9: '' } } });
    const o = tepkiOzetleri(m, '9');
    expect(o.map((t) => [t.emoji, t.etiket, t.kisiler.length, t.benim, t.kurumsal])).toEqual([
      ['✅', 'Tamam', 2, true, true],
      ['👍', '', 1, false, false],
    ]);
  });
  it('açık tepkiyi kapatır, kapalıyı açar; yalnız kendi anahtarına yazar', () => {
    expect(tepkiYamasi(ileti({ rx: { c_tamam: { 9: '9' } } }), 'c_tamam', '9')).toEqual({ rx: { c_tamam: { 9: '' } } });
    expect(tepkiYamasi(ileti({}), 'c_tamam', '9')).toEqual({ rx: { c_tamam: { 9: '9' } } });
  });
});

describe('iletiIslemleri', () => {
  it('kendi iletimde düzenle ve sil var (izinli)', () => {
    expect(iletiIslemleri(ileti({ by: '9' }), '9', true)).toEqual(['yanitla', 'goreve', 'onaya', 'kopyala', 'bilgi', 'duzenle', 'sil']);
  });
  it('başkasının iletisinde düzenle, sil ve bilgi yok (reddedilen)', () => {
    expect(iletiIslemleri(ileti({ by: '8' }), '9', true)).toEqual(['yanitla', 'goreve', 'onaya', 'kopyala']);
  });
  it('yazma yetkisi yoksa yalnız kopyala ve bilgi kalır (reddedilen)', () => {
    expect(iletiIslemleri(ileti({ by: '9' }), '9', false)).toEqual(['kopyala', 'bilgi']);
  });
  it('kart iletisi göreve ve onaya çevrilmez; duyuru düzenlenir', () => {
    expect(iletiIslemleri(ileti({ by: '9', kind: 'task', text: '' }), '9', true)).toEqual(['yanitla', 'bilgi', 'sil']);
    expect(iletiIslemleri(ileti({ by: '9', kind: 'ann' }), '9', true)).toContain('duzenle');
  });
});

describe('metinler', () => {
  it('yanıt alıntısı metinsiz kartı türüyle anar ve 200 karakterle sınırlar', () => {
    expect(yanitBilgisi(ileti({ id: 'x', kind: 'approval', text: '' }))).toEqual({ id: 'x', by: '7', text: 'Onay isteği' });
    expect(yanitBilgisi(ileti({ text: 'a'.repeat(300) })).text).toHaveLength(200);
  });
  it('kanal önizlemesi son yazanı kısa adla, beni "Sen", otomatik uyarıyı "Uyarı" diye yazar', () => {
    const k = { name: 'genel', createdAt: 0, createdBy: '7', lastText: 'merhaba', topic: 'konu' };
    expect(kanalOnizlemesi({ ...k, lastBy: '7' }, '9', ad)).toBe('Deneme: merhaba');
    expect(kanalOnizlemesi({ ...k, lastBy: '9' }, '9', ad)).toBe('Sen: merhaba');
    expect(kanalOnizlemesi({ ...k, lastBy: '__bot' }, '9', ad)).toBe('Uyarı: merhaba');
    expect(kanalOnizlemesi({ name: 'x', createdAt: 0, createdBy: '7', topic: 'konu' }, '9', ad)).toBe('konu');
  });
  it('yazıyor: bu kanalda, ben hariç, son 10 saniye', () => {
    const esler = [
      { kisi: '7', durum: { typing: 'genel' }, guncellendi: T },
      { kisi: '8', durum: { typing: 'baska' }, guncellendi: T },
      { kisi: '9', durum: { typing: 'genel' }, guncellendi: T },
      { kisi: '10', durum: { typing: 'genel' }, guncellendi: T - 11_000 },
    ];
    expect(yazanlar(esler, 'genel', '9', T + 1000)).toEqual(['7']);
    expect(yaziyorMetni(['7'], ad)).toBe('Deneme yazıyor…');
    expect(yaziyorMetni(['7', '8'], ad)).toBe('2 kişi yazıyor…');
    expect(yaziyorMetni([], ad)).toBe('');
  });
});

describe('bahis tamamlama', () => {
  it('imlecin solundaki @ sözcüğünü bulur', () => {
    expect(bahisSorgusu('merhaba @den', 12)).toEqual({ sorgu: 'den', bas: 8 });
    expect(bahisSorgusu('e-posta@ornek', 13)).toBeNull();
  });
  it('adaylar Türkçe küçük harfle süzülür, ben hariç, en çok 8; @herkes sonda', () => {
    const kisiler = [{ id: '7', ad: 'İlker Deneme' }, { id: '9', ad: 'İlknur Deneme' }, { id: '8', ad: 'Başka' }];
    expect(bahisAdaylari(kisiler, 'il', '9', true).map((k) => k.id)).toEqual(['7']);
    expect(bahisAdaylari(kisiler, 'he', '9', true).map((k) => k.id)).toEqual(['__all']);
    expect(bahisAdaylari(kisiler, '', '9', false)).toHaveLength(2);
  });
});

describe('zamanlama', () => {
  it('kısayollar: 1 saat sonra, yarın 08:00, gelecek pazartesi 08:30, cuma 16:00', () => {
    const cuma = new Date(2026, 9, 23, 10, 0).getTime();
    const k = zamanKisayollari(cuma).map((x) => yerelTarihSaat(x.ts));
    expect(k).toEqual(['2026-10-23T11:00', '2026-10-24T08:00', '2026-10-26T08:30', '2026-10-30T16:00']);
  });
  it('geçersiz ya da tekrarsız geçmiş zaman reddedilir; tekrarlıda geçmiş kabul', () => {
    expect(zamanlamaHatasi('', 'none', T)).toBe('Geçerli bir tarih seç.');
    expect(zamanlamaHatasi(yerelTarihSaat(T - 10 * DK), 'none', T)).toBe('Geçmiş bir zaman seçtin.');
    expect(zamanlamaHatasi(yerelTarihSaat(T - 10 * DK), 'daily', T)).toBeNull();
    expect(zamanlamaHatasi(yerelTarihSaat(T + DK), 'none', T)).toBeNull();
  });
});
