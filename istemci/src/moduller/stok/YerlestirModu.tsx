import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { KodCozCevabi } from '#paylasilan/sozlesme/stok.ts';
import { okutmaDuzelt } from '#paylasilan/kod-sozlugu.ts';
import { Dugme, KodOkuyucu, Simge, useBildirim, useOkutmaGecmisi, type KomutIsleyici } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { hataMetni, korumaliPost } from './ortak.tsx';
import {
  YERLESTIR_BASI, yerlestirArtir, yerlestirGeriAl, yerlestirGovdeleri, yerlestirMiktar, yerlestirOkut, type YerlestirDurumu,
} from './yerlestir-al.ts';
import './stok.css';

// Okut panelinin Yerleştir modu (1916): önce göz, sonra o göze konanlar; Kaydet her satırı kayıtlı tek yerinden göze taşır.
// Kayıt mevcut taşıma ucudur (stok.transfer); birden çok yerde kayıtlı satır kaydedilmez, nedeniyle listede kalır.
export function YerlestirModu({ komut: ustKomut }: { komut?: KomutIsleyici }) {
  const gecmis = useOkutmaGecmisi();
  const { bildir } = useBildirim();
  const istemci = useQueryClient();
  const [durum, setDurumu] = useState<YerlestirDurumu>(YERLESTIR_BASI);
  const durumRef = useRef(durum);
  const setDurum = (d: YerlestirDurumu) => { durumRef.current = d; setDurumu(d); };
  const kuyruk = useRef<Promise<unknown>>(Promise.resolve());
  const [kaydediliyor, setKaydediliyor] = useState(false);

  // Okutmalar sırayla çözülür: göz okutması sonraki etiketlerin hedefini belirler.
  const okundu = (ham: string) => {
    const kod = okutmaDuzelt(ham.trim());
    if (kod === '') return;
    kuyruk.current = kuyruk.current.then(async () => {
      try {
        const c = await api.get<KodCozCevabi>(`/stok/kod-coz?kod=${encodeURIComponent(kod)}`);
        const r = yerlestirOkut(durumRef.current, kod, c);
        setDurum(r.durum);
        gecmis.bildir(kod, r.sonuc.ton, `${r.sonuc.baslik} · ${r.sonuc.alt}`);
      } catch (e) { gecmis.bildir(kod, 'hata', hataMetni(e)); }
    });
  };
  const kaydet = async () => {
    const d = durumRef.current;
    const { govdeler } = yerlestirGovdeleri(d);
    if (govdeler.length === 0) return;
    setKaydediliyor(true);
    const biten = new Set<number>();
    const hatalar: string[] = [];
    for (const g of govdeler) {
      try { await korumaliPost('/stok/tasima', g.govde); biten.add(g.sira); } catch (e) { hatalar.push(`${d.satirlar[g.sira]!.ad}: ${hataMetni(e)}`); }
    }
    const kalan = durumRef.current.satirlar.filter((_, n) => !biten.has(n));
    setDurum({ goz: kalan.length > 0 ? durumRef.current.goz : null, satirlar: kalan });
    setKaydediliyor(false);
    bildir(biten.size > 0 && hatalar.length === 0 ? 'tamam' : 'hata', `${biten.size} satır ${d.goz?.kod ?? ''} gözüne yerleşti${hatalar.length ? `; ${hatalar.join('; ')}` : ''}.`);
    await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
  };
  const { govdeler, atlanan } = yerlestirGovdeleri(durum);
  const komut: KomutIsleyici = (k) => {
    const d = durumRef.current;
    switch (k.ad) {
      case 'KAYDET':
        if (yerlestirGovdeleri(d).govdeler.length === 0) return { ton: 'uyari', metin: 'Kaydedilecek satır yok' };
        void kaydet();
        return { ton: 'tamam', metin: 'Yerleştiriliyor' };
      case 'GERI-AL':
        if (!d.goz) return { ton: 'uyari', metin: 'Geri alınacak yok' };
        setDurum(yerlestirGeriAl(d));
        return { ton: 'tamam', metin: d.satirlar.length > 0 ? 'Son satır silindi' : 'Göz bırakıldı' };
      case 'MIKTAR':
        if (d.satirlar.length === 0) return { ton: 'uyari', metin: 'Önce bir satır okut' };
        setDurum(yerlestirMiktar(d, d.satirlar.length - 1, String(k.miktar)));
        return { ton: 'tamam', metin: `Miktar ${k.miktar}` };
      case 'ARTI': case 'EKSI':
        if (d.satirlar.length === 0) return { ton: 'uyari', metin: 'Önce bir satır okut' };
        setDurum(yerlestirArtir(d, k.ad === 'ARTI' ? 1 : -1));
        return { ton: 'tamam', metin: k.ad === 'ARTI' ? 'Bir arttı' : 'Bir azaldı' };
      case 'EVET': case 'VAZGEC': case 'MOD':
        return ustKomut?.(k) ?? null;
    }
  };
  return (
    <div className="tc-stok-okut-ust">
      <div className="tc-stok-seri-ozet">
        <strong><Simge ad="target" /> {durum.goz ? `Göz ${durum.goz.kod}` : 'Önce gözü okut'}</strong>
        {durum.goz && <span className="tc-stok-not">{durum.satirlar.length} satır</span>}
      </div>
      <KodOkuyucu kendiliginden dokunmatikteOdakYok okundu={okundu} geribildirim={gecmis} komut={komut}
        ipucu={durum.goz ? 'Bu göze konan lot ya da malzemeyi okut; bitince Kaydet.' : 'Malzemeyi koyacağın gözün etiketini okut.'} />
      {durum.satirlar.length > 0 && (
        <ul className="tc-stok-seri-satirlar" aria-label="Yerleştirilecekler">
          {durum.satirlar.map((s, n) => (
            <li key={`${s.kod}-${n}`} data-tur={s.lot ? 'lot' : 'malzeme'}>
              <span className="tc-stok-seri-tur"><Simge ad={s.neden ? 'alert' : s.lot ? 'box' : 'layers'} /></span>
              <div><strong>{s.ad}</strong><span className="tc-stok-not">{s.neden ?? `${s.kaynakKod ?? ''} → ${durum.goz?.kod ?? ''}`}</span></div>
              <input className="tc-alan-kutu tc-stok-seri-adet" inputMode="decimal" aria-label={`Miktar ${s.ad}`} value={s.miktar}
                onChange={(o) => setDurum(yerlestirMiktar(durumRef.current, n, o.target.value))} />
              <Dugme simge="trash" aria-label={`Sil ${s.ad}`} onClick={() => setDurum({ ...durumRef.current, satirlar: durumRef.current.satirlar.filter((_, i) => i !== n) })} />
            </li>
          ))}
        </ul>
      )}
      {atlanan > 0 && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="status">{atlanan} satır kaydedilmez: kaynağı belirsiz ya da miktarı geçersiz. Otomatik modda tek tek taşı.</p>}
      <div className="tc-stok-eylem">
        <Dugme simge="x" disabled={!durum.goz || kaydediliyor} onClick={() => setDurum(yerlestirGeriAl(durumRef.current))}>Geri al</Dugme>
        <Dugme tur="birincil" simge="check" disabled={govdeler.length === 0} yukleniyor={kaydediliyor} onClick={() => void kaydet()}>
          Yerleştir ({govdeler.length})
        </Dugme>
      </div>
    </div>
  );
}
