import { Dugme, Girdi, Secim } from '../../ortak/arayuz/index.ts';
import './istasyonlar.css';

// Kodlar ASCII büyük harfle yazılır ("EKIP"); Türkçe küçültme onu "ekıp" yapar ve "ekip" araması bulamaz. Bu yüzden ı ile i eş sayılır.
const kucuk = (m: string) => m.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');

// Aranan metin alanlardan birinde geçiyorsa satır görünür; harf büyüklüğü gözetilmez.
export function aramayaUyar(aranan: string, alanlar: readonly (string | null | undefined)[]): boolean {
  const a = kucuk(aranan.trim());
  return a === '' || alanlar.some((m) => m != null && kucuk(m).includes(a));
}

interface Suzgec {
  etiket: string;
  bosSecenek: string;
  secenekler: readonly { deger: string; baslik: string }[];
  deger: string;
  degistir: (deger: string) => void;
}

// Bölüm listelerinin üst satırı: arama, isteğe bağlı süzgeç, görünen satırların CSV'si ve yeni kayıt.
export function ListeAraclari({ ara, araYaz, araIpucu, suzgec, csv, csvKapali, yeni }: {
  ara: string;
  araYaz: (deger: string) => void;
  araIpucu: string;
  suzgec?: Suzgec;
  csv: () => void;
  csvKapali: boolean;
  yeni?: { metin: string; ac: () => void };
}) {
  return (
    <div className="tc-ist-ust">
      <div className="tc-ist-ata">
        <Girdi etiket="Ara" type="search" value={ara} onChange={(o) => araYaz(o.target.value)} placeholder={araIpucu} />
        {suzgec && (
          <Secim
            etiket={suzgec.etiket}
            bosSecenek={suzgec.bosSecenek}
            secenekler={suzgec.secenekler}
            value={suzgec.deger}
            onChange={(o) => suzgec.degistir(o.target.value)}
          />
        )}
      </div>
      <div className="tc-ist-ata">
        <Dugme simge="download" disabled={csvKapali} onClick={csv}>CSV indir</Dugme>
        {yeni && <Dugme tur="birincil" simge="plus" onClick={yeni.ac}>{yeni.metin}</Dugme>}
      </div>
    </div>
  );
}
