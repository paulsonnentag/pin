import * as Babel from "@babel/standalone";

function modifyMaplibreSource(sourceCode: string): string | null {
  try {
    // Check if file contains "maplibre"
    if (!sourceCode.toLowerCase().includes("maplibre")) {
      return null;
    }

    let foundMarker = false;

    // Parse and transform with Babel standalone
    const result = Babel.transform(sourceCode, {
      presets: [],
      plugins: [
        function () {
          return {
            visitor: {
              ClassDeclaration(path: any) {
                const methods = path.node.body.body
                  .filter((node: any) => node.type === "ClassMethod")
                  .map((node: any) => (node.key.type === "Identifier" ? node.key.name : null))
                  .filter(Boolean);

                // Check for Marker-specific methods
                const hasAddTo = methods.includes("addTo");
                const hasRemove = methods.includes("remove");
                const hasSetLngLat = methods.includes("setLngLat");
                const hasGetLngLat = methods.includes("getLngLat");

                if (hasAddTo && hasRemove && hasSetLngLat & hasGetLngLat) {
                  foundMarker = true;

                  // Modify Marker methods
                  path.traverse({
                    ClassMethod(methodPath: any) {
                      if (methodPath.node.key.type === "Identifier" && methodPath.node.key.name === "addTo") {
                        const body = methodPath.node.body;
                        if (body.type === "BlockStatement") {
                          const logStatement = {
                            type: "ExpressionStatement",
                            expression: {
                              type: "CallExpression",
                              callee: {
                                type: "MemberExpression",
                                object: { type: "Identifier", name: "console" },
                                property: { type: "Identifier", name: "log" },
                              },
                              arguments: [
                                { type: "StringLiteral", value: "[MapLibre] Marker added:" },
                                {
                                  type: "CallExpression",
                                  callee: {
                                    type: "MemberExpression",
                                    object: { type: "ThisExpression" },
                                    property: { type: "Identifier", name: "getLngLat" },
                                  },
                                  arguments: [],
                                },
                              ],
                            },
                          };
                          body.body.push(logStatement);
                        }
                      } else if (methodPath.node.key.type === "Identifier" && methodPath.node.key.name === "remove") {
                        const body = methodPath.node.body;
                        if (body.type === "BlockStatement") {
                          const logStatement = {
                            type: "ExpressionStatement",
                            expression: {
                              type: "CallExpression",
                              callee: {
                                type: "MemberExpression",
                                object: { type: "Identifier", name: "console" },
                                property: { type: "Identifier", name: "log" },
                              },
                              arguments: [
                                { type: "StringLiteral", value: "[MapLibre] Marker removed:" },
                                {
                                  type: "CallExpression",
                                  callee: {
                                    type: "MemberExpression",
                                    object: { type: "ThisExpression" },
                                    property: { type: "Identifier", name: "getLngLat" },
                                  },
                                  arguments: [],
                                },
                              ],
                            },
                          };
                          body.body.unshift(logStatement);
                        }
                      }
                    },
                  });
                }
              },
            },
          };
        },
      ],
    });

    if (!result || !result.code || !foundMarker) {
      return null;
    }

    return result.code;
  } catch (error) {
    return null;
  }
}

// Intercept and modify JS responses
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Check if the request is for a JavaScript file
    if (details.type === "script" || details.url.endsWith(".js")) {
      // Create a filter to intercept the response
      const filter = browser.webRequest.filterResponseData(details.requestId);
      const decoder = new TextDecoder("utf-8");
      const encoder = new TextEncoder();

      let responseData = "";

      filter.ondata = (event) => {
        // Accumulate response data
        responseData += decoder.decode(event.data, { stream: true });
      };

      filter.onstop = () => {
        // Finish decoding
        responseData += decoder.decode();

        // Try to modify the source
        const modifiedSource = modifyMaplibreSource(responseData);

        if (modifiedSource) {
          console.log("[MapLibre] Modified script:", details.url);
          filter.write(encoder.encode(modifiedSource));
        } else {
          // Write original source
          filter.write(encoder.encode(responseData));
        }

        filter.close();
      };
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);
