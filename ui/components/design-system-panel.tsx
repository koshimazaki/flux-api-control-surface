import { Check, ChevronDown, Circle, Cpu, SquareStack, Zap } from "lucide-react";

const panelVariants = [
  {
    name: "Frost Plate",
    detail: "soft glass / quiet default",
    className: "frost",
    mark: "BFL-01"
  },
  {
    name: "Signal Plate",
    detail: "active run / generation",
    className: "signal",
    mark: "RUN-02"
  },
  {
    name: "Warning Plate",
    detail: "cost / failed status",
    className: "warning",
    mark: "CR-03"
  },
  {
    name: "Label Plate",
    detail: "asset tags / library cells",
    className: "label",
    mark: "IDX-04"
  }
];

export function DesignSystemPanel() {
  return (
    <section className="assetsPanel designSystemPanel">
      <div className="panelHeader">
        <div>
          <h2>CNC System</h2>
          <p>Panel and control variants for the alternate BFL dashboard skin.</p>
        </div>
        <SquareStack size={18} />
      </div>

      <div className="designSystemGrid">
        <div className="panelVariantGrid">
          {panelVariants.map((variant) => (
            <article className={`cncSpecCard ${variant.className}`} key={variant.name}>
              <CncPanelSvg mark={variant.mark} />
              <div>
                <strong>{variant.name}</strong>
                <span>{variant.detail}</span>
              </div>
            </article>
          ))}
        </div>

        <aside className="controlVariantBoard">
          <div className="controlVariantSection">
            <div className="runLogHeader">
              <strong>Buttons</strong>
              <Cpu size={15} />
            </div>
            <div className="cncButtonRow">
              <button className="cncButton command">
                <Zap size={14} />
                Generate
              </button>
              <button className="cncButton neutral">Queue</button>
              <button className="cncButton danger">Abort</button>
              <button className="cncIconButton" title="Compact icon button">
                <Circle size={15} />
              </button>
            </div>
          </div>

          <div className="controlVariantSection">
            <div className="runLogHeader">
              <strong>Menu</strong>
              <ChevronDown size={15} />
            </div>
            <div className="cncSegmented" role="group" aria-label="Model style variants">
              <button className="active">Frost</button>
              <button>Wire</button>
              <button>Sticker</button>
            </div>
            <div className="cncSelectPreview">
              <span>FLUX.2 Pro</span>
              <ChevronDown size={14} />
            </div>
          </div>

          <div className="controlVariantSection">
            <div className="runLogHeader">
              <strong>Ticks</strong>
              <Check size={15} />
            </div>
            <div className="cncCheckGrid">
              <label className="cncCheck">
                <input type="checkbox" defaultChecked />
                <span>Reference anchor</span>
              </label>
              <label className="cncCheck pixel">
                <input type="checkbox" defaultChecked />
                <span>Pixel crop</span>
              </label>
              <label className="cncSwitch">
                <input type="checkbox" defaultChecked />
                <span>Prompt upsample</span>
              </label>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function CncPanelSvg({ mark }: { mark: string }) {
  return (
    <svg className="cncPanelSvg" viewBox="0 0 340 136" role="img" aria-label={`${mark} panel frame`}>
      <path className="cncPanelBase" d="M18 8H282L332 58V118L314 128H58L8 78V22L18 8Z" />
      <path className="cncPanelInset" d="M28 20H274L318 64V108L306 116H66L22 72V28L28 20Z" />
      <path className="cncPanelRail" d="M34 38H190M34 54H250M34 70H140M218 88H302" />
      <path className="cncPanelCircuit" d="M232 34h42l16 16h24M236 102h28l10-10h26M58 104h48l12-12h22" />
      <rect x="34" y="90" width="90" height="16" rx="2" />
      <rect x="214" y="54" width="70" height="22" rx="2" />
      <text x="38" y="34">{mark}</text>
      <g className="cncPanelPixels">
        {Array.from({ length: 28 }, (_, index) => {
          const x = 34 + (index % 14) * 7;
          const y = 112 + Math.floor(index / 14) * 7;
          return <rect key={index} x={x} y={y} width="4" height="4" />;
        })}
      </g>
    </svg>
  );
}
