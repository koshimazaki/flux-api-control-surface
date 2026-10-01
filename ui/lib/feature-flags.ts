/**
 * FLUX 3 Image stays hidden until the model is released. Set
 * NEXT_PUBLIC_FLUX3_IMAGE=1 (for example in .env.local) to preview it locally;
 * remove the flag after launch.
 */
export const FLUX3_IMAGE_ENABLED = process.env.NEXT_PUBLIC_FLUX3_IMAGE === "1";
