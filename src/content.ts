console.log("ran this!!!");

document.open("text/html", "replace");
document.write("");
document.close();

fetch(window.location.href)
  .then((res) => res.text())
  .then((source) => {
    console.log(source);
    console.log("rewrite");
    document.open("text/html", "replace");
    //document.write("TESt");
    // Replace all <script> tags with src by appending &something=true to the src URL
    const modifiedSource = source.replace(/<script\s+([^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*)>/gi, (match, beforeSrc, srcValue, afterSrc) => {
      // Check if src already has a query string
      const newSrc = srcValue.includes("?") ? `${srcValue}&something=true` : `${srcValue}?something=true`;
      return `<script ${beforeSrc}${newSrc}${afterSrc}>`;
    });
    document.write(modifiedSource);
    document.close();
  });
