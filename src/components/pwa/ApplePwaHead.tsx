const ICON = "/apple-touch-icon.png?v=7";

const SPLASHES = [
  { href: "/splash/640x1136.png?v=7", media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)" },
  { href: "/splash/750x1334.png?v=7", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" },
  { href: "/splash/828x1792.png?v=7", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" },
  { href: "/splash/1125x2436.png?v=7", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/1170x2532.png?v=7", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/1179x2556.png?v=7", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/1284x2778.png?v=7", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/1290x2796.png?v=7", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/1320x2868.png?v=7", media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)" },
];

export function ApplePwaHead() {
  return (
    <>
      <link rel="apple-touch-icon" href={ICON} />
      <link rel="apple-touch-icon" href={ICON} media="(prefers-color-scheme: light)" />
      <link rel="apple-touch-icon" href={ICON} media="(prefers-color-scheme: dark)" />
      <link rel="apple-touch-icon-precomposed" href={ICON} />
      {SPLASHES.map((item) => (
        <link
          key={item.media}
          rel="apple-touch-startup-image"
          href={item.href}
          media={item.media}
        />
      ))}
    </>
  );
}
