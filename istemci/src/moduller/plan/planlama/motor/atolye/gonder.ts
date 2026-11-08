import type { CanliDegistiAyrintisi, DortSaatAyrintisi, PlanSurumCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { EskiSurumAyrintisi } from '#paylasilan/hata.ts';
import type { CalismaGeriAlCevabi, CalismaTaslagiCevabi, TaslaktanCalismayaCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AtolyeKomutuCevabi, AtolyeOlayi, EkMesaiEkleGovdesi, IsTasiGovdesi } from '#paylasilan/sozlesme/planlama-atolye.ts';
import { useBildirim } from '../../../../../ortak/arayuz/index.ts';
import { api, ApiHatasi, hataIletisi } from '../../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../../../ortak/veri/istek-kimligi.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { useBekleyenUygula } from '../coz.ts';
import { gunAdi } from '../cizelge/kurallar.ts';
import { simdiSaati } from '../kurallar.ts';

// Çalışma planını onaya gönderme (eski soGonder, 503 a): çalışma önce kaydedilir (sunucu yalnız kayıtlı çalışmayı yazar), sonra kişiye yeni
// plan taslağı olarak yazılır ve plan modülünün kendi ucuyla onaya gönderilir. Yarıda kalırsa açılan taslaktan vazgeçilir (onaya gitmemiş
// taslak). Eski Gönder yalnız onaya gönderirdi; "Onayla ve canlıya al" ayrı düğmedir (eski paYayinla('calisma')) ve aynı yoldan gidip
// onaydaki taslağı canlıya alır; canlıya alma reddedilirse plan onayda kalır. "Deneme olarak kaydet" (eski paDenemeKaydet) taslağı açık
// bırakır. Kimin neyi yapabileceğine uçlar karar verir; ekran yalnız sunucunun cevabını gösterir.
export interface GonderSonucu {
  taslak: number; ad: string; yazilan: number; atlanan: number; yazilamaz: string[]; ekMesaiAtlanan: number; senaryolar: SenaryolarCevabi | null;
}

export type GonderHedefi = 'deneme' | 'onay' | 'canli';
// 990 a: canlıya alma 4 saat kuralına takıldıysa plan onayda kalır; ekran gerekçe sorup onaydaki taslağı (gerekceTaslagi) yeniden canlıya alır.
// 2311 S1: canlı plan ekran açıldıktan sonra değiştiyse kişiye sorulur. 'taslak-yaz': taslak yazılmadı, onaylanırsa gönderme baştan yapılır;
// sayı: plan onayda kaldı, onaylanırsa o taslak cakismalariKabul ile canlıya alınır.
export type CanliDegisti = 'taslak-yaz' | number;
export class GonderHatasi extends Error {
  readonly gerekceTaslagi: number | null;
  readonly canliDegisti: CanliDegisti | null;
  constructor(mesaj: string, gerekceTaslagi: number | null = null, canliDegisti: CanliDegisti | null = null) {
    super(mesaj); this.gerekceTaslagi = gerekceTaslagi; this.canliDegisti = canliDegisti;
  }
}
const CANLI_DEGISTI: CanliDegistiAyrintisi['neden'] = 'canli-degisti';
const ESKI_SURUM: EskiSurumAyrintisi['neden'] = 'eski-surum';
const nedeni = (h: unknown): unknown => (h instanceof ApiHatasi && h.durum === 409 ? (h.govde.ayrinti as { neden?: unknown } | null | undefined)?.neden : undefined);
export const canliDegistiMi = (h: unknown): h is ApiHatasi => nedeni(h) === CANLI_DEGISTI;

// Sorunun metni: canlıyı en son kim, ne zaman aldı (GET /plan/surum); okunamazsa yalnız değiştiği söylenir.
export function canliDegistiIletisi(son: PlanSurumCevabi['sonCanliyaAlma'] | null | undefined): string {
  const kim = son ? `${son.kisi ?? 'Başka bir kişi'} ${new Date(son.zaman).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })} tarihinde canlıya aldı. ` : '';
  return `Bu plan hazırlandıktan sonra canlı plan değişti. ${kim}Canlıya alırsanız o değişiklikler bu planla değişir; önce canlıya alan kişiyle konuşun.`;
}
export const canliDegistiOku = (): Promise<string> =>
  api.get<PlanSurumCevabi>('/plan/surum').then((v) => canliDegistiIletisi(v.sonCanliyaAlma), () => canliDegistiIletisi(null));
const DORT_SAAT: DortSaatAyrintisi['neden'] = 'dort-saat';
const gerekceIsterMi = (h: unknown) => {
  const a = h instanceof ApiHatasi ? h.govde.ayrinti as Partial<DortSaatAyrintisi> | null | undefined : null;
  return a?.neden === DORT_SAAT && a.gerekceIle === true;
};

const sebep = (h: unknown) => hataIletisi(h, 'sunucuya ulaşılamadı');

export async function calismayiGonder(a: {
  komut: CalismaKomutu; ad: string; not: string | null; planSurumu: number | null; hedef: GonderHedefi;
  // Kişi "canlı değişti" sorusunu onayladı: canlıya alma cakismalariKabul ile gider.
  canliKabul?: boolean;
}): Promise<GonderSonucu> {
  const bas = a.hedef === 'deneme' ? 'Deneme kaydedilemedi' : 'Plan onaya gönderilemedi';
  const calismaSurumu = await a.komut.kaydet();
  if (calismaSurumu === null) throw new GonderHatasi(`${bas}: çalışma kaydedilemedi; sayfayı yenileyip yeniden deneyin.`);
  let g: CalismaTaslagiCevabi;
  try {
    g = await tekrarKorumaliGonder((d) => api.post<CalismaTaslagiCevabi>('/plan/planlama-calismasi/taslak-yaz',
      { ad: a.ad, calismaSurumu, ...(a.planSurumu !== null ? { planSurumu: a.planSurumu } : {}) }, d));
  } catch (h) {
    // Okunan canlı sürüm tutmadıysa (eski sürüm) ve canlı gerçekten ilerlediyse soru sorulur; çalışma sürümü tutmadıysa düz hata kalır.
    if (nedeni(h) === ESKI_SURUM && a.planSurumu !== null) {
      const simdi = await api.get<PlanSurumCevabi>('/plan/surum').then((v) => v.planSurumu, () => null);
      if (simdi !== null && simdi !== a.planSurumu) throw new GonderHatasi(`${bas}: ekran açıldıktan sonra canlı plan değişti.`, null, 'taslak-yaz');
    }
    throw new GonderHatasi(`${bas}: ${sebep(h)}`);
  }
  const id = g.taslak.id;
  const sonuc = (sen: SenaryolarCevabi | null): GonderSonucu => ({ taslak: id, ad: a.ad, yazilan: g.yazilan, atlanan: g.atlanan, yazilamaz: g.yazilamaz, ekMesaiAtlanan: g.ekMesai?.atlanan ?? 0, senaryolar: sen });
  // Deneme yazıldı; liste okunamazsa (null) ekran eski listeyle kalır, yazılan taslak plan modülünde açıktır.
  if (a.hedef === 'deneme') return sonuc(await api.get<SenaryolarCevabi>('/plan/senaryolar').catch(() => null));
  let sen: SenaryolarCevabi;
  try {
    sen = await api.post<SenaryolarCevabi>(`/plan/senaryolar/${String(id)}/onaya-gonder`, { surum: g.taslak.surum, not: a.not });
  } catch (h) {
    api.post(`/plan/senaryolar/${String(id)}/vazgec`, { surum: g.taslak.surum }).catch(() => undefined);
    throw new GonderHatasi(`Plan onaya gönderilemedi: ${sebep(h)}`);
  }
  if (a.hedef === 'canli') {
    const s = sen.senaryolar.find((x) => x.id === id);
    if (!s) throw new GonderHatasi('Plan canlıya alınamadı, onayda bekliyor: plan listede bulunamadı.');
    try {
      sen = await tekrarKorumaliGonder((d) => api.post<SenaryolarCevabi>(`/plan/senaryolar/${String(id)}/canliya-al`, { surum: s.surum, cakismalariKabul: a.canliKabul === true }, d));
    } catch (h) { throw new GonderHatasi(`Plan canlıya alınamadı, onayda bekliyor: ${sebep(h)}`, gerekceIsterMi(h) ? id : null, canliDegistiMi(h) ? id : null); }
  }
  return sonuc(sen);
}

const ilkUc = (l: string[]) => `${l.slice(0, 3).join(', ')}${l.length > 3 ? '…' : ''}`;
// Eski gonderOzeti: yazılan, yerinde kalan ve sunucuda karşılığı olmadığı için yazılmayan işler; taslağa geçmeyen ek vardiya (507 2 a) da söylenir.
export const gonderOzeti = (g: Pick<GonderSonucu, 'yazilan' | 'atlanan' | 'yazilamaz'> & { ekMesaiAtlanan?: number }): string =>
  `${g.yazilan} iş taslağa yazıldı${g.atlanan ? `, ${g.atlanan} iş yerinde kaldı (başlamış, kilitli ya da dondurulmuş)` : ''}`
  + `${g.yazilamaz.length ? `; ${g.yazilamaz.length} iş sunucuda karşılığı olmadığı için yazılmadı (${ilkUc(g.yazilamaz)})` : ''}`
  + `${g.ekMesaiAtlanan ? `; ${g.ekMesaiAtlanan} ek vardiya sunucuda karşılığı olmadığı için taslağa geçmedi` : ''}.`;

// Eski taslak adları (fmtDT(...).slice(0, 9), gün adıyla): "Onay <gün> · <kişi>", "Deneme <n> · <gün>".
export const taslakAdi = (hedef: GonderHedefi, gun: string, kisi: string, acik: number): string =>
  hedef === 'deneme' ? `Deneme ${acik + 1} · ${gun.trim()}` : `Onay ${gun.trim()} · ${kisi}`;

// Ekranın çağrısı: taslak adı, not ve canlı sürüm (arada canlıya alınırsa sunucu reddeder) ekranın verisinden kurulur.
export function calismayiYolla(a: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; sen: SenaryolarCevabi | null; hedef: GonderHedefi; not: string | null; canliKabul?: boolean }): Promise<GonderSonucu> {
  const komut = a.o.komut;
  if (!komut) return Promise.reject(new GonderHatasi('Çalışma bu oturumda yazılamıyor; sayfayı yenileyin.'));
  const acik = (a.sen?.senaryolar ?? []).filter((x) => x.durum === 'acik').length;
  return calismayiGonder({
    komut, not: a.not, hedef: a.hedef, planSurumu: a.sen?.canliSurum ?? a.o.depo.planSurumu?.planSurumu ?? null, canliKabul: a.canliKabul === true,
    ad: taslakAdi(a.hedef, gunAdi(a.c.D, simdiSaati(a.c)), a.o.depo.ben.kisi.ad, acik),
  });
}

export const gonderIletisi = (hedef: GonderHedefi, g: GonderSonucu): string =>
  hedef === 'deneme' ? `"${g.ad}" kaydedildi; karşılaştırmaya eklenebilir. ${gonderOzeti(g)}`
    : hedef === 'onay' ? `Plan onaya gönderildi: ${gonderOzeti(g)} Canlıya onaylayan alır.`
      : `Plan canlıda: ${gonderOzeti(g)} Tezgâh kuyrukları ve operatör ekranı bu planı gösterir.`;

export const gonderHataIletisi = (h: unknown): string => (h instanceof GonderHatasi ? h.message : hataIletisi(h, 'İşlem tamamlanamadı; sayfayı yenileyip yeniden deneyin.'));

// Çalışmaya aç (eski 'sen-ac', 507 3 a): bekleyen değişiklik önce kaydedilir, sonra taslağın yerleşimleri ve kilitleri kayıtlı çalışmanın
// üstüne yazılır (veri, arıza, ek mesai yazılmaz). Eskide açma geri yığını temizlerdi; şimdi yazmadan önceki sürüm geri alınabilir (508 2 a).
export async function calismayaAc(a: { komut: CalismaKomutu; taslakId: number; taslakSurumu: number }): Promise<TaslaktanCalismayaCevabi> {
  const calismaSurumu = await a.komut.kaydet();
  if (calismaSurumu === null) throw new GonderHatasi('Plan çalışmaya açılamadı: çalışma kaydedilemedi; sayfayı yenileyip yeniden deneyin.');
  try {
    return await tekrarKorumaliGonder((d) => api.post<TaslaktanCalismayaCevabi>('/plan/planlama-calismasi/taslaktan-yaz',
      { taslakId: a.taslakId, taslakSurumu: a.taslakSurumu, calismaSurumu }, d));
  } catch (h) { throw new GonderHatasi(`Plan çalışmaya açılamadı: ${sebep(h)}`); }
}
// Geri al: çalışma yazmadan önceki sürümüne döner; arada başka yazma olduysa sunucu reddeder.
export async function calismayiGeriAl(calismaSurumu: number): Promise<CalismaGeriAlCevabi> {
  try {
    return await tekrarKorumaliGonder((d) => api.post<CalismaGeriAlCevabi>('/plan/planlama-calismasi/geri-al', { calismaSurumu }, d));
  } catch (h) { throw new GonderHatasi(`Geri alınamadı: ${sebep(h)}`); }
}
export const acmaOzeti = (r: Pick<TaslaktanCalismayaCevabi, 'yazilan' | 'kilitli' | 'atlanan'>): string =>
  `${r.yazilan} iş çalışmaya yazıldı${r.kilitli ? `, ${r.kilitli} kilit` : ''}`
  + `${r.atlanan.length ? `; ${r.atlanan.length} iş çalışmada karşılığı olmadığı için yazılmadı (${ilkUc(r.atlanan)})` : ''}. Plan yeniden çözülmeli.`;

// Atölyenin elle düzenleme komutları (1982 a): taşı, başka tezgâha, saat kaydır, sürükle-bırak, olay ve ek mesai her biri kendi ucuyla gider.
// Bekleyen değişiklik önce kaydedilir (sunucu kayıtlı çalışmanın sürümünü ister); cevaptan sonra sayfa çalışmayı yeniden okur ve plan
// kendiliğinden uygulanır (2053-1 a, otomatikUygulaIste).
export async function isiTasi(komut: CalismaKomutu, g: Omit<IsTasiGovdesi, 'calismaSurumu'>): Promise<AtolyeKomutuCevabi> {
  const calismaSurumu = await komut.kaydet();
  if (calismaSurumu === null) throw new GonderHatasi('İş taşınamadı: çalışma kaydedilemedi; sayfayı yenileyip yeniden deneyin.');
  try {
    return await tekrarKorumaliGonder((d) => api.post<AtolyeKomutuCevabi>('/plan/planlama-calismasi/is-tasi', { ...g, calismaSurumu }, d));
  } catch (h) { throw new GonderHatasi(`İş taşınamadı: ${sebep(h)}`); }
}
export async function olayiEkle(komut: CalismaKomutu, olay: AtolyeOlayi): Promise<AtolyeKomutuCevabi> {
  const calismaSurumu = await komut.kaydet();
  if (calismaSurumu === null) throw new GonderHatasi('Olay eklenemedi: çalışma kaydedilemedi; sayfayı yenileyip yeniden deneyin.');
  try {
    return await tekrarKorumaliGonder((d) => api.post<AtolyeKomutuCevabi>('/plan/planlama-calismasi/olay-ekle', { calismaSurumu, olay }, d));
  } catch (h) { throw new GonderHatasi(`Olay eklenemedi: ${sebep(h)}`); }
}
export async function ekMesaiyiEkle(komut: CalismaKomutu, g: Omit<EkMesaiEkleGovdesi, 'calismaSurumu'>): Promise<AtolyeKomutuCevabi> {
  const calismaSurumu = await komut.kaydet();
  if (calismaSurumu === null) throw new GonderHatasi('Ek mesai eklenemedi: çalışma kaydedilemedi; sayfayı yenileyip yeniden deneyin.');
  try {
    return await tekrarKorumaliGonder((d) => api.post<AtolyeKomutuCevabi>('/plan/planlama-calismasi/ek-mesai-ekle', { ...g, calismaSurumu }, d));
  } catch (h) { throw new GonderHatasi(`Ek mesai eklenemedi: ${sebep(h)}`); }
}

// 2053-1 a: komut çalışmayı değiştirdiyse plan kendiliğinden uygulanır. Yenileme ekranı yeniden kurduğu için istek modülde tutulur; sayfa
// komutun yazdığı sürümü (ya da sonrasını) okuyunca bekleyen değişiklikler bir kez uygulanır. Değişmeyen komut istek bırakmaz.
let otomatikHedef: number | null = null;
export function otomatikUygulaIste(r: AtolyeKomutuCevabi): void {
  if (r.calismaSurumu !== r.oncekiSurum) otomatikHedef = r.calismaSurumu;
}
export function otomatikUygulaAl(surum: number | null): boolean {
  if (otomatikHedef === null || surum === null || surum < otomatikHedef) return false;
  otomatikHedef = null;
  return true;
}
// Testler için: bekleyen isteği boşaltır.
export function otomatikUygulaSifirla(): void { otomatikHedef = null; }
export function useOtomatikUygula(o: Pick<PlanlamaEkranOzellikleri, 'komut' | 'yetki' | 'calisma' | 'depo'>, uyar: (ileti: string) => void): void {
  const bu = useBekleyenUygula(o, uyar);
  const surum = o.depo.calismaSurumu ?? null;
  useEffect(() => {
    if (bu?.suruyor) return;
    if (otomatikUygulaAl(surum) && bu) bu.uygula();
  }, [bu, surum]);
}

// Sayfanın elle düzenleme komutları (atölye, seçim paneli, odak, denetçi aynı kancayı kullanır): yazamayan ya da komut sürerken null.
// Cevaptan sonra sayfa yenilenir; komut çalışmayı değiştirdiyse plan kendiliğinden uygulanır (useOtomatikUygula sayfada bir kez).
export interface AtolyeKomutlari {
  tasi: ((id: string, m: string, S: number) => void) | null;
  olayEkle: ((olay: AtolyeOlayi) => Promise<boolean>) | null;
  ekMesai: ((m: string, gun: number, vardiya: string) => void) | null;
  isleniyor: boolean;
}
export function useAtolyeKomutlari(o: Pick<PlanlamaEkranOzellikleri, 'komut' | 'yetki' | 'yenile'>, c: PlanlamaCalismasi | null): AtolyeKomutlari {
  const { komut, yenile } = o; const yaz = komut !== null && o.yetki.planYaz;
  const { bildir } = useBildirim();
  const [isleniyor, setIsleniyor] = useState(false);
  const gonder = useCallback(async (is: () => Promise<AtolyeKomutuCevabi>, tamam: string): Promise<boolean> => {
    setIsleniyor(true);
    try { otomatikUygulaIste(await is()); bildir('tamam', tamam); yenile(); return true; } catch (h) { bildir('hata', gonderHataIletisi(h)); return false; } finally { setIsleniyor(false); }
  }, [bildir, yenile]);
  const simdi = c ? simdiSaati(c) : 0;
  const tasi = useMemo(() => (yaz && komut ? (id: string, m: string, S: number): void => {
    void gonder(() => isiTasi(komut, { isId: id, tezgah: m, baslangic: tasimaSaati(S, simdi) }), 'İş taşındı; plan yeniden diziliyor.');
  } : null), [yaz, komut, gonder, simdi]);
  const olayEkle = useMemo(() => (yaz && komut ? (olay: AtolyeOlayi): Promise<boolean> => gonder(() => olayiEkle(komut, olay), 'Olay eklendi; plan yeniden diziliyor.') : null), [yaz, komut, gonder]);
  const ekMesai = useMemo(() => (yaz && komut ? (m: string, gun: number, vardiya: string): void => {
    void gonder(() => ekMesaiyiEkle(komut, { tezgah: m, gun, vardiya }), 'Ek mesai eklendi; plan yeniden diziliyor.');
  } : null), [yaz, komut, gonder]);
  return isleniyor ? { tasi: null, olayEkle: null, ekMesai: null, isleniyor } : { tasi, olayEkle, ekMesai, isleniyor };
}

// Taşımanın saati çeyrek saate yuvarlanır ve şimdiden önce olamaz (sunucu geçmişe konan kilidi reddeder).
export const tasimaSaati = (S: number, now: number): number => Math.max(Math.ceil(now * 4 - 1e-9) / 4, Math.round(S * 4) / 4);
