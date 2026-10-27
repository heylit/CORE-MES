import { describe, expect, it } from 'vitest';
import { D, H, M } from '../bicim.ts';
import { BEN, KISI_A, KISI_B } from '../ornek-veri.ts';
import type { Duyuru, Gorev, Kanal, Kayit, Kural, Onay, SiparisOzeti, Toplanti, Zamanli } from '../tipler.ts';
import {
  KURAL_TURLERI, bilinenKisiler, ekranBildirimleri, gonderimSonrasi, hatirlatmalar, kuralParametresi, parametreleriAyikla, tetikAnahtari,
  uyarilariHesapla, vaktiGelenler, type UyariGirdisi,
} from './kurallar.ts';

// Uydurma veri; saat sabittir (yerel öğle).
const SIMDI = new Date(2026, 9, 23, 12, 0, 0).getTime();
const k = <T,>(id: string, v: T): Kayit<T> => ({ ...v, id, surum: 1 });
const ad = (id: string) => ({ [BEN]: 'Deneme Yönetici', [KISI_A]: 'Örnek Kişi A', [KISI_B]: 'Örnek Kişi B' }[id] ?? 'Ekip arkadaşı');
const kanal = k<Kanal>('genel', { name: 'genel', createdAt: 0, createdBy: KISI_A });
const kural = (type: Kural['type'], ek: Partial<Kural> = {}) => k<Kural>(`r-${type}`, { type, cid: 'genel', on: true, by: KISI_A, createdAt: SIMDI - 2 * D, ...ek });

const girdi = (g: Partial<UyariGirdisi>): UyariGirdisi => ({
  kurallar: [], kanallar: [kanal], siparisler: [], gorevler: [], onaylar: [], duyurular: [], bilinenKisiler: [BEN, KISI_A, KISI_B], ad, simdi: SIMDI, ...g,
});

const siparis = (ek: Partial<SiparisOzeti>): SiparisOzeti => ({
  id: 's1', no: 'S-1', musteri: 'Örnek Müşteri', urun: 'Örnek ürün', hedef: 100, birim: 'adet', teslim: SIMDI + D, durum: 'uretimde', uretilen: 50, ...ek,
});

describe('otomatik uyarılar', () => {
  it('teslim riski: eşiğin altında ve teslime az kala uyarır; sevk edilen ve hedefsiz sipariş uyarmaz', () => {
    const r = kural('order_risk', { params: { days: 2, pct: 80 } });
    const out = uyarilariHesapla(girdi({ kurallar: [r], siparisler: [siparis({}), siparis({ id: 's2', durum: 'sevk' }), siparis({ id: 's3', hedef: null })] }));
    expect(out).toHaveLength(1);
    expect(out[0]?.anahtar).toBe('r-order_risk_s1');
    expect(out[0]?.metin).toContain('teslime 1 gün kaldı ama üretim %50');
    expect(uyarilariHesapla(girdi({ kurallar: [r], siparisler: [siparis({ uretilen: 90 })] }))).toHaveLength(0);
  });

  it('teslim riski: üretilen bilinmiyorsa sıfır sayılmaz, uyarı üretilmez', () => {
    expect(uyarilariHesapla(girdi({ kurallar: [kural('order_risk')], siparisler: [siparis({ uretilen: null })] }))).toEqual([]);
  });

  it('geciken görev sorumluyu etiketler; bugün teslimli ve kural açılmadan bir gün önceden eski görev uyarmaz', () => {
    const r = kural('task_late');
    const gec = k<Gorev>('t1', { title: 'Örnek görev', to: KISI_B, by: KISI_A, status: 'todo', due: SIMDI - D, createdAt: 0 });
    const bugun = k<Gorev>('t2', { title: 'Bugün', to: KISI_B, by: KISI_A, status: 'todo', due: SIMDI - H, createdAt: 0 });
    const eski = k<Gorev>('t3', { title: 'Eski', to: KISI_B, by: KISI_A, status: 'todo', due: SIMDI - 5 * D, createdAt: 0 });
    const out = uyarilariHesapla(girdi({ kurallar: [r], gorevler: [gec, bugun, eski] }));
    expect(out.map((u) => u.anahtar)).toEqual([`r-task_late_t1_${new Date(SIMDI - D).toISOString().slice(0, 10)}`]);
    expect(out[0]?.metin).toBe(`⏰ <@${KISI_B}> “Örnek görev” görevinin süresi geçti (veren: Örnek Kişi A).`);
    expect(out[0]?.bahisler).toEqual([KISI_B]);
  });

  it('bekleyen onay saat dolunca yalnız oy vermeyenleri etiketler; yeniden sunulunca süre baştan başlar', () => {
    const r = kural('appr_wait', { params: { hours: 24 } });
    const onay = k<Onay>('a1', {
      title: 'Örnek onay', by: KISI_A, approvers: [BEN, KISI_B], round: 1, createdAt: SIMDI - 25 * H,
      votes: { [BEN]: { u: BEN, d: 'ok', ts: SIMDI - 2 * H, r: 1 } },
    });
    const out = uyarilariHesapla(girdi({ kurallar: [r], onaylar: [onay] }));
    expect(out[0]?.bahisler).toEqual([KISI_B]);
    expect(out[0]?.anahtar).toBe('r-appr_wait_a1_1');
    const yeniden = { ...onay, last: { by: KISI_A, ts: SIMDI - H, t: 'yeniden onaya sundu' } };
    expect(uyarilariHesapla(girdi({ kurallar: [r], onaylar: [yeniden] }))).toHaveLength(0);
  });

  it('okunmayan duyuru okumayanları etiketler, duyuruya yanıt olarak duyurunun kanalına gider; bot adı aranmaz', () => {
    const r = kural('ann_unread', { cid: 'uretim', params: { hours: 12 } });
    const d = k<Duyuru>('d1', { by: KISI_A, ts: SIMDI - 13 * H, text: `**Önemli** <@${BEN}>`, cid: 'genel', mid: 'm1', ack: { [KISI_B]: KISI_B } });
    const out = uyarilariHesapla(girdi({
      kurallar: [r], duyurular: [d], kanallar: [kanal, k<Kanal>('uretim', { name: 'üretim', createdAt: 0, createdBy: KISI_A })], bilinenKisiler: [BEN, KISI_A, KISI_B, '__bot'],
    }));
    expect(out[0]?.bahisler).toEqual([BEN]);
    expect(out[0]?.kanal).toBe('genel');
    expect(out[0]?.yanit).toEqual({ id: 'm1', by: KISI_A, text: d.text });
    expect(out[0]?.metin).toContain('“Önemli @Deneme Yönetici”');
  });

  it('kapalı kural, kanalı silinmiş kural ve sipariş özetinin desteklemediği türler uyarı üretmez', () => {
    const gec = k<Gorev>('t1', { title: 'G', to: KISI_B, by: KISI_A, status: 'todo', due: SIMDI - D, createdAt: 0 });
    const g = girdi({
      gorevler: [gec],
      siparisler: [siparis({ durum: 'hazir' })],
      kurallar: [kural('task_late', { on: false }), kural('task_late', { cid: 'yok' }), kural('order_ready'), kural('order_new'), kural('prod_word')],
    });
    expect(uyarilariHesapla(g)).toEqual([]);
    expect(Object.entries(KURAL_TURLERI).filter(([, t]) => !t.calisir).map(([x]) => x)).toEqual(['order_ready', 'order_new', 'prod_word']);
  });

  it('parametre: kayıtta yoksa varsayılan; formda sayı boş ya da sıfırsa varsayılan, metin olduğu gibi', () => {
    expect(kuralParametresi({ type: 'appr_wait' }, 'hours')).toBe(24);
    expect(kuralParametresi({ type: 'appr_wait', params: { hours: 6 } }, 'hours')).toBe(6);
    expect(parametreleriAyikla('order_risk', { days: '', pct: '0' })).toEqual({ days: 2, pct: 80 });
    expect(parametreleriAyikla('order_risk', { days: '3', pct: '50' })).toEqual({ days: 3, pct: 50 });
    expect(parametreleriAyikla('prod_word', { words: 'arıza' })).toEqual({ words: 'arıza' });
  });

  it('tetik anahtarı belge yoluna uyar ve 190 karakterle sınırlıdır', () => {
    expect(tetikAnahtari('r1_a/b c')).toBe('r1_a_b_c');
    expect(tetikAnahtari('x'.repeat(300))).toHaveLength(190);
  });

  it('bilinen kişiler veride geçen herkes ve bendir', () => {
    const t = k<Gorev>('t1', { title: 'G', to: KISI_B, by: KISI_A, status: 'todo', due: null, createdAt: 0 });
    expect(bilinenKisiler({ gorevler: [t], onaylar: [], duyurular: [] }, BEN).sort()).toEqual([BEN, KISI_A, KISI_B].sort());
  });

  it('bilinen kişilere çevrimiçiler ve açılan kanalların yazarları da girer (838/3 a)', () => {
    expect(bilinenKisiler({ gorevler: [], onaylar: [], duyurular: [] }, BEN, ['u_cevrimici', 'u_yazar', BEN]).sort()).toEqual([BEN, 'u_cevrimici', 'u_yazar'].sort());
  });
});

describe('zamanlanmış iletiler', () => {
  const z = (ek: Partial<Zamanli>) => k<Zamanli>('z1', { cid: 'genel', by: BEN, text: 'Merhaba', sendAt: SIMDI - M, status: 'bekliyor', createdAt: 0, ...ek });

  it('vakti gelen ve bekleyen iletiler seçilir', () => {
    expect(vaktiGelenler([z({}), z({ sendAt: SIMDI + M }), z({ status: 'gonderildi' })], SIMDI)).toHaveLength(1);
  });

  it('tekrarsız ileti gönderildi olur; tekrarlı ileti sonraki zamana alınır', () => {
    expect(gonderimSonrasi(z({}), SIMDI)).toEqual({ status: 'gonderildi', sentAt: SIMDI });
    expect(gonderimSonrasi(z({ repeat: 'none' }), SIMDI)).toEqual({ status: 'gonderildi', sentAt: SIMDI });
    expect(gonderimSonrasi(z({ repeat: 'daily' }), SIMDI)).toEqual({ sendAt: SIMDI - M + D, lastSent: SIMDI });
    // Cuma öğlesi: hafta içi tekrar pazartesiye atlar.
    const cuma = new Date(2026, 9, 23, 8, 0, 0).getTime();
    expect(new Date(gonderimSonrasi(z({ sendAt: cuma, repeat: 'weekdays' }), SIMDI).sendAt!).getDay()).toBe(1);
  });
});

describe('hatırlatmalar ve ekran bildirimleri', () => {
  it('toplantı hatırlatması süre içinde, iptal ve katılmıyorum yanıtında yok; görev hatırlatması 12 saat içinde', () => {
    const mt = (id: string, ek: Partial<Toplanti>) => k<Toplanti>(id, { title: 'Toplantı', start: SIMDI + 5 * M, remind: 10, by: KISI_A, attendees: [BEN], createdAt: 0, ...ek });
    const t = (id: string, ek: Partial<Gorev>) => k<Gorev>(id, { title: 'Görev', to: BEN, by: KISI_A, status: 'todo', due: null, createdAt: 0, ...ek } as Gorev);
    const out = hatirlatmalar({
      ben: BEN, simdi: SIMDI,
      toplantilar: [mt('m1', {}), mt('m2', { cancelled: true }), mt('m3', { rsvp: { [BEN]: { u: BEN, r: 'no', ts: 0 } } }), mt('m4', { start: SIMDI + H })],
      gorevler: [t('t1', { remind: SIMDI - H }), t('t2', { remind: SIMDI - 13 * H }), t('t3', { remind: SIMDI - H, status: 'done' })],
    }, () => '5 dk sonra');
    expect(out.map((h) => h.anahtar)).toEqual([`rm:m1:${SIMDI + 5 * M}`, `rt:t1:${SIMDI - H}`]);
  });

  it('açılıştan sonra gelen bahis, onay isteği, görev ve duyuru bildirilir; açık kanaldaki bahis bildirilmez', () => {
    const acilis = SIMDI - H;
    const g = {
      kanallar: [k<Kanal>('genel', { name: 'genel', createdAt: 0, createdBy: KISI_A, mentions: { [BEN]: SIMDI } }), k<Kanal>('eski', { name: 'eski', createdAt: 0, createdBy: KISI_A, mentions: { [BEN]: acilis - 1 } })],
      onaylar: [k<Onay>('a1', { title: 'O', by: KISI_A, approvers: [BEN], createdAt: SIMDI })],
      gorevler: [k<Gorev>('t1', { title: 'G', to: BEN, by: KISI_A, status: 'todo', due: null, createdAt: SIMDI })],
      duyurular: [k<Duyuru>('d1', { by: KISI_A, ts: SIMDI, text: 'D', cid: 'genel', mid: null })],
      okunan: {}, ben: BEN, acikKanal: null, acilis, ad,
    };
    expect(ekranBildirimleri(g).map((b) => b.metin)).toEqual([
      '#genel kanalında senden bahsedildi.', 'Örnek onayını istiyor: O', 'Örnek sana görev verdi: G', 'Örnek bir duyuru yaptı.',
    ]);
    expect(ekranBildirimleri({ ...g, acikKanal: 'genel' }).some((b) => b.metin.startsWith('#genel'))).toBe(false);
  });
});
