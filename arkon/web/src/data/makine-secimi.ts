/* Makine seçimi (kart #1148). Makineli istasyonda CORE kilidi makinededir: işi hangi makinelerde çalıştıracağını operatör seçer, seçmezse işe atanmış
   makine kullanılır (sunucu karar verir; ekran seçilmemişliği `mcs` göndermeyerek söyler). Tek makineli istasyonda seçim yoktur. Seçim yalnız
   çalışmaya geçiş kaydına girer: çalışan işte makine değişmez (başka makineye geçmek önce durdurmak ister). */
export interface SecilebilirMakine { id: string; name?: string }

export const AZAMI_MAKINE_SECIMI = 20;

export const makineSecimiGorunur = (makineler: readonly SecilebilirMakine[], durum: string | undefined): boolean =>
  makineler.length >= 2 && durum !== 'running';

export function secimiDegistir(secili: readonly string[], id: string): string[] {
  if (secili.includes(id)) return secili.filter((x) => x !== id);
  return secili.length >= AZAMI_MAKINE_SECIMI ? [...secili] : [...secili, id];
}

// 2046 a: seçici kişinin çalışabildiği makineleri gösterir (sunucunun `makineler` listesi). Liste yoksa (yönetici, eski sunucu) süzülmez;
// son söz başlatma komutundadır.
export const calisabildigiMakineler = <T extends SecilebilirMakine>(makineler: readonly T[], yetkin: readonly string[] | null | undefined): T[] =>
  yetkin == null ? [...makineler] : makineler.filter((m) => yetkin.includes(m.id));

/* 2055 a: makinesi olan istasyonda iş makinesiz başlamaz. İstasyonda tek makine varsa sunucu onu kendisi alır; birden çok makinede
   seçim ya da planın atadığı makine gerekir. Kişinin çalışabildiği tek makine kalıyorsa seçici görünmez, o makine kayda yazılır.
   İnsanlı istasyonu ekran bilmez: son söz başlatma komutundadır. */
export function baslatmaMakineReddi(
  tum: readonly SecilebilirMakine[], secilebilir: readonly SecilebilirMakine[], secili: readonly string[], atanan: string | null | undefined,
): string | null {
  if (tum.length < 2 || atanan || secili.length > 0 || secilebilir.length === 1) return null;
  return secilebilir.length === 0 ? 'Bu istasyonda çalışabileceğiniz makine yok · amirinize bildirin' : 'Makine seçin · bu istasyonda iş makinesiz başlatılamaz';
}

export const varsayilanSecim = (tum: readonly SecilebilirMakine[], secilebilir: readonly SecilebilirMakine[], secili: readonly string[]): string[] =>
  secili.length === 0 && tum.length >= 2 && secilebilir.length === 1 ? [secilebilir[0]!.id] : [...secili];

// İstasyon ya da iş değişince istasyonda olmayan makine seçimde kalmaz.
export const seciliMakineler = (secili: readonly string[], makineler: readonly SecilebilirMakine[]): string[] =>
  secili.filter((id) => makineler.some((m) => m.id === id));

// Çalışmaya geçiş kaydındaki `mcs`: seçim yoksa alan hiç gönderilmez (undefined).
export const kayittakiMakineler = (secili: readonly string[], makineler: readonly SecilebilirMakine[], durum: string | undefined): string[] | undefined => {
  const gecerli = seciliMakineler(secili, makineler);
  return durum === 'running' && gecerli.length > 0 ? gecerli : undefined;
};

export function secimOzeti(secili: readonly string[], atanan: string | null | undefined): string {
  if (secili.length > 0) return `${secili.length} makine seçili`;
  return atanan ? `Seçilmezse ${atanan} makinesinde başlar` : 'Seçilmezse işe atanmış makinede başlar';
}

/* 393 d: başka emre önümüzdeki saatlerde ayrılmış makinede başlatmayı sunucu reddeder. Seçici aynı kuraldan gelen ayrımları
   (GET /arkon/makine-ayrimlari) baştan gösterir: planın makinesi etiketli, ayrılmış makine kilitli ve seçilemez. Ayrım okunamazsa
   (çevrimdışı, eski sunucu) seçici bugünkü gibidir; son söz başlatma komutundadır. */
export interface MakineAyrimi { mc: string; emirNo: string; opNo: number; baslangic: string }
export interface MakineAyrimlari { planMakinesi: string | null; ayrimlar: MakineAyrimi[] }
// Ayrım saatle değişir (4 saatlik pencere kayar, plan canlıya alınır): seçici açıkken dakikada bir yeniden okunur.
export const AYRIM_YENILEME_MS = 60_000;

export const makineAyrimi = (ayrim: MakineAyrimlari | null | undefined, id: string): MakineAyrimi | null =>
  ayrim?.ayrimlar.find((a) => a.mc === id) ?? null;

// Ayrım seçimden sonra gelirse kilitli makine seçimde kalmaz: kayıt onu göndermez.
export const kilitsizSecim = (secili: readonly string[], ayrim: MakineAyrimlari | null | undefined): string[] =>
  secili.filter((id) => makineAyrimi(ayrim, id) === null);

export const ayrimEtiketi = (a: MakineAyrimi, saat: (an: number) => string): string => `${saat(Date.parse(a.baslangic))} · ${a.emirNo}`;
export const ayrimAciklamasi = (a: MakineAyrimi, saat: (an: number) => string): string =>
  `Başka işe ayrılmış: ${a.emirNo} op ${a.opNo}, başlangıç ${saat(Date.parse(a.baslangic))}. Bu makinede başlatılamaz.`;
