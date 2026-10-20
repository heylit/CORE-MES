import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { RafTuru, YerlesimCevabi, YerlesimKaydetGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Girdi, Pencere, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KORIDOR, RAF_TIPLERI, harf, sonrakiKod } from './yerlesim.ts';

// Önizlemedeki şablondan hızlı kurulum (genLayout): her koridorun iki yanında sırt sırta raf, aynı kod, bir yanı tek bir yanı
// çift numaralı. Var olan raflara dokunmaz; yeni raflar sağa eklenir ve yerleşim düzenleyiciye gidilir.
export function HizliKurulumPenceresi({ kapat }: { kapat: () => void }) {
  const yonlendir = useNavigate();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const y = useQuery({ queryKey: [...anahtarlar.hepsi, 'yerlesim'], queryFn: () => api.get<YerlesimCevabi>('/stok/yerlesim') });
  const [tur, setTur] = useState<RafTuru>('palet');
  const [koridor, setKoridor] = useState('2');
  const [bolme, setBolme] = useState('7');
  const [kat, setKat] = useState('4');
  const kur = useMutation({
    mutationFn: (g: YerlesimKaydetGovdesi) => api.post<YerlesimCevabi>('/stok/yerlesim/kaydet', g),
    onSuccess: async () => { bildir('tamam', 'Raflar kuruldu; yerleşimi gözden geçir.'); await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }); kapat(); void yonlendir('/stok/yerlesim'); },
    onError: (h) => bildir('hata', hataIletisi(h, 'Kurulamadı.')),
  });
  const olustur = () => {
    if (!y.data) return;
    const t = RAF_TIPLERI[tur], dep = t.dep, P = KORIDOR.genis + 2 * dep + KORIDOR.sirt, v = y.data;
    const mevcutSag = v.raflar.reduce((m, r) => Math.max(m, r.xM + r.derinlikM), v.yerlesim.bina.x0 + 1);
    const n = Math.max(1, Math.min(12, Number(koridor) || 1)), b = Math.max(1, Math.min(40, Number(bolme) || 1)), k = tur === 'zemin' ? 1 : Math.max(1, Math.min(t.enCokKat, Number(kat) || 1));
    const kodlar: string[] = []; const kullanilan = [...v.raflar];
    for (let a = 0; a < n; a++) { const kod = sonrakiKod(kullanilan) || harf(a); kodlar.push(kod); kullanilan.push({ ...kullanilan[0]!, kod }); }
    const yeni = kodlar.flatMap((kod, a) => {
      const cx = mevcutSag + 2 + a * P + KORIDOR.genis / 2 + dep;
      const ortak = { id: null, surum: null, kod, tur, ilkBolme: 1, bolmeSayisi: b, katSayisi: k, bolmeGenislikM: t.bw, derinlikM: dep, katAraligiM: t.lh, zM: Math.round((v.yerlesim.bina.z1 - 8) * 10) / 10, aci: 0 as const };
      return [
        { ...ortak, numaralama: 'tek' as const, xM: Math.round((cx - KORIDOR.genis / 2 - dep / 2) * 10) / 10, onYuzTers: false },
        { ...ortak, numaralama: 'cift' as const, xM: Math.round((cx + KORIDOR.genis / 2 + dep / 2) * 10) / 10, onYuzTers: true },
      ];
    });
    const sag = Math.max(v.yerlesim.bina.x1, ...yeni.map((r) => r.xM + 3));
    kur.mutate({
      surum: v.yerlesim.surum, depoAdi: v.depo.ad, bina: { ...v.yerlesim.bina, x1: sag, z0: Math.min(v.yerlesim.bina.z0, v.yerlesim.bina.z1 - 8 - b * t.bw - 4) },
      kabul: v.yerlesim.kabul, kareBoyu: v.yerlesim.kareBoyu, sayimSuresiGun: v.yerlesim.sayimSuresiGun, fason: v.yerlesim.fason, silinenler: [],
      raflar: [...v.raflar.map(({ doluBolmeler: _d, stokluGoz: _s, ...r }) => r), ...yeni],
    });
  };
  return (
    <Pencere acik kapat={kapat} baslik="Şablondan hızlı kurulum" tur="yan" alt={<Dugme tur="birincil" yukleniyor={kur.isPending} disabled={!y.data} onClick={olustur}>Rafları kur</Dugme>}>
      <div className="tc-stok-form">
        <p className="tc-stok-not">Her koridorun iki yanına sırt sırta raf konur: aynı kod, bir yanı tek (1, 3, 5…) bir yanı çift (2, 4, 6…) numaralı. Var olan raflara dokunulmaz.</p>
        <Secim etiket="Raf tipi" value={tur} onChange={(e) => setTur(e.target.value as RafTuru)} secenekler={(Object.keys(RAF_TIPLERI) as RafTuru[]).map((x) => ({ deger: x, baslik: RAF_TIPLERI[x].ad }))} />
        <div className="tc-stok-iki">
          <Girdi etiket="Koridor sayısı" inputMode="numeric" value={koridor} onChange={(e) => setKoridor(e.target.value)} />
          <Girdi etiket="Bölme sayısı" inputMode="numeric" value={bolme} onChange={(e) => setBolme(e.target.value)} />
          {tur !== 'zemin' && <Girdi etiket="Kat sayısı" inputMode="numeric" value={kat} onChange={(e) => setKat(e.target.value)} />}
        </div>
      </div>
    </Pencere>
  );
}
