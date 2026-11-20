import type { Islem } from '#paylasilan/islemler.ts';
import { zamanTanisiParcalari, type Derleme, type OkunanPlan, type ZamanTanisi } from '../motor/kurallar.ts';
import { sureYaz, type KokpitEmri, type KokpitModeli } from './kurallar.ts';

// Engeller paneli (3457-1 A): son planda yerleşmeyen adımlar, ufka taşan işler, plana hiç girmeyen siparişler ve motorun uyarıları; nedene
// göre gruplu. Her satır üç şey söyler: ne oldu, neden, ne yapmalı; düzeltme yeri varsa düğme olur. Zincirleme düşen adım ayrı satır
// olmaz, kök adımın satırında "sonraki N adım bunu bekliyor" diye sayılır. Saf: yalnız plan kaydını ve modeli okur.
export type EngelTuru = ZamanTanisi['alt'] | 'aday' | 'ufuk' | 'siparis' | 'termin' | 'uyari';
export const ENGEL_SIRASI: readonly EngelTuru[] = ['sure', 'dolu', 'vardiya', 'kisi', 'ayarci', 'hazirlik', 'malzeme', 'aday', 'ufuk', 'siparis', 'bilinmiyor', 'termin', 'uyari'];
export const ENGEL_ADI: Readonly<Record<EngelTuru, string>> = {
  sure: 'Süre sığmıyor', dolu: 'Tezgâh dolu', vardiya: 'Vardiya yok', kisi: 'Yetkin kişi yok', ayarci: 'Ayarcı yok', hazirlik: 'Hazırlık sığmıyor',
  malzeme: 'Malzeme yok', aday: 'Uygun tezgâh yok', ufuk: 'Planlama süresine sığmıyor', siparis: 'Planda rotası yok', bilinmiyor: 'Nedeni ölçülemedi',
  termin: 'Termin planlama süresinin dışında', uyari: 'Uyarı',
};

// Düzeltme yeri: başka sayfa (yol, açma yetkisi) ya da Kokpit'in kendi Duruş ve mesai paneli.
export type DuzeltmeYeri =
  | { tur: 'adres'; baslik: string; sayfa: string; yol: string; islem: Islem }
  | { tur: 'kapasite'; baslik: string };
const SURELER: DuzeltmeYeri = { tur: 'adres', baslik: 'Süreleri aç', sayfa: 'Süreler', yol: '/recete-rota/sureler', islem: 'sayfa.recete-rota' };
const VARDIYA: DuzeltmeYeri = { tur: 'adres', baslik: 'Vardiya takvimini aç', sayfa: 'Vardiyalar', yol: '/vardiya', islem: 'sayfa.vardiya' };
const PERSONEL: DuzeltmeYeri = { tur: 'adres', baslik: 'Vardiya personelini aç', sayfa: 'Vardiya başına personel', yol: '/vardiya/personel', islem: 'sayfa.vardiya' };
const KAYNAKLAR: DuzeltmeYeri = { tur: 'adres', baslik: 'Kaynakları aç', sayfa: 'Kaynaklar', yol: '/recete-rota/res', islem: 'sayfa.recete-rota' };
const STOK: DuzeltmeYeri = { tur: 'adres', baslik: 'Stoku aç', sayfa: 'Stok', yol: '/recete-rota/stock', islem: 'sayfa.recete-rota' };
const ROTALAR: DuzeltmeYeri = { tur: 'adres', baslik: 'Ürün ve rotaları aç', sayfa: 'Ürün ve rotalar', yol: '/recete-rota/schema', islem: 'sayfa.recete-rota' };
const PLANLANABILIRLIK: DuzeltmeYeri = { tur: 'adres', baslik: 'Planlanabilirliği aç', sayfa: 'Planlanabilirlik', yol: '/recete-rota/planlanabilirlik', islem: 'sayfa.recete-rota' };
const MOTOR: DuzeltmeYeri = { tur: 'adres', baslik: 'Motor ayarlarını aç', sayfa: 'Motor ayarları', yol: '/plan/motor-ayarlari', islem: 'plan.planlama-oku' };
const MESAI: DuzeltmeYeri = { tur: 'kapasite', baslik: 'Ek mesai aç' };
export const DUZELTME_YERLERI: Readonly<Record<EngelTuru, readonly DuzeltmeYeri[]>> = {
  sure: [SURELER, VARDIYA], dolu: [MESAI], vardiya: [VARDIYA], kisi: [PERSONEL], ayarci: [PERSONEL], hazirlik: [SURELER], malzeme: [STOK],
  aday: [KAYNAKLAR], ufuk: [MOTOR, SURELER], siparis: [ROTALAR], bilinmiyor: [PLANLANABILIRLIK], termin: [MOTOR], uyari: [],
};
const UYARI_YERI: Readonly<Record<string, readonly DuzeltmeYeri[]>> = { malzeme: [STOK], takim: [KAYNAKLAR], ikincil: [KAYNAKLAR], 'Ayarcı': [PERSONEL] };
const UYARI_ONERISI: Readonly<Record<string, string>> = {
  malzeme: 'Stok ve satın alma durumunu kontrol edin.', kilit: 'Kilidi kaldırın ya da kilitli işi taşıyın.', geri: 'Termini ya da süreleri kontrol edin.',
  bekleme: 'Bildirilen beklemeyi ya da kilidi kontrol edin.', program: 'NC programını hazırlayın.', takim: 'Takımı yenileyin ya da başka takım ekleyin.',
  ikincil: 'Aparatı artırın ya da işleri kaydırın.', 'Ayarcı': 'Vardiyaya ayarcı atayın.',
  cakisma: 'Kilitli işi taşıyın ya da kilidi kaldırın; iş başladıysa gerçekleşen kaydın saatlerini kontrol edin.',
};

// Grubun tonu: hata plana girmeyen iş, uyarı planda olup eksik kalan, bilgi motorun uyarısı.
export const ENGEL_TONU: Readonly<Record<EngelTuru, 'hata' | 'uyari' | 'bilgi'>> = {
  sure: 'hata', dolu: 'hata', vardiya: 'hata', kisi: 'hata', ayarci: 'hata', hazirlik: 'hata', malzeme: 'hata', aday: 'hata', siparis: 'hata', bilinmiyor: 'hata',
  ufuk: 'uyari', termin: 'uyari', uyari: 'bilgi',
};
export interface Engel {
  tur: EngelTuru;
  // Satırın kimliği (tekrar çizimde aynı kalır).
  anahtar: string;
  emir: string | null;
  // Emrin tanıtımı: no · ürün · adet · adım ("ORN-2 · ORN-Mil · 40 adet · 2. Tornalama").
  baslik: string;
  neOldu: string;
  neden: string | null;
  neYapmali: string;
  duzelt: readonly DuzeltmeYeri[];
}
export interface EngelGrubu { tur: EngelTuru; ad: string; engeller: Engel[] }

const buyukHarf = (s: string): string => (s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s);
const cumle = (s: string): string => { const b = buyukHarf(s.trim()); return /[.!?]$/.test(b) ? b : `${b}.`; };

export function engeller(p: OkunanPlan | null, m: KokpitModeli, cx: Derleme, ufukSonu: number, zaman: (t: number) => string): EngelGrubu[] {
  if (p === null) return [];
  const l: Engel[] = [];
  const emir = new Map(m.emirler.map((e) => [e.id, e]));
  const adimBasligi = (e: KokpitEmri | undefined, id: string): string => {
    if (!e) return id;
    const n = e.adimlar.findIndex((a) => a.id === id), a = e.adimlar[n];
    return [e.no, e.urun, `${e.adet.toLocaleString('tr-TR')} adet`, a ? `${String(n + 1)}. ${a.ad}` : ''].filter(Boolean).join(' · ');
  };
  const emirBasligi = (e: KokpitEmri): string => [e.no, e.urun, `${e.adet.toLocaleString('tr-TR')} adet`].filter(Boolean).join(' · ');
  const jobOf = (id: string): string | null => cx.byId[id]?.job ?? null;

  // Kök adım: öncülü yerleşmediği için düşen adım, zincirin başındaki adıma (kendi nedeni olan ya da ufka taşan) bağlanır.
  const fail = new Set(p.fail);
  const kokOf = (id: string): string => {
    let x = id;
    for (let i = 0; i < 1000; i++) {
      const n = p.failNeden?.[x];
      if (n?.kod !== 'oncul' || !n.oncul || n.oncul === x) return x;
      if (!fail.has(n.oncul)) return n.oncul;
      x = n.oncul;
    }
    return x;
  };
  const bekleyen = new Map<string, number>();
  const kokler: string[] = [];
  for (const id of p.fail) {
    const k = kokOf(id);
    // Öncülü planda olan (ufka taşmayan) adım kendi satırıdır: kökü gösterilecek bir engel değildir.
    if (k === id || (!fail.has(k) && !m.isler[k]?.ufukDisi)) kokler.push(id); else bekleyen.set(k, (bekleyen.get(k) ?? 0) + 1);
  }
  const bekliyor = (id: string): string => { const n = bekleyen.get(id) ?? 0; return n > 0 ? `; sonraki ${String(n)} adım bunu bekliyor` : ''; };

  for (const id of kokler) {
    const j = jobOf(id), e = j === null ? undefined : emir.get(j);
    const n = p.failNeden?.[id];
    const ortak = { anahtar: `adim:${id}`, emir: j, baslik: adimBasligi(e, id), neOldu: `Adım plana girmedi${bekliyor(id)}.` };
    if (n?.tani) {
      const t = zamanTanisiParcalari(n.tani);
      // Düğme Stok'a gider: öneri de oradan başlar (satın alma talebi plan modülünün dışındadır).
      const oneri = n.tani.alt === 'malzeme' ? 'Stokta eksik malzemeye bakın; satın alma talebini Satın Alma\'dan açın.' : t.oneri;
      l.push({ ...ortak, tur: n.tani.alt, neden: cumle(t.neden), neYapmali: oneri, duzelt: DUZELTME_YERLERI[n.tani.alt] });
    } else if (n?.kod === 'aday') {
      l.push({ ...ortak, tur: 'aday', neden: 'Adımın istasyonunda uygun tezgâh ya da fasoncu yok (pasif, kilitli ya da tanımsız olabilir).', neYapmali: 'Kaynaklar\'da istasyona aktif tezgâh ekleyin ya da kilidi kaldırın.', duzelt: DUZELTME_YERLERI.aday });
    } else {
      const t = zamanTanisiParcalari({ alt: 'bilinmiyor', m: null, ad: null, gerek: null, mevcut: null, ufukGun: null });
      l.push({ ...ortak, tur: 'bilinmiyor', neden: cumle(t.neden), neYapmali: t.oneri, duzelt: DUZELTME_YERLERI.bilinmiyor });
    }
  }

  // 3484 c: ufka sığmayan emir için ufuk uzar; adım gerçek tarihiyle yerleşir ve canlıya yazılır. Bilgi olarak gösterilir.
  for (const x of Object.values(m.isler)) {
    if (!x.ufukDisi) continue;
    const e = emir.get(x.job);
    l.push({
      tur: 'ufuk', anahtar: `ufuk:${x.id}`, emir: x.job, baslik: adimBasligi(e, x.id),
      neOldu: `Adım planlama ufkundan sonra bitiyor; ufuk bu emir için uzadı, ${sureYaz(x.ufukDisi)} ufuk sonrasında${bekliyor(x.id)}.`,
      neden: 'Ayardaki ufka sığmadı; tarihleri ufuk sonrası takvimle hesaplandı ve canlı plana yazılır.',
      neYapmali: 'Daha erken bitmesi gerekiyorsa çevrim süresine bakın ya da başka tezgâh ekleyin.', duzelt: DUZELTME_YERLERI.ufuk,
    });
  }

  // Ürünü ya da rotası motorda bulunmayan sipariş plana hiç girmez; ne planda ne yerleşmeyenlerde görünürdü.
  for (const s of cx.g.D.siparisler) {
    if (cx.jobs[s.id]?.ops.length) continue;
    l.push({
      tur: 'siparis', anahtar: `siparis:${s.id}`, emir: null, baslik: [s.ad ?? s.id, `${s.adet.toLocaleString('tr-TR')} adet`].join(' · '),
      neOldu: 'Sipariş plana girmedi.', neden: 'Ürünün planda rotası ya da adımı yok.', neYapmali: 'Ürüne rota tanımlayın.', duzelt: DUZELTME_YERLERI.siparis,
    });
  }

  // Termini planlama süresinin dışındaki emrin geç kalıp kalmadığı plandan görünmez.
  for (const e of m.emirler) {
    if (e.termin === null || e.termin <= ufukSonu || e.durum === 'plansiz') continue;
    l.push({
      tur: 'termin', anahtar: `termin:${e.id}`, emir: e.id, baslik: emirBasligi(e),
      neOldu: 'Geç kalıp kalmadığı görünmüyor.', neden: `Termin planlama süresinin dışında; plan ${zaman(ufukSonu)} tarihine kadar.`,
      neYapmali: 'Planlama süresini uzatın.', duzelt: DUZELTME_YERLERI.termin,
    });
  }

  // Motorun uyarıları; "planlanamadı" ve "ufuk" yukarıdaki satırların kopyasıdır. Metnin başındaki iç kimlik atılır, emir başlıkta yazar.
  p.warn.forEach((w, i) => {
    if (w.t === 'plan' || w.t === 'ufuk' || !w.txt) return;
    const e = w.j === null ? undefined : emir.get(w.j);
    // İçteki adım kimliği ("2.10") emir no ve OP no ile yazılır; saatli tarih ("21.10 08:00") kimlik sayılmaz.
    const metin = w.txt.replace(/^[^\s:]+:\s*/, '').replace(/\b([0-9A-Za-z_-]+)\.(\d+)\b(?! \d{1,2}:\d{2})/g, (t, j: string, op: string) => (cx.byId[t] ? `${emir.get(j)?.no ?? j} OP ${op}` : t));
    l.push({
      tur: 'uyari', anahtar: `uyari:${String(i)}`, emir: e ? e.id : null, baslik: e ? emirBasligi(e) : 'Genel plan uyarısı',
      neOldu: cumle(metin), neden: null, neYapmali: UYARI_ONERISI[w.t] ?? 'Planı ve verisini kontrol edin.', duzelt: UYARI_YERI[w.t] ?? [],
    });
  });

  return ENGEL_SIRASI.map((tur) => ({ tur, ad: ENGEL_ADI[tur], engeller: l.filter((x) => x.tur === tur) })).filter((g) => g.engeller.length > 0);
}

// Başlıktaki özet: kart sayısı ve plana girmeyen adım sayısı (zincirde bekleyenler dahil), öteki engeller türüyle; düğmedeki sayı kartların toplamıdır.
export function engelOzeti(p: OkunanPlan | null, g: readonly EngelGrubu[]): { toplam: number; metin: string } {
  const adim = p?.fail.length ?? 0;
  const say = (t: EngelTuru) => g.find((x) => x.tur === t)?.engeller.length ?? 0;
  const digerTurler: EngelTuru[] = ['siparis', 'ufuk', 'termin', 'uyari'];
  const kok = g.filter((x) => !digerTurler.includes(x.tur)).reduce((t, x) => t + x.engeller.length, 0);
  const parcalar: [number, string][] = [
    [kok, `engel, toplam ${String(adim)} adım plana girmedi`], [say('siparis'), 'sipariş plana hiç girmedi'], [say('ufuk'), 'adım planlama süresini aşıyor'],
    [say('termin'), 'emrin termini planlama süresinin dışında'], [say('uyari'), 'uyarı'],
  ];
  const l = parcalar.filter(([n]) => n > 0);
  return { toplam: l.reduce((t, [n]) => t + n, 0), metin: l.map(([n, m]) => `${String(n)} ${m}`).join(', ') };
}
