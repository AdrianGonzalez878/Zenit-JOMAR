import type { Lot } from "@/types";

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(value: number | string | null | undefined): string | null {
  const n = toNumber(value);
  if (n == null) return null;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}

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
    return "No hay lotes cargados en el catálogo. No inventes inventario. Dile al cliente que un asesor de JOMAR le confirma disponibilidad, medidas y precios.";
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

      const costM2 = formatMoney(lot.cost_per_m2);
      if (costM2) lines.push(`  Costo/m² (preventa ago 2026): ${costM2}`);

      const price = formatMoney(lot.price);
      lines.push(
        price
          ? `  Precio de lista / 24 MSI: ${price}`
          : "  Precio: no publicado — un asesor lo confirma"
      );

      const down = formatMoney(lot.down_payment);
      if (down) lines.push(`  Enganche 10%: ${down}`);

      const m24 = formatMoney(lot.monthly_payment);
      if (m24) lines.push(`  24 MSI: ${m24}/mes (total ${price})`);

      const p36 = formatMoney(lot.price_36);
      const m36 = formatMoney(lot.monthly_36);
      if (p36 && m36) lines.push(`  36 meses: ${m36}/mes (total ${p36})`);

      const p48 = formatMoney(lot.price_48);
      const m48 = formatMoney(lot.monthly_48);
      if (p48 && m48) lines.push(`  48 meses: ${m48}/mes (total ${p48})`);

      const p12 = formatMoney(lot.price_12);
      if (p12) lines.push(`  12 meses (beneficio 4%): total ${p12}`);

      const cash = formatMoney(lot.price_cash);
      if (cash) lines.push(`  Una sola exhibición (beneficio 8%): ${cash}`);

      if (price) {
        lines.push("  Fuente precios: tabla de inversión preventa agosto 2026");
      }

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
  /\b(foto|fotos|imagen|imagenes|imágenes|muestra|muéstrame|muestrame|verlo|verla|verlos|cómo se ve|como se ve|quiero ver|enséñame|enseñame|mandame|mándame|mapa|ubicación|ubicacion)\b/i;

export function customerWantsPhotos(text: string): boolean {
  return PHOTO_KEYWORDS.test(text);
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
