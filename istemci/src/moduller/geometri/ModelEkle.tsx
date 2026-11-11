import { useDeferredValue, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { BelgeAyrintisi, MalzemeSecimiCevabi } from '#paylasilan/sozlesme/belge-merkezi.ts';
import type { GeometriModelSatiri } from '#paylasilan/sozlesme/geometri.ts';
import { Dugme, DurumKutusu, Girdi, Pencere, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { DosyaHatasi, malzemeBelgesiYukle } from '../belge-merkezi/disari.ts';

// 3D Atölyesi yalnız ölçülebilen biçimleri listeler; buradan yalnız onlar yüklenir (öbürleri malzeme kartından).
const KABUL = '.step,.stp,.iges,.igs';
const OLCULUR = /\.(step|stp|iges|igs)$/i;

export function useModelYetkisi() {
  const islemler = useOturum().data?.islemler ?? [];
  return {
    // Malzeme seçicisi (/cizimler/malzeme-secimi) yalnız belge-merkezi.yaz ister; malzemeler.yaz tek başına seçiciyi açamaz.
    ekler: islemler.includes('belge-merkezi.yaz'),
    yayinlar: islemler.includes('belge-merkezi.yayinla'),
    merkezGorur: islemler.includes('sayfa.cizimler'),
  };
}

// Model, malzeme kartına taslak olarak eklenir (1990 a: yayını yayınlama yetkisi olan yapar); malzeme kartındaki "Resimler > Ekle" ile aynı yükleme.
export function ModelEkle({ kapat, eklendi }: { kapat: () => void; eklendi: (malzemeNo: number) => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [ara, araYaz] = useState('');
  const aranan = useDeferredValue(ara.trim());
  const [malzemeNo, malzemeYaz] = useState<number | null>(null);
  const [dosya, dosyaYaz] = useState<File | null>(null);
  const [antetRev, antetRevYaz] = useState('');
  const [ilerleme, ilerlemeYaz] = useState<number | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const secenekler = useQuery({
    queryKey: ['geometri', 'malzeme-secimi', aranan],
    queryFn: () => api.get<MalzemeSecimiCevabi>(`/cizimler/malzeme-secimi?ara=${encodeURIComponent(aranan)}`),
    placeholderData: keepPreviousData,
  });
  const malzemeler = secenekler.data?.malzemeler ?? [];
  const red = dosya !== null && !OLCULUR.test(dosya.name) ? 'Yalnız STEP ya da IGES dosyası ölçülür.' : null;
  const komut = useMutation({
    mutationFn: (d: File) => malzemeBelgesiYukle(malzemeNo!, d, { tur: '3b-model', antetRev: antetRev.trim() || null }, ilerlemeYaz),
    onMutate: () => { hataYaz(null); ilerlemeYaz(0); },
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: ['geometri', 'modeller'] });
      bildir('bilgi', 'Model taslak olarak eklendi. Listede seçip "Yayınla" deyince ölçülür.');
      eklendi(malzemeNo!);
      kapat();
    },
    onError: (e) => { ilerlemeYaz(null); hataYaz(e instanceof DosyaHatasi ? e.message : hataIletisi(e, 'Model eklenemedi.')); },
  });
  return (
    <Pencere
      acik tur="yan" kapat={kapat} baslik="3B model ekle"
      alt={<Dugme tur="birincil" simge="upload" yukleniyor={komut.isPending} disabled={malzemeNo === null || dosya === null || red !== null} onClick={() => { if (dosya) komut.mutate(dosya); }}>Yükle</Dugme>}
    >
      <div className="tc-g3b-form">
        <Girdi etiket="Malzeme ara" type="search" value={ara} maxLength={80} onChange={(e) => { araYaz(e.target.value); }} ipucu="Stok kodu ya da ad yazın." />
        <Secim
          etiket="Malzeme kartı" value={malzemeNo === null ? '' : String(malzemeNo)} bosSecenek="Seçiniz"
          onChange={(e) => { malzemeYaz(e.target.value === '' ? null : Number(e.target.value)); }}
          secenekler={malzemeler.map((m) => ({ deger: String(m.id), baslik: `${m.kod}${m.ad ? ` - ${m.ad}` : ''}` }))}
          ipucu={secenekler.isError ? 'Malzeme listesi alınamadı.' : malzemeler.length === 0 && !secenekler.isPending ? 'Eşleşen aktif kart yok.' : undefined}
        />
        <Girdi
          etiket="Dosya" type="file" accept={KABUL} required
          onChange={(e) => { dosyaYaz(e.target.files?.[0] ?? null); }}
          ipucu={dosya ? dosya.name : 'STEP ya da IGES; en çok 200 MB.'} {...(red ? { hata: red } : {})}
        />
        <Girdi etiket="Revizyon kodu" value={antetRev} maxLength={20} onChange={(e) => { antetRevYaz(e.target.value); }} ipucu="Boşsa kartın revizyonu gösterilir." />
        {ilerleme !== null && <progress max={1} value={ilerleme} aria-label="Yükleme" />}
        {hata !== null && <p className="tc-g3b-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}

// Taslak model seçilince: ölçüm yayından sonradır. Yayınlama yetkisi olana düğme, olmayana kimin yayınlayacağı söylenir.
export function TaslakModel({ satir, yayinlandi }: { satir: GeometriModelSatiri; yayinlandi: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const { yayinlar, merkezGorur } = useModelYetkisi();
  const komut = useMutation({
    mutationFn: async () => {
      const b = await api.get<BelgeAyrintisi>(`/cizimler/${String(satir.belgeId)}`);
      await api.post(`/cizimler/${String(satir.belgeId)}/revizyonlar/${String(satir.revizyonId)}/yayinla`, { surum: b.surum });
    },
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: ['geometri', 'modeller'] });
      bildir('bilgi', 'Model yayınlandı; ölçüm yarım dakika içinde başlar.');
      yayinlandi();
    },
    onError: (e) => bildir('hata', hataIletisi(e, 'Yayınlanamadı.')),
  });
  return (
    <div className="tc-g3b-taslak">
      <p className="tc-g3b-baslik">
        <strong>{satir.malzemeKodu}</strong> {satir.malzemeAdi ?? ''} <span className="tc-g3b-soluk">{satir.revKodu ? `Rev ${satir.revKodu}` : 'Kodsuz revizyon'} · {satir.belgeAdi}</span>
      </p>
      <DurumKutusu durum="bos" mesaj="Bu model taslak. Yayınlanınca ölçülür, atölyede ve rotada geçerli olur." />
      <div className="tc-g3b-taslak-eylem">
        {yayinlar
          ? <Dugme tur="birincil" simge="check" yukleniyor={komut.isPending} onClick={() => { komut.mutate(); }}>Yayınla</Dugme>
          : <p className="tc-g3b-soluk">Yayınlama yetkisi olan kişi yayınlar.</p>}
        {merkezGorur && <Link className="tc-g3b-bag" to={`/cizimler/belge/${String(satir.belgeId)}`}><Simge ad="fit" />Çizim Merkezi'nde aç</Link>}
      </div>
    </div>
  );
}
