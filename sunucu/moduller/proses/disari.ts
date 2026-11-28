import type { Db } from '#cekirdek/db.ts';
import type { NcDurumu } from '#paylasilan/sozlesme/proses.ts';
import { parcaninProgramlari } from './sorgular.ts';

export interface NcProgramKunyesi { id: number; opNo: number; ad: string; surum: number; durum: NcDurumu; revizyonKodu: string | null }

// Değişiklik yönetimi konfigürasyonu (3827): parçanın kullanımdaki (eski olmayan) NC programları; yetki denetlemez, çağıran korur.
export async function parcaninNcProgramKunyeleri(db: Db, malzemeId: number): Promise<NcProgramKunyesi[]> {
  return (await parcaninProgramlari(db, malzemeId))
    .filter((p) => p.durum !== 'eski')
    .map(({ id, opNo, ad, surum, durum, revizyonKodu }) => ({ id, opNo, ad, surum, durum, revizyonKodu }));
}
