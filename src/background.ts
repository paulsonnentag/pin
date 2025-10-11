import browser from "webextension-polyfill";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import { generate } from "astring";
import { LIBRARY_PATTERNS, type LibraryPattern } from "./patterns";

// Create an injection node from a function expression
function createInjectionNode(injectorFn: (...args: any[]) => void): any {
  // Convert the function to a string and parse it as AST
  const fnString = injectorFn.toString();

  // Parse the function expression
  let fnExpression: any;
  try {
    // Try parsing as arrow function or regular function
    const parsed = acorn.parse(`(${fnString})`, {
      ecmaVersion: "latest",
    }) as any;

    // Extract the function expression from the parsed program
    fnExpression = parsed.body[0].expression;
  } catch (error) {
    console.error("[Interceptor] Failed to parse injector function:", error);
    return null;
  }

  // Create a call expression that invokes the function with spread arguments
  // Result: ((injectorFn)(...arguments))
  return {
    type: "ExpressionStatement",
    expression: {
      type: "CallExpression",
      callee: fnExpression,
      arguments: [
        {
          type: "SpreadElement",
          argument: { type: "Identifier", name: "arguments" },
        },
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

// Inject a function call into a method or constructor
function injectIntoMethod(method: any, injectorFn: (...args: any[]) => void): boolean {
  if (method.value && method.value.type === "FunctionExpression" && method.value.body) {
    const body = method.value.body;
    if (body.type === "BlockStatement" && Array.isArray(body.body)) {
      const injectionNode = createInjectionNode(injectorFn);
      if (injectionNode) {
        body.body.unshift(injectionNode);
        return true;
      }
    }
  }
  return false;
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
              console.log(`[Interceptor] Injecting into ${classPattern.name}.${injection.target}`);
              if (injectIntoMethod(method, injection.expression)) {
                modified = true;
              }
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
              console.log(`[Interceptor] Injecting into ${classPattern.name}.${injection.target}`);
              if (injectIntoMethod(method, injection.expression)) {
                modified = true;
              }
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
