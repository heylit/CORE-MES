import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { islemAdi } from '#paylasilan/islem-adlari.ts';
import type { BildirimAliciSatiri, BildirimAlicilariCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { AramaliSecim, Dugme, DurumKutusu, Kart, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { modulAdi } from '../bildirim/disari.ts';
import { MATRIS_ANAHTARI } from './BildirimMatrisi.tsx';
import './eposta.css';

// 3456 d: olay x rol alıcı matrisi. Kutucuk anında bugünkü alıcı ucuna, satırın okunan sürümüyle yazılır; kişiler korunur.
// Rol seçmek yetki vermez, yalnız alıcıyı seçer. `ayarlar.yaz` ister (alıcı ucu gibi). 3594: kişiler de burada eklenir ve çıkarılır;
// son yazımın Geri al'ı satırda kalır (kısa ömürlü bildirim yerine), klavye ve ekran okuyucu da yetişir.
const varsayilanMetni = (a: BildirimAliciSatiri): string =>
  (a.varsayilanIslemler.length === 0 ? 'Kayda bağlı kişi' : `Yetkisi olanlar (${a.varsayilanIslemler.map(islemAdi).join(', ')})`);

export function KimAlir() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const d = useQuery({ queryKey: MATRIS_ANAHTARI.alicilar, queryFn: () => api.get<BildirimAlicilariCevabi>('/bildirimler/alicilar') });
  const [arama, setArama] = useState('');
  const [bekleyen, setBekleyen] = useState<string | null>(null);
  const [son, setSon] = useState<{ tur: string; metin: string; geri: { rolIdleri: number[]; kisiIdleri: number[] } | null } | null>(null);

  if (d.isPending) return <Kart baslik="Kim alır"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (d.isError) {
    return <Kart baslik="Kim alır"><DurumKutusu durum="hata" mesaj={hataIletisi(d.error, 'Alıcılar alınamadı.')} yenile={() => { void d.refetch(); }} /></Kart>;
  }
  const { roller } = d.data;
  const aranan = arama.trim().toLocaleLowerCase('tr');
  const satirlar = d.data.satirlar.filter((s) => aranan === '' || s.baslik.toLocaleLowerCase('tr').includes(aranan));

  const yaz = async (tur: string, secim: { rolIdleri?: number[]; kisiIdleri?: number[] }, ozet: string, geriAlinabilir: boolean): Promise<void> => {
    const guncel = istemci.getQueryData<BildirimAlicilariCevabi>(MATRIS_ANAHTARI.alicilar)?.satirlar.find((s) => s.tur === tur);
    if (!guncel) return;
    const eski = { rolIdleri: guncel.rolIdleri, kisiIdleri: guncel.kisiIdleri };
    const yeniSecim = (secim.rolIdleri ?? guncel.rolIdleri).length + (secim.kisiIdleri ?? guncel.kisiIdleri).length;
    // BIL-10: ilk seçim varsayılanın yerine geçer; anında yazıldığı için sonuç satırda söylenir.
    const ilk = eski.rolIdleri.length + eski.kisiIdleri.length === 0 && yeniSecim > 0 && guncel.varsayilanIslemler.length > 0;
    const metin = ilk ? `${ozet} ${guncel.varsayilanIslemler.map(islemAdi).join(', ')} yetkisi olanlar bu bildirimi artık almaz.` : ozet;
    setBekleyen(tur);
    try {
      await api.post(`/bildirimler/alicilar/${tur}/degistir`, {
        rolIdleri: secim.rolIdleri ?? guncel.rolIdleri, kisiIdleri: secim.kisiIdleri ?? guncel.kisiIdleri, surum: guncel.surum,
      });
      await istemci.invalidateQueries({ queryKey: MATRIS_ANAHTARI.alicilar });
      setSon({ tur, metin, geri: geriAlinabilir ? eski : null });
    } catch (h) {
      bildir('hata', hataIletisi(h, 'Alıcı kaydedilemedi.'));
      void istemci.invalidateQueries({ queryKey: MATRIS_ANAHTARI.alicilar });
    } finally {
      setBekleyen(null);
    }
  };
  const kisiAdi = new Map(d.data.kisiler.map((k) => [k.id, k.ad]));
  const adi = (id: number) => kisiAdi.get(id) ?? `Kişi ${String(id)}`;

  const sutunlar: Sutun<BildirimAliciSatiri>[] = [
    { anahtar: 'olay', baslik: 'Olay', sabit: 'sol', csv: (s) => s.baslik, hucre: (s) => s.baslik },
    ...roller.map((r): Sutun<BildirimAliciSatiri> => ({
      anahtar: `rol-${String(r.id)}`, baslik: r.ad, csv: (s) => (s.rolIdleri.includes(r.id) ? 'Evet' : ''),
      hucre: (s) => (
        <input
          type="checkbox" className="tc-kim-alir-kutu" aria-label={`${s.baslik}: ${r.ad}`} checked={s.rolIdleri.includes(r.id)}
          // Yazım sürerken odak kutuda kalır (disabled odağı düşürür); ikinci basış yok sayılır.
          aria-disabled={bekleyen === s.tur}
          onChange={(o) => {
            if (bekleyen === s.tur) return;
            const secili = o.target.checked;
            const yeni = secili ? [...s.rolIdleri, r.id].sort((x, y) => x - y) : s.rolIdleri.filter((x) => x !== r.id);
            void yaz(s.tur, { rolIdleri: yeni }, `${r.ad} ${secili ? 'eklendi' : 'çıkarıldı'}.`, true);
          }}
        />
      ),
    })),
    {
      anahtar: 'kisiler', baslik: 'Kişiler', kartTamSatir: true,
      csv: (s) => [...s.kisiIdleri.map(adi), ...(s.rolIdleri.length + s.kisiIdleri.length === 0 ? [`${varsayilanMetni(s)} (varsayılan)`] : [])].join(', '),
      hucre: (s) => {
        const eklenebilir = d.data.kisiler.filter((k) => !s.kisiIdleri.includes(k.id));
        const sonu = son?.tur === s.tur ? son : null;
        return (
          <div className="tc-kim-alir-kisiler">
            {s.rolIdleri.length + s.kisiIdleri.length === 0 && <span className="tc-matris-varsayilan">{`${varsayilanMetni(s)} (varsayılan)`}</span>}
            <ul className="tc-alici-kisiler" aria-label={`${s.baslik}: alıcı kişiler`}>
              {s.kisiIdleri.map((id) => (
                <li key={id}>
                  <Dugme
                    simge="x" aria-label={`${s.baslik}: ${adi(id)} çıkar`} aria-disabled={bekleyen === s.tur}
                    onClick={(o) => {
                      if (bekleyen === s.tur) return;
                      // Çıkarılan çip kaybolur; odak aynı satırın "Kişi ekle"sine geçer, klavye kullanıcısı yerini kaybetmez.
                      const satirKutusu = o.currentTarget.closest('.tc-kim-alir-kisiler');
                      void yaz(s.tur, { kisiIdleri: s.kisiIdleri.filter((x) => x !== id) }, `${adi(id)} çıkarıldı.`, true)
                        .then(() => { satirKutusu?.querySelector<HTMLElement>('[aria-haspopup="listbox"]')?.focus(); });
                    }}
                  >
                    {adi(id)}
                  </Dugme>
                </li>
              ))}
            </ul>
            <AramaliSecim
              etiket={`${s.baslik}: kişi ekle`} deger="" yerTutucu={eklenebilir.length === 0 ? 'Bütün kişiler eklendi' : 'Kişi ekle'} disabled={eklenebilir.length === 0}
              secenekler={eklenebilir.map((k) => ({ deger: String(k.id), baslik: k.ad }))}
              sec={(v) => {
                if (bekleyen === s.tur) return;
                const id = Number(v);
                if (id > 0) void yaz(s.tur, { kisiIdleri: [...s.kisiIdleri, id].sort((x, y) => x - y) }, `${adi(id)} eklendi.`, true);
              }}
            />
            {/* Canlı bölge her satırda hep durur, metin yazımdan sonra dolar. */}
            <span className="tc-kim-alir-son" aria-live="polite">
              {sonu?.metin}
              {sonu?.geri && (
                <Dugme onClick={() => { const g = sonu.geri; if (g) void yaz(s.tur, g, 'Geri alındı.', false); }}>Geri al</Dugme>
              )}
            </span>
          </div>
        );
      },
    },
  ];

  return (
    <Kart baslik="Kim alır">
      <p className="tc-ayar-aciklama">
        Kutucuk basınca hemen kaydedilir. Rol seçmek yetki vermez, yalnız bildirimin kime gideceğini seçer; kayda bağlı kişi (ör. görevi atanan) her durumda alır.
        Yalnız seçilenler alır; hiç seçim yoksa olay varsayılan alıcıya gider.
      </p>
      <Tablo
        etiket="Kim alır"
        kip="kaydir"
        sutunlar={sutunlar}
        satirlar={satirlar}
        satirAnahtari={(s) => s.tur}
        bosMesaj="Bu aramaya uyan olay yok."
        grup={{ yol: (s) => [s.kaynakModul], baslik: (yol) => modulAdi(yol[0] ?? '') }}
        arac={{ arama: { deger: arama, degistir: setArama, etiket: 'Olay ara' }, csv: { ad: 'kim-alir' } }}
      />
      {roller.length === 0 && <p className="tc-ayar-aciklama">Tanımlı rol yok.</p>}
    </Kart>
  );
}
