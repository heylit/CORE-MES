import type { Profil } from './tipler.ts';

// Geri alma (prototip snap/undo): işlemden önce açık profilin bütün hâli saklanır; oturum boyunca, en çok 40 adım, profil başına aranır.
export const GERI_AL_SINIRI = 40;

export interface GeriAlAdimi { etiket: string; pid: string; veri: string }

export class GeriAlYigini {
  private adimlar: GeriAlAdimi[] = [];

  sakla(etiket: string, pid: string, profil: Profil): void {
    this.adimlar.push({ etiket, pid, veri: JSON.stringify(profil) });
    if (this.adimlar.length > GERI_AL_SINIRI) this.adimlar.shift();
  }

  var(pid: string): boolean {
    return this.adimlar.some((a) => a.pid === pid);
  }

  // Bu profilin son adımı çıkarılır; geri dönen veri normalize edilmeden önceki JSON'dur.
  al(pid: string): { etiket: string; profil: unknown } | null {
    for (let i = this.adimlar.length - 1; i >= 0; i--) {
      const a = this.adimlar[i];
      if (a?.pid !== pid) continue;
      this.adimlar.splice(i, 1);
      return { etiket: a.etiket, profil: JSON.parse(a.veri) as unknown };
    }
    return null;
  }

  // Profil silinince ya da depo yeniden okununca o profilin adımları anlamını yitirir.
  temizle(pid?: string): void {
    this.adimlar = pid === undefined ? [] : this.adimlar.filter((a) => a.pid !== pid);
  }
}
