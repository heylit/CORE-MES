// Testlerin uydurma verisi: kişi adları ve metinler örnektir, gerçek kayıt değildir. Kişi no'ları metin olarak.
export const BEN = '5';
export const KISI_A = '11';
export const KISI_B = '12';

export const ORNEK_KISILER = [
  { id: 5, ad: 'Deneme Yönetici' },
  { id: 11, ad: 'Örnek Kişi A' },
  { id: 12, ad: 'Örnek Kişi B' },
];

const T = Date.UTC(2026, 9, 23, 9, 0, 0);
export const ORNEK_ZAMAN = T;

export function ornekBelgeler(): Record<string, Record<string, unknown>> {
  return {
    'channels/genel': { name: 'genel', emoji: '💬', topic: 'Herkes için genel sohbet', createdAt: T - 864e5 * 10, createdBy: KISI_A, lastAt: T - 6e4, lastBy: KISI_A, lastText: 'Günaydın', mentions: { [BEN]: T - 6e4 } },
    'channels/uretim': { name: 'üretim', emoji: '🏭', topic: 'Vardiya takibi', createdAt: T - 864e5 * 9, createdBy: KISI_B, lastAt: T - 36e5, lastBy: BEN },
    'channels/genel/msgs/m1': { by: KISI_A, ts: T - 6e4, kind: 'msg', text: `<@${BEN}> Günaydın`, mentions: [BEN], rx: {} },
    'tasks/t1': { title: 'Örnek görev', to: BEN, by: KISI_A, status: 'todo', due: T, createdAt: T - 36e5 },
    'tasks/t2': { title: 'Verdiğim görev', to: KISI_B, by: BEN, status: 'doing', due: null, createdAt: T - 72e5 },
    'approvals/a1': { title: 'Örnek onay', by: KISI_A, approvers: [BEN, KISI_B], round: 1, votes: {}, createdAt: T - 36e5 },
    'duyurular/d1': { by: KISI_A, ts: T - 36e5, text: 'Örnek duyuru', cid: 'genel', mid: null, ack: {} },
    'toplantilar/mt1': { title: 'Örnek toplantı', start: T + 864e5, dur: 30, attendees: [BEN, KISI_A], by: KISI_A, rsvp: {}, createdAt: T - 36e5 },
    'kurallar/r1': { type: 'task_late', cid: 'genel', params: {}, on: true, by: KISI_A, createdAt: T - 864e5 },
  };
}
