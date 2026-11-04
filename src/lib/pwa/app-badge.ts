type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function syncAppBadge(count: number) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as BadgeNavigator;
  if (typeof nav.setAppBadge !== "function") return;

  const next = Math.max(0, Math.floor(count));
  if (next > 0) {
    void nav.setAppBadge(next).catch(() => {
      // iOS o el escritorio pueden no soportar el badge
    });
    return;
  }

  if (typeof nav.clearAppBadge === "function") {
    void nav.clearAppBadge().catch(() => undefined);
  } else {
    void nav.setAppBadge(0).catch(() => undefined);
  }
}
