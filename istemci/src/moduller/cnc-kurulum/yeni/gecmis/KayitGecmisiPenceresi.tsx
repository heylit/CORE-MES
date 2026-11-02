import { useEffect, useState } from 'react';
import type { KayitGecmisiCevabi, KayitGecmisiSatiri } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { DurumKutusu, Pencere, Rozet, Secim, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { tarihSaatMetni } from '../../../../ortak/veri/zaman-metni.ts';
import { DURUM_ANAHTARI } from '../durum.ts';
import { EMIR, SECIM } from '../veri.ts';

// Sözleşmedeki IS_EMRI_ONEKI ile aynı (istemci sözleşmeyi değer olarak ithal etmez).
const IS_EMRI_ONEKI = `${EMIR}.is-emri.`;

// Kayıt geçmişi (CNC-7 a): kim neyi ne zaman değiştirdi. Salt okunur; değer sunucudan gelmez, yalnız değişen üst alanlar.

export function anahtarAdi(anahtar: string): string {
  if (anahtar === DURUM_ANAHTARI) return 'Kurulum durumu';
  if (anahtar === SECIM) return 'Adım seçimleri';
  if (anahtar === EMIR) return 'Seçili iş emri';
  if (anahtar.startsWith(IS_EMRI_ONEKI)) return `İş emri ${anahtar.slice(IS_EMRI_ONEKI.length)} kurulumu`;
  return anahtar;
}

const kisiAdi = (k: { id: number; ad: string | null } | null): string => (k === null ? '—' : k.ad ?? `Kişi ${String(k.id)}`);

const SUTUNLAR: readonly Sutun<KayitGecmisiSatiri>[] = [
  { anahtar: 'surum', baslik: 'Sürüm', hucre: (s) => s.surum, hizala: 'sag', mono: true },
  { anahtar: 'yazan', baslik: 'Yazan', hucre: (s) => `${kisiAdi(s.yazan)} · ${tarihSaatMetni(s.yazildi)}`, csv: (s) => kisiAdi(s.yazan) },
  {
    anahtar: 'degistiren', baslik: 'Yerine yazan',
    hucre: (s) => (s.silindi ? <Rozet ton="hata">Silindi</Rozet> : kisiAdi(s.degistiren)),
    csv: (s) => (s.silindi ? 'Silindi' : kisiAdi(s.degistiren)),
  },
  { anahtar: 'degisti', baslik: 'Değişti', hucre: (s) => tarihSaatMetni(s.degisti), kirilmaz: true },
  {
    anahtar: 'alanlar', baslik: 'Değişen alanlar', mono: true,
    hucre: (s) => (s.alanlar === null ? '—' : s.alanlar.length === 0 ? 'yok' : s.alanlar.join(', ')),
  },
];

export function KayitGecmisiPenceresi({ kapat }: { kapat: () => void }) {
  const [anahtar, anahtarYaz] = useState(DURUM_ANAHTARI);
  const [cevap, cevapYaz] = useState<KayitGecmisiCevabi | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const [deneme, denemeYaz] = useState(0);

  useEffect(() => {
    let bitti = false;
    hataYaz(null);
    api.get<KayitGecmisiCevabi>(`/cnc-kurulum/kayitlar/gecmis?anahtar=${encodeURIComponent(anahtar)}`).then(
      (c) => { if (!bitti) cevapYaz(c); },
      (e: unknown) => { if (!bitti) hataYaz(hataIletisi(e, 'Kayıt geçmişi okunamadı.')); },
    );
    return () => { bitti = true; };
  }, [anahtar, deneme]);

  const guncel = cevap?.anahtar === anahtar ? cevap : null;
  const secenekler = [...new Set([DURUM_ANAHTARI, anahtar, ...(cevap?.anahtarlar.map((a) => a.anahtar) ?? [])])]
    .map((a) => ({ deger: a, baslik: anahtarAdi(a) }));

  return (
    <Pencere acik kapat={kapat} baslik="Kayıt geçmişi" tur="yan">
      <Secim etiket="Kayıt" value={anahtar} secenekler={secenekler} onChange={(e) => { anahtarYaz(e.target.value); }} />
      {hata !== null ? (
        <DurumKutusu durum="hata" mesaj={hata} yenile={() => { denemeYaz((d) => d + 1); }} />
      ) : guncel === null ? (
        <DurumKutusu durum="yukleniyor" />
      ) : (
        <>
          <p role="note">
            {guncel.guncel === null
              ? 'Bu kayıt şu an yok (hiç yazılmadı ya da silindi).'
              : `Güncel sürüm ${String(guncel.guncel.surum)} · ${kisiAdi(guncel.guncel.yazan)} · ${tarihSaatMetni(guncel.guncel.yazildi)}`}
          </p>
          <Tablo
            etiket="Önceki sürümler"
            sutunlar={SUTUNLAR}
            satirlar={guncel.satirlar}
            satirAnahtari={(s) => `${String(s.surum)}-${s.degisti}`}
            bosMesaj="Bu kaydın önceki sürümü yok."
          />
        </>
      )}
    </Pencere>
  );
}
