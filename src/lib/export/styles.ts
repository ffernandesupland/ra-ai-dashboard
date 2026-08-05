/**
 * Stylesheet for the exported single-file artifact. Deliberately a separate,
 * trimmed copy of the app's tokens: the export has no build step, no app chrome,
 * and is tuned for a projector rather than a browser tab.
 *
 * Values track upland-tokens.json v1.1.0 — keep in sync with src/app/globals.css.
 */
export const EXPORT_CSS = `
@import url("https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap");
:root{
--ground:#F1F3F3;--surface:#fff;--ink:#252B31;--ink-deep:#16191D;--slate:#6B7786;--slate-strong:#525C69;
--hair:#BFC6CE;--hair-soft:#E0E3E6;
--accent:#2574DB;--accent-hover:#1666D0;--accent-active:#0C5CC5;--accent-focus:#0049A9;--accent-soft:#F0F6FE;
--signal:#599900;--signal-soft:#E3FAC3;--signal-ink:#3C6600;
--ochre:#BB8000;--ochre-soft:#FFE3A6;--ochre-ink:#875C00;
--garnet:#E60C51;--garnet-soft:#FFB7CE;--garnet-ink:#93002F;
--sans:"Open Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
--cond:var(--sans);--mono:var(--sans);
--code:ui-monospace,SFMono-Regular,Menlo,monospace;
--r-xs:2px;--r-sm:4px;--r-md:8px;
--elev-1:0 1px 3px 0 rgba(0,0,0,.2),0 2px 1px -1px rgba(0,0,0,.12),0 1px 1px 0 rgba(0,0,0,.14)}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
.shell{max-width:1240px;margin:0 auto;padding:0 28px 64px}
.brandbar{display:flex;align-items:center;padding:16px 0 0}
.masthead{display:flex;flex-wrap:wrap;align-items:flex-end;gap:24px;padding:18px 0;border-bottom:2px solid var(--ink)}
.eyebrow{font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--slate)}
.masthead h1{font-family:var(--cond);font-weight:700;font-size:52px;line-height:1;letter-spacing:-.02em;margin:8px 0 0}
.meta{margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--slate);text-align:right;font-variant-numeric:tabular-nums}
.meta b{color:var(--ink);font-weight:600}
.tabbar{display:flex;flex-wrap:wrap;border-bottom:1px solid var(--hair);position:sticky;top:0;background:var(--ground);z-index:5}
.tabbar button{appearance:none;background:none;border:0;border-bottom:2px solid transparent;padding:14px 18px;cursor:pointer;font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--slate)}
.tabbar button:hover{color:var(--ink)}
.tabbar button[aria-selected="true"]{color:var(--accent);border-bottom-color:var(--accent)}
.tabbar button:focus-visible{outline:2px solid var(--accent-focus);outline-offset:-2px}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--hair);border:1px solid var(--hair);border-radius:var(--r-md);overflow:hidden;box-shadow:var(--elev-1);margin:26px 0}
.kpi{background:var(--surface);padding:18px 16px}
.kpi-value{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:30px;font-weight:600;letter-spacing:-.03em;line-height:1.1}
.kpi-value span{font-size:17px;letter-spacing:0}
.kpi-label{margin-top:6px;font-size:12px;color:var(--slate);line-height:1.35}
.v-signal{color:var(--signal)}.v-garnet{color:var(--garnet)}.v-ochre{color:var(--ochre)}
.stage{margin:34px 0 0}
.stage-head{display:flex;align-items:baseline;gap:14px;padding-bottom:8px;border-bottom:1px solid var(--ink);margin-bottom:18px}
.stage-num{font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.14em;color:var(--accent)}
.stage-head h2{font-family:var(--cond);font-weight:700;font-size:26px;letter-spacing:-.01em;margin:0}
.stage-sub{margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--slate);font-variant-numeric:tabular-nums}
.grid{display:grid;gap:22px}.grid-2{grid-template-columns:repeat(2,1fr)}.grid-3{grid-template-columns:repeat(3,1fr)}
.card{background:var(--surface);border:1px solid var(--hair-soft);border-radius:var(--r-md);box-shadow:var(--elev-1);padding:24px}
.card-title{font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--slate);margin:0 0 16px}
.card p{font-size:13.5px;color:var(--slate);line-height:1.55}.card p strong{color:var(--ink)}.card>:last-child{margin-bottom:0}
.hero{display:grid;grid-template-columns:460px 1fr;gap:26px;align-items:center;background:var(--surface);border:1px solid var(--hair-soft);border-radius:var(--r-md);box-shadow:var(--elev-1);padding:22px}
.hero h2{font-family:var(--cond);font-weight:700;font-size:30px;letter-spacing:-.015em;margin:8px 0 10px}
.bar{margin-bottom:16px}
.bar-head{display:flex;align-items:baseline;gap:10px;font-size:12.5px;margin-bottom:4px}
.bar-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-meta{margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--slate);font-variant-numeric:tabular-nums;white-space:nowrap}
.bar-body{display:flex;align-items:center;gap:10px}
.bar-track{flex:1;height:9px;background:var(--hair-soft);border-radius:var(--r-xs);overflow:hidden}
.bar-fill{height:100%;width:0;border-radius:var(--r-xs);transition:width .9s cubic-bezier(.22,.9,.3,1)}
.bar-value{width:46px;text-align:right;font-family:var(--mono);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.t-signal{background:var(--signal)}.t-ochre{background:var(--ochre)}.t-garnet{background:var(--garnet)}
.t-ink{background:var(--ink)}.t-slate{background:var(--slate)}.t-hair{background:var(--hair)}
.scale{margin-bottom:18px}
.scale-head{display:flex;align-items:baseline;gap:9px;margin-bottom:7px}
.scale-value{font-family:var(--mono);font-size:24px;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.scale-track{position:relative;display:flex;height:14px}
.scale-band:first-child{border-radius:var(--r-xs) 0 0 var(--r-xs)}
.scale-band:last-child{border-radius:0 var(--r-xs) var(--r-xs) 0}
.sb-needs-improvement{background:var(--garnet)}.sb-moderate{background:var(--ochre)}
.sb-good{background:var(--signal)}.sb-excellent{background:var(--signal-ink)}
.scale-mark{position:absolute;top:-5px;bottom:-5px;width:3px;background:var(--ink);border-radius:2px;transform:translateX(-50%);box-shadow:0 0 0 2px var(--paper)}
.scale-legend{display:flex;margin-top:6px}
.scale-seg{display:flex;flex-direction:column;align-items:center;gap:1px;padding:0 2px;min-width:0;color:var(--slate)}
.scale-seg.is-on{color:var(--ink)}
.scale-seg-label{font-size:9.5px;font-weight:600;letter-spacing:.02em;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.scale-seg-range{font-family:var(--mono);font-size:9px;font-variant-numeric:tabular-nums}
.scale-cap{margin-top:8px}
.split{display:flex;height:16px;background:var(--ground);border-radius:var(--r-xs);overflow:hidden;margin-bottom:12px}
.chip{display:inline-block;font-family:var(--mono);font-size:10px;font-weight:600;border-radius:var(--r-xs);padding:2px 6px;white-space:nowrap}
.chip-ok{background:var(--signal-soft);color:var(--signal-ink)}
.chip-warm{background:var(--ochre-soft);color:var(--ochre-ink)}
.chip-hot{background:var(--garnet-soft);color:var(--garnet-ink)}
.chip-neutral{background:var(--hair-soft);color:var(--slate-strong)}
table{width:100%;border-collapse:collapse}
th{font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--slate);text-align:left;padding:0 8px 7px 0;border-bottom:1px solid var(--ink)}
td{font-size:13px;padding:8px 8px 8px 0;border-bottom:1px solid var(--hair-soft);vertical-align:top}
th.num,td.num{text-align:right;white-space:nowrap;padding-right:0;font-family:var(--mono);font-variant-numeric:tabular-nums}
.callout{border-left:3px solid var(--garnet);padding:12px 0 12px 14px;margin-top:16px;font-size:14px;line-height:1.55;color:var(--slate)}
.callout strong{color:var(--ink)}
.formula{font-family:var(--code);font-size:11.5px;line-height:1.7;background:var(--ground);border-radius:var(--r-sm);padding:12px 14px;white-space:pre-wrap;overflow-x:auto;margin:0 0 14px}
.inputlist{list-style:none;margin:0;padding:0}
.inputlist li{display:flex;gap:10px;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--hair-soft);font-size:13px}
.inputlist .src{margin-left:auto;color:var(--slate);font-size:12px;text-align:right}
.footer{background:#0B0C0F;color:var(--hair);border-radius:var(--r-md);padding:26px 22px;margin-top:24px}
.footer h3{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#838FA0;margin:0 0 8px}
.footer p{font-size:13px;color:#BFC6CE;margin:0;line-height:1.5}
.footer-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}
.disclaimer{font-family:var(--mono);font-size:10.5px;color:#838FA0;margin-top:22px;padding-top:14px;border-top:1px solid #252B31;line-height:1.6}
@media (max-width:900px){.shell{padding:0 16px 48px}.masthead h1{font-size:38px}.meta{margin-left:0;text-align:left}
.kpis{grid-template-columns:repeat(2,1fr)}.grid-2,.grid-3,.hero{grid-template-columns:1fr}.footer-grid{grid-template-columns:repeat(2,1fr)}.tabbar{position:static}}
@media (max-width:520px){.kpis,.footer-grid{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

/** Inline copy of <Logo tone="light" />. Same caveat: placeholder, not official artwork. */
export const EXPORT_LOGO = `<svg viewBox="0 0 208 32" height="26" role="img" aria-label="RightAnswers" style="display:block;width:auto">
<rect x="0" y="0" width="32" height="32" rx="8" fill="#2574DB"/>
<path d="M9 10.5h14a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-6.4L12 24.5V21H9a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 9 10.5Z" fill="#FFFFFF"/>
<path d="m12.4 15.6 2.5 2.5 5-5" fill="none" stroke="#2574DB" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
<text x="44" y="22" font-family="'Open Sans',-apple-system,sans-serif" font-size="19" font-weight="700" letter-spacing="-0.3" fill="#252B31">Right<tspan font-weight="400" fill="#6B7786">Answers</tspan></text>
</svg>`;
