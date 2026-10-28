import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Belge, BelgeCevabi, FirmaKisisiCevabi, KisilerCevabi, SorguCevabi } from '#paylasilan/sozlesme/portal.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Secim, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
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
    <>
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
      <FirmaKisileri />
    </>
  );
}

// Firma kişisi (1021 b): TMI kişisi portalda bir müşteri ya da tedarikçi firmasının kullanıcısı olarak açılır ve yalnız
// o firmanın kayıtlarını okur. Atama kişinin portal kullanıcısındaki firma alanıdır; yalnız sunucu yazar.
const FIRMA_TURU: Record<string, string> = { customer: 'Müşteri', supplier: 'Tedarikçi' };
const TMI_KULLANICI = /^users\/tmi-(\d+)$/;
const FIRMA_ANAHTARI = ['portal', 'ayarlar', 'firma-kisileri'] as const;

export interface FirmaSecenegi { kimlik: string; ad: string; tur: string }
export interface FirmaKisisi { kisiId: number; ad: string; firma: string; firmaAdi: string; tur: string }

export function firmaSecenekleri(firmalar: readonly Belge[]): FirmaSecenegi[] {
  return firmalar
    .filter((b) => typeof b.veri['type'] === 'string' && b.veri['type'] in FIRMA_TURU)
    .map((b) => ({ kimlik: b.kimlik, ad: String(b.veri['name'] ?? b.kimlik), tur: FIRMA_TURU[String(b.veri['type'])] ?? '' }))
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

// Kartı silinmiş firmaya atanan kişi de listelenir: o kişi portalda hiçbir kaydı görmez, buradan kaldırılır.
export function firmaKisileri(kullanicilar: readonly Belge[], firmalar: readonly FirmaSecenegi[], kisiler: readonly { id: number; ad: string }[]): FirmaKisisi[] {
  const firma = new Map(firmalar.map((f) => [f.kimlik, f]));
  const kisi = new Map(kisiler.map((k) => [k.id, k.ad]));
  return kullanicilar.flatMap((b) => {
    const no = TMI_KULLANICI.exec(b.yol)?.[1];
    const kimlik = b.veri['partyId'];
    if (no === undefined || typeof kimlik !== 'string' || kimlik === 'firm') return [];
    const f = firma.get(kimlik);
    return [{ kisiId: Number(no), ad: kisi.get(Number(no)) ?? String(b.veri['name'] ?? ''), firma: kimlik, firmaAdi: f?.ad ?? 'Silinmiş firma', tur: f?.tur ?? '' }];
  }).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

function FirmaKisileri() {
  const oturum = useOturum();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const veri = useQuery({
    queryKey: FIRMA_ANAHTARI,
    queryFn: async () => {
      const [kisiler, firmalar, kullanicilar] = await Promise.all([
        api.get<KisilerCevabi>('/portal/kisiler'),
        api.get<SorguCevabi>('/portal/sorgu?koleksiyon=parties'),
        api.get<SorguCevabi>('/portal/sorgu?koleksiyon=users'),
      ]);
      const secenekler = firmaSecenekleri(firmalar.belgeler);
      return { kisiler: kisiler.kisiler, firmalar: secenekler, atananlar: firmaKisileri(kullanicilar.belgeler, secenekler, kisiler.kisiler) };
    },
  });
  const [kisiId, setKisiId] = useState('');
  const [firma, setFirma] = useState('');
  const [mesgul, setMesgul] = useState<number | null>(null);

  const ata = async (no: number, kimlik: string | null) => {
    setMesgul(no);
    try {
      await api.post<FirmaKisisiCevabi>(`/portal/kisiler/${String(no)}/firma`, { firma: kimlik });
      bildir('tamam', kimlik === null ? 'Firma ataması kaldırıldı.' : 'Kişi firmaya atandı.');
      if (kimlik !== null) { setKisiId(''); setFirma(''); }
      await istemci.invalidateQueries({ queryKey: FIRMA_ANAHTARI });
    } catch (hata) {
      bildir('hata', hataIletisi(hata, 'Firma ataması yapılamadı.'));
    } finally {
      setMesgul(null);
    }
  };

  const sutunlar: Sutun<FirmaKisisi>[] = [
    { anahtar: 'ad', baslik: 'Kişi', hucre: (s) => s.ad },
    { anahtar: 'firma', baslik: 'Firma', hucre: (s) => s.firmaAdi },
    { anahtar: 'tur', baslik: 'Tür', hucre: (s) => s.tur },
    { anahtar: 'eylem', baslik: '', hizala: 'sag', csv: false,
      hucre: (s) => <Dugme simge="x" yukleniyor={mesgul === s.kisiId} onClick={() => { void ata(s.kisiId, null); }}>Kaldır</Dugme> },
  ];

  let icerik;
  if (veri.isError) icerik = <DurumKutusu durum="hata" mesaj={hataIletisi(veri.error, 'Firma kişileri okunamadı.')} />;
  else if (veri.isPending) icerik = <DurumKutusu durum="yukleniyor" mesaj="Firma kişileri okunuyor." />;
  else {
    const atanmis = new Set(veri.data.atananlar.map((a) => a.kisiId));
    const kisiSecenekleri = veri.data.kisiler.filter((k) => k.id !== oturum.data?.id && !atanmis.has(k.id)).map((k) => ({ deger: String(k.id), baslik: k.ad }));
    const firmaSecenekleriListesi = veri.data.firmalar.map((f) => ({ deger: f.kimlik, baslik: `${f.ad} (${f.tur})` }));
    icerik = (
      <>
        <Tablo etiket="Firma kişileri" sutunlar={sutunlar} satirlar={veri.data.atananlar} satirAnahtari={(s) => s.kisiId} bosMesaj="Firmaya atanmış kişi yok." />
        <div className="tc-form">
          <Secim etiket="Kişi" name="firma-kisisi" bosSecenek="Kişi seçin" secenekler={kisiSecenekleri} value={kisiId} onChange={(e) => { setKisiId(e.currentTarget.value); }} />
          <Secim etiket="Firma" name="firma-kimligi" bosSecenek="Firma seçin" secenekler={firmaSecenekleriListesi} value={firma} onChange={(e) => { setFirma(e.currentTarget.value); }} />
        </div>
        <Dugme simge="user-plus" tur="birincil" disabled={kisiId === '' || firma === ''} yukleniyor={mesgul === Number(kisiId)}
          onClick={() => { void ata(Number(kisiId), firma); }}>Firmaya ata</Dugme>
      </>
    );
  }

  return (
    <Kart baslik="Firma kişileri">
      <p>Firmaya atanan kişi portalı o müşteri ya da tedarikçinin kullanıcısı olarak açar: yalnız o firmanın kayıtlarını görür ve portalda bir şey yazamaz.</p>
      {icerik}
    </Kart>
  );
}
