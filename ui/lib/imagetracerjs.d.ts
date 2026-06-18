declare module "imagetracerjs" {
  type TraceOptions = Record<string, number | string | boolean>;
  const ImageTracer: {
    imagedataToSVG(imageData: ImageData, options?: TraceOptions | string): string;
    imageToSVG(url: string, callback: (svg: string) => void, options?: TraceOptions | string): void;
    imagedataToTracedata(imageData: ImageData, options?: TraceOptions | string): unknown;
  };
  export default ImageTracer;
}
