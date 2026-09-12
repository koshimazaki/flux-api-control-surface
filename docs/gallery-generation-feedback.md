# Gallery generation feedback

The All view uses compact collection folders, roughly half the full card width.
Selecting Collections restores the full shelf. Opening a collection expands its
members; small screens retain a usable minimum folder width.

New queue jobs occupy stable gallery tiles and resolve in place to their saved
image or video. Matching uses the result/provider ID, never the title. Historical
completed jobs do not replay a reveal when the dashboard opens. Clearing settled
jobs preserves visible results; failures stop their animation.

Three decorative patterns are selected per job: Organic Flow, Mechanical Mosaic
and Gradient Sweep. Cell size stays small and fixed. The animation does not claim
to represent provider progress. Organic/mechanical reveal by turning the live
shader's dark/light field into alpha. Gradient adds seeded, irregular fine grain
to that transparency, rather than drawing a second pattern or directional wipe.
Reveals begin after the image or first video frame is ready and last one second.
The waiting grayscale shader takes on the real media's pixelated colours as its
alpha clears, so the handoff moves continuously from grayscale to colour to sharp.

Opening or switching videos in the lightbox reveals the ready frame from black
in 500 ms. Video browsing has no pixelation or shader overlay. Buffering after
the initial reveal does not hide the video or controls. Reduced motion shortens
the fade to 100 ms; stalled or unsupported media still exposes native controls.
Generation retains its distinct grayscale → coloured mosaic → clear reveal.

The job queue's active slots have a smooth, layered stream of light. The
heading shows elapsed time for the earliest currently running job; active rows
show their own clocks, based on actual start timestamps.
Running queue rows catch a slow, soft pink/blue/gold light that travels around
their rounded border and periodically fades away completely. Queue wells, idle
slots and row surfaces follow the panel’s surface theme, including light RAMS;
the existing active accents remain.

All main run actions carry a continuously circulating blue/pink/gold rim: faint
when unavailable, inviting when ready, brighter and slightly faster while busy.
Hover and keyboard focus brighten ready actions. The broader halo hugs the edge. Busy buttons remain
fully illuminated while disabled to prevent duplicate submissions. Their spinner
is a small tiled loader whose rows and columns continuously slide and wrap like
a Rubik’s cube, with a shallow 3D tilt during swaps and no held frames.
The light stays at the border, preserving the button’s colour and fill. Reduced
motion holds both effects static. No extra panel or run button is added. Image/video generation, every image tool,
Edit, Upscale, image pair scripts and video batch queueing share RunButton and
CubeLoader, preserving their labels and submission rules. The FLUX 3 rendering
overlay also uses the same cube.

The preview queue reserves its columns when jobs are cancelled, so remaining
cards keep their size. “Clear generated” clears finished queue entries while
preserving saved media.

Upscale and Edit share a light, 1 px comparison divider with a smaller 22 × 26 px
grip with an 82% black fill for contrast over bright footage. Its full-area range
control and keyboard focus remain usable. Lightbox previous/next glyphs stay
80% white across themes, becoming solid white on hover or keyboard focus.

Development preview: `/dev/gallery` offers three patterns, saved image/video
handoffs, failure/retry states, collection sizing and the actual lightbox. It
does not submit generation requests or mutate stored assets. The route is
unavailable in production. The shader uses the public `img-fx` engine (MIT) with
a shared renderer and local contrast/motion settings.
