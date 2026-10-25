import { useState } from 'react';
import { FormPenceresi, Girdi, Pencere, Secim, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { useMesaj, type FormOzellikleri } from '../durum.tsx';
import type { Kayit, Kanal, Kural } from '../tipler.ts';
import {
  KURAL_TURLERI, kuralParametresi, kuralTuruMu, parametreleriAyikla, type KuralTuru,
} from '../otomasyon/kurallar.ts';

// Prototip `openRuleForm`: yeni uyarıda önce tür seçilir, sonra kanal ve türün parametreleri.
export function KuralFormu({ istek, kapat }: FormOzellikleri<'kural'>) {
  const m = useMesaj();
  const kayit = istek.duzenle === undefined ? undefined : m.veri.kurallar.find((r) => r.id === istek.duzenle);
  const [tur, turYaz] = useState<KuralTuru | null>(kayit && kuralTuruMu(kayit.type) ? kayit.type : null);

  if (istek.duzenle !== undefined && !kayit) {
    return <Pencere acik kapat={kapat} baslik="Otomatik uyarı"><p>Bu uyarı artık yok.</p></Pencere>;
  }
  if (tur === null) {
    // Sipariş özeti oluşma zamanı ve üretim notu taşımadığı için değerlendirilemeyen türler yeni uyarıda sunulmaz.
    const turler = (Object.entries(KURAL_TURLERI) as [KuralTuru, (typeof KURAL_TURLERI)[KuralTuru]][]).filter(([, t]) => t.calisir);
    return (
      <Pencere acik kapat={kapat} baslik="Otomatik uyarı ekle" tur="yan">
        <p className="tc-mb-ipucu">Bir olay gerçekleşince Mesai seçtiğin kanala kendiliğinden mesaj atar.</p>
        <ul className="tc-mb-liste">
          {turler.map(([k, t]) => (
            <li key={k}>
              <button type="button" className="tc-mb-tur" onClick={() => turYaz(k)}>
                <span className="tc-mb-oge-simge"><Simge ad={t.simge} /></span>
                <span className="tc-mb-oge-govde">
                  <span className="tc-mb-ad">{t.baslik}</span>
                  <span className="tc-mb-ipucu">{t.aciklama}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Pencere>
    );
  }
  return <KuralAyarlari tur={tur} kayit={kayit} kanallar={m.veri.kanallar} kapat={kapat} />;
}

function varsayilanKanal(kanallar: readonly Kayit<Kanal>[]): string {
  return (kanallar.find((c) => c.id === 'uretim') ?? kanallar.find((c) => c.id === 'genel') ?? kanallar[0])?.id ?? '';
}

function KuralAyarlari({ tur, kayit, kanallar, kapat }: {
  tur: KuralTuru;
  kayit: Kayit<Kural> | undefined;
  kanallar: readonly Kayit<Kanal>[];
  kapat: () => void;
}) {
  const m = useMesaj();
  const { bildir } = useBildirim();
  const tanim = KURAL_TURLERI[tur];
  const parametreAdlari = Object.keys(tanim.parametreler);
  const ilkParametreler = Object.fromEntries(parametreAdlari.map((ad) => [ad, String(kuralParametresi(kayit ?? { type: tur }, ad))]));

  const form = useForm<{ kanal: string; parametreler: Record<string, string> }>({
    ilk: { kanal: kayit?.cid ?? varsayilanKanal(kanallar), parametreler: ilkParametreler },
    dogrula: (d): Record<string, string> => (d.kanal ? {} : { kanal: 'Kanal seç.' }),
    kaydet: async (d) => {
      const params = parametreleriAyikla(tur, d.parametreler);
      if (kayit) await m.yaz.guncelle(`kurallar/${kayit.id}`, { cid: d.kanal, params });
      else await m.yaz.ekle('kurallar', { type: tur, cid: d.kanal, params, on: true, by: m.ben.id, createdAt: Date.now() });
    },
    basarili: () => { bildir('tamam', 'Otomatik uyarı kaydedildi.'); kapat(); },
    hataIletisi: 'Otomatik uyarı kaydedilemedi.',
  });

  return (
    <FormPenceresi acik kapat={kapat} baslik={tanim.baslik} form={form} kaydetMetni={kayit ? 'Kaydet' : 'Uyarıyı aç'}>
      <p className="tc-mb-ipucu">{tanim.aciklama}</p>
      <Secim
        etiket="Hangi kanala?"
        {...form.alan('kanal')}
        bosSecenek={kanallar.length ? undefined : 'Kanal yok'}
        secenekler={kanallar.map((c) => ({ deger: c.id, baslik: `${c.emoji || '#'} ${c.name}` }))}
      />
      {parametreAdlari.map((ad) => {
        const p = tanim.parametreler[ad]!;
        return (
          <Girdi
            key={ad}
            etiket={p.etiket}
            name={ad}
            {...(typeof p.varsayilan === 'number' ? { type: 'number', min: 0, step: 1, inputMode: 'numeric' as const } : {})}
            value={form.degerler.parametreler[ad] ?? ''}
            onChange={(o) => form.degistir({ parametreler: { ...form.degerler.parametreler, [ad]: o.target.value } })}
          />
        );
      })}
    </FormPenceresi>
  );
}
