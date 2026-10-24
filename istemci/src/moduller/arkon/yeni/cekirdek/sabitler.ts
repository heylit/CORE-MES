import type { MakineDurumu } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import type { Perm, PermMatrix, Policy, Reason, Role, ScrapReason } from './tipler.ts';

// Arkon'un sabit listeleri (arkon/web/src/app temel.ts, ortak-ayarlar.ts). Değerler kayıtlara yazılan kodlardır; değişmez.
// Renk adı yerine ortak arayüzün durum adı tutulur: ekran rengi tasarım değişkeninden seçer.

export type IsDurumu = 'queued' | 'setup' | 'running' | 'paused' | 'stopped' | 'done';
export const IS_DURUMLARI: Readonly<Record<IsDurumu, { etiket: string; durum: MakineDurumu }>> = {
  queued: { etiket: 'Sırada', durum: 'sirada' },
  setup: { etiket: 'Hazırlık', durum: 'ayar' },
  running: { etiket: 'Çalışıyor', durum: 'calisiyor' },
  paused: { etiket: 'Duraklatıldı', durum: 'durakli' },
  stopped: { etiket: 'Durduruldu', durum: 'durdu' },
  done: { etiket: 'Tamamlandı', durum: 'bitti' },
};

export const ROLLER: readonly (readonly [Role, string])[] = [
  ['admin', 'Yönetici'], ['plan', 'Üretim planlama'], ['prep', 'Proses / hazırlık'], ['quality', 'Kalite kontrol'], ['lead', 'Vardiya amiri'],
  ['maint', 'Bakım'], ['operator', 'Operatör'],
];
export const ROL_ADLARI: Readonly<Record<Role, string>> = Object.fromEntries(ROLLER) as Record<Role, string>;

export const YETKILER: readonly { g: string; k: Perm; l: string }[] = [
  { g: 'Ekranlar', k: 'page.op', l: 'Operatör ekranı' }, { g: 'Ekranlar', k: 'page.board', l: 'Fabrika panosu' }, { g: 'Ekranlar', k: 'page.plan', l: 'Plan Kuyruğu' },
  { g: 'Ekranlar', k: 'page.prep', l: 'Üretim Terminali Hazırlık' }, { g: 'Ekranlar', k: 'page.quality', l: 'Kalite istasyonu' }, { g: 'Ekranlar', k: 'page.maint', l: 'Bakım' },
  { g: 'Ekranlar', k: 'page.report', l: 'Raporlar' }, { g: 'Ekranlar', k: 'page.draw', l: 'Çizim stüdyosu' },
  { g: 'Üretim', k: 'prod.run', l: 'Üretimi başlat / durdur, parça say' }, { g: 'Üretim', k: 'prod.fix', l: 'Sayım düzeltme (−1, sayı gir)' },
  { g: 'Üretim', k: 'prod.station', l: 'Tabletin istasyonunu değiştir' }, { g: 'Üretim', k: 'prod.ack', l: 'Çağrıları üstlen' },
  { g: 'Üretim', k: 'logi.req', l: 'Malzeme iste, teslim et / al' }, { g: 'Üretim', k: 'logi.handle', l: 'Malzeme taleplerini karşıla (depo)' },
  { g: 'Planlama', k: 'plan.edit', l: 'İş emri sırası, istasyon ataması, içe aktarma' }, { g: 'Planlama', k: 'down.edit', l: 'Planlı duruş takvimi' },
  { g: 'Hazırlık', k: 'pkg.edit', l: 'Paket oluştur / düzenle' }, { g: 'Hazırlık', k: 'pkg.publish', l: 'Paketi istasyona yayınla / geri çek' },
  { g: 'Hazırlık', k: 'pkg.del', l: 'Paket sil' }, { g: 'Hazırlık', k: 'pkg.approve', l: 'Paketi onayla (yayın onayı)' },
  { g: 'Kalite', k: 'q.meas', l: 'Kalite ölçümü gir (elle / CMM)' }, { g: 'Kalite', k: 'q.decide', l: 'Numune onay / red kararı' },
  { g: 'Kalite', k: 'q.report', l: 'SPC ve ölçüm raporu' }, { g: 'Kalite', k: 'gauge.edit', l: 'Ölçü aletleri ve kalibrasyon' },
  { g: 'Bakım', k: 'maint.work', l: 'Arıza kaydı aç / kapat' }, { g: 'Bakım', k: 'maint.plan', l: 'Periyodik bakım planı' },
  { g: 'Yönetim', k: 'adm.users', l: 'Kullanıcılar ve PIN' }, { g: 'Yönetim', k: 'adm.plant', l: 'Tesis yapısı (iş merkezi, istasyon, makine)' },
  { g: 'Yönetim', k: 'adm.shifts', l: 'Vardiyalar ve molalar' }, { g: 'Yönetim', k: 'adm.backup', l: 'Yedekleme ve geri yükleme' },
  { g: 'Yönetim', k: 'adm.demo', l: 'Tanıtım verileri' }, { g: 'Yönetim', k: 'adm.reasons', l: 'Duruş / hurda nedenleri, çalışma kuralları' },
  { g: 'Yönetim', k: 'adm.audit', l: 'Değişiklik günlüğü' },
];
export const YETKI_ADLARI: Readonly<Partial<Record<Perm, string>>> = Object.fromEntries(YETKILER.map((p) => [p.k, p.l]));

export const VARSAYILAN_YETKILER: PermMatrix = {
  plan: ['page.op', 'page.board', 'page.plan', 'page.prep', 'page.quality', 'page.report', 'page.draw', 'pkg.edit', 'pkg.publish', 'prod.station', 'q.report', 'adm.shifts', 'plan.edit', 'down.edit', 'logi.handle'],
  prep: ['page.op', 'page.board', 'page.plan', 'page.prep', 'page.quality', 'page.report', 'page.draw', 'pkg.edit', 'pkg.publish', 'pkg.del', 'prod.station', 'q.report'],
  quality: ['page.op', 'page.board', 'page.quality', 'page.report', 'q.meas', 'q.decide', 'q.report', 'prod.ack', 'pkg.approve', 'gauge.edit'],
  lead: ['page.op', 'page.board', 'page.plan', 'page.quality', 'page.maint', 'page.report', 'prod.run', 'prod.fix', 'prod.station', 'prod.ack', 'q.report', 'adm.shifts', 'down.edit', 'logi.req', 'maint.work'],
  maint: ['page.op', 'page.board', 'page.maint', 'page.report', 'prod.ack', 'prod.station', 'maint.work', 'maint.plan'],
  operator: ['page.op', 'prod.run', 'logi.req'],
};
// v24'te kaydedilmiş matriste olmayan (sonradan eklenen) yetkiler için varsayılan kullanılır.
export const V24_YETKILERI: readonly Perm[] = [
  'page.op', 'page.prep', 'page.quality', 'page.draw', 'prod.run', 'prod.fix', 'prod.station', 'prod.ack', 'pkg.edit', 'pkg.publish', 'pkg.del',
  'q.meas', 'q.decide', 'q.report', 'adm.users', 'adm.plant', 'adm.shifts', 'adm.backup', 'adm.demo',
];

export const VARSAYILAN_KURALLAR: Policy = { shiftLogout: true, idleLock: 30, callEsc: 5, approval: false, autoCall: true, scrapAsk: true, fpRestart: true };

// Sunucu kipinde neden listesinin sahibi TMI'dir (neden-kaynagi.ts): yerleşik listeler yalnız yerel kipte açılır, yeni ekran hep sunucu kipindedir.
export const YERLESIK_DURUS_NEDENLERI: readonly Reason[] = [
  { code: 'D-01', l: 'Malzeme bekleniyor', i: 'truck', cat: 'u', team: 'malzeme', after: 5 }, { code: 'D-02', l: 'Mekanik arıza', i: 'wrench', cat: 'u', team: 'bakim', after: 0 },
  { code: 'D-03', l: 'Elektrik / kontrol arızası', i: 'bolt', cat: 'u', team: 'bakim', after: 0 }, { code: 'D-04', l: 'Takım / kalıp değişimi', i: 'tool', cat: 'u' },
  { code: 'D-05', l: 'Kalite kontrol bekleniyor', i: 'search', cat: 'u', team: 'kalite', after: 10 }, { code: 'D-06', l: 'Program / CNC hatası', i: 'cpu', cat: 'u', team: 'amir', after: 15 },
  { code: 'D-11', l: 'Operatör yok', i: 'user', cat: 'u', team: 'amir', after: 10 },
  { code: 'D-07', l: 'Planlı bakım', i: 'gauge', cat: 'p' }, { code: 'D-08', l: 'Mola / yemek', i: 'coffee', cat: 'p' },
  { code: 'D-09', l: 'Toplantı / eğitim', i: 'user', cat: 'p' }, { code: 'D-10', l: 'İş emri yok (plan yok)', i: 'list', cat: 'p' }, { code: 'D-12', l: 'Deneme / numune üretimi', i: 'flag', cat: 'p' },
];
export const YERLESIK_HURDA_NEDENLERI: readonly ScrapReason[] = [
  { code: 'H-01', l: 'Ölçü dışı' }, { code: 'H-02', l: 'Yüzey hatası / çizik' }, { code: 'H-03', l: 'Malzeme hatası' }, { code: 'H-04', l: 'Hazırlık parçası' },
  { code: 'H-05', l: 'Takım kırılması' }, { code: 'H-06', l: 'Çapak / şekil bozukluğu' }, { code: 'H-09', l: 'Diğer' },
];

// Neden rengi (temel.ts reasonColor): planlı yeşil, bakım ekibi kırmızı, öteki plansızlar sarı.
export const nedenDurumu = (r: Pick<Reason, 'cat' | 'team'>): MakineDurumu => (r.cat === 'p' ? 'bitti' : r.team === 'bakim' ? 'durdu' : 'durakli');

export type CagriEkibi = 'bakim' | 'kalite' | 'malzeme' | 'amir' | 'ayarci';
export const CAGRI_EKIPLERI: readonly { k: CagriEkibi; l: string; d: string; simge: SimgeAdi; eta: number }[] = [
  { k: 'bakim', l: 'Bakım', d: 'Mekanik / elektrik destek', simge: 'wrench', eta: 4 },
  { k: 'kalite', l: 'Kalite', d: 'Ölçüm onayı, ilk parça', simge: 'search', eta: 6 },
  { k: 'malzeme', l: 'Malzeme', d: 'Ham madde, kasa, forklift', simge: 'truck', eta: 8 },
  { k: 'amir', l: 'Vardiya amiri', d: 'Karar ve onay', simge: 'user', eta: 3 },
  { k: 'ayarci', l: 'Ayarcı', d: 'Tezgâh ayarı, takım ve program', simge: 'gear', eta: 5 },
];
