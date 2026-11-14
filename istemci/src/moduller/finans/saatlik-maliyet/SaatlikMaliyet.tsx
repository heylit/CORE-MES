import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SaatlikMaliyetSatiri } from '#paylasilan/sozlesme/finans.ts';
import { Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Rozet, Tablo, useBildirim, type Sutun } from '../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import '../finans.css';
import './saatlik-maliyet.css';

// Yalnız istasyon: kişi başı saat maliyeti Finans'ta gösterilmez (2598 c); grup değeri 2602 ile gelir.
type Tur = 'istasyon';
const tur: Tur = 'istasyon';
const AZAMI = 1_000_000_000;
const anahtar = (t: Tur) => ['finans', 'saatlik-maliyetler', t] as const;
// Karar 2464: para birimi ₺ ile gösterilir.
const tl = (v: string): string => `${Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ₺`;
const zaman = (z: string): string => new Date(z).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' });

// Virgül ya da nokta ondalık kabul edilir; boş, eksi, dört ondalıktan fazla ya da çok büyük değer reddedilir. 0 geçerlidir ("bedava"),
// "bilinmiyor" ise kaldırmadır (2572): ikisi aynı şey değildir.
export function tutarGirdisi(ham: string): { tamam: true; deger: number } | { tamam: false; ileti: string } {
  const m = ham.trim().replace(/\s/g, '').replace(',', '.');
  if (m === '') return { tamam: false, ileti: 'Tutar girin; maliyeti bilinmiyorsa "Kaldır"ı kullanın.' };
  if (!/^\d+(\.\d{1,4})?$/.test(m)) return { tamam: false, ileti: 'Tutar sıfır ya da pozitif, en çok dört ondalık olmalı.' };
  const deger = Number(m);
  if (deger > AZAMI) return { tamam: false, ileti: 'Tutar çok büyük.' };
  return { tamam: true, deger };
}

// 2593 (2589 b): istasyon saatlik maliyeti yalnız burada yazılır. Okuma finans.maliyet-oku; yazma ve kaldırma finans.maliyet-yaz
// (sunucu denetler). Girilmemiş maliyet "Girilmedi" yazar; sıfır gösterilmez.
export function SaatlikMaliyet() {
  const islemler = useOturum().data?.islemler ?? [];
  const okuyabilir = islemler.includes('finans.maliyet-oku');
  const yazabilir = islemler.includes('finans.maliyet-yaz');
  const liste = useQuery({
    queryKey: anahtar(tur),
    queryFn: () => api.get<{ satirlar: SaatlikMaliyetSatiri[] }>(`/finans/saatlik-maliyetler/${tur}`),
    enabled: okuyabilir,
  });
  const [duzenlenen, setDuzenlenen] = useState<SaatlikMaliyetSatiri | null>(null);
  const [kaldirilan, setKaldirilan] = useState<SaatlikMaliyetSatiri | null>(null);

  if (!okuyabilir) return <div className="tc-finans-durum"><DurumKutusu durum="hata" mesaj="Saatlik maliyetleri görme yetkiniz yok." /></div>;
  const sutunlar: Sutun<SaatlikMaliyetSatiri>[] = [
    { anahtar: 'kod', baslik: 'Kod', hucre: (s) => s.kod ?? '—', kirilmaz: true, mono: true },
    {
      anahtar: 'ad', baslik: 'İstasyon',
      hucre: (s) => <span className="tc-sm-ad">{s.ad}{!s.aktif && <Rozet ton="pasif">Pasif</Rozet>}</span>,
    },
    { anahtar: 'tutar', baslik: '₺ / saat', hizala: 'sag', mono: true, hucre: (s) => (s.maliyet ? tl(s.maliyet.birimMaliyet) : <Rozet ton="uyari">Girilmedi</Rozet>) },
    { anahtar: 'guncelleme', baslik: 'Son değişiklik', hucre: (s) => (s.maliyet ? zaman(s.maliyet.guncelleme) : '—') },
    ...(yazabilir ? [{
      anahtar: 'eylem', baslik: 'İşlem', hizala: 'sag' as const,
      hucre: (s: SaatlikMaliyetSatiri) => (
        <span className="tc-sm-eylem">
          <Dugme simge="edit" onClick={() => setDuzenlenen(s)} aria-label={`${s.ad} maliyetini ${s.maliyet ? 'düzenle' : 'gir'}`}>{s.maliyet ? 'Düzenle' : 'Gir'}</Dugme>
          {s.maliyet && <Dugme simge="trash" tur="tehlike" onClick={() => setKaldirilan(s)} aria-label={`${s.ad} maliyetini kaldır`}>Kaldır</Dugme>}
        </span>
      ),
    }] : []),
  ];
  return (
    <div className="tc-gg">
      <Kart baslik="İstasyon saatlik maliyetleri">
        <div className="tc-gg-ic">
          <p className="tc-kf-not">
            Planlama ve proje maliyeti istasyon saatini bu tutarla hesaplar; yalnız doğrudan gider girilir (enerji, bakım, sarf). Girilmemiş maliyet bilinmiyor sayılır ve hesapta
            eksik görünür; sıfır "bedava" demektir. Yanlış girilen maliyeti silmek için "Kaldır"ı kullanın.
          </p>
          {liste.isPending && <DurumKutusu durum="yukleniyor" />}
          {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Saatlik maliyetler alınamadı')} yenile={() => { void liste.refetch(); }} />}
          {liste.data && (
            <Tablo etiket="İstasyon saatlik maliyetleri" sutunlar={sutunlar} satirlar={liste.data.satirlar} satirAnahtari={(s) => s.anahtar}
              bosMesaj="Tanımlı istasyon yok." />
          )}
        </div>
      </Kart>
      {duzenlenen && <TutarFormu key={duzenlenen.anahtar} satir={duzenlenen} kapat={() => setDuzenlenen(null)} />}
      <KaldirOnayi satir={kaldirilan} kapat={() => setKaldirilan(null)} />
    </div>
  );
}

function TutarFormu({ satir, kapat }: { satir: SaatlikMaliyetSatiri; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [ham, setHam] = useState(satir.maliyet ? String(Number(satir.maliyet.birimMaliyet)).replace('.', ',') : '');
  const yaz = useMutation({
    mutationFn: (deger: number) => api.post(`/finans/maliyetler/${tur}/yaz`, {
      anahtar: satir.anahtar, birimMaliyet: deger, paraBirimi: 'TRY', surum: satir.maliyet?.surum ?? null,
    }),
    onSuccess: async () => { bildir('tamam', `${satir.ad} saatlik maliyeti kaydedildi.`); kapat(); await istemci.invalidateQueries({ queryKey: anahtar(tur) }); },
    onError: async (h) => { bildir('hata', hataIletisi(h, 'Maliyet kaydedilemedi.')); await istemci.invalidateQueries({ queryKey: anahtar(tur) }); },
  });
  const [hata, setHata] = useState<string | undefined>(undefined);
  const gonder = (e: FormEvent) => {
    e.preventDefault();
    const g = tutarGirdisi(ham);
    if (!g.tamam) { setHata(g.ileti); bildir('hata', g.ileti); return; }
    setHata(undefined);
    yaz.mutate(g.deger);
  };
  const sifir = tutarGirdisi(ham);
  const sifirIpucu = sifir.tamam && sifir.deger === 0 ? '0 "bedava" demektir. Maliyet bilinmiyorsa boş bırakıp "Kaldır"ı kullanın.' : undefined;
  return (
    <Kart baslik={`${satir.ad}: saatlik maliyet`}>
      <form className="tc-kf-form" onSubmit={gonder} aria-label={`${satir.ad} saatlik maliyeti`}>
        <Girdi
          etiket="Saatlik maliyet (₺)" inputMode="decimal" required autoFocus value={ham} hata={hata} ipucu={sifirIpucu}
          onChange={(e) => { setHam(e.target.value); setHata(undefined); }}
        />
        <span className="tc-sm-eylem">
          <Dugme onClick={kapat} disabled={yaz.isPending}>Vazgeç</Dugme>
          <Dugme type="submit" tur="birincil" simge="check" yukleniyor={yaz.isPending}>Kaydet</Dugme>
        </span>
      </form>
    </Kart>
  );
}

function KaldirOnayi({ satir, kapat }: { satir: SaatlikMaliyetSatiri | null; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  // Aynı onayın yinelenen gönderimi aynı kimliği taşır; sunucu ikinci kez uygulamaz (tekrar korumalı uç).
  const [kimlik, setKimlik] = useState(yeniIstekKimligi);
  const kaldir = useMutation({
    mutationFn: (s: SaatlikMaliyetSatiri) => api.post(`/finans/maliyetler/${tur}/${String(s.anahtar)}/kaldir`, { surum: s.maliyet?.surum }, { istekKimligi: kimlik }),
    onSuccess: async (_c, s) => { bildir('tamam', `${s.ad} saatlik maliyeti kaldırıldı; artık girilmemiş sayılır.`); setKimlik(yeniIstekKimligi()); kapat(); await istemci.invalidateQueries({ queryKey: anahtar(tur) }); },
    onError: async (h) => { bildir('hata', hataIletisi(h, 'Maliyet kaldırılamadı.')); setKimlik(yeniIstekKimligi()); kapat(); await istemci.invalidateQueries({ queryKey: anahtar(tur) }); },
  });
  return (
    <OnayPenceresi acik={satir !== null} baslik="Maliyeti kaldır" onayMetni="Kaldır" tehlikeli yukleniyor={kaldir.isPending}
      onayla={() => { if (satir) kaldir.mutate(satir); }} vazgec={kapat}>
      {satir?.maliyet && (
        <p>{satir.ad} için {tl(satir.maliyet.birimMaliyet)} / saat kaldırılacak. Maliyet bilinmiyor sayılır; hesaplarda eksik görünür.</p>
      )}
    </OnayPenceresi>
  );
}
