const HIDE_WATERMARK_CSS = "<style>#es-watermark{display:none!important}</style>";
const HIDE_WATERMARK_JS = "<script>(function(){function rm(){var w=document.getElementById('es-watermark');if(w)w.remove();}rm();new MutationObserver(rm).observe(document.body||document.documentElement,{childList:true,subtree:true});document.addEventListener('DOMContentLoaded',rm);var i=setInterval(rm,500);setTimeout(function(){clearInterval(i)},5000);})();</script>";

export function injectSmartIds(
  body: Uint8Array | ArrayBuffer,
  projectId: number,
  toolId: number,
): Uint8Array {
  const text = new TextDecoder().decode(body);
  const script = `<script>window.SMART_PROJECT_ID=${projectId};window.SMART_TOOL_ID=${toolId};</script>${HIDE_WATERMARK_CSS}`;
  // Inject into head, and add cleanup script at end of body
  let result = text.replace("</head>", `${script}</head>`);
  result = result.replace("</body>", `${HIDE_WATERMARK_JS}</body>`);
  return new TextEncoder().encode(result);
}
