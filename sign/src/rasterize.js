import html2canvas from "html2canvas";

/**
 * Turn the confirmation block into a PNG data URL.
 *
 * Waits for fonts and the embedded signature image first: html2canvas
 * snapshots whatever is painted at the moment it runs, so capturing early
 * yields a page in a fallback font or with a blank signature box.
 */
export async function blockToPng(node, width) {
  if (document.fonts?.ready) await document.fonts.ready;

  await Promise.all(
    [...node.querySelectorAll("img")].map((img) =>
      img.complete ? Promise.resolve() : img.decode().catch(() => {}),
    ),
  );

  const canvas = await html2canvas(node, {
    // 2x keeps Hebrew crisp once the image is scaled onto an A4 page.
    scale: 2,
    backgroundColor: "#ffffff",
    width,
    windowWidth: width,
    logging: false,
    useCORS: true,
  });

  return canvas.toDataURL("image/png");
}

/** Lets React paint the block before html2canvas reads it. */
export function nextPaint() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
}

/**
 * Waits for React to commit the off-screen block. Two animation frames are
 * normally plenty, but a slow phone under a re-render can miss that window,
 * and a null ref here would surface as an unreadable TypeError at the exact
 * moment the client is trying to sign.
 */
export async function waitForNode(getNode, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    const node = getNode();
    if (node) return node;
    await nextPaint();
  }
  throw new Error("לא ניתן היה להכין את דף החתימה. יש לנסות שוב.");
}
