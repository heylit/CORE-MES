import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HurdaNedenleriCevabi } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import type { BirimAyrintisi, BirimDurumu, BirimlerCevabi, DurumGovdesi, DurumKomutu, MarkalamaBirimi } from '#paylasilan/sozlesme/markalama.ts';
import {
  CokSatir, Dugme, DurumKutusu, Kart, KodOkuyucu, Pencere, Rozet, Secim, Tablo, useBildirim, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { BIRIM_DURUMLARI, DURUM_ADLARI, DURUM_TONLARI, GECERLI_KOMUTLAR, KOMUT_ADLARI, KOMUT_SIMGELERI, OLAY_ADLARI } from './adlar.ts';
import { anahtarlar } from './anahtarlar.ts';
import './markalama.css';

const SUTUNLAR: readonly Sutun<MarkalamaBirimi>[] = [
  { anahtar: 'seri', baslik: 'Seri no', mono: true, hucre: (b) => b.seriNo },
  { anahtar: 'durum', baslik: 'Durum', hucre: (b) => <Rozet ton={DURUM_TONLARI[b.durum]}>{DURUM_ADLARI[b.durum]}</Rozet> },
  { anahtar: 'zaman', baslik: 'Markalandı', hucre: (b) => zamanMetni(b.zaman) },
];

function KomutPenceresi({ birim, komut, kapat }: { birim: BirimAyrintisi; komut: DurumKomutu; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [nedenId, nedenIdYaz] = useState('');
  const [aciklama, aciklamaYaz] = useState('');
  const hurda = komut === 'hurda';
  const nedenler = useQuery({
    queryKey: anahtarlar.hurdaNedenleri,
    queryFn: () => api.get<HurdaNedenleriCevabi>('/hurda-nedenleri?yalnizAktif=true'),
    enabled: hurda,
  });
  const gonder = useMutation({
    mutationFn: () => {
      const govde: DurumGovdesi = {
        komut, hurdaNedeniId: hurda && nedenId !== '' ? Number(nedenId) : null, aciklama: aciklama.trim() === '' ? null : aciklama.trim(), surum: birim.surum,
      };
      return api.post<MarkalamaBirimi>(`/markalama/birimler/${birim.id}/durum`, govde);
    },
    onSuccess: async (b) => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      bildir('tamam', `${b.seriNo}: ${DURUM_ADLARI[b.durum]}`);
      kapat();
    },
  });
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={`${birim.seriNo} · ${KOMUT_ADLARI[komut]}`}
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur={hurda ? 'tehlike' : 'birincil'} simge={KOMUT_SIMGELERI[komut]} yukleniyor={gonder.isPending} disabled={hurda && nedenId === ''} onClick={() => gonder.mutate()}>
            {KOMUT_ADLARI[komut]}
          </Dugme>
        </>
      )}
    >
      <div className="tc-mrk-form">
        {hurda && (
          nedenler.isError
            ? <p className="tc-mrk-hata" role="alert">{hataIletisi(nedenler.error, 'Hurda nedenleri okunamadı')}</p>
            : (
              <Secim
                etiket="Hurda nedeni"
                required
                secenekler={(nedenler.data?.nedenler ?? []).map((n) => ({ deger: String(n.id), baslik: `${n.kod} · ${n.ad}` }))}
                bosSecenek={nedenler.isPending ? 'Okunuyor' : 'Seçin'}
                value={nedenId}
                onChange={(o) => nedenIdYaz(o.target.value)}
              />
            )
        )}
        <CokSatir etiket="Açıklama" maxLength={300} value={aciklama} onChange={(o) => aciklamaYaz(o.target.value)} />
        {gonder.isError && <p className="tc-mrk-hata" role="alert">{hataIletisi(gonder.error, 'Durum değiştirilemedi')}</p>}
      </div>
    </Pencere>
  );
}

function BirimKarti({ id, yazabilir }: { id: number; yazabilir: boolean }) {
  const [komut, komutYaz] = useState<DurumKomutu | null>(null);
  const q = useQuery({ queryKey: anahtarlar.birim(id), queryFn: () => api.get<BirimAyrintisi>(`/markalama/birimler/${id}`) });
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Birim okunamadı')} />;
  const b = q.data;
  return (
    <Kart baslik={b.seriNo} simge="tag" sag={<Rozet ton={DURUM_TONLARI[b.durum]}>{DURUM_ADLARI[b.durum]}</Rozet>}>
      <dl className="tc-mrk-bilgi">
        <dt>Üretim emri</dt><dd className="mono">{b.emirNo ?? `#${b.uretimEmriId}`}</dd>
        <dt>Markalandı</dt><dd>{zamanMetni(b.zaman)}</dd>
        <dt>Doğrulama</dt><dd>{b.dogrulamaZamani === null ? 'Okutulmadı' : zamanMetni(b.dogrulamaZamani)}</dd>
      </dl>
      <h3 className="tc-mrk-bolum">Geçmiş</h3>
      <ol className="tc-mrk-gecmis">
        {b.olaylar.map((o) => (
          <li key={o.id}>
            <b>{OLAY_ADLARI[o.olay]}</b>
            <span className="tc-mrk-ipucu">{zamanMetni(o.zaman)}</span>
            {o.aciklama && <span>{o.aciklama}</span>}
          </li>
        ))}
      </ol>
      {yazabilir && GECERLI_KOMUTLAR[b.durum].length > 0 && (
        <div className="tc-mrk-eylemler">
          {GECERLI_KOMUTLAR[b.durum].map((k) => (
            <Dugme key={k} tur={k === 'hurda' ? 'tehlike' : k === 'kabul' ? 'birincil' : 'ikincil'} simge={KOMUT_SIMGELERI[k]} onClick={() => komutYaz(k)}>
              {KOMUT_ADLARI[k]}
            </Dugme>
          ))}
        </div>
      )}
      {komut && <KomutPenceresi birim={b} komut={komut} kapat={() => komutYaz(null)} />}
    </Kart>
  );
}

export function Izleme() {
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('markalama.durum-yaz') === true;
  const [seri, seriYaz] = useState<string | null>(null);
  const [durum, durumYaz] = useState<BirimDurumu | ''>('');
  const [secili, seciliYaz] = useState<number | null>(null);
  const sorgu = new URLSearchParams();
  if (seri !== null) sorgu.set('seriNo', seri);
  if (durum !== '') sorgu.set('durum', durum);
  const liste = useQuery({
    queryKey: anahtarlar.birimler(sorgu.toString()),
    queryFn: () => api.get<BirimlerCevabi>(`/markalama/birimler${sorgu.toString() === '' ? '' : `?${sorgu.toString()}`}`),
  });
  const tek = seri !== null && liste.data?.birimler.length === 1 ? liste.data.birimler[0]!.id : null;
  const gosterilen = secili ?? tek;
  return (
    <div className="tc-mrk-sayfa">
      <Kart baslik="Seri izleme" simge="scan">
        <div className="tc-mrk-form">
          <KodOkuyucu sik okundu={(kod) => { seriYaz(kod); seciliYaz(null); }} ipucu="Parçadaki seri no ya da kodu okutun" dokunmatikteOdakYok />
          <div className="tc-mrk-satir">
            <Secim
              etiket="Durum"
              secenekler={BIRIM_DURUMLARI.map((d) => ({ deger: d, baslik: DURUM_ADLARI[d] }))}
              bosSecenek="Hepsi"
              value={durum}
              onChange={(o) => { durumYaz(o.target.value as BirimDurumu | ''); seciliYaz(null); }}
            />
            {seri !== null && <Dugme simge="x" onClick={() => { seriYaz(null); seciliYaz(null); }}>Aramayı temizle ({seri})</Dugme>}
          </div>
        </div>
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />}
        {liste.data && (
          <Tablo
            etiket="Markalı birimler"
            sutunlar={SUTUNLAR}
            satirlar={liste.data.birimler}
            satirAnahtari={(b) => b.id}
            satirSec={(b) => seciliYaz(b.id)}
            bosMesaj={seri !== null ? 'Bu seri no ile markalı birim yok' : 'Markalı birim yok'}
          />
        )}
      </Kart>
      {gosterilen !== null && <BirimKarti key={gosterilen} id={gosterilen} yazabilir={yazabilir} />}
    </div>
  );
}
