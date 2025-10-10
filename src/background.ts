import browser from "webextension-polyfill";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import { generate } from "astring";

console.log("start up");

// Pattern configuration
interface InjectionPoint {
  target: string; // "constructor" or method name
  label: string; // Label for console.log
}

interface ClassPattern {
  name: string; // Descriptive name for logging
  requiredMethods: string[]; // Method names that must be present
  injections: InjectionPoint[];
}

interface LibraryPattern {
  keyword: string; // Keyword to search for in script files
  classes: ClassPattern[];
}

// Define patterns for libraries to intercept
const LIBRARY_PATTERNS: LibraryPattern[] = [
  {
    keyword: "maplibre",
    classes: [
      {
        name: "Map",
        requiredMethods: ["addControl", "removeControl", "addSource", "addLayer"],
        injections: [{ target: "constructor", label: "MapLibre Map created" }],
      },
      {
        name: "Marker",
        requiredMethods: ["setLngLat", "addTo", "remove"],
        injections: [
          { target: "constructor", label: "MapLibre Marker created" },
          { target: "addTo", label: "MapLibre Marker.addTo called" },
        ],
      },
    ],
  },
];

// Create a console.log AST node
function createConsoleLogNode(label: string): any {
  return {
    type: "ExpressionStatement",
    expression: {
      type: "CallExpression",
      callee: {
        type: "MemberExpression",
        object: { type: "Identifier", name: "console" },
        property: { type: "Identifier", name: "log" },
        computed: false,
      },
      arguments: [
        { type: "Literal", value: label, raw: `"${label}"` },
        { type: "Identifier", name: "arguments" },
      ],
    },
  };
}

// Extract method names from a class body
function extractMethodNames(classBody: any[]): string[] {
  const methodNames: string[] = [];
  for (const member of classBody) {
    if (member.type === "MethodDefinition" && member.key.type === "Identifier") {
      methodNames.push(member.key.name);
    }
  }
  return methodNames;
}

// Check if a class matches a pattern (all required methods must be present)
function matchesPattern(methodNames: string[], requiredMethods: string[]): boolean {
  return requiredMethods.every((required) => methodNames.includes(required));
}

// Inject console.log into a method or constructor
function injectIntoMethod(method: any, label: string): void {
  if (method.value && method.value.type === "FunctionExpression" && method.value.body) {
    const body = method.value.body;
    if (body.type === "BlockStatement" && Array.isArray(body.body)) {
      const consoleLog = createConsoleLogNode(label);
      body.body.unshift(consoleLog);
    }
  }
}

// Process and modify source code based on patterns
function modifySourceWithPatterns(source: string, patterns: LibraryPattern[]): string | null {
  // Check if source matches any pattern keyword
  const matchingPattern = patterns.find((pattern) => source.toLowerCase().includes(pattern.keyword.toLowerCase()));

  if (!matchingPattern) {
    return null;
  }

  console.log(`[Interceptor] Found keyword: ${matchingPattern.keyword}`);

  let ast: acorn.Node;
  try {
    ast = acorn.parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
    });
  } catch (error) {
    console.error("[Interceptor] Failed to parse source:", error);
    return null;
  }

  let modified = false;

  // Traverse the AST to find classes
  walk.simple(ast, {
    ClassDeclaration(node: any) {
      const methodNames = extractMethodNames(node.body.body);

      // Check against each class pattern
      for (const classPattern of matchingPattern.classes) {
        if (matchesPattern(methodNames, classPattern.requiredMethods)) {
          console.log(`[Interceptor] Matched class: ${classPattern.name}`);

          // Inject code into specified methods/constructor
          for (const injection of classPattern.injections) {
            const method = node.body.body.find((member: any) => member.type === "MethodDefinition" && member.key.type === "Identifier" && member.key.name === injection.target);

            if (method) {
              console.log(`[Interceptor] Injecting into ${injection.target}`);
              injectIntoMethod(method, injection.label);
              modified = true;
            }
          }
        }
      }
    },
    ClassExpression(node: any) {
      const methodNames = extractMethodNames(node.body.body);

      // Check against each class pattern
      for (const classPattern of matchingPattern.classes) {
        if (matchesPattern(methodNames, classPattern.requiredMethods)) {
          console.log(`[Interceptor] Matched class expression: ${classPattern.name}`);

          // Inject code into specified methods/constructor
          for (const injection of classPattern.injections) {
            const method = node.body.body.find((member: any) => member.type === "MethodDefinition" && member.key.type === "Identifier" && member.key.name === injection.target);

            if (method) {
              console.log(`[Interceptor] Injecting into ${injection.target}`);
              injectIntoMethod(method, injection.label);
              modified = true;
            }
          }
        }
      }
    },
  });

  if (!modified) {
    return null;
  }

  // Serialize the modified AST back to code
  try {
    return generate(ast);
  } catch (error) {
    console.error("[Interceptor] Failed to generate code:", error);
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
        const modifiedSource = modifySourceWithPatterns(responseData, LIBRARY_PATTERNS);

        if (modifiedSource) {
          console.log("[Interceptor] Modified script:", details.url);
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
