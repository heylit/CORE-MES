import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { KalemAmbalaji, KalemGorunumu, RaftaGosterim } from '#paylasilan/sozlesme/atolye.ts';
import { parcaAnahtari } from '#paylasilan/atolye-sabitleri.ts';
import { Dugme, Girdi, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AMBALAJ_ADI } from './kurallar.ts';
import { kalemGorunumuSil, kalemGorunumuYaz, useKalemGorunumleri, useModeller } from './veri.ts';

// Kalemin (parça no, malzeme kodu) görünümü: rafta paketli mi (ambalaj) yoksa parçanın kendi 3B modeliyle mi
// görünsün; aynı model makinede işlenirken üstünde döner. Raf kartında gözden, kütüphanede modelden açılır.

const AMBALAJLAR = (Object.keys(AMBALAJ_ADI) as KalemAmbalaji[]).map((a) => ({ deger: a, baslik: AMBALAJ_ADI[a] }));
const RAFTA = [{ deger: 'paket', baslik: 'Paketli (ambalajıyla)' }, { deger: 'model', baslik: 'Parçanın 3B modeliyle' }];

interface Ozellikler {
  // Verilmezse kod girilir (kütüphaneden yeni bağ).
  kod?: string;
  // Kütüphaneden açılınca model önceden seçili gelir.
  varsayilanModelId?: number;
  yazabilir: boolean;
  bitti?: () => void;
}

export function kalemBul(kalemler: readonly KalemGorunumu[] | undefined, kod: string): KalemGorunumu | undefined {
  const a = parcaAnahtari(kod);
  return kalemler?.find((k) => parcaAnahtari(k.kod) === a);
}

export function KalemGorunumuFormu({ kod: sabitKod, varsayilanModelId, yazabilir, bitti }: Ozellikler) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const kalemler = useKalemGorunumleri();
  const modeller = useModeller(yazabilir);
  const [kod, kodYaz] = useState(sabitKod ?? '');
  const mevcut = kalemBul(kalemler.data?.kalemler, kod);
  const [ambalaj, ambalajYaz] = useState<KalemAmbalaji>('otomatik');
  const [rafta, raftaYaz] = useState<RaftaGosterim>(varsayilanModelId ? 'model' : 'paket');
  const [modelId, modelIdYaz] = useState<number | null>(varsayilanModelId ?? null);

  // Kayıtlı görünüm forma gelir (kod değişince de).
  useEffect(() => {
    if (!mevcut) return;
    ambalajYaz(mevcut.ambalaj);
    raftaYaz(mevcut.rafta);
    modelIdYaz(varsayilanModelId ?? mevcut.model?.id ?? null);
  }, [mevcut, varsayilanModelId]);

  const yenile = () => {
    void istemci.invalidateQueries({ queryKey: anahtarlar.kalemGorunumleri });
    void istemci.invalidateQueries({ queryKey: anahtarlar.modeller });
  };
  const kaydet = useMutation({
    mutationFn: () => kalemGorunumuYaz({ kod: kod.trim(), modelId, ambalaj, rafta }),
    onSuccess: () => { bildir('tamam', `${kod.trim()} görünümü kaydedildi.`); yenile(); bitti?.(); },
    onError: (hata) => bildir('hata', hataIletisi(hata, 'Görünüm kaydedilemedi.')),
  });
  const kaldir = useMutation({
    mutationFn: () => kalemGorunumuSil(kod.trim()),
    onSuccess: () => { bildir('tamam', `${kod.trim()} görünümü kaldırıldı.`); yenile(); bitti?.(); },
    onError: (hata) => bildir('hata', hataIletisi(hata, 'Görünüm kaldırılamadı.')),
  });

  const modelAdi = mevcut?.model?.ad;
  if (!yazabilir) {
    return (
      <p className="tc-atolye-ipucu">
        {mevcut
          ? `${mevcut.rafta === 'model' && modelAdi ? `Rafta 3B modeliyle (${modelAdi})` : `Rafta ${AMBALAJ_ADI[mevcut.ambalaj].toLocaleLowerCase('tr')}`}.`
          : 'Görünüm tanımlı değil; malzemenin biçiminden çizilir.'}
      </p>
    );
  }
  const modelSecenekleri = [
    { deger: '', baslik: 'Model yok' },
    ...(modeller.data?.modeller ?? []).filter((m) => m.tamam).map((m) => ({ deger: String(m.id), baslik: m.ad })),
  ];
  const gecerli = kod.trim() !== '' && (rafta === 'paket' || modelId !== null) && (modelId !== null || ambalaj !== 'otomatik');
  return (
    <form className="tc-atolye-kalem" onSubmit={(o) => { o.preventDefault(); if (gecerli) kaydet.mutate(); }}>
      {sabitKod === undefined && <Girdi etiket="Kod (parça no ya da malzeme kodu)" value={kod} maxLength={60} onChange={(o) => kodYaz(o.target.value)} />}
      <Secim etiket="Rafta" secenekler={RAFTA} value={rafta} onChange={(o) => raftaYaz(o.target.value as RaftaGosterim)} />
      {rafta === 'paket' && <Secim etiket="Ambalaj" secenekler={AMBALAJLAR} value={ambalaj} onChange={(o) => ambalajYaz(o.target.value as KalemAmbalaji)} />}
      <Secim
        etiket={rafta === 'model' ? '3B model' : '3B model (makinede işlenirken döner)'}
        secenekler={modelSecenekleri}
        value={modelId === null ? '' : String(modelId)}
        onChange={(o) => modelIdYaz(o.target.value === '' ? null : Number(o.target.value))}
      />
      {rafta === 'model' && <p className="tc-atolye-ipucu">Parçalar modelin gerçek ölçüsüyle göze dizilir; adet gözün doluluğundan.</p>}
      <div className="tc-atolye-kart-eylem">
        <Dugme type="submit" tur="birincil" simge="check" yukleniyor={kaydet.isPending} disabled={!gecerli}>Görünümü kaydet</Dugme>
        {mevcut && <Dugme simge="trash" yukleniyor={kaldir.isPending} onClick={() => kaldir.mutate()}>Görünümü kaldır</Dugme>}
      </div>
    </form>
  );
}
