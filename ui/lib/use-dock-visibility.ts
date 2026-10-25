import { useEffect, useState } from "react";

/**
 * True once the asset gallery has scrolled up under the top of the window, so
 * a reference dock can drop in and take images dragged from the gallery.
 */
export function useDockVisibility(enabled: boolean) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    function shouldShowDock() {
      if (!enabled) return false;
      const firstAsset = document.querySelector<HTMLElement>(".assetsPanel .assetCard");
      if (firstAsset) return firstAsset.getBoundingClientRect().bottom <= 96;

      const assetsPanel = document.querySelector<HTMLElement>(".assetsPanel");
      if (assetsPanel) return assetsPanel.getBoundingClientRect().top <= 96 && window.scrollY > 320;

      return false;
    }

    let frame = 0;
    const updateVisibility = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setIsVisible(shouldShowDock()));
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, [enabled]);

  return isVisible;
}
