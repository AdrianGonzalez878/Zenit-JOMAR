import type { Lot } from "@/types";

function formatServices(lot: Lot): string {
  const items: string[] = [];
  if (lot.has_electricity) items.push("luz");
  if (lot.has_water) items.push("agua");
  if (lot.has_sewage) items.push("drenaje");
  if (lot.other_services?.trim()) items.push(lot.other_services.trim());
  return items.length ? items.join(", ") : "no publicados en ficha";
}

export function lotDisplayName(lot: Lot): string {
  return lot.name?.trim() || `Lote ${lot.code}`;
}

export function formatLotsParaIA(lots: Lot[]): string {
  if (!lots.length) {
    return "No hay lotes cargados en el catálogo. No inventes inventario ni precios. Dile al cliente que uno de nuestros asesores le confirma disponibilidad y medidas en la cita.";
  }

  return lots
    .map((lot) => {
      const lines: string[] = [];
      lines.push(`• ${lotDisplayName(lot)} [${lot.zone}]`);
      lines.push(`  Código: ${lot.code}`);
      lines.push(`  Estatus: ${lot.status}`);
      lines.push(`  Superficie: ${lot.area_m2} m²`);

      if (lot.front_m != null) lines.push(`  Frente: ${lot.front_m} m`);
      if (lot.depth_m != null) lines.push(`  Fondo: ${lot.depth_m} m`);

      lines.push(`  Servicios: ${formatServices(lot)}`);
      if (lot.maps_url) lines.push(`  Ubicación: ${lot.maps_url}`);
      if (lot.plusvalia_notes) lines.push(`  Plusvalía: ${lot.plusvalia_notes}`);
      if (lot.notes) lines.push(`  Notas internas: ${lot.notes}`);

      const photos = lot.photo_urls?.filter(Boolean) ?? [];
      lines.push(
        photos.length
          ? `  Fotos: ${photos.length} disponible(s) — el sistema las envía si el cliente las pide`
          : "  Fotos: no hay URLs cargadas"
      );

      return lines.join("\n");
    })
    .join("\n\n");
}

const PHOTO_KEYWORDS =
  /\b(foto|fotos|imagen|imagenes|imágenes|muestra|muéstrame|muestrame|mostrar|verlo|verla|verlos|cómo se ve|como se ve|quiero ver|enséñame|enseñame)\b/i;

const PLANO_KEYWORDS = /\b(croquis|planos?|lotificaci[oó]n|lotific)\b/i;

const SEE_THE_PLACE =
  /\b(mostrar(me|nos)?|ver|ense[nñ]ar(me)?|quiero ver|c[oó]mo se ve|c[oó]mo est[aá])\b[\s\S]{0,48}\b(terreno|lugar|desarrollo|proyecto|zenit|foto|fotos)\b|\b(terreno|lugar|desarrollo|proyecto|zenit)\b[\s\S]{0,48}\b(foto|fotos|im[aá]genes?|fotograf[ií]as?|c[oó]mo se ve)\b/i;

const CROQUIS_KEYWORDS =
  new RegExp(`${PLANO_KEYWORDS.source}|\\b(d[oó]nde|en d[oó]nde|ubicar)\\b[\\s\\S]{0,48}\\b(lote|manzana)\\b|\\b(lote|manzana)\\b[\\s\\S]{0,48}\\b(d[oó]nde queda|d[oó]nde est[aá]|ubicar)\\b`, "i");

const LOCATION_KEYWORDS =
  /\b(ubicaci[oó]n|c[oó]mo llego|c[oó]mo llegar|direcci[oó]n|google maps|mapa)\b|\bd[oó]nde (queda|est[aá])( el (desarrollo|proyecto|lugar)| zenit)?\b/i;

const DEVELOPMENT_PHOTO_KEYWORDS =
  /\b(fotos?|im[aá]genes?|fotograf[ií]as?|c[oó]mo se ve|c[oó]mo est[aá] el (lugar|desarrollo|proyecto|terreno))\b/i;

export function customerWantsPhotos(text: string): boolean {
  return PHOTO_KEYWORDS.test(text) && !customerWantsDevelopmentPhotos(text);
}

export function customerWantsDevelopmentPhotos(text: string): boolean {
  const withoutPlano = text.replace(/\bplanos?\b/gi, " ");
  const asksPhotos =
    DEVELOPMENT_PHOTO_KEYWORDS.test(text) || SEE_THE_PLACE.test(withoutPlano);
  if (PLANO_KEYWORDS.test(text) && !/\b(foto|fotos|im[aá]genes?|fotograf[ií]as?|terreno|lugar|desarrollo|zenit)\b/i.test(withoutPlano)) {
    return false;
  }
  return asksPhotos;
}

export function customerWantsCroquis(text: string): boolean {
  return PLANO_KEYWORDS.test(text) || CROQUIS_KEYWORDS.test(text);
}

export const ZENIT_MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=Bajos+de+Chila,+San+Pedro+Mixtepec,+Oaxaca";

export function customerWantsLocation(text: string): boolean {
  if (!LOCATION_KEYWORDS.test(text)) return false;
  const aboutLot = /\b(lote|manzana|terreno)\b/i.test(text);
  const aboutPlace =
    /\b(ubicaci[oó]n|c[oó]mo llego|c[oó]mo llegar|direcci[oó]n|google maps|mapa|desarrollo|proyecto|zenit)\b/i.test(
      text
    );
  if (aboutLot && !aboutPlace) return false;
  return true;
}

export function extractLotCodes(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.toUpperCase().matchAll(/M\s*([1-4])[\s-]*L\s*-?\s*([1-7])/g)) {
    found.add(`M${match[1]}-L${match[2]}`);
  }
  return [...found];
}

function scoreLotMatch(lot: Lot, haystack: string): number {
  const code = lot.code.toLowerCase();
  const name = lotDisplayName(lot).toLowerCase();
  const zone = lot.zone.toLowerCase();

  if (haystack.includes(code.toLowerCase())) return 100;
  if (haystack.includes(name)) return 90;
  if (haystack.includes(zone)) return 40;

  const words = name
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const matches = words.filter((w) => haystack.includes(w)).length;
  if (matches >= 2) return matches * 12;
  return 0;
}

export function findLotsForPhotos(
  userMessage: string,
  aiResponse: string,
  historyText: string,
  lots: Lot[],
  max = 2
): Lot[] {
  const haystack = `${userMessage}\n${aiResponse}\n${historyText}`.toLowerCase();

  return lots
    .map((lot) => ({ lot, score: scoreLotMatch(lot, haystack) }))
    .filter(({ score, lot }) => score > 0 && (lot.photo_urls?.length ?? 0) > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ lot }) => lot);
}

export function firstPhotoUrl(lot: Lot): string | null {
  return lot.photo_urls?.find((url) => url?.trim()) ?? null;
}
