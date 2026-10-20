import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Sablon, SablonCevabi, SablonlarCevabi, SablonYazGovdesi, SeceneklerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme, DurumKutusu, Girdi, OnayPenceresi, Rozet, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { korumaliPost } from './komut.ts';
import './rotalar.css';

interface Taslak { id: number | null; surum: number | null; ad: string; adimlar: { operasyonTipiId: number | null; ad: string }[] }

const taslagi = (s: Sablon): Taslak => ({ id: s.id, surum: s.surum, ad: s.ad, adimlar: s.adimlar.map((a) => ({ operasyonTipiId: a.operasyonTipi.id, ad: a.ad })) });

// Rota şablonları (#698): yeni rota "Şablondan başla" ile buradaki adımlarla açılır; varsayılan şablon "Standart" seçimidir.
// Şablondan açılmış rota kopyadır: şablon sonradan değişse de rota değişmez.
export function SablonlarEkrani() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const yazabilir = (useOturum().data?.islemler ?? []).includes('rota.yaz');
  const liste = useQuery({ queryKey: anahtarlar.sablonlar, queryFn: () => api.get<SablonlarCevabi>('/rota/sablonlar') });
  const secenekler = useQuery({ queryKey: anahtarlar.secenekler, queryFn: () => api.get<SeceneklerCevabi>('/rota/secenekler') });
  const [duzenlenen, duzenlenenYaz] = useState<Taslak | null>(null);
  const [silinecek, silinecekYaz] = useState<Sablon | null>(null);
  const yenile = () => istemci.invalidateQueries({ queryKey: anahtarlar.sablonlar });

  const kaydet = useMutation({
    mutationFn: (t: Taslak) => {
      const govde: SablonYazGovdesi = { ad: t.ad, adimlar: t.adimlar.map((a) => ({ operasyonTipiId: a.operasyonTipiId ?? 0, ad: a.ad })) };
      return t.id === null
        ? korumaliPost<SablonCevabi>('/rota/sablonlar/ekle', govde)
        : api.post<SablonCevabi>(`/rota/sablonlar/${t.id}/kaydet`, { ...govde, surum: t.surum });
    },
    onSuccess: (c) => { duzenlenenYaz(taslagi(c.sablon)); bildir('tamam', 'Şablon kaydedildi.'); void yenile(); },
    onError: (e) => bildir('hata', hataIletisi(e, 'Şablon kaydedilemedi.')),
  });
  const varsayilan = useMutation({
    mutationFn: (s: Sablon) => api.post<SablonCevabi>(`/rota/sablonlar/${s.id}/varsayilan-yap`, { surum: s.surum }),
    onSuccess: () => { void yenile(); },
    onError: (e) => bildir('hata', hataIletisi(e, 'Varsayılan yapılamadı.')),
  });
  const sil = useMutation({
    mutationFn: (s: Sablon) => api.post<SablonlarCevabi>(`/rota/sablonlar/${s.id}/sil`, { surum: s.surum }),
    onSuccess: (_c, s) => { silinecekYaz(null); if (duzenlenen?.id === s.id) duzenlenenYaz(null); void yenile(); },
    onError: (e) => bildir('hata', hataIletisi(e, 'Şablon silinemedi.')),
  });

  const tipler = (secenekler.data?.operasyonTipleri ?? []).filter((t) => t.aktif || duzenlenen?.adimlar.some((a) => a.operasyonTipiId === t.id));
  const tipSecenekleri = tipler.map((t) => ({ deger: String(t.id), baslik: `${t.kod} · ${t.ad}` }));
  const adimYaz = (i: number, p: Partial<Taslak['adimlar'][number]>) =>
    duzenlenenYaz((d) => (d ? { ...d, adimlar: d.adimlar.map((a, j) => (j === i ? { ...a, ...p } : a)) } : d));
  const tasi = (i: number, yon: -1 | 1) => duzenlenenYaz((d) => {
    if (!d) return d;
    const a = [...d.adimlar];
    const j = i + yon;
    if (j < 0 || j >= a.length) return d;
    [a[i], a[j]] = [a[j]!, a[i]!];
    return { ...d, adimlar: a };
  });
  const eksik = duzenlenen ? duzenlenen.ad.trim() === '' || duzenlenen.adimlar.some((a) => a.operasyonTipiId === null || a.ad.trim() === '') : true;

  return (
    <div className="tc-merkez">
      <section className="tc-sch2" aria-label="Rota şablonları">
        <div className="tc-sec-head">
          <h2>Rota şablonları</h2>
          <p className="tc-rota-ipucu">Rotası olmayan üründe "Şablondan başla" bu adımlarla taslak açar. Varsayılan şablon ilk seçenektir; rota sıfırdan da kurulabilir.</p>
        </div>
        {yazabilir && (
          <div className="tc-satir">
            <Dugme simge="plus" onClick={() => duzenlenenYaz({ id: null, surum: null, ad: '', adimlar: [] })}>Yeni şablon</Dugme>
          </div>
        )}
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />}
        {liste.data && liste.data.sablonlar.length === 0 && <p className="tc-rota-ipucu">Şablon yok.</p>}
        <ul className="tc-rota-yigin" aria-label="Şablonlar">
          {liste.data?.sablonlar.map((s) => (
            <li key={s.id} className="tc-panel">
              <div className="tc-satir">
                <b>{s.ad}</b>
                {s.varsayilan && <Rozet ton="tamam">Varsayılan</Rozet>}
                <small>{s.adimlar.length} adım</small>
                <span className="tc-grow" />
                {yazabilir && <Dugme simge="edit" onClick={() => duzenlenenYaz(taslagi(s))}>Düzenle</Dugme>}
                {yazabilir && !s.varsayilan && <Dugme simge="check" yukleniyor={varsayilan.isPending} onClick={() => varsayilan.mutate(s)}>Varsayılan yap</Dugme>}
                {yazabilir && !s.varsayilan && <Dugme simge="trash" aria-label={`${s.ad} şablonunu sil`} onClick={() => silinecekYaz(s)} />}
              </div>
              <p className="tc-rota-ipucu">{s.adimlar.map((a) => a.ad).join(' → ') || 'Adımsız'}</p>
            </li>
          ))}
        </ul>
        {duzenlenen && (
          <div className="tc-panel" role="form" aria-label={duzenlenen.id === null ? 'Yeni şablon' : `${duzenlenen.ad} şablonu`}>
            <Girdi etiket="Şablon adı" value={duzenlenen.ad} onChange={(e) => duzenlenenYaz({ ...duzenlenen, ad: e.target.value })} required />
            <ol className="tc-rota-yigin" aria-label="Şablon adımları">
              {duzenlenen.adimlar.map((a, i) => (
                <li key={i} className="tc-satir">
                  <Secim etiket={`Adım ${i + 1} tipi`} secenekler={tipSecenekleri} bosSecenek="Tip seçin" value={a.operasyonTipiId === null ? '' : String(a.operasyonTipiId)}
                    onChange={(e) => {
                      const t = tipler.find((x) => String(x.id) === e.target.value);
                      adimYaz(i, { operasyonTipiId: t ? t.id : null, ad: a.ad.trim() === '' && t ? t.ad : a.ad });
                    }} />
                  <Girdi etiket={`Adım ${i + 1} adı`} value={a.ad} onChange={(e) => adimYaz(i, { ad: e.target.value })} />
                  <Dugme simge="up" aria-label={`Adım ${i + 1} yukarı`} disabled={i === 0} onClick={() => tasi(i, -1)} />
                  <Dugme simge="down" aria-label={`Adım ${i + 1} aşağı`} disabled={i === duzenlenen.adimlar.length - 1} onClick={() => tasi(i, 1)} />
                  <Dugme simge="x" aria-label={`Adım ${i + 1} kaldır`} onClick={() => duzenlenenYaz({ ...duzenlenen, adimlar: duzenlenen.adimlar.filter((_x, j) => j !== i) })} />
                </li>
              ))}
            </ol>
            <div className="tc-satir">
              <Dugme simge="plus" onClick={() => duzenlenenYaz({ ...duzenlenen, adimlar: [...duzenlenen.adimlar, { operasyonTipiId: null, ad: '' }] })}>Adım ekle</Dugme>
              <span className="tc-grow" />
              <Dugme onClick={() => duzenlenenYaz(null)}>Kapat</Dugme>
              <Dugme tur="birincil" simge="check" disabled={eksik} yukleniyor={kaydet.isPending} onClick={() => kaydet.mutate(duzenlenen)}>Kaydet</Dugme>
            </div>
          </div>
        )}
        <OnayPenceresi acik={silinecek !== null} baslik="Şablonu sil" tehlikeli onayMetni="Sil" yukleniyor={sil.isPending}
          onayla={() => { if (silinecek) sil.mutate(silinecek); }} vazgec={() => silinecekYaz(null)}>
          <p>{silinecek?.ad} şablonu silinir. Bu şablondan açılmış rotalar değişmez.</p>
        </OnayPenceresi>
      </section>
    </div>
  );
}
