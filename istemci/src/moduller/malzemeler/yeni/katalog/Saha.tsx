import { useState } from 'react';
import { Dugme, KodOkuyucu, Pencere } from '../../../../ortak/arayuz/index.ts';
import { KatalogSimgesi } from '../ortak/KatalogSimgesi.tsx';
import { kgFmt } from '../bicim.ts';
import { TURLER } from '../sabitler/index.ts';
import * as K from '../kurallar/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { KatalogKarti, KartKaydi } from '../tipler.ts';
import type { MalzemeYetkisi } from '../yetki.ts';
import { kimlikOf, yerineOf } from './liste.ts';
import { OnayRozeti } from './paneller.tsx';

// Okunan metin karta çevrilir (kart kodu, MK: öneki, ERP kodu ya da QR bağlantısı); bulunamazsa metin gösterilir.
export function QrPenceresi({ kartlar, b, kapat, bulundu }: {
  kartlar: readonly KatalogKarti[]; b: KuralBaglami; kapat: () => void; bulundu: (kimlik: string) => void;
}) {
  const [eslesmedi, eslesmediYaz] = useState<string | null>(null);
  const oku = (metin: string) => {
    const x = K.qrKartBul(metin, kartlar.map((k) => k.kayit), b);
    if (x) bulundu(kimlikOf(x)); else eslesmediYaz(metin.slice(0, 80));
  };
  return (
    <Pencere acik kapat={kapat} baslik="QR okut" tur="orta" alt={<Dugme onClick={kapat}>Kapat</Dugme>}>
      <p className="tc-mk-ipucu">Etiketteki QR kodunu okut; kartın saha görünümü açılır. Kamera açılamazsa fotoğraf çek ya da kodu yaz.</p>
      <KodOkuyucu okundu={oku} ipucu="ör. HM-PAS-00001 ya da ERP kodu" />
      {eslesmedi !== null && (
        <p className="tc-mk-uyari" data-ton="hata" role="status">Bu QR bir kartla eşleşmedi: <code>{eslesmedi}</code></p>
      )}
    </Pencere>
  );
}

// Prototipin sahaAc'ı: atölyede telefonla okunan kartın kısa bilgisi.
export function sahaSatirlari(x: KartKaydi, b: KuralBaglami): [string, string][] {
  const sat: [string, string][] = [];
  const ek = (a: string, v: unknown) => { if (v !== undefined && v !== null && String(v).trim() !== '') sat.push([a, String(v)]); };
  const t = (x.tur ?? 'hammadde') as keyof typeof TURLER;
  const g = x.g ?? {};
  const w = K.weight(x, b);
  ek('Tür', TURLER[t]?.ad);
  if (!K.isGen(x, b)) {
    const s = K.specData(x, b);
    ek('Kalite', s.g ? s.g.ad : '');
    ek('Standart', K.finalStd(x, b));
    ek('Ölçü', K.dimsStr(x, true, b));
    ek('Durum', [x.opts?.durum, x.opts?.yuzey].filter(Boolean).join(', '));
    ek('Birim ağırlık', w ? kgFmt(w.kg, b.birim) : '');
  } else {
    ek(t === 'hizmet' ? 'Hizmet grubu' : 'Kategori', K.turKat(x, b)?.ad);
    if (t === 'hizmet') {
      ek('Hizmet çeşidi', K.hzCesitAdi(x, b));
      ek('Standart', g.std);
      ek('Hizmet yönü', g.yon);
    }
    if (t === 'ticari_mal') ek('Marka / model', [g.marka, g.model].filter(Boolean).join(' '));
    ek('Teknik resim', g.resim ? `${g.resim}${g.rev ? ` rev ${g.rev}` : ''}` : '');
    ek('Seri no', g.seri);
    ek('Konum', g.konum);
    ek('Zimmet', g.sorumlu);
    if (x.ops?.length) ek('Rota', K.rota(x, b).map((r) => r.kod).join(' › '));
  }
  ek('Stok birimi', K.finalBirim(x, b));
  ek('Depo yeri', g.depoYeri);
  ek('Tedarikçi', x.com?.ted);
  ek('Sertifikalar', (x.com?.sertifika ?? []).join(', '));
  ek('ERP kodu', x.com?.eskiKod);
  return sat;
}

export function SahaGorunumu({ kart, b, yetki, kapat, ac, tamFoy, etiket, qr, etiketMerkezi }: {
  kart: KatalogKarti; b: KuralBaglami; yetki: MalzemeYetkisi; kapat: () => void; ac: (kimlik: string) => void;
  tamFoy: () => void; etiket: () => void; qr: () => void; etiketMerkezi: () => void;
}) {
  const x = kart.kayit;
  const hizmet = x.tur === 'hizmet';
  const yerine = yerineOf(x);
  const tarihler = x.tur === 'demirbas' ? K.gTarihler(x, b) : [];
  return (
    <Pencere
      acik kapat={kapat} baslik={x.com.kod} tur="orta"
      alt={(
        <div className="tc-mk-pencere-alt">
          <Dugme tur="birincil" simge="file" onClick={tamFoy}>Tam föy</Dugme>
          {!hizmet && <Dugme simge="tag" onClick={etiket}>Etiket</Dugme>}
          {!hizmet && yetki.etiketMerkezi && <Dugme simge="printer" onClick={etiketMerkezi}>Etiket Merkezi'nde bas</Dugme>}
          <Dugme simge="scan" onClick={qr}>Başka QR okut</Dugme>
          <Dugme className="tc-mk-sona" onClick={kapat}>Kapat</Dugme>
        </div>
      )}
    >
      {yerine && (
        <p className="tc-mk-uyari" data-ton="hata">
          <b>Bu kart kullanılmıyor.</b> Yerine <button type="button" className="tc-mk-bag" onClick={() => ac(yerine.id)}>{yerine.kod}</button> kullan.
        </p>
      )}
      {K.talepVar(x, b) && <p className="tc-mk-uyari">Bu kart için bekleyen bir değişiklik talebi var; bilgiler onaylanana kadar aşağıdaki gibidir.</p>}
      <div className="tc-mk-saha-bas" data-tur={x.tur ?? 'hammadde'} data-aile={x.fam}>
        <KatalogSimgesi yol={K.kartIkon(x, b)} boyut="b" />
        <div>
          <b className="tc-mk-kod">{x.com.kod}</b> <OnayRozeti x={x} b={b} />
          <div className="tc-mk-saha-ad">{x.com.ad}</div>
        </div>
      </div>
      <dl className="tc-mk-dl">
        {sahaSatirlari(x, b).map(([a, v]) => <div key={a}><dt>{a}</dt><dd>{v}</dd></div>)}
      </dl>
      {tarihler.length > 0 && (
        <ul className="tc-mk-tarihler">
          {tarihler.map((z) => (
            <li key={z.ad} data-durum={z.kalanGun < 0 ? 'gecti' : z.kalanGun < 30 ? 'yakin' : undefined}>
              {z.ad}: {z.sonraki.toLocaleDateString('tr-TR')}{z.kalanGun < 0 ? ` (${-z.kalanGun} gün geçti)` : ''}
            </li>
          ))}
        </ul>
      )}
    </Pencere>
  );
}
