import { useId, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { KalemSatiri, MaliyetKalemi, MaliyetOzeti, TabanAlGovdesi } from '#paylasilan/sozlesme/proje-maliyet.ts';
import { CokSatir, Dugme, Kart, Pencere, SayiKarti, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi, yenidenDenenebilirMi } from '../../ortak/veri/istek-kimligi.ts';
import { tarihSaatMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';

export const KALEM_ADI: Record<MaliyetKalemi, string> = {
  malzeme: 'Malzeme', isleme: 'İşleme', ayar: 'Ayar', fason: 'Fason', iscilik: 'İşçilik ve mesai', genel_gider: 'Genel gider', finansman: 'Bekleme finansmanı',
};
export const tl = (x: number | null): string => (x === null ? '—' : `${x.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} TL`);

// Tekrar korumalı komutun kimliği pencere açıkken korunur: sonucu bilinmeyen gönderim aynı kimlikle yinelenir, sunucunun
// reddettiği gönderimden sonra yenilenir (düzeltilmiş gövde eski kimliğin ret cevabına takılmaz).
export function useIstekKimligi() {
  const kimlik = useRef<string | null>(null);
  return {
    al: () => (kimlik.current ??= yeniIstekKimligi()),
    hataSonrasi: (hata: unknown) => { if (!yenidenDenenebilirMi(hata)) kimlik.current = null; },
  };
}

interface KarsilastirmaSatiri { kalem: MaliyetKalemi; taban: number | null; guncel: number | null; gerceklesen: number | null }

const SUTUNLAR: Sutun<KarsilastirmaSatiri>[] = [
  { anahtar: 'kalem', baslik: 'Kalem', hucre: (k) => KALEM_ADI[k.kalem] },
  { anahtar: 'taban', baslik: 'Taban plan', hizala: 'sag', mono: true, kirilmaz: true, hucre: (k) => tl(k.taban) },
  { anahtar: 'guncel', baslik: 'Güncel plan', hizala: 'sag', mono: true, kirilmaz: true, hucre: (k) => tl(k.guncel) },
  { anahtar: 'gerceklesen', baslik: 'Gerçekleşen', hizala: 'sag', mono: true, kirilmaz: true, hucre: (k) => tl(k.gerceklesen) },
];

const isaretli = (x: number | null): string => (x === null ? '—' : `${x > 0 ? '+' : ''}${tl(x)}`);

// 934, 936 a: ilk planlanan maliyet (taban), son gerçekleşen ve ikisinin farkı. Taban elle alınır; yenileme gerekçe ister.
export function MaliyetTabani({ projeId, ozet, kalemler, yazabilir }: {
  projeId: number; ozet: MaliyetOzeti; kalemler: readonly KalemSatiri[]; yazabilir: boolean;
}) {
  const [pencere, pencereYaz] = useState(false);
  const { taban } = ozet;
  const satirlar: KarsilastirmaSatiri[] = kalemler.map((k) => ({
    kalem: k.kalem, taban: taban?.kalemler.find((t) => t.kalem === k.kalem)?.plan ?? null, guncel: k.plan, gerceklesen: k.gerceklesen,
  }));
  return (
    <Kart
      baslik="Taban ve fark"
      simge="flag"
      sag={yazabilir && (
        <Dugme tur={taban === null ? 'birincil' : 'ikincil'} simge="flag" onClick={() => { pencereYaz(true); }}>
          {taban === null ? 'Taban al' : 'Tabanı yenile'}
        </Dugme>
      )}
    >
      <div className="tc-pm">
        <div className="tc-pm-kartlar">
          <SayiKarti
            baslik="Taban plan" simge="flag" metin={taban === null ? 'Alınmadı' : tl(taban.plan)}
            altMetin={taban === null ? 'İlk planlanan maliyet henüz kaydedilmedi' : `${taban.sira}. taban · ${tarihSaatMetni(taban.an)} · ${taban.kisiAd ?? '—'}`}
          />
          <SayiKarti
            baslik="Son gerçekleşen" simge="chart" metin={tl(ozet.sonGerceklesen)}
            altMetin={ozet.masraflar.length === 0 ? 'Bağlı üretim dışı masraf yok' : `Üretim dışı masraf dahil: ${tl(ozet.masrafToplami)}`}
          />
          <SayiKarti
            baslik="Fark (tahmini son - taban)" simge="gauge" metin={isaretli(ozet.fark)}
            altMetin={`Tahmini son ${tl(ozet.tahminiSon)} (gerçekleşen + kalan plan)`}
            ton={ozet.fark !== null && ozet.fark > 0 ? 'uyari' : 'bilgi'}
          />
        </div>
        {taban !== null && taban.eksikKalemler.length > 0 && (
          <p className="tc-pm-uyari">Taban alınırken toplama girmeyen kalemler: {taban.eksikKalemler.map((k) => KALEM_ADI[k]).join(', ')}.</p>
        )}
        <Tablo etiket="Taban ve güncel plan" sutunlar={SUTUNLAR} satirlar={satirlar} satirAnahtari={(k) => k.kalem} />
        {ozet.tabanGecmisi.length > 0 && (
          <ul className="tc-pm-gecmis" aria-label="Önceki tabanlar">
            {ozet.tabanGecmisi.map((t) => (
              <li key={t.sira}>
                <span className="mono">{t.sira}. taban {tl(t.plan)}</span>
                <span className="tc-pm-risk-etiket">{tarihSaatMetni(t.an)} · {t.kisiAd ?? '—'}{t.gerekce === null ? '' : ` · ${t.gerekce}`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {pencere && <TabanPenceresi projeId={projeId} yenileme={taban !== null} kapat={() => { pencereYaz(false); }} />}
    </Kart>
  );
}

function TabanPenceresi({ projeId, yenileme, kapat }: { projeId: number; yenileme: boolean; kapat: () => void }) {
  const kimlik = useId();
  const istemci = useQueryClient();
  const istek = useIstekKimligi();
  const [gerekce, gerekceYaz] = useState('');
  const [hata, hataYaz] = useState<string | undefined>(undefined);
  const komut = useMutation({
    mutationFn: (govde: TabanAlGovdesi) => api.post(`/proje-maliyet/${projeId}/taban`, govde, { istekKimligi: istek.al() }),
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.maliyet(projeId) });
      kapat();
    },
    onError: istek.hataSonrasi,
  });
  const ilet = (o: FormEvent) => {
    o.preventDefault();
    if (yenileme && gerekce.trim() === '') { hataYaz('Taban yenileniyor: gerekçe zorunlu.'); return; }
    komut.mutate({ gerekce: yenileme ? gerekce.trim() : null });
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={yenileme ? 'Tabanı yenile' : 'Taban al'}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending}>{yenileme ? 'Yenile' : 'Taban al'}</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        <p className="tc-form-tam">
          Projenin bugünkü plan maliyeti kalem kalem kaydedilir; fark bundan sonra bu tabana göre gösterilir.
          {yenileme && ' Önceki taban geçmişte kalır.'}
        </p>
        {yenileme && (
          <div className="tc-form-tam">
            <CokSatir
              etiket="Gerekçe" required value={gerekce} maxLength={500} hata={hata}
              onChange={(e) => { gerekceYaz(e.target.value); hataYaz(undefined); }}
            />
          </div>
        )}
        {komut.isError && <p className="tc-form-tam tc-pm-hata" role="alert">{hataIletisi(komut.error, 'Taban kaydedilemedi')}</p>}
      </form>
    </Pencere>
  );
}
