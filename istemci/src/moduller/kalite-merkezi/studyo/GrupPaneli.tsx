import { useEffect, useMemo, useState } from 'react';
import type { KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { Dugme, Girdi, OnayPenceresi, Rozet, Secim, Simge, useBildirim } from '../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { degisti, govdeOlustur, grupsuzOperasyonlar, operasyonBagla, taslakHatasi, taslakOlustur, yeniGrupAdi, type GrupTaslagi, type RotaOperasyonu } from './gruplar.ts';
import { useGruplariYaz } from './veri.ts';

// Balon grupları ve operasyon ataması (3693): Kalite Merkezi resmin balonlarını adlı gruplara ayırır, operasyonu gruba bağlar. Atama yalnız
// grup kartından yapılır; operatör ve numune formu operasyonunun grubunu kendiliğinden kullanır.
export function GrupPaneli({ resim, rota, duzenler }: { resim: KmResim; rota: readonly RotaOperasyonu[]; duzenler: boolean }) {
  const { bildir } = useBildirim();
  const yaz = useGruplariYaz();
  const [taslak, taslakYaz] = useState<GrupTaslagi[]>(() => taslakOlustur(resim));
  const [silinecek, silinecekYaz] = useState<GrupTaslagi | null>(null);
  // Resim ya da kayıtlı sürüm değişince (kayıt, başkasının değişikliği) taslak kayıtlı plana döner.
  useEffect(() => { taslakYaz(taslakOlustur(resim)); }, [resim.id, resim.gruplarSurum]);

  const duzenlenebilir = duzenler && !resim.eski;
  const balonNolari = useMemo(() => resim.balonlar.map((b) => b.no).sort((a, b) => a - b), [resim.balonlar]);
  const hata = taslakHatasi(taslak);
  const degisen = degisti(resim, taslak);
  const grupsuz = grupsuzOperasyonlar(taslak, rota);
  const opMetni = (id: number) => `Op ${String(rota.find((o) => o.operasyonId === id)?.opNo ?? '?')}`;

  const guncelle = (anahtar: string, f: (g: GrupTaslagi) => GrupTaslagi) => { taslakYaz((t) => t.map((g) => (g.anahtar === anahtar ? f(g) : g))); };
  const balonDegistir = (anahtar: string, no: number) => {
    guncelle(anahtar, (g) => ({ ...g, balonlar: g.balonlar.includes(no) ? g.balonlar.filter((x) => x !== no) : [...g.balonlar, no] }));
  };
  const ekle = () => { taslakYaz((t) => [...t, { anahtar: `y${String(Date.now())}${String(t.length)}`, id: null, ad: yeniGrupAdi(t), balonlar: [], operasyonlar: [] }]); };
  const kaydet = () => {
    if (hata !== null) return;
    yaz.mutate({ resim, govde: govdeOlustur(resim.gruplarSurum ?? 1, taslak) }, {
      onSuccess: () => { bildir('tamam', 'Balon grupları kaydedildi.'); },
      onError: (h) => { bildir('hata', hataIletisi(h, 'Balon grupları kaydedilemedi.')); },
    });
  };

  return (
    <section className="km-st-kart km-st-gruplar" aria-label="Balon grupları">
      <div className="km-st-grup-ust">
        <span className="km-st-baslik">Balon grupları</span>
        {duzenlenebilir ? <Dugme tur="ikincil" simge="plus" onClick={ekle}>Yeni grup</Dugme> : null}
      </div>
      {resim.eski ? <span className="km-st-soluk">Eski revizyon salt okunur; grupları güncel revizyonda düzenleyin.</span> : null}
      {!duzenler && !resim.eski ? <span className="km-st-soluk">Grupları düzenlemek için kalite onayı gerekir.</span> : null}
      {taslak.length === 0 ? <span className="km-st-soluk">Bu resimde grup yok; operasyonlar bütün balonları görür.</span> : null}
      {taslak.map((g) => (
        <div key={g.anahtar} className="km-st-grup">
          <div className="km-st-grup-ust">
            {duzenlenebilir
              ? <Girdi etiket="Grup adı" value={g.ad} maxLength={60} onChange={(o) => { guncelle(g.anahtar, (x) => ({ ...x, ad: o.target.value })); }} />
              : <b>{g.ad}</b>}
            {duzenlenebilir ? <Dugme tur="ikincil" simge="trash" aria-label={`${g.ad} grubunu sil`} onClick={() => { silinecekYaz(g); }} /> : null}
          </div>
          <div className="km-st-grup-balonlar" role="group" aria-label={`${g.ad} balonları`}>
            {balonNolari.map((no) => (
              <button key={no} type="button" className={`km-st-grup-balon${g.balonlar.includes(no) ? ' on' : ''}`} aria-pressed={g.balonlar.includes(no)}
                disabled={!duzenlenebilir} onClick={() => { balonDegistir(g.anahtar, no); }}>{no}</button>
            ))}
            {balonNolari.length === 0 ? <span className="km-st-soluk">Resimde balon yok.</span> : null}
          </div>
          <div className="km-st-grup-op">
            {g.operasyonlar.map((id) => (
              <Rozet key={id} ton="tamam">
                {opMetni(id)}
                {duzenlenebilir ? <button type="button" className="km-st-grup-x" aria-label={`${opMetni(id)} bağını kaldır`}
                  onClick={() => { guncelle(g.anahtar, (x) => ({ ...x, operasyonlar: x.operasyonlar.filter((o) => o !== id) })); }}><Simge ad="x" boyut="k" /></button> : null}
              </Rozet>
            ))}
            {duzenlenebilir ? (
              <Secim etiket="Operasyon bağla" value="" onChange={(o) => { if (o.target.value) taslakYaz((t) => operasyonBagla(t, g.anahtar, Number(o.target.value))); }}
                secenekler={[{ deger: '', baslik: '＋ Operasyon' }, ...rota.filter((o) => !g.operasyonlar.includes(o.operasyonId)).map((o) => ({ deger: String(o.operasyonId), baslik: `Op ${String(o.opNo)}` }))]} />
            ) : null}
          </div>
        </div>
      ))}
      {grupsuz.map((o) => (
        <div key={o.operasyonId} className="km-st-grup km-st-grup-uyari" role="status">
          <Rozet ton="hata">Kontrol grubu yok</Rozet>
          <span className="km-st-soluk">Op {o.opNo} için bir grup bağlayın.</span>
        </div>
      ))}
      {hata !== null ? <span className="km-st-soluk" role="alert">{hata}</span> : null}
      {duzenlenebilir && degisen ? (
        <div className="km-st-taslak" role="status">
          <span>Kaydedilmemiş grup değişikliği</span>
          <Dugme tur="ikincil" simge="x" disabled={yaz.isPending} onClick={() => { taslakYaz(taslakOlustur(resim)); }}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={yaz.isPending || hata !== null} onClick={kaydet}>Kaydet</Dugme>
        </div>
      ) : null}
      <OnayPenceresi acik={silinecek !== null} baslik="Grubu sil" onayMetni="Grubu sil" tehlikeli
        onayla={() => { if (silinecek) taslakYaz((t) => t.filter((g) => g.anahtar !== silinecek.anahtar)); silinecekYaz(null); }} vazgec={() => { silinecekYaz(null); }}>
        <p>{silinecek?.ad} silinirse bağlı operasyonlar ({silinecek?.operasyonlar.map(opMetni).join(', ') || 'yok'}) grupsuz kalır ve “Kontrol grubu yok” uyarısı alır; balonlar resimde kalır. Değişiklik Kaydet'e basınca geçerli olur.</p>
      </OnayPenceresi>
    </section>
  );
}
