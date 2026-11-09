import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Kontrol, KontrolTuru, KontrollerCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { Dugme, DurumKutusu, Kart, Sekmeler, Simge } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KONTROL_GRUBU, KONTROL_GRUPLARI, KONTROL_TURLERI, KONTROL_TURU, tarihMetni } from './gorunum.ts';
import { KontrolKarti } from './KontrolKarti.tsx';
import { KontrolAyrinti, KontrolFormu, YapildiPenceresi } from './KontrolPencereleri.tsx';
import { useIslemVar } from './yazma.ts';
import './idari-isler.css';

type Suzgec = 'hepsi' | KontrolTuru;

// Periyodik kontroller, sözleşmeler, atık: tür süzgeci ve üç grup (süresi geçti, 30 gün içinde, daha sonra).
export function Periyodik() {
  const yazar = useIslemVar('idari-isler.kontrol-yaz');
  const [suzgec, suzgecYaz] = useState<Suzgec>('hepsi');
  const [secili, seciliYaz] = useState<Kontrol | null>(null);
  const [yapilan, yapilanYaz] = useState<Kontrol | null>(null);
  const [form, formYaz] = useState<{ kontrol: Kontrol | null } | null>(null);
  const [bitenAcik, bitenAcikYaz] = useState(false);
  const bitenler = useQuery({
    queryKey: anahtarlar.bitenKontroller,
    queryFn: () => api.get<KontrollerCevabi>('/idari-isler/kontroller/bitenler'),
    enabled: bitenAcik,
  });
  const liste = useQuery({ queryKey: anahtarlar.kontroller, queryFn: () => api.get<KontrollerCevabi>('/idari-isler/kontroller') });
  const kontroller = liste.data?.kontroller ?? [];
  const sekmeler = [
    { anahtar: 'hepsi' as Suzgec, baslik: `Hepsi ${kontroller.length}` },
    ...KONTROL_TURLERI.map((t) => ({
      anahtar: t as Suzgec, baslik: `${KONTROL_TURU[t].etiket} ${kontroller.filter((k) => k.tur === t).length}`, simge: KONTROL_TURU[t].simge,
    })),
  ];
  const gorunen = kontroller.filter((k) => suzgec === 'hepsi' || k.tur === suzgec);

  return (
    <section className="tc-ii">
      <Kart
        baslik="Periyodik kontroller, sözleşmeler, atık"
        sag={(
          <span className="tc-ii-dugmeler">
            {yazar && <Dugme tur="birincil" simge="plus" onClick={() => formYaz({ kontrol: null })}>Kalem ekle</Dugme>}
            <Dugme simge="list" aria-pressed={bitenAcik} onClick={() => bitenAcikYaz((a) => !a)}>Biten kalemler</Dugme>
            <Dugme simge="rotate" aria-label="Yenile" onClick={() => { void liste.refetch(); }} yukleniyor={liste.isFetching} />
          </span>
        )}
      >
        <Sekmeler etiket="Tür" sekmeler={sekmeler} secili={suzgec} sec={suzgecYaz} />
        {liste.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Kalemler alınamadı')} yenile={() => { void liste.refetch(); }} />
        ) : liste.isPending ? (
          <DurumKutusu durum="yukleniyor" />
        ) : (
          <div className="tc-ii-pano">
            {KONTROL_GRUPLARI.map((g) => {
              const kalemler = gorunen.filter((k) => k.grup === g);
              return (
                <section key={g} className="tc-ii-sutun" aria-label={KONTROL_GRUBU[g].etiket} data-grup={g}>
                  <h3 className="tc-ii-sutun-baslik">
                    <span className="tc-ii-satir"><Simge ad={KONTROL_GRUBU[g].simge} boyut="k" />{KONTROL_GRUBU[g].etiket}</span>
                    <span className="tc-ii-sayi mono">{kalemler.length}</span>
                  </h3>
                  {kalemler.length === 0
                    ? <p className="tc-ii-soluk">Kalem yok.</p>
                    : kalemler.map((k) => (
                      <KontrolKarti key={k.id} kontrol={k} sec={() => seciliYaz(k)} {...(yazar ? { eylem: () => yapilanYaz(k) } : {})} />
                    ))}
                </section>
              );
            })}
          </div>
        )}
        {bitenAcik && (
          <section className="tc-ii-yigin" aria-label="Biten kalemler">
            <h3 className="tc-ii-ara-baslik">Biten kalemler</h3>
            {bitenler.isError ? (
              <DurumKutusu durum="hata" mesaj={hataIletisi(bitenler.error, 'Biten kalemler alınamadı')} yenile={() => { void bitenler.refetch(); }} />
            ) : bitenler.isPending ? (
              <DurumKutusu durum="yukleniyor" />
            ) : bitenler.data.kontroller.length === 0 ? (
              <p className="tc-ii-soluk">Biten kalem yok.</p>
            ) : (
              <ul className="tc-ii-kayitlar">
                {bitenler.data.kontroller.filter((k) => suzgec === 'hepsi' || k.tur === suzgec).map((k) => (
                  <li key={k.id}>
                    <button type="button" className="tc-ii-bag" onClick={() => seciliYaz(k)}>{k.ad}</button>
                    <span className="tc-ii-soluk"> · {KONTROL_TURU[k.tur].etiket} · son tarih {tarihMetni(k.sonrakiTarih)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <p className="tc-ii-soluk">
          Kayıt tarihi ve belge no saklanır, sonraki tarih sıklıktan hesaplanır. Tezgah bakımı Üretim Hazırlık'ta, ölçü aleti kalibrasyonu Kalibrasyon'da kalır.
        </p>
      </Kart>
      <KontrolAyrinti kontrol={secili} kapat={() => seciliYaz(null)} duzenle={(k) => { seciliYaz(null); formYaz({ kontrol: k }); }} />
      <YapildiPenceresi kontrol={yapilan} kapat={() => yapilanYaz(null)} />
      <KontrolFormu acik={form !== null} kontrol={form?.kontrol ?? null} kapat={() => formYaz(null)} />
    </section>
  );
}
