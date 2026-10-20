import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BelgeCevabi } from '#paylasilan/sozlesme/portal.ts';
import { Dugme, DurumKutusu, Girdi, Kart, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';

// Portalın onay ve bildirim kuralları (prototipin settings/main belgesi). Portal içindeki form gizlidir; kural burada,
// Sistem Ayarları'nda değişir. Varsayılanlar ve denetimler prototipinkiyle aynıdır (portal.html rules(), SUBMIT.rules/nrules).
const YOL = 'settings/main';
const ANAHTAR = ['portal', 'ayarlar', YOL] as const;

export const ONAY_ALANLARI = [
  { k: 'poMgr', etiket: 'Satın alma siparişi: müdür onayı üstü (TL)', saltOkunur: true },
  { k: 'poGM', etiket: 'Satın alma siparişi: genel müdür onayı üstü (TL)', saltOkunur: true },
  { k: 'payFin', etiket: 'Tedarikçi ödemesi: finans müdürü onayı üstü (TL)' },
  { k: 'contractGM', etiket: 'Sözleşme: genel müdür onayı üstü (TL)' },
  { k: 'discMgr', etiket: 'Teklif iskontosu: satış müdürü onayı üstü (%)' },
  { k: 'priceMgr', etiket: 'Tedarikçi fiyat artışı: müdür onayı üstü (%)' },
  { k: 'priceTol', etiket: 'Fatura fiyat toleransı (±%)' },
] as readonly { k: string; etiket: string; saltOkunur?: true }[];
export const BILDIRIM_ALANLARI = [
  { k: 'supplierConfirmH', etiket: 'Tedarikçi sipariş onayı süresi (saat)' },
  { k: 'remindH', etiket: 'Onay hatırlatması (saat)' },
  { k: 'escalateH', etiket: 'Onay eskalasyonu (saat)' },
  { k: 'dueDays', etiket: 'Vade uyarısı (gün önce)' },
  { k: 'docDays', etiket: 'Belge süresi uyarısı (gün önce)' },
] as const;

const ONAY_VARSAYILAN: Record<string, number> = { payFin: 150000, discMgr: 10, priceMgr: 5, contractGM: 2000000, priceTol: 1 };
const BILDIRIM_VARSAYILAN: Record<string, number> = { remindH: 24, escalateH: 48, supplierConfirmH: 24, dueDays: 3, docDays: 30 };

type Degerler = Record<string, string>;

function nesne(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

// Kayıtlı sayı formda virgüllü ondalıkla yazılır; noktalı yazılsa "0.125" sayiOku'da binlik okunur.
function alanMetni(v: unknown): string {
  return typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
}

export function formDegerleri(veri: Record<string, unknown>): Degerler {
  const kurallar = { ...ONAY_VARSAYILAN, ...nesne(veri['rules']) };
  const bildirim = { ...BILDIRIM_VARSAYILAN, ...nesne(veri['notify']) };
  return Object.fromEntries([
    ...ONAY_ALANLARI.map(({ k }) => [k, alanMetni(kurallar[k])]),
    ...BILDIRIM_ALANLARI.map(({ k }) => [k, alanMetni(bildirim[k])]),
  ]);
}

// Türkçe yazım kabul edilir: "250.000" binlik ayırıcılı, "1,5" virgüllü ondalık. Virgül varsa nokta binlik ayırıcıdır;
// virgülsüz metinde nokta yalnız üçlü gruplar ayırıyorsa binliktir ("1.5" ondalık kalır).
export function sayiOku(metin: string): number {
  const m = metin.trim().replace(/\s/g, '');
  if (m === '') return Number.NaN;
  if (m.includes(',')) return /^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(m) ? Number(m.replace(/\./g, '').replace(',', '.')) : Number.NaN;
  if (/^\d{1,3}(\.\d{3})+$/.test(m)) return Number(m.replace(/\./g, ''));
  return /^\d+(\.\d+)?$/.test(m) ? Number(m) : Number.NaN;
}

// Hata varsa alan adına iletisi, yoksa yazılacak kurallar.
export function kurallariDenetle(d: Degerler):
  { hatalar: Record<string, string> } | { rules: Record<string, number>; notify: Record<string, number> } {
  const hatalar: Record<string, string> = {};
  const rules: Record<string, number> = {};
  const notify: Record<string, number> = {};
  for (const { k, saltOkunur } of ONAY_ALANLARI) {
    if (saltOkunur) continue;
    const v = sayiOku(d[k] ?? '');
    if (!Number.isFinite(v) || v < 0) hatalar[k] = 'Sıfır ya da pozitif bir sayı girin.';
    else rules[k] = v;
  }
  for (const { k } of BILDIRIM_ALANLARI) {
    const v = sayiOku(d[k] ?? '');
    if (!Number.isInteger(v) || v < 0) hatalar[k] = 'Sıfır ya da pozitif bir tam sayı girin.';
    else notify[k] = v;
  }
  if (hatalar['escalateH'] === undefined && hatalar['remindH'] === undefined && (notify['escalateH'] ?? 0) <= (notify['remindH'] ?? 0)) {
    hatalar['escalateH'] = 'Eskalasyon süresi hatırlatma süresinden uzun olmalı.';
  }
  return Object.keys(hatalar).length > 0 ? { hatalar } : { rules, notify };
}

export function PortalAyarlari() {
  const oturum = useOturum();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const belge = useQuery({ queryKey: ANAHTAR, queryFn: () => api.get<BelgeCevabi>(`/portal/belge?yol=${encodeURIComponent(YOL)}`) });
  const [degerler, setDegerler] = useState<Degerler | null>(null);
  const [hatalar, setHatalar] = useState<Record<string, string>>({});
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const mevcut = belge.data?.belge ?? null;

  // Form yalnız ilk okumada doldurulur: kaydetme ya da çakışma sonrası yenilenen belge girilen değerleri silmez.
  useEffect(() => { if (mevcut !== null) setDegerler((d) => d ?? formDegerleri(mevcut.veri)); }, [mevcut]);

  if (belge.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(belge.error, 'Portal ayarları okunamadı.')} />;
  if (belge.isPending) return <DurumKutusu durum="yukleniyor" mesaj="Portal ayarları okunuyor." />;
  if (mevcut === null || degerler === null) {
    return <DurumKutusu durum="bos" mesaj="Portal henüz kurulmadı; Portal kurulumu yetkisi olan biri portalı ilk açtığında kurulur." />;
  }

  const kaydet = async (e: FormEvent) => {
    e.preventDefault();
    const sonuc = kurallariDenetle(degerler);
    if ('hatalar' in sonuc) { setHatalar(sonuc.hatalar); return; }
    setHatalar({});
    setKaydediliyor(true);
    try {
      const gecmis = Array.isArray(mevcut.veri['history']) ? mevcut.veri['history'] as unknown[] : [];
      const satir = { at: new Date().toISOString(), by: 'firm', u: `tmi-${String(oturum.data?.id ?? '')}`, text: 'Onay ve bildirim kuralları Sistem Ayarları\'nda güncellendi' };
      await api.post<BelgeCevabi>('/portal/belge/yaz', {
        yol: YOL, kip: 'birlestir', beklenenSurum: mevcut.surum,
        veri: { rules: sonuc.rules, notify: sonuc.notify, history: [...gecmis, satir] },
      });
      bildir('tamam', 'Portal kuralları kaydedildi.');
      await istemci.invalidateQueries({ queryKey: ANAHTAR });
    } catch (hata) {
      // Çakışmada belge yeniden okunur (yeni sürümle ikinci kayıt geçer); girilen değerler formda kalır.
      bildir('hata', hataIletisi(hata, 'Portal kuralları kaydedilemedi.'));
      await istemci.invalidateQueries({ queryKey: ANAHTAR });
    } finally {
      setKaydediliyor(false);
    }
  };

  const alan = (k: string, etiket: string, ondalik: boolean, saltOkunur = false) => (
    <Girdi key={k} etiket={etiket} name={k} inputMode={ondalik ? 'decimal' : 'numeric'} value={degerler[k] ?? ''} hata={hatalar[k]} readOnly={saltOkunur}
      {...(saltOkunur ? { ipucu: 'Satın alma ayarlarındaki onay limitlerinden gelir.' } : {})}
      onChange={(e) => { const v = e.currentTarget.value; setDegerler((d) => ({ ...(d ?? {}), [k]: v })); }} />
  );

  return (
    <form onSubmit={(e) => { void kaydet(e); }} noValidate>
      <Kart baslik="Onay limitleri">
        <p>Tutar limitleri onay zincirini, fiyat toleransı üçlü eşleştirmeyi belirler. IBAN değişikliği her zaman Muhasebe ve Finans müdürü onayından geçer.</p>
        <div className="tc-form">{ONAY_ALANLARI.map(({ k, etiket, saltOkunur }) => alan(k, etiket, true, saltOkunur === true))}</div>
      </Kart>
      <Kart baslik="Bildirim kuralları">
        <div className="tc-form">{BILDIRIM_ALANLARI.map(({ k, etiket }) => alan(k, etiket, false))}</div>
      </Kart>
      <Dugme type="submit" tur="birincil" simge="check" yukleniyor={kaydediliyor}>Kuralları kaydet</Dugme>
    </form>
  );
}
