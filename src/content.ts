// Inject library.js into the page context
const script = document.createElement("script");
script.src = browser.runtime.getURL("library.js");
script.type = "module";
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);
