import { useState } from 'react';
import './brand-header.css';

/** Bundled, optimized copies of the product owner's two supplied Greek-mosaic artworks (see public/branding/README.md). */
const branding = `${import.meta.env.BASE_URL}branding/`;
const portrait = (size: number) => `${branding}mosaic-medusa-with-serpent-crown-${size}.webp`;
const banner = (width: number) => `${branding}moonlit-gorgon-mosaic-ruins-${width}.webp`;

/**
 * Cinematic header: mosaic ruins banner as decorative background, the mosaic Gorgon portrait and an accessible text
 * wordmark. Artwork that fails to load is removed, leaving the dark gradient and the readable wordmark.
 */
export function BrandHeader() {
  const [bannerFailed, setBannerFailed] = useState(false);
  const [portraitFailed, setPortraitFailed] = useState(false);
  return <header className="site-header">
    <div className="site-banner" aria-hidden="true">
      {!bannerFailed && <img className="site-banner-image" src={banner(1440)}
        srcSet={`${banner(960)} 960w, ${banner(1440)} 1440w, ${banner(1916)} 1916w`} sizes="min(140vw, 2400px)"
        alt="" width="1916" height="821" decoding="async" onError={() => setBannerFailed(true)} />}
    </div>
    <div className="site-header-inner">
      {!portraitFailed && <img className="brand-portrait" src={portrait(192)}
        srcSet={`${portrait(96)} 96w, ${portrait(192)} 192w, ${portrait(384)} 384w`} sizes="(max-width: 30rem) 48px, 72px"
        alt="" width="384" height="384" decoding="async" onError={() => setPortraitFailed(true)} />}
      <span className="wordmark">Gorgon Builder</span>
      <span className="project-label">Build Planner</span>
    </div>
  </header>;
}
