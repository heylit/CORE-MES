import { useId, useMemo, useState } from 'react';
import type { AlternatifKurali, AlternatifKuraliKaydetGovdesi, KapsamTuru, MuadilTuru } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import type { PayTuru } from '#paylasilan/sozlesme/stok-kontrol-sabitleri.ts';
import { CokSatir, Dugme, FormPenceresi, Girdi, OnayPenceresi, Secim, useBildirim, type Secenek } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { useForm, type AlanHatalari } from '../../../../ortak/veri/form.ts';
import type { KatalogKarti } from '../tipler.ts';
import { useKartlar } from '../veri.ts';
import { kuralKaydet, muadilKaydet, useAlternatifTazele, useKuralKaldir, type MuadilTablosu } from './veri.ts';

// Üç durumlu alan: boş üst kapsamdan gelir.
type UcDurum = '' | 'evet' | 'hayir';
const ucDurum = (v: boolean | null): UcDurum => (v === null ? '' : v ? 'evet' : 'hayir');
const ucDeger = (v: string): boolean | null => (v === '' ? null : v === 'evet');
const metin = (v: string): string | null => (v.trim() === '' ? null : v.trim());
const sayi = (v: string): number | null => (v.trim() === '' ? null : Number(v.replace(',', '.')));

const KAPSAMLAR: readonly Secenek[] = [
  { deger: 'aile', baslik: 'Aile (bütün sınıflar)' }, { deger: 'sinif', baslik: 'Sınıf' },
  { deger: 'kalite', baslik: 'Kalite' }, { deger: 'kart', baslik: 'Tek kart' },
];
const KAPSAM_IPUCU: Record<KapsamTuru, string> = {
  aile: 'Katalogdaki aile, ör. metal', sinif: 'Katalogdaki "aile/sınıf", ör. metal/aluminyum', kalite: 'Katalogdaki kalite, ör. 6082', kart: 'Kartın stok kodu',
};
const PAYLAR: readonly Secenek[] = [
  { deger: '', baslik: 'Üst kapsamdan' }, { deger: 'tam', baslik: 'Yalnız aynı ölçü' },
  { deger: 'mm', baslik: 'Sabit mm' }, { deger: 'yuzde', baslik: 'Yüzde (en az mm ile)' },
];
const uc = (evet: string, hayir: string): readonly Secenek[] => [
  { deger: '', baslik: 'Üst kapsamdan' }, { deger: 'evet', baslik: evet }, { deger: 'hayir', baslik: hayir },
];

interface KuralFormu {
  kapsamTuru: string; kapsam: string; kaliteAcik: string; durumAcik: string; sartliAcik: string; boyUzunKesilir: string;
  yuzeySerbest: string; payTuru: string; payDeger: string; payEnAzMm: string; kapali: string; gerekce: string;
}

function kuralFormu(k: AlternatifKurali | null, kapsamTuru: KapsamTuru, kapsam: string): KuralFormu {
  return {
    kapsamTuru: k?.kapsamTuru ?? kapsamTuru, kapsam: k?.kapsam ?? kapsam,
    kaliteAcik: ucDurum(k?.kaliteAcik ?? null), durumAcik: ucDurum(k?.durumAcik ?? null), sartliAcik: ucDurum(k?.sartliAcik ?? null),
    boyUzunKesilir: ucDurum(k?.boyUzunKesilir ?? null), yuzeySerbest: ucDurum(k?.yuzeySerbest ?? null),
    payTuru: k?.payTuru ?? '', payDeger: k?.payDeger === null || k?.payDeger === undefined ? '' : String(k.payDeger),
    payEnAzMm: k?.payEnAzMm === null || k?.payEnAzMm === undefined ? '' : String(k.payEnAzMm),
    kapali: ucDurum(k?.kapali ?? null), gerekce: k?.gerekce ?? '',
  };
}

export function kuralGovdesi(d: KuralFormu, surum: number | undefined): AlternatifKuraliKaydetGovdesi {
  return {
    kapsamTuru: d.kapsamTuru as KapsamTuru, kapsam: d.kapsam.trim(),
    kaliteAcik: ucDeger(d.kaliteAcik), durumAcik: ucDeger(d.durumAcik), sartliAcik: ucDeger(d.sartliAcik),
    boyUzunKesilir: ucDeger(d.boyUzunKesilir), yuzeySerbest: ucDeger(d.yuzeySerbest),
    payTuru: d.payTuru === '' ? null : (d.payTuru as PayTuru), payDeger: d.payTuru === 'tam' ? null : sayi(d.payDeger),
    payEnAzMm: d.payTuru === 'yuzde' ? sayi(d.payEnAzMm) : null, kapali: ucDeger(d.kapali), gerekce: metin(d.gerekce),
    ...(surum === undefined ? {} : { surum }),
  };
}

// Kapsam önerileri katalogdaki kartlardan; kartta stok kodu yazılır, sunucuya kart numarası gider.
export function kapsamOnerileri(kartlar: readonly KatalogKarti[]): Record<KapsamTuru, string[]> {
  const kume = (f: (k: KatalogKarti) => string | null) => [...new Set(kartlar.map(f).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'tr'));
  return {
    aile: kume((k) => k.kayit.fam), sinif: kume((k) => (k.kayit.fam && k.kayit.cls ? `${k.kayit.fam}/${k.kayit.cls}` : null)),
    kalite: kume((k) => k.kayit.grade), kart: kume((k) => (k.kayit.tur === 'hammadde' ? k.kayit.com.kod || null : null)),
  };
}
const kartNoKoddan = (kartlar: readonly KatalogKarti[], kod: string) => kartlar.find((k) => k.kayit.com.kod === kod.trim())?.no ?? null;
const kartKoduNodan = (kartlar: readonly KatalogKarti[], no: string) => kartlar.find((k) => String(k.no) === no)?.kayit.com.kod || no;

function kuralDogrula(d: KuralFormu, kartlar: readonly KatalogKarti[] | null): AlanHatalari {
  const h: AlanHatalari = {};
  if (d.kapsam.trim() === '') h.kapsam = 'Kapsamı yazın.';
  else if (d.kapsamTuru === 'kart' && kartlar !== null && kartNoKoddan(kartlar, d.kapsam) === null) h.kapsam = 'Bu stok koduyla kart yok.';
  if ((d.payTuru === 'mm' || d.payTuru === 'yuzde') && !Number.isFinite(sayi(d.payDeger))) h.payDeger = 'Pay değeri girin.';
  if (d.kapali === 'evet' && d.gerekce.trim() === '') h.gerekce = 'Alternatifi kapatırken gerekçe yazın.';
  return h;
}

export function KuralPenceresi({ kayit, kapsamTuru = 'aile', kapsam = '', kapat }: {
  kayit: AlternatifKurali | null; kapsamTuru?: KapsamTuru; kapsam?: string; kapat: () => void;
}) {
  const tazele = useAlternatifTazele();
  const kaldir = useKuralKaldir();
  const kartlar = useKartlar().data ?? [];
  const oneriler = useMemo(() => kapsamOnerileri(kartlar), [kartlar]);
  const liste = useId();
  // Var olan ya da karttan açılan kuralın kapsamı sabittir ve kart numarasıyla gelir; yeni kart kuralında stok kodu yazılır.
  const kapsamSabit = kayit !== null || kapsam !== '';
  const [silAcik, silAcikYaz] = useState(false);
  const { bildir } = useBildirim();
  const form = useForm<KuralFormu>({
    ilk: kuralFormu(kayit, kapsamTuru, kapsam),
    dogrula: (d) => kuralDogrula(d, kapsamSabit ? null : kartlar),
    kaydet: async (d) => {
      const govde = kuralGovdesi(d, kayit?.surum);
      const no = govde.kapsamTuru === 'kart' && !kapsamSabit ? kartNoKoddan(kartlar, govde.kapsam) : null;
      try { return await kuralKaydet(no === null ? govde : { ...govde, kapsam: String(no) }); } finally { await tazele(); }
    },
    basarili: () => { bildir('tamam', 'Kural kaydedildi'); kapat(); },
    hataIletisi: 'Kural kaydedilemedi.',
  });
  const d = form.degerler;
  const sil = () => {
    if (!kayit) return;
    kaldir.mutate({ id: kayit.id, surum: kayit.surum }, {
      onSuccess: () => { bildir('tamam', 'Kural kaldırıldı'); kapat(); },
      onError: (e) => { bildir('hata', hataIletisi(e, 'Kural kaldırılamadı')); silAcikYaz(false); },
    });
  };
  return (
    <FormPenceresi acik kapat={kapat} baslik={kayit ? 'Kuralı düzenle' : 'Kural ekle'} form={form}>
      <div className="tc-alt-form">
        <Secim
          etiket="Kapsam" secenekler={KAPSAMLAR} value={d.kapsamTuru} disabled={kapsamSabit}
          onChange={(e) => form.degistir({ kapsamTuru: e.target.value })}
        />
        {kapsamSabit
          ? <Girdi etiket="Uygulandığı yer" readOnly value={d.kapsamTuru === 'kart' ? kartKoduNodan(kartlar, d.kapsam) : d.kapsam} />
          : <Girdi etiket="Uygulandığı yer" ipucu={KAPSAM_IPUCU[d.kapsamTuru as KapsamTuru]} list={liste} autoComplete="off" {...form.alan('kapsam')} />}
        <datalist id={liste}>{oneriler[d.kapsamTuru as KapsamTuru].map((o) => <option key={o} value={o} />)}</datalist>
        <Secim etiket="Ölçü payı" secenekler={PAYLAR} {...form.alan('payTuru')} />
        {(d.payTuru === 'mm' || d.payTuru === 'yuzde') && (
          <Girdi etiket={d.payTuru === 'mm' ? 'Pay (mm)' : 'Pay (%)'} inputMode="decimal" {...form.alan('payDeger')} hata={form.hata('payDeger')} />
        )}
        {d.payTuru === 'yuzde' && <Girdi etiket="En az (mm)" inputMode="decimal" {...form.alan('payEnAzMm')} />}
        <Secim etiket="Kalite" secenekler={uc('Muadil kalite kabul', 'Yalnız aynı kalite')} {...form.alan('kaliteAcik')} />
        <Secim etiket="Durum" secenekler={uc('Muadil durum kabul', 'Yalnız aynı durum')} {...form.alan('durumAcik')} />
        <Secim etiket="Şartlı muadil" secenekler={uc('Kabul (onayla)', 'Kabul edilmez')} {...form.alan('sartliAcik')} />
        <Secim etiket="Boy" secenekler={uc('Uzun boy kesilir', 'Yalnız aynı boy')} {...form.alan('boyUzunKesilir')} />
        <Secim etiket="Yüzey" secenekler={uc('Serbest', 'Aynı yüzey')} {...form.alan('yuzeySerbest')} />
        <Secim etiket="Alternatif" secenekler={uc('Alternatif kapalı', 'Alternatif açık')} {...form.alan('kapali')} />
        <CokSatir etiket="Gerekçe" ipucu="Kapatırken zorunlu" {...form.alan('gerekce')} />
        {kayit && <Dugme tur="tehlike" simge="trash" onClick={() => silAcikYaz(true)}>Kuralı kaldır</Dugme>}
      </div>
      <OnayPenceresi acik={silAcik} baslik="Kuralı kaldır" onayMetni="Kaldır" tehlikeli yukleniyor={kaldir.isPending} onayla={sil} vazgec={() => silAcikYaz(false)}>
        <p>Bu kapsamdaki kartlar üst kapsamın ya da varsayılanın sınırlarına döner.</p>
      </OnayPenceresi>
    </FormPenceresi>
  );
}

export interface MuadilAcilisi { t: MuadilTablosu; kayit: { deger: string; muadil: string; tur: MuadilTuru; notu: string | null; surum: number } | null }
interface MuadilFormu { deger: string; muadil: string; tur: string; notu: string }
const TURLER: readonly Secenek[] = [
  { deger: 'tam', baslik: 'Tam muadil (doğrudan)' }, { deger: 'ust', baslik: 'Üst muadil (genelde pahalı)' }, { deger: 'sartli', baslik: 'Şartlı (onay ister)' },
];

export function MuadilPenceresi({ acilis: { t, kayit }, kapat }: { acilis: MuadilAcilisi; kapat: () => void }) {
  const tazele = useAlternatifTazele();
  const { bildir } = useBildirim();
  const ad = t === 'kalite' ? 'Kalite' : 'Durum';
  const form = useForm<MuadilFormu>({
    ilk: { deger: kayit?.deger ?? '', muadil: kayit?.muadil ?? '', tur: kayit?.tur ?? 'tam', notu: kayit?.notu ?? '' },
    dogrula: (d) => ({
      ...(d.deger.trim() === '' ? { deger: `${ad} yazın.` } : {}),
      ...(d.muadil.trim() === '' ? { muadil: 'Muadili yazın.' } : {}),
    }),
    kaydet: async (d) => {
      try {
        return await muadilKaydet(t, {
          deger: d.deger.trim(), muadil: d.muadil.trim(), tur: d.tur as MuadilTuru, notu: metin(d.notu), ...(kayit ? { surum: kayit.surum } : {}),
        });
      } finally { await tazele(); }
    },
    basarili: () => { bildir('tamam', 'Muadil kaydedildi'); kapat(); },
    hataIletisi: 'Muadil kaydedilemedi.',
    alanEsle: (alan) => (alan === t ? 'deger' : alan),
  });
  return (
    <FormPenceresi acik kapat={kapat} baslik={kayit ? `${ad} muadilini düzenle` : `${ad} muadili ekle`} form={form}>
      <div className="tc-alt-form">
        <Girdi etiket={ad} readOnly={kayit !== null} {...form.alan('deger')} />
        <Girdi etiket="Yerine kullanılabilir" readOnly={kayit !== null} {...form.alan('muadil')} />
        <Secim etiket="Tür" secenekler={TURLER} {...form.alan('tur')} />
        <CokSatir etiket="Not" {...form.alan('notu')} />
      </div>
    </FormPenceresi>
  );
}
