// Root HTML for the static web export (web only). Sets the title, viewport, v3 background
// grid, pixelated image rendering and the visible 3 px white focus ring (v3 lines 6–7, 133).
import React from 'react';
import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';

const GLOBAL_CSS = `
html,body{background-color:#0d0a24;color:#f4f4ff;}
body{min-height:100vh;-webkit-font-smoothing:none;background-image:linear-gradient(#15113a 1px,transparent 1px),linear-gradient(90deg,#15113a 1px,transparent 1px);background-size:32px 32px;image-rendering:pixelated;}
#root{background:transparent;}
[role=button]:focus-visible,[role=link]:focus-visible,[role=switch]:focus-visible,[role=slider]:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid #ffffff !important;outline-offset:2px;}
@media (prefers-reduced-motion: reduce){*{animation:none !important;transition:none !important;}}
`;

// SDK 58: the document must render the server context's head/body nodes — they carry the
// /GLITCH/_expo/ script + CSS tags the export injects.
export default function Root({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#0d0a24" />
        <meta name="description" content="GLITCH — an AI literacy adventure. Spot what AI gets wrong and make the call." />
        <title>GLITCH</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
