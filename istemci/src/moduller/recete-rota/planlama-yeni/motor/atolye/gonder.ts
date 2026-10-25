import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { CalismaTaslagiCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { api, hataIletisi } from '../../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../../../ortak/veri/istek-kimligi.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { gunAdi } from '../cizelge/kurallar.ts';
import { simdiSaati } from '../kurallar.ts';

// Çalışma planını onaya gönderme (eski soGonder, 503 a): çalışma önce kaydedilir (sunucu yalnız kayıtlı çalışmayı yazar), sonra kişiye yeni
// plan taslağı olarak yazılır ve plan modülünün kendi ucuyla onaya gönderilir. Yarıda kalırsa açılan taslaktan vazgeçilir (onaya gitmemiş
// taslak). Eski Gönder yalnız onaya gönderirdi; "Onayla ve canlıya al" ayrı düğmedir (eski paYayinla('calisma')) ve aynı yoldan gidip
// onaydaki taslağı canlıya alır; canlıya alma reddedilirse plan onayda kalır. "Deneme olarak kaydet" (eski paDenemeKaydet) taslağı açık
// bırakır. Kimin neyi yapabileceğine uçlar karar verir; ekran yalnız sunucunun cevabını gösterir.
export interface GonderSonucu { taslak: number; ad: string; yazilan: number; atlanan: number; yazilamaz: string[]; senaryolar: SenaryolarCevabi | null }

export type GonderHedefi = 'deneme' | 'onay' | 'canli';
export class GonderHatasi extends Error {}

const sebep = (h: unknown) => hataIletisi(h, 'sunucuya ulaşılamadı');

export async function calismayiGonder(a: {
  komut: CalismaKomutu; ad: string; not: string | null; planSurumu: number | null; hedef: GonderHedefi;
}): Promise<GonderSonucu> {
  const bas = a.hedef === 'deneme' ? 'Deneme kaydedilemedi' : 'Plan onaya gönderilemedi';
  const calismaSurumu = await a.komut.kaydet();
  if (calismaSurumu === null) throw new GonderHatasi(`${bas}: çalışma kaydedilemedi; sayfayı yenileyip yeniden deneyin.`);
  let g: CalismaTaslagiCevabi;
  try {
    g = await tekrarKorumaliGonder((d) => api.post<CalismaTaslagiCevabi>('/recete-rota/planlama-calismasi/taslak-yaz',
      { ad: a.ad, calismaSurumu, ...(a.planSurumu !== null ? { planSurumu: a.planSurumu } : {}) }, d));
  } catch (h) { throw new GonderHatasi(`${bas}: ${sebep(h)}`); }
  const id = g.taslak.id;
  const sonuc = (sen: SenaryolarCevabi | null): GonderSonucu => ({ taslak: id, ad: a.ad, yazilan: g.yazilan, atlanan: g.atlanan, yazilamaz: g.yazilamaz, senaryolar: sen });
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
      sen = await tekrarKorumaliGonder((d) => api.post<SenaryolarCevabi>(`/plan/senaryolar/${String(id)}/canliya-al`, { surum: s.surum, cakismalariKabul: true }, d));
    } catch (h) { throw new GonderHatasi(`Plan canlıya alınamadı, onayda bekliyor: ${sebep(h)}`); }
  }
  return sonuc(sen);
}

// Eski gonderOzeti: yazılan, yerinde kalan ve sunucuda karşılığı olmadığı için yazılmayan işler.
export const gonderOzeti = (g: Pick<GonderSonucu, 'yazilan' | 'atlanan' | 'yazilamaz'>): string =>
  `${g.yazilan} iş taslağa yazıldı${g.atlanan ? `, ${g.atlanan} iş yerinde kaldı (başlamış, kilitli ya da dondurulmuş)` : ''}`
  + `${g.yazilamaz.length ? `; ${g.yazilamaz.length} iş sunucuda karşılığı olmadığı için yazılmadı (${g.yazilamaz.slice(0, 3).join(', ')}${g.yazilamaz.length > 3 ? '…' : ''})` : ''}.`;

// Eski taslak adları (fmtDT(...).slice(0, 9), gün adıyla): "Onay <gün> · <kişi>", "Deneme <n> · <gün>".
export const taslakAdi = (hedef: GonderHedefi, gun: string, kisi: string, acik: number): string =>
  hedef === 'deneme' ? `Deneme ${acik + 1} · ${gun.trim()}` : `Onay ${gun.trim()} · ${kisi}`;

// Ekranın çağrısı: taslak adı, not ve canlı sürüm (arada canlıya alınırsa sunucu reddeder) ekranın verisinden kurulur.
export function calismayiYolla(a: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; sen: SenaryolarCevabi | null; hedef: GonderHedefi; not: string | null }): Promise<GonderSonucu> {
  const komut = a.o.komut;
  if (!komut) return Promise.reject(new GonderHatasi('Çalışma bu oturumda yazılamıyor; sayfayı yenileyin.'));
  const acik = (a.sen?.senaryolar ?? []).filter((x) => x.durum === 'acik').length;
  return calismayiGonder({
    komut, not: a.not, hedef: a.hedef, planSurumu: a.sen?.canliSurum ?? a.o.depo.planSurumu?.planSurumu ?? null,
    ad: taslakAdi(a.hedef, gunAdi(a.c.D, simdiSaati(a.c)), a.o.depo.ben.kisi.ad, acik),
  });
}

export const gonderIletisi = (hedef: GonderHedefi, g: GonderSonucu): string =>
  hedef === 'deneme' ? `"${g.ad}" kaydedildi; karşılaştırmaya eklenebilir. ${gonderOzeti(g)}`
    : hedef === 'onay' ? `Plan onaya gönderildi: ${gonderOzeti(g)} Canlıya onaylayan alır.`
      : `Plan canlıda: ${gonderOzeti(g)} Tezgâh kuyrukları ve operatör ekranı bu planı gösterir.`;

export const gonderHataIletisi = (h: unknown): string => (h instanceof GonderHatasi ? h.message : hataIletisi(h, 'İşlem tamamlanamadı; sayfayı yenileyip yeniden deneyin.'));
