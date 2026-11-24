import { useEffect, useState } from 'react';
import type { GunlukDuzeyi } from '#paylasilan/sozlesme/saglik.ts';
import { Dugme, DurumKutusu, Girdi, Rozet, Secim, Simge } from '../../ortak/arayuz/index.ts';
import { GUNLUK_DUZEY_BILGISI, yerelSaat, type GunlukSuzgeci } from './kapanma-yorumu.ts';
import { useGunluk } from './kapanma-sorgusu.ts';

const DUZEYLER = (Object.keys(GUNLUK_DUZEY_BILGISI) as GunlukDuzeyi[]).map((d) => ({ deger: d, baslik: d === 'bilgi' ? 'Bilgi ve üstü' : `${GUNLUK_DUZEY_BILGISI[d].ad} ve üstü` }));
const YOK = '—';
const SAAT_DESENI = /^([01]\d|2[0-3]):[0-5]\d$/;
const saatHatasi = (d: string | undefined): string | undefined => (d === undefined || d === '' || SAAT_DESENI.test(d) ? undefined : 'Saat SS:DD biçiminde yazılır (örnek 14:30).');
const gunMetni = (g: string): string => g.split('-').reverse().join('.');

function DuzeyRozeti({ duzey }: { duzey: GunlukDuzeyi }) {
  const b = GUNLUK_DUZEY_BILGISI[duzey];
  return <Rozet ton={b.ton}><Simge ad={b.simge} boyut="k" /> {b.ad.toLocaleUpperCase('tr-TR')}</Rozet>;
}

export function GunlukSekmesi({ suzgec, uygula }: { suzgec: Partial<GunlukSuzgeci>; uygula: (s: Partial<GunlukSuzgeci>) => void }) {
  const [taslak, taslakYaz] = useState<Partial<GunlukSuzgeci>>(suzgec);
  // Adres dışarıdan değişince (kapanmadan "Günlükte bu saati aç", geri/ileri) form da o süzgeci gösterir.
  useEffect(() => { taslakYaz(suzgec); }, [suzgec]);
  const sorgu = useGunluk(suzgec);
  const sayfalar = sorgu.data?.pages ?? [];
  const satirlar = sayfalar.flatMap((s) => s.satirlar);
  const gunler = sayfalar[0]?.gunler ?? [];
  const degistir = (alan: keyof GunlukSuzgeci, deger: string) => { taslakYaz((o) => ({ ...o, [alan]: deger })); };
  const dosyaMetni = gunler.length === 0 ? '' : (suzgec.gun === undefined || suzgec.gun === '' ? 'Bugünkü ve önceki günün günlüğü' : `${gunMetni(suzgec.gun)} günlüğü`);

  return (
    <div className="tc-izleme-gunluk">
      <form className="tc-izleme-suzgec" onSubmit={(o) => { o.preventDefault(); if (saatHatasi(taslak.baslangic) !== undefined || saatHatasi(taslak.bitis) !== undefined) return; uygula(taslak); }}>
        <Secim etiket="Gün" value={taslak.gun ?? ''} onChange={(o) => { degistir('gun', o.target.value); }}
          bosSecenek="Bugün ve önceki" secenekler={gunler.map((g) => ({ deger: g, baslik: gunMetni(g) }))} />
        <Girdi etiket="Başlangıç saati" type="text" inputMode="numeric" autoComplete="off" maxLength={5} placeholder="SS:DD" hata={saatHatasi(taslak.baslangic)} value={taslak.baslangic ?? ''} disabled={(taslak.gun ?? '') === ''} onChange={(o) => { degistir('baslangic', o.target.value); }} />
        <Girdi etiket="Bitiş saati" type="text" inputMode="numeric" autoComplete="off" maxLength={5} placeholder="SS:DD" hata={saatHatasi(taslak.bitis)} value={taslak.bitis ?? ''} disabled={(taslak.gun ?? '') === ''} onChange={(o) => { degistir('bitis', o.target.value); }} />
        <Secim etiket="Düzey" value={taslak.duzey ?? 'hata'} onChange={(o) => { degistir('duzey', o.target.value); }} secenekler={DUZEYLER} />
        <Girdi etiket="Uç" value={taslak.uc ?? ''} maxLength={200} onChange={(o) => { degistir('uc', o.target.value); }} />
        <Girdi etiket="Kişi no" inputMode="numeric" pattern="[0-9]*" value={taslak.kisi ?? ''} onChange={(o) => { degistir('kisi', o.target.value); }} />
        <Girdi etiket="Hata kodu" maxLength={8} value={taslak.hata ?? ''} onChange={(o) => { degistir('hata', o.target.value); }} />
        <Dugme type="submit" simge="search" boyut="ana">Ara</Dugme>
      </form>
      {(taslak.gun ?? '') === '' && <p className="tc-sistem-soluk">Saat aralığı için önce gün seçin.</p>}
      <p className="tc-sistem-soluk">Günlük ekrandan okunur, kopya tutulmaz. Dosyalar 60 gün saklanır.</p>

      {sorgu.isPending && <DurumKutusu durum="yukleniyor" />}
      {sorgu.isError && <DurumKutusu durum="hata" hata={sorgu.error} mesaj="Günlük dosyası okunamadı" yenile={() => { void sorgu.refetch(); }} />}
      {sorgu.isSuccess && gunler.length === 0 && <DurumKutusu durum="bos" mesaj="Günlük dosyası bulunamadı (günlük kapalı ya da klasör boş)" />}
      {sorgu.isSuccess && gunler.length > 0 && satirlar.length === 0 && !sorgu.hasNextPage && (
        <DurumKutusu durum="bos" mesaj="Bu süzgeçle satır bulunamadı. Düzeyi düşürün ya da saat aralığını genişletin." />
      )}
      {satirlar.length > 0 && (
        <>
          <p role="status"><strong>{satirlar.length} satır bulundu</strong>{sorgu.hasNextPage ? ' (daha eskileri var)' : ''} · {dosyaMetni}</p>
          <table className="tc-izleme-tablo">
            <thead><tr><th>Saat</th><th>Düzey</th><th>Uç</th><th>Kişi</th><th>Kod</th><th>İleti</th></tr></thead>
            <tbody>
              {satirlar.map((s, n) => (
                <tr key={`${s.zaman}-${String(n)}`}>
                  <td className="tc-izleme-mono">{yerelSaat(s.zaman)}</td>
                  <td><DuzeyRozeti duzey={s.duzey} /></td>
                  <td>{s.uc === null ? YOK : `${s.yontem ?? ''} ${s.uc}`.trim()}</td>
                  <td>{s.kisiId ?? YOK}</td>
                  <td className="tc-izleme-mono">{s.hataKodu ?? YOK}</td>
                  <td>{s.ileti}{s.hata === null ? '' : ` — ${s.hata}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="tc-izleme-gunluk-kartlari" aria-label="Günlük satırları">
            {satirlar.map((s, n) => (
              <li key={`${s.zaman}-${String(n)}`}>
                <span className="tc-izleme-mono"><strong>{yerelSaat(s.zaman)}</strong> · <DuzeyRozeti duzey={s.duzey} />{s.hataKodu === null ? '' : ` · kod ${s.hataKodu}`}</span>
                {s.uc !== null && <span>{s.yontem} {s.uc}{s.kisiId === null ? '' : ` · kişi ${String(s.kisiId)}`}</span>}
                <span>{s.ileti}{s.hata === null ? '' : ` — ${s.hata}`}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {sorgu.hasNextPage && <Dugme tur="ikincil" yukleniyor={sorgu.isFetchingNextPage} onClick={() => { void sorgu.fetchNextPage(); }}>Daha eski 500 satır</Dugme>}
    </div>
  );
}
